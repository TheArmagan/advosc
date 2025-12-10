import { contextBridge, ipcRenderer } from 'electron';

// Local watcher event names we propagate from main
type WatchEventName = 'add' | 'change' | 'unlink';

export type MediaCommand = 'skip-track' | 'previous-track' | 'toggle-play-pause' | 'pause' | 'resume';

export interface MediaInfo {
  title?: string;
  artist?: string;
  album?: string;
  playbackStatus: 'Playing' | 'Paused' | 'Stopped' | 'Unknown';
  position?: number;
  duration?: number;
  appName?: string;
  hasArtwork: boolean;
}

export interface TrackerBattery {
  deviceIndex: number;
  serialNumber: string | null;
  modelNumber: string | null;
  batteryLevel: number;
  isCharging: boolean;
  deviceClass: string;
}

export interface StartTimeResponse {
  startTime: number | null;
  error?: string;
}

export interface TrackerBatteryResponse {
  trackers: TrackerBattery[] | null;
  error?: string;
}

export interface PreloadElectronAPI {
  env: { get(key: string): string | undefined };
  theme: {
    current: () => 'light' | 'dark';
    onChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
  frame: { minimize: () => void; maximize: () => void; close: () => void };
  media: {
    execute: (command: MediaCommand) => Promise<{ success: boolean; command: string; error?: string }>;
    onMediaInfo: (callback: (info: MediaInfo) => void) => () => void;
  };
  osc: {
    send: (address: string, ...args: (number | string | boolean | null | undefined)[]) => void;
    onMessage: (callback: (message: { address: string; args: (number | string | boolean | null | undefined)[] }) => void) => () => void;
  };
  path: {
    join: (...paths: string[]) => string;
    sep: string;
  };
  files: {
    readText: (filePath: string, enc?: BufferEncoding) => Promise<string>;
    readJSON: (filePath: string, enc?: BufferEncoding) => Promise<any>;
    watch: (
      filePaths: string[],
      callback: (eventName: WatchEventName, path: string) => void,
      options?: { ignoreInitial?: boolean }
    ) => () => void;
    findFiles: (dirPath: string) => Promise<string[]>;
  };
  utils: {
    getStartTime: (processName: string) => Promise<StartTimeResponse>;
    getOpenVRTrackers: () => Promise<TrackerBatteryResponse>;
  };
  globalShortcut: {
    register: (accelerator: string, callback: () => void) => Promise<{ success: boolean; accelerator: string; error?: string }>;
    unregister: (accelerator: string) => Promise<{ success: boolean; accelerator: string; error?: string }>;
    unregisterAll: () => Promise<{ success: boolean; error?: string }>;
    isRegistered: (accelerator: string) => Promise<boolean>;
  };
  version: string;
}

let pathSep: string | null = null;
let version: string | null = null;

const api: PreloadElectronAPI = {
  env: { get: (key) => ipcRenderer.sendSync('env:get', key) },
  theme: {
    current: () => ipcRenderer.sendSync('theme:get') as 'light' | 'dark',
    onChange: (callback) => {
      const listener = (_e: unknown, theme: 'light' | 'dark') => callback(theme);
      ipcRenderer.on('theme:changed', listener as any);
      return () => ipcRenderer.removeListener('theme:changed', listener as any);
    },
  },
  frame: {
    minimize: () => ipcRenderer.send('frame:minimize'),
    maximize: () => ipcRenderer.send('frame:maximize'),
    close: () => ipcRenderer.send('frame:close'),
  },
  media: {
    execute: (command: MediaCommand) => ipcRenderer.invoke('media:execute', command) as Promise<{ success: boolean; command: string; error?: string }>,
    onMediaInfo: (callback) => {
      const listener = (_e: unknown, info: MediaInfo) => callback(info);
      ipcRenderer.on('media:info', listener as any);
      return () => ipcRenderer.removeListener('media:info', listener as any);
    },
  },
  osc: {
    send: (address: string, ...args: (number | string | boolean | null | undefined)[]) => {
      ipcRenderer.invoke('osc:send', address, args);
    },
    onMessage: (callback: (message: { address: string; args: (number | string | boolean | null | undefined)[] }) => void) => {
      const listener = (_e: unknown, message: { address: string; args: any[] }) => callback(message);
      ipcRenderer.on('osc:message', listener as any);
      return () => ipcRenderer.removeListener('osc:message', listener as any);
    }
  },
  path: {
    join: (...paths: string[]) => ipcRenderer.sendSync('path:join', ...paths),
    get sep() {
      if (pathSep === null) {
        pathSep = ipcRenderer.sendSync('path:sep');
      }
      return pathSep!;
    },
  },
  files: {
    readText: (filePath: string, enc?: BufferEncoding) => ipcRenderer.invoke('files:readText', filePath, enc) as Promise<string>,
    readJSON: (filePath: string, enc?: BufferEncoding) => ipcRenderer.invoke('files:readJSON', filePath, enc) as Promise<any>,
    watch: (filePaths, callback, options = {}) => {
      const id = crypto.randomUUID();
      const listener = (_e: unknown, payload: { id: string; eventName: WatchEventName; path: string }) => {
        if (payload.id === id) callback(payload.eventName, payload.path);
      };
      ipcRenderer.on('files:watch:event', listener as any);
      ipcRenderer.send('files:watch:start', { id, filePaths, options });
      return () => {
        ipcRenderer.send('files:watch:stop', id);
        ipcRenderer.removeListener('files:watch:event', listener as any);
      };
    },
    findFiles: (dirPath: string) => ipcRenderer.invoke('files:findFiles', dirPath) as Promise<string[]>,
  },
  utils: {
    getStartTime: (processName: string) => ipcRenderer.invoke('utils:startTime', processName) as Promise<StartTimeResponse>,
    getOpenVRTrackers: () => ipcRenderer.invoke('utils:openvrTrackers') as Promise<TrackerBatteryResponse>,
  },
  globalShortcut: (() => {
    const callbacks = new Map<string, () => void>();

    // Listen for shortcut triggers from main process
    ipcRenderer.on('globalShortcut:triggered', (_e: unknown, callbackId: string) => {
      const callback = callbacks.get(callbackId);
      if (callback) callback();
    });

    return {
      register: async (accelerator: string, callback: () => void) => {
        const callbackId = `${accelerator}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        callbacks.set(callbackId, callback);
        const result = await ipcRenderer.invoke('globalShortcut:register', accelerator, callbackId) as { success: boolean; accelerator: string; error?: string };
        if (!result.success) {
          callbacks.delete(callbackId);
        }
        return result;
      },
      unregister: async (accelerator: string) => {
        // Remove callbacks that match this accelerator
        for (const [id] of callbacks) {
          if (id.startsWith(`${accelerator}-`)) {
            callbacks.delete(id);
          }
        }
        return await ipcRenderer.invoke('globalShortcut:unregister', accelerator) as { success: boolean; accelerator: string; error?: string };
      },
      unregisterAll: async () => {
        callbacks.clear();
        return await ipcRenderer.invoke('globalShortcut:unregisterAll') as { success: boolean; error?: string };
      },
      isRegistered: (accelerator: string) => ipcRenderer.invoke('globalShortcut:isRegistered', accelerator) as Promise<boolean>,
    };
  })(),
  get version() {
    if (version === null) {
      version = ipcRenderer.sendSync('app:version');
    }
    return version!;
  }
};

contextBridge.exposeInMainWorld('ADVOSCNative', api);
