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

  // Set CSP for both dev and production
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? `default-src 'self' http://localhost:5173 ws://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; script-src 'self' http://localhost:5173; ${connectSrc}`
            : `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; ${connectSrc}`
        ],
      },
    });
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
