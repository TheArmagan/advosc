import { contextBridge, ipcRenderer } from 'electron';

export interface PreloadElectronAPI {
  env: {
    get(key: string): string | undefined;
  };
  theme: {
    current: () => 'light' | 'dark';
    onChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
  frame: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  osc: {
    send: (address: string, args?: (number | string | boolean | null | undefined)[]) => void;
    onMessage: (callback: (message: { address: string; args: (number | string | boolean | null | undefined)[] }) => void) => () => void;
  };
}

const api: PreloadElectronAPI = {
  env: {
    get: (key) => ipcRenderer.sendSync('env:get', key),
  },
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
    send: (address: string, args: (number | string | boolean | null | undefined)[] = []) => {
      ipcRenderer.invoke('osc:send', address, args);
    },
    onMessage: (callback: (message: { address: string; args: (number | string | boolean | null | undefined)[] }) => void) => {
      const listener = (_e: unknown, message: { address: string; args: any[] }) => callback(message);
      ipcRenderer.on('osc:message', listener as any);
      return () => ipcRenderer.removeListener('osc:message', listener as any);
    }
  }
};

contextBridge.exposeInMainWorld('ADVOSCNative', api);
