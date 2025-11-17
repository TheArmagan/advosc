import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { fileURLToPath } from 'url';
// @ts-ignore
import OSCReq from "osc";

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const VRChatReceiverPort = 9001;
const VRChatSenderPort = 9000;

const port = new OSCReq.UDPPort({
  localAddress: "127.0.0.1",
  localPort: VRChatReceiverPort,
  remoteAddress: "127.0.0.1",
  remotePort: VRChatSenderPort,
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    minWidth: 1200,
    height: 800,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    frame: false
  });

  // Set CSP header
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"],
      },
    });
  });

  // --

  // Load the index.html
  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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
    return await fs.promises.readFile(filePath, enc as BufferEncoding);
  });

  // read json
  ipcMain.handle('files:readJSON', async (_event, filePath: string, enc: string = 'utf-8') => {
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
        if (jsType === "boolean") return { type: arg ? "T" : "F", value: arg };
      })
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


  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
