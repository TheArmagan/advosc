import { BrowserWindow, screen, session } from 'electron';
import * as path from 'path';
import { getBootstrap, updateBootstrap, type WindowBounds } from './bootstrap';
import { isDev } from './paths';

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
/** Bounds change constantly during a drag, and only the last one matters. */
const SAVE_BOUNDS_DELAY_MS = 500;

let mainWindow: BrowserWindow | null = null;
let sessionReady = false;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Sets the CSP. The window comes and goes now, but webRequest listeners belong to the session,
 * so this has to run once rather than per window. There used to be CORS handling here too:
 * nothing in the renderer talks to the network any more.
 */
function setupSession() {
  if (sessionReady) return;
  sessionReady = true;

  // Modules and user templates can talk to any API, so outgoing requests are not
  // restricted. Code execution still is: scripts and documents stay local.
  const connectSrc = "connect-src * data: blob: ws: wss:";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    responseHeaders['Content-Security-Policy'] = [
      isDev
        ? `default-src 'self' http://localhost:5173 ws://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; script-src 'self' http://localhost:5173; ${connectSrc}`
        : `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; ${connectSrc}`
    ];

    callback({ responseHeaders });
  });
}

/** Saved bounds can point at a monitor that's gone, which would open the window off-screen. */
function isOnScreen(bounds: WindowBounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const overlapY = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return overlapX >= 100 && overlapY >= 50;
  });
}

function restoredBounds(): Partial<WindowBounds> {
  const saved = getBootstrap().bounds;
  if (saved && isOnScreen(saved)) return saved;
  return { width: saved?.width ?? DEFAULT_WIDTH, height: saved?.height ?? DEFAULT_HEIGHT };
}

function saveBounds(window: BrowserWindow) {
  if (window.isDestroyed() || window.isMinimized()) return;
  const maximized = window.isMaximized();
  // The normal bounds, so un-maximizing after a restart lands back on the old size.
  const { x, y, width, height } = window.getNormalBounds();
  updateBootstrap({ bounds: { x, y, width, height, maximized } });
}

export function createWindow(): BrowserWindow {
  setupSession();

  const bounds = restoredBounds();

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width ?? DEFAULT_WIDTH,
    height: bounds.height ?? DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), // __dirname becasue of build structure
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    frame: false
  });

  if (bounds.maximized) mainWindow.maximize();

  const window = mainWindow;
  let saveTimer: NodeJS.Timeout | null = null;
  const queueSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveBounds(window), SAVE_BOUNDS_DELAY_MS);
  };
  window.on('resize', queueSave);
  window.on('move', queueSave);
  window.on('maximize', queueSave);
  window.on('unmaximize', queueSave);

  window.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveBounds(window);
  });

  if (isDev) {
    // Vite dev server
    window.loadURL('http://localhost:5173');
    window.webContents.openDevTools();
  } else {
    // In production, try unpacked directory first (for asar.unpack), then fall back to regular path
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html');
    window.loadFile(unpackedPath);
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  return window;
}

/** Brings the window back, building a new one if it was closed to the tray. */
export function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
