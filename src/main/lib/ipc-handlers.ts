import { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import chokidar, { type FSWatcher } from 'chokidar';
import { OSC } from './osc';
import { executeMediaCommand } from './media';
import { getMainWindow } from './window';
import { getProcessStartTime, getOpenVRTrackers } from './advosc-utils';
import { getSystemInfo } from './system-monitor';
import {
  connectBleDevice,
  disconnectBleDevice,
  getBleState,
  startBleScan,
  stopBleScan,
} from './ble-heart-rate';
import { performHttpRequest, type HttpRequestOptions } from './http-request';
import {
  getSpeechServerState,
  openSpeechPage,
  sendSpeechCommand,
  setSpeechConfig,
  startSpeechServer,
  stopSpeechServer,
  type SpeechServerConfig,
} from './speech-server';
import {
  DEFAULT_OSC_SOURCES,
  loadOSCSources,
  sanitizeSources,
  saveOSCSources,
  toActiveSources,
  type OSCSourceConfig,
} from './osc-config';
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
    // A user-configured setup may have no send endpoint at all; don't reject into the renderer.
    if (!port.hasSendTarget()) return;
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

  // OSC sendCustom handler - allows explicit type specification
  ipcMain.handle('osc:sendCustom', (_channel, address: string, args: { value: number | string | boolean | null | undefined, type: "Float" | "Int" | "Bool" | "String" | "Null" | "Undefined" }[] = []) => {
    if (!port.hasSendTarget()) return;
    port.send({
      address,
      args: args.map(arg => {
        switch (arg.type) {
          case "Float":
            return { type: "f", value: Number(arg.value) };
          case "Int":
            return { type: "i", value: Math.floor(Number(arg.value)) };
          case "Bool":
            return { type: arg.value ? "T" : "F" };
          case "String":
            return { type: "s", value: String(arg.value ?? "") };
          case "Null":
          case "Undefined":
          default:
            return { type: "N", value: 0 };
        }
      }) as any[]
    });
  });

  // OSC source configuration
  const applySources = (sources: OSCSourceConfig[]) => {
    saveOSCSources(sources);
    port.reconfigure(toActiveSources(sources));
    return { success: true, sources, status: port.getStatus() };
  };

  ipcMain.handle('osc:getSources', () => loadOSCSources());

  ipcMain.handle('osc:getDefaultSources', () => DEFAULT_OSC_SOURCES);

  ipcMain.handle('osc:getStatus', () => port.getStatus());

  ipcMain.handle('osc:setSources', (_event, sources: unknown) => {
    try {
      const sanitized = sanitizeSources(sources);
      if (!sanitized.length) {
        return { success: false, error: 'At least one valid OSC source is required.' };
      }
      return applySources(sanitized);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('osc:resetSources', () => {
    try {
      return applySources([...DEFAULT_OSC_SOURCES]);
    } catch (error) {
      return { success: false, error: String(error) };
    }
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

  // Open a link in the user's default browser (https only)
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Only https links can be opened.' };
      }
      await shell.openExternal(parsed.toString());
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // HTTP requests on behalf of the renderer (chatbox Request module). Runs here so
  // user-configured endpoints are not subject to the renderer's CORS rules.
  ipcMain.handle('http:request', async (_event, options: HttpRequestOptions) => {
    return await performHttpRequest(options);
  });

  // Speech recognition server. The page it serves runs in the user's browser, because
  // the Web Speech API does not exist inside Electron.
  ipcMain.handle('speech:start', async (_event, options: { port?: number; config?: Partial<SpeechServerConfig> } = {}) => {
    return await startSpeechServer(options);
  });

  ipcMain.handle('speech:stop', async () => {
    return await stopSpeechServer();
  });

  ipcMain.handle('speech:getState', () => getSpeechServerState());

  ipcMain.handle('speech:setConfig', (_event, config: Partial<SpeechServerConfig>) => {
    return setSpeechConfig(config || {});
  });

  ipcMain.handle('speech:command', (_event, action: 'start' | 'stop' | 'clear') => {
    return sendSpeechCommand(action);
  });

  ipcMain.handle('speech:openPage', async () => {
    return await openSpeechPage();
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

  ipcMain.handle('utils:systemInfo', () => {
    return getSystemInfo();
  });

  // BLE heart rate IPC handlers
  ipcMain.handle('ble:scan', (_event, options: { seconds?: number; all?: boolean } = {}) => {
    return startBleScan(options);
  });

  ipcMain.handle('ble:stopScan', () => stopBleScan());

  ipcMain.handle('ble:connect', (_event, address: string) => connectBleDevice(address));

  ipcMain.handle('ble:disconnect', (_event, address: string) => disconnectBleDevice(address));

  ipcMain.handle('ble:getState', () => getBleState());

  // Global shortcuts IPC handlers
  const shortcutCallbacks = new Map<string, string>(); // accelerator -> callback id

  ipcMain.handle('globalShortcut:register', (_event, accelerator: string, callbackId: string) => {
    try {
      // Unregister existing shortcut if it exists
      if (shortcutCallbacks.has(accelerator)) {
        globalShortcut.unregister(accelerator);
      }

      const success = globalShortcut.register(accelerator, () => {
        BrowserWindow.getAllWindows().forEach((w) => {
          w.webContents.send('globalShortcut:triggered', callbackId);
        });
      });

      if (success) {
        shortcutCallbacks.set(accelerator, callbackId);
      }

      return { success, accelerator };
    } catch (error) {
      return { success: false, accelerator, error: String(error) };
    }
  });

  ipcMain.handle('globalShortcut:unregister', (_event, accelerator: string) => {
    try {
      globalShortcut.unregister(accelerator);
      shortcutCallbacks.delete(accelerator);
      return { success: true, accelerator };
    } catch (error) {
      return { success: false, accelerator, error: String(error) };
    }
  });

  ipcMain.handle('globalShortcut:unregisterAll', () => {
    try {
      globalShortcut.unregisterAll();
      shortcutCallbacks.clear();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('globalShortcut:isRegistered', (_event, accelerator: string) => {
    return globalShortcut.isRegistered(accelerator);
  });
}
