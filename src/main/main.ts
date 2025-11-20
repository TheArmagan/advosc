import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { spawn, type ChildProcess } from 'child_process';
import { OSC } from './lib/osc';

const port = new OSC({
  local: { address: '0.0.0.0', port: 9001 },
  remote: { address: '0.0.0.0', port: 9000 }
});

type MediaCommand = 'skip-track' | 'previous-track' | 'toggle-play-pause' | 'pause' | 'resume';

interface MediaInfo {
  title?: string;
  artist?: string;
  album?: string;
  playbackStatus: 'Playing' | 'Paused' | 'Stopped' | 'Unknown';
  position?: number;
  duration?: number;
  appName?: string;
  hasArtwork: boolean;
}

let mainWindow: BrowserWindow | null = null;
let mediaProcess: ChildProcess | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    minWidth: 1200,
    height: 800,
    minHeight: 800,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
    autoHideMenuBar: true,
    frame: false
  });

  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';

  const allowList = [
    "https://lrclib.net",
    "https://cdn.jsdelivr.net"
  ]

  // Set CSP for both dev and production
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? `default-src 'self' http://localhost:5173 ws://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; script-src 'self' http://localhost:5173; connect-src 'self' http://localhost:5173 ws://localhost:5173 ${allowList.join(' ')}`
            : `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ${allowList.join(' ')}`
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
}

function startMediaMonitor() {
  if (mediaProcess) {
    return;
  }

  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';
  const exePath = isDev
    ? path.join(__dirname, '..', 'natives', 'win-media-info.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'natives', 'win-media-info.exe');

  if (!fs.existsSync(exePath)) {
    console.error('win-media-info.exe not found at:', exePath);
    return;
  }

  // Don't pass any command to use default monitor behavior
  mediaProcess = spawn(exePath, []);
  let buffer = '';

  mediaProcess.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rawData = JSON.parse(trimmed);
        const mediaInfo: MediaInfo = {
          title: rawData.title,
          artist: rawData.artist,
          album: rawData.album,
          playbackStatus: rawData.playback_status,
          position: rawData.position,
          duration: rawData.duration,
          appName: rawData.app_name,
          hasArtwork: rawData.has_artwork
        };
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('media:info', mediaInfo));
      } catch (err) {
        console.error('Failed to parse media info:', err, 'Line:', trimmed);
      }
    }
  });

  mediaProcess.stderr?.on('data', (data: Buffer) => {
    console.error('Media monitor error:', data.toString());
  });

  mediaProcess.on('close', (code: number | null) => {
    console.log('Media monitor process exited with code:', code);
    mediaProcess = null;
    // Restart after 5 seconds if not manually stopped
    setTimeout(() => {
      if (BrowserWindow.getAllWindows().length > 0) {
        startMediaMonitor();
      }
    }, 5000);
  });
}

function stopMediaMonitor() {
  if (mediaProcess) {
    mediaProcess.kill();
    mediaProcess = null;
  }
}

async function executeMediaCommand(command: MediaCommand): Promise<{ success: boolean; command: string; error?: string }> {
  const isDev = process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';
  const exePath = isDev
    ? path.join(__dirname, '..', 'natives', 'win-media-info.exe')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'natives', 'win-media-info.exe');

  if (!fs.existsSync(exePath)) {
    return { success: false, command, error: 'win-media-info.exe not found' };
  }

  return new Promise((resolve) => {
    const proc = spawn(exePath, [command]);
    let output = '';

    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    proc.on('close', (code: number | null) => {
      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch {
        resolve({ success: code === 0, command, error: code !== 0 ? 'Command failed' : undefined });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, command, error: err.message });
    });
  });
}

export type OSCMessage = {
  address: string;
  args: any[];
}

app.whenReady().then(async () => {
  port.once("ready", () => {
    console.log("OSC connection opened.");
  });

  port.open();

  await new Promise((resolve) => setTimeout(resolve, 100));

  ipcMain.on('env:get', (event, key: string) => {
    event.returnValue = process.env[key];
  });

  // Path join (sync)
  ipcMain.on('path:join', (event, ...paths: string[]) => {
    event.returnValue = path.join(...paths);
  });

  ipcMain.on('path:sep', (event) => {
    event.returnValue = path.sep;
  });

  // Files: read text (async)
  ipcMain.handle('files:readText', async (_event, filePath: string, enc: string = 'utf-8') => {
    if (!fs.existsSync(filePath)) return null;
    return await fs.promises.readFile(filePath, enc as BufferEncoding);
  });

  // read json
  ipcMain.handle('files:readJSON', async (_event, filePath: string, enc: string = 'utf-8') => {
    if (!fs.existsSync(filePath)) return null;
    let text = await fs.promises.readFile(filePath, enc as BufferEncoding);
    // remove BOM if present
    text = text.replace(/\uFEFF/g, '');
    return JSON.parse(text);
  });

  // Files: find files recursively (basic, no external filter for security)
  ipcMain.handle('files:findFiles', async (_event, dirPath: string) => {
    const results: string[] = [];
    const walk = (current: string) => {
      const items = fs.readdirSync(current);
      for (const item of items) {
        const full = path.join(current, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full); else results.push(full);
      }
    };
    try {
      walk(dirPath);
    } catch (_) { }
    return results;
  });

  // Files: watch
  const watchers = new Map<string, FSWatcher>();
  ipcMain.on('files:watch:start', (event, payload: { id: string; filePaths: string[]; options?: { ignoreInitial?: boolean } }) => {
    const { id, filePaths, options } = payload;
    const watcher = chokidar.watch(filePaths, { ignoreInitial: options?.ignoreInitial ?? true });
    const send = (eventName: string, filePath: string) => {
      event.sender.send('files:watch:event', { id, eventName, path: filePath });
    };
    watcher.on('add', p => send('add', p));
    watcher.on('change', p => send('change', p));
    watcher.on('unlink', p => send('unlink', p));
    watchers.set(id, watcher);
  });
  ipcMain.on('files:watch:stop', (_event, id: string) => {
    const watcher = watchers.get(id);
    if (watcher) {
      watcher.removeAllListeners();
      watcher.close();
      watchers.delete(id);
    }
  });

  // Theme IPC: get current and emit on changes
  ipcMain.on('theme:get', (event) => {
    event.returnValue = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme:changed', theme));
  });

  ipcMain.handle('osc:send', (channel, address, args: (number | string | boolean | null | undefined)[] = []) => {
    port.send({
      address,
      args: args.map(arg => {
        if (arg === null || arg === undefined) return { type: "N", value: 0 };
        const jsType = typeof arg;
        if (jsType === "number" && (Number(arg) === arg && arg % 1 === 0)) return { type: "i", value: arg };
        if (jsType === "number" && (Number(arg) === arg && arg % 1 !== 0)) return { type: "f", value: arg };
        if (jsType === "string") return { type: "s", value: arg };
        if (jsType === "boolean") return { type: arg ? "T" : "F" };
      }).filter(arg => arg) as any[]
    });
  });

  port.on("message", (message: OSCMessage) => {
    if (!message || !message.address) return;
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('osc:message', message));
  });

  ipcMain.on('frame:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('frame:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('frame:close', () => {
    mainWindow?.close();
  });

  // Media IPC handlers
  ipcMain.handle('media:execute', async (_event, command: MediaCommand) => {
    return await executeMediaCommand(command);
  });

  // Start media monitor
  startMediaMonitor();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMediaMonitor();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
