import { contextBridge, ipcRenderer } from 'electron';
import type {
  BleEvent,
  BleState,
  OSCSourceConfig,
  OSCSourcesResult,
  OSCSourceStatus,
  StartupSettings,
} from '../shared/native-types';
import type { PanicApi, PanicState } from '../shared/toys';

export type * from '../shared/native-types';

type EngineEventListener = (name: string, payload: unknown) => void;

export interface PreloadElectronAPI {
  theme: {
    current: () => 'light' | 'dark';
    onChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
  };
  frame: { minimize: () => void; maximize: () => void; close: () => void };
  /** Each frame is a JSON string, because the renderer's objects can be runes proxies. */
  engine: {
    connect: () => void;
    onConnected: (callback: () => void) => () => void;
    send: (frame: string) => void;
    onMessage: (callback: (frame: string) => void) => () => void;
    onEvent: (callback: EngineEventListener) => () => void;
    call: (method: string, argsJson: string) => Promise<unknown>;
  };
  osc: {
    getSources: () => Promise<OSCSourceConfig[]>;
    getDefaultSources: () => Promise<OSCSourceConfig[]>;
    getStatus: () => Promise<OSCSourceStatus[]>;
    setSources: (sources: OSCSourceConfig[]) => Promise<OSCSourcesResult>;
    resetSources: () => Promise<OSCSourcesResult>;
  };
  ble: {
    scan: (options?: { seconds?: number; all?: boolean }) => Promise<BleState>;
    stopScan: () => Promise<BleState>;
    connect: (address: string) => Promise<BleState>;
    disconnect: (address: string) => Promise<BleState>;
    getState: () => Promise<BleState>;
    onEvent: (callback: (event: BleEvent) => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
  startup: {
    get: () => Promise<StartupSettings>;
    set: (patch: Partial<Pick<StartupSettings, 'startHidden' | 'gpuAcceleration'>>) => Promise<StartupSettings>;
    restart: () => void;
  };
  /** Plain IPC to main, never through the engine, so it works with the engine hung or dead. */
  panic: PanicApi;
  /** `advosc://` links from main, one at a time. `ready` asks for the next one. */
  deeplink: {
    ready: () => void;
    onLink: (callback: (link: string) => void) => () => void;
  };
  version: string;
}

let version: string | null = null;

// ------------------------------------------------------------- engine channel

/** The channel main brokers for this window. A new one arrives if the engine restarts. */
let port: MessagePort | null = null;
let nextCallId = 1;

const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const connectedListeners = new Set<() => void>();
const frameListeners = new Set<(frame: string) => void>();
const eventListeners = new Set<EngineEventListener>();

function send(frame: string) {
  port?.postMessage(frame);
}

function call(method: string, argsJson: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!port) {
      reject(new Error('Not connected to the engine.'));
      return;
    }
    const id = nextCallId++;
    pending.set(id, { resolve, reject });
    send(`{"t":"call","id":${id},"m":${JSON.stringify(method)},"a":${argsJson}}`);
  });
}

function callEngine<T>(method: string, ...args: unknown[]): Promise<T> {
  return call(method, JSON.stringify(args)) as Promise<T>;
}

function handleFrame(frame: string) {
  // Frames are compared by prefix so a 30 Hz stream isn't parsed here and again in the page.
  if (frame.startsWith('{"t":"res"')) {
    const message = JSON.parse(frame) as { id: number; ok: boolean; v?: unknown; e?: string };
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.v);
    else entry.reject(new Error(message.e || 'Engine call failed'));
    return;
  }

  if (frame.startsWith('{"t":"evt"')) {
    const message = JSON.parse(frame) as { n: string; p?: unknown };
    for (const listener of eventListeners) listener(message.n, message.p);
    return;
  }

  for (const listener of frameListeners) listener(frame);
}

ipcRenderer.on('engine:port', (event) => {
  port?.close();

  // Anything still in flight went to an engine that no longer exists.
  for (const entry of pending.values()) entry.reject(new Error('The engine restarted.'));
  pending.clear();

  port = event.ports[0];
  port.onmessage = (message) => handleFrame(message.data as string);
  port.start();

  for (const listener of connectedListeners) listener();
});

// ------------------------------------------------------------------------ api

const api: PreloadElectronAPI = {
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
  engine: {
    connect: () => ipcRenderer.send('engine:connect'),
    onConnected: (callback) => {
      connectedListeners.add(callback);
      return () => connectedListeners.delete(callback);
    },
    send,
    onMessage: (callback) => {
      frameListeners.add(callback);
      return () => frameListeners.delete(callback);
    },
    onEvent: (callback) => {
      eventListeners.add(callback);
      return () => eventListeners.delete(callback);
    },
    call,
  },
  osc: {
    getSources: () => callEngine('osc.getSources'),
    getDefaultSources: () => callEngine('osc.getDefaultSources'),
    getStatus: () => callEngine('osc.getStatus'),
    setSources: (sources) => callEngine('osc.setSources', sources),
    resetSources: () => callEngine('osc.resetSources'),
  },
  ble: {
    scan: (options = {}) => callEngine('ble.scan', options),
    stopScan: () => callEngine('ble.stopScan'),
    connect: (address) => callEngine('ble.connect', address),
    disconnect: (address) => callEngine('ble.disconnect', address),
    getState: () => callEngine('ble.getState'),
    onEvent: (callback) => {
      const listener: EngineEventListener = (name, payload) => {
        if (name === 'ble:event') callback(payload as BleEvent);
      };
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<{ success: boolean; error?: string }>,
  },
  startup: {
    get: () => ipcRenderer.invoke('startup:get'),
    set: (patch) => ipcRenderer.invoke('startup:set', { ...patch }),
    restart: () => ipcRenderer.send('startup:restart'),
  },
  panic: {
    get: () => ipcRenderer.invoke('panic:get'),
    trigger: () => ipcRenderer.invoke('panic:trigger'),
    rearm: () => ipcRenderer.invoke('panic:rearm'),
    setHotkey: (accelerator) => ipcRenderer.invoke('panic:setHotkey', accelerator),
    onChange: (callback) => {
      const listener = (_e: unknown, state: PanicState) => callback(state);
      ipcRenderer.on('panic:changed', listener as any);
      return () => ipcRenderer.removeListener('panic:changed', listener as any);
    },
  },
  deeplink: {
    ready: () => ipcRenderer.send('deeplink:ready'),
    onLink: (callback) => {
      const listener = (_e: unknown, link: string) => callback(link);
      ipcRenderer.on('deeplink:open', listener as any);
      return () => ipcRenderer.removeListener('deeplink:open', listener as any);
    },
  },
  get version() {
    if (version === null) {
      version = ipcRenderer.sendSync('app:version');
    }
    return version!;
  }
};

contextBridge.exposeInMainWorld('ADVOSCNative', api);
