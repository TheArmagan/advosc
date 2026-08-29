import { BrowserWindow } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    minWidth: 1200,
    height: 800,
    minHeight: 800,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), // __dirname becasue of build structure
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
    autoHideMenuBar: true,
    frame: false
  });

  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';

  // Modules and user templates can talk to any API, so outgoing requests are not
  // restricted. Code execution still is: scripts and documents stay local.
  const connectSrc = "connect-src * data: blob: ws: wss:";

  const session = mainWindow.webContents.session;

  const isDevServer = (url: string) => url.startsWith('http://localhost:5173');

  // Remember which origin each request came from so the CORS reply can echo it
  // back. "*" is not allowed once a request carries credentials.
  const requestOrigins = new Map<number, string>();

  // Browsers block cross-origin API calls unless the server opts in, and most of
  // the APIs a module or a user template hits never will. This is a desktop app,
  // so we answer the CORS handshake on the server's behalf instead.
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (isDevServer(details.url)) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }

    const headers = { ...details.requestHeaders };
    const origin = headers['Origin'] ?? headers['origin'] ?? 'null';
    requestOrigins.set(details.id, origin);

    // Drop Origin so the server sees a plain request. Some APIs 403 anything
    // with a browser origin on it.
    delete headers['Origin'];
    delete headers['origin'];

    callback({ requestHeaders: headers });
  });

  // Set CSP for both dev and production, and answer CORS for remote requests
  session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    responseHeaders['Content-Security-Policy'] = [
      isDev
        ? `default-src 'self' http://localhost:5173 ws://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; script-src 'self' http://localhost:5173; ${connectSrc}`
        : `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; ${connectSrc}`
    ];

    if (isDevServer(details.url)) {
      callback({ responseHeaders });
      return;
    }

    const origin = requestOrigins.get(details.id) ?? 'null';
    requestOrigins.delete(details.id);

    // A server that already sent its own values would end up with two of each,
    // which Chromium rejects, so replace rather than append.
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase().startsWith('access-control-')) {
        delete responseHeaders[key];
      }
    }

    responseHeaders['Access-Control-Allow-Origin'] = [origin];
    responseHeaders['Access-Control-Allow-Credentials'] = ['true'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    responseHeaders['Access-Control-Expose-Headers'] = ['*'];
    responseHeaders['Access-Control-Max-Age'] = ['86400'];

    // A preflight only passes on a 2xx. Servers that do not implement OPTIONS
    // answer 404 or 405, so rewrite the status for that one method.
    if (details.method === 'OPTIONS') {
      callback({ responseHeaders, statusLine: 'HTTP/1.1 204 No Content' });
      return;
    }

    callback({ responseHeaders });
  });

  session.webRequest.onErrorOccurred((details) => {
    requestOrigins.delete(details.id);
  });

  if (isDev) {
    // Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, try unpacked directory first (for asar.unpack), then fall back to regular path
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html');
    mainWindow.loadFile(unpackedPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}
