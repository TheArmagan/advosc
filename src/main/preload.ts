import { contextBridge, ipcRenderer } from 'electron';

// Define channel sets with literal types
const TO_MAIN_CHANNELS = ['toMain'] as const;
const FROM_MAIN_CHANNELS = ['fromMain'] as const;

export type ToMainChannel = typeof TO_MAIN_CHANNELS[number];
export type FromMainChannel = typeof FROM_MAIN_CHANNELS[number];

interface PreloadEnvAPI {
  get(key: string): string | undefined;
}

export interface PreloadElectronAPI {
  send(channel: ToMainChannel, data: unknown): void;
  receive(channel: FromMainChannel, func: (...args: unknown[]) => void): void;
  env: PreloadEnvAPI;
  theme: {
    current: () => 'light' | 'dark';
    onChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
}

const api: PreloadElectronAPI = {
  send: (channel, data) => {
    if (TO_MAIN_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    if (FROM_MAIN_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  env: {
    get: (key) => process.env[key],
  },
  theme: {
    current: () => ipcRenderer.sendSync('theme:get-sync') as 'light' | 'dark',
    onChange: (callback) => {
      const listener = (_e: unknown, theme: 'light' | 'dark') => callback(theme);
      ipcRenderer.on('theme:changed', listener as any);
      return () => ipcRenderer.removeListener('theme:changed', listener as any);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
