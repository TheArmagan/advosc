import { contextBridge, ipcRenderer } from 'electron';

// Local watcher event names we propagate from main
type WatchEventName = 'add' | 'change' | 'unlink';

export interface PreloadElectronAPI {
  env: { get(key: string): string | undefined };
  theme: {
    current: () => 'light' | 'dark';
    onChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
  frame: { minimize: () => void; maximize: () => void; close: () => void };
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
}

let pathSep: string | null = null;

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
};

contextBridge.exposeInMainWorld('ADVOSCNative', api);
