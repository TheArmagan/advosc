import * as http from 'http';
import { randomBytes } from 'crypto';
import { BrowserWindow, shell } from 'electron';
import { renderSpeechPage } from './speech-page';

/**
 * Local HTTP server that hosts the speech recognition page.
 *
 * Electron has no Web Speech API, so recognition has to happen in a real browser. The app
 * serves a page on 127.0.0.1, the user opens it in Chrome, and the page posts every result
 * back here. Results are forwarded to the renderer, which feeds the chatbox Speech module.
 *
 * Bound to loopback only. A LAN address would not help anyway: the Web Speech API needs a
 * secure context, and only localhost counts as one over plain http.
 */

export interface SpeechServerConfig {
  /** BCP-47 tag handed to the recognizer, e.g. "en-US". */
  language: string;
  interimResults: boolean;
  continuous: boolean;
  /** Whether the page should currently have the mic open. */
  listening: boolean;
  maxAlternatives: number;
}

export interface SpeechTranscript {
  sessionId: string;
  text: string;
  isFinal: boolean;
  confidence: number | null;
  language: string;
  at: number;
  cleared?: boolean;
}

export interface SpeechPageStatus {
  sessionId?: string;
  listening: boolean;
  wantListening?: boolean;
  language?: string;
  supported?: boolean;
  error?: string;
  closing?: boolean;
}

export interface SpeechServerState {
  running: boolean;
  port: number | null;
  url: string | null;
  /** Number of pages holding the event stream open. */
  clients: number;
  pageListening: boolean;
  lastError?: string;
  config: SpeechServerConfig;
}

const DEFAULT_PORT = 7274;
/** How many ports to walk past the requested one before giving up. */
const PORT_ATTEMPTS = 20;
const MAX_BODY_BYTES = 64 * 1024;
const HEARTBEAT_MS = 20000;

const defaultConfig: SpeechServerConfig = {
  language: 'en-US',
  interimResults: true,
  continuous: true,
  listening: false,
  maxAlternatives: 1,
};

let server: http.Server | null = null;
let activePort: number | null = null;
let token = '';
let config: SpeechServerConfig = { ...defaultConfig };
let clients = new Set<http.ServerResponse>();
let heartbeat: NodeJS.Timeout | null = null;
let pageListening = false;
let lastError: string | undefined;

function broadcastToRenderer(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function pageUrl(port: number) {
  return `http://127.0.0.1:${port}/?t=${token}`;
}

export function getSpeechServerState(): SpeechServerState {
  return {
    running: !!server && activePort !== null,
    port: activePort,
    url: activePort === null ? null : pageUrl(activePort),
    clients: clients.size,
    pageListening,
    lastError,
    config: { ...config },
  };
}

function pushState() {
  broadcastToRenderer('speech:state', getSpeechServerState());
}

function sendEvent(message: unknown) {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      // The page went away mid-write; the close handler cleans it up.
    }
  }
}

function sendConfig() {
  sendEvent({ type: 'config', config });
}

/**
 * The page is on localhost, so any website the user has open could POST to it. The token
 * lives only in the URL the app opened, which no other origin can read.
 */
function isAuthorized(request: http.IncomingMessage, url: URL): boolean {
  if (!token) return false;
  if (url.searchParams.get('t') !== token) return false;

  // A cross-site form post cannot set Content-Type: application/json, but check the origin
  // anyway so a rebinding attempt with a leaked token still fails.
  const origin = request.headers.origin;
  if (origin && activePort !== null) {
    const allowed = [`http://127.0.0.1:${activePort}`, `http://localhost:${activePort}`];
    if (!allowed.includes(origin)) return false;
  }
  return true;
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    request.on('error', reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  response.end(text);
}

function handleEventStream(request: http.IncomingMessage, response: http.ServerResponse) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write(': connected\n\n');
  response.write(`data: ${JSON.stringify({ type: 'config', config })}\n\n`);

  clients.add(response);
  pushState();

  const drop = () => {
    if (!clients.delete(response)) return;
    if (clients.size === 0) {
      // Nothing is listening any more once every page is gone.
      pageListening = false;
      broadcastToRenderer('speech:status', { listening: false, closing: true } as SpeechPageStatus);
    }
    pushState();
  };

  request.on('close', drop);
  request.on('error', drop);
}

