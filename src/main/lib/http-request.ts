import { net } from 'electron';

export interface HttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Milliseconds before the request is aborted. */
  timeoutMs?: number;
}

export interface HttpRequestResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  /** Set when the request never produced a response (DNS, timeout, bad URL). */
  error?: string;
  durationMs: number;
  /** True when the body hit the size cap and was cut short. */
  truncated?: boolean;
}

const DEFAULT_TIMEOUT = 10000;
const MAX_TIMEOUT = 60000;
/** Chatbox placeholders only ever read small slices of a body, so a hard cap is safe. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const ALLOWED_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
]);

/** Headers the network stack owns; letting a template set them breaks the request. */
const BLOCKED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding']);

function emptyResult(error: string, durationMs = 0): HttpRequestResult {
  return { ok: false, status: 0, statusText: '', headers: {}, body: '', error, durationMs };
}

/** Reads the response body, stopping at the size cap instead of buffering forever. */
async function readCappedBody(response: Response): Promise<{ text: string; truncated: boolean }> {
  const stream = response.body;
  if (!stream) return { text: '', truncated: false };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      size += value.byteLength;
      if (size >= MAX_BODY_BYTES) {
        truncated = true;
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch { /* the stream is already gone; nothing to clean up */ }
  }

  const merged = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const room = merged.length - offset;
    if (room <= 0) break;
    merged.set(chunk.subarray(0, Math.min(room, chunk.length)), offset);
    offset += chunk.length;
  }

  return { text: new TextDecoder().decode(merged), truncated };
}

/**
 * Performs a single HTTP request on behalf of the renderer. This lives in main because
 * `net.fetch` uses Chromium's network stack directly, so user-configured endpoints are
 * not blocked by CORS the way a renderer `fetch` would be.
 */
export async function performHttpRequest(options: HttpRequestOptions): Promise<HttpRequestResult> {
  const started = Date.now();

  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    return emptyResult(`Invalid URL: ${options.url}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return emptyResult(`Unsupported protocol "${url.protocol}". Use http or https.`);
  }

  const method = (options.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return emptyResult(`Unsupported method "${method}".`);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.headers || {})) {
    const name = key.trim();
    if (!name || BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = String(value ?? '');
  }

  const hasBody = method !== 'GET' && method !== 'HEAD' && options.body !== undefined && options.body !== '';

  const controller = new AbortController();
  const timeout = Math.min(MAX_TIMEOUT, Math.max(1000, options.timeoutMs || DEFAULT_TIMEOUT));
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await net.fetch(url.toString(), {
      method,
      headers,
      body: hasBody ? options.body : undefined,
      signal: controller.signal,
      // User endpoints are arbitrary; a redirect chain is normal and expected.
      redirect: 'follow',
    });

    const { text, truncated } = await readCappedBody(response);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: text,
      durationMs: Date.now() - started,
      truncated,
    };
  } catch (error) {
    const aborted = controller.signal.aborted;
    return emptyResult(
      aborted ? `Request timed out after ${timeout}ms` : String((error as Error)?.message || error),
      Date.now() - started,
    );
  } finally {
    clearTimeout(timer);
  }
}
