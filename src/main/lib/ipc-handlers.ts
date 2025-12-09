import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { OSC } from './osc';
import { executeMediaCommand } from './media';
import { getMainWindow } from './window';
import { getProcessStartTime, getOpenVRTrackers } from './advosc-utils';
import type { MediaCommand } from './types';

const watchers = new Map<string, FSWatcher>();

export function setupIpcHandlers(port: OSC): void {
  // Environment
  ipcMain.on('env:get', (event, key: string) => {
    event.returnValue = process.env[key];
  });

  // Path utilities (sync)
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

  // Files: read JSON (async)
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

  // OSC handlers
  ipcMain.handle('osc:send', (_channel, address, args: (number | string | boolean | null | undefined)[] = []) => {
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

  port.on("message", (message) => {
    if (!message || !message.address) return;
    const msg = {
      address: message.address,
      args: message.args.map((arg: any) => arg.value)
    };
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('osc:message', msg));
  });

  // Frame controls
  ipcMain.on('frame:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('frame:maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('frame:close', () => {
    getMainWindow()?.close();
  });

  // App info
  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion();
  });

  // Media IPC handlers
  ipcMain.handle('media:execute', async (_event, command: MediaCommand) => {
    return await executeMediaCommand(command);
  });

  // Utils IPC handlers
  ipcMain.handle('utils:startTime', async (_event, processName: string) => {
    return await getProcessStartTime(processName);
  });

  ipcMain.handle('utils:openvrTrackers', async () => {
    return await getOpenVRTrackers();
  });
}