async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  let url: URL;
  try {
    url = new URL(request.url || '/', `http://127.0.0.1:${activePort ?? DEFAULT_PORT}`);
  } catch {
    response.writeHead(400).end();
    return;
  }

  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true, running: true });
    return;
  }

  if (!isAuthorized(request, url)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden. Open this page from ADVOSC so it carries the right link.');
    return;
  }

  if (url.pathname === '/' && request.method === 'GET') {
    const html = renderSpeechPage();
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
    });
    response.end(html);
    return;
  }

  if (url.pathname === '/events' && request.method === 'GET') {
    handleEventStream(request, response);
    return;
  }

  if (url.pathname === '/transcript' && request.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(request)) as SpeechTranscript;
      if (typeof payload?.text === 'string') {
        broadcastToRenderer('speech:transcript', {
          sessionId: String(payload.sessionId || ''),
          text: payload.text,
          isFinal: !!payload.isFinal,
          confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
          language: String(payload.language || config.language),
          at: Number(payload.at) || Date.now(),
          cleared: !!payload.cleared,
        } as SpeechTranscript);
      }
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: String(error) });
    }
    return;
  }

  if (url.pathname === '/status' && request.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(request)) as SpeechPageStatus;
      pageListening = !!payload?.listening;
      lastError = payload?.error;
      broadcastToRenderer('speech:status', payload);
      pushState();
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: String(error) });
    }
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

function listen(port: number, attemptsLeft: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const instance = http.createServer((request, response) => {
      handleRequest(request, response).catch((error) => {
        try {
          sendJson(response, 500, { ok: false, error: String(error) });
        } catch {
          // The socket is already gone.
        }
      });
    });

    const onError = (error: NodeJS.ErrnoException) => {
      instance.removeListener('listening', onListening);
      instance.close();
      if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
        // Another app (or a stale copy of ADVOSC) has the port; walk up until one is free.
        resolve(listen(port + 1, attemptsLeft - 1));
      } else {
        reject(error);
      }
    };

    const onListening = () => {
      instance.removeListener('error', onError);
      instance.on('error', (error) => {
        lastError = String(error);
        pushState();
      });
      server = instance;
      activePort = port;
      resolve(port);
    };

    instance.once('error', onError);
    instance.once('listening', onListening);
    instance.listen(port, '127.0.0.1');
  });
}

export async function startSpeechServer(options: {
  port?: number;
  config?: Partial<SpeechServerConfig>;
} = {}): Promise<{ success: boolean; url?: string; port?: number; error?: string }> {
  if (options.config) config = { ...config, ...options.config };

  if (server && activePort !== null) {
    const requested = options.port ?? activePort;
    if (requested === activePort) {
      sendConfig();
      return { success: true, url: pageUrl(activePort), port: activePort };
    }
    // A different port was asked for, so the old listener has to go first.
    await stopSpeechServer();
  }

  if (!token) token = randomBytes(18).toString('hex');

  try {
    const port = await listen(options.port ?? DEFAULT_PORT, PORT_ATTEMPTS);
    lastError = undefined;

    if (heartbeat) clearInterval(heartbeat);
    // Idle SSE connections get dropped by intermediaries and by Chrome itself.
    heartbeat = setInterval(() => {
      for (const client of clients) {
        try {
          client.write(': ping\n\n');
        } catch {
          // Cleaned up by the close handler.
        }
      }
    }, HEARTBEAT_MS);

    pushState();
    return { success: true, url: pageUrl(port), port };
  } catch (error) {
    lastError = String((error as Error)?.message || error);
    pushState();
    return { success: false, error: lastError };
  }
}

export function stopSpeechServer(): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }

    for (const client of clients) {
      try {
        client.end();
      } catch {
        // Already closed.
      }
    }
    clients.clear();
    pageListening = false;

    const instance = server;
    server = null;
    activePort = null;

    if (!instance) {
      pushState();
      resolve({ success: true });
      return;
    }

    instance.close(() => {
      pushState();
      resolve({ success: true });
    });
    // `close` only stops new connections; kill the keep-alives so it actually finishes.
    instance.closeAllConnections?.();
  });
}

export function setSpeechConfig(next: Partial<SpeechServerConfig>): SpeechServerState {
  config = { ...config, ...next };
  sendConfig();
  pushState();
  return getSpeechServerState();
}

export function sendSpeechCommand(action: 'start' | 'stop' | 'clear'): SpeechServerState {
  if (action === 'start' || action === 'stop') {
    config = { ...config, listening: action === 'start' };
  }
  sendEvent({ type: 'command', action });
  pushState();
  return getSpeechServerState();
}

export async function openSpeechPage(): Promise<{ success: boolean; error?: string }> {
  if (activePort === null) return { success: false, error: 'The speech server is not running.' };
  try {
    await shell.openExternal(pageUrl(activePort));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
