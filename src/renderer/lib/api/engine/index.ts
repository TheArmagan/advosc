import type { ClientMessage, EngineInfo, EngineMessage } from "$shared/engine-protocol";
import { get, writable, type Readable, type Writable } from "$shared/store";

/**
 * This window's connection to the engine. All state lives there. What's here is a hydrated
 * copy, which is why reads stay synchronous and why nothing may be imported from `$lib/api`
 * until `connectEngine` has resolved: stores read their initial value when they're created.
 */

const bridge = window.ADVOSCNative.engine;

/** Every persisted key as a JSON string, same as localStorage held them. */
const raw = new Map<string, string>();
const syncedStores = new Map<string, Writable<any>>();
const handedOut = new Map<string, Writable<any>>();
/** Sequence of the last write sent per key. Echoes older than this are stale. */
const sequences = new Map<string, number>();

const mirrorValues = new Map<string, unknown>();
const mirrorStores = new Map<string, Writable<any>>();

interface StreamEntry {
  store: Writable<Record<string, any>>;
  subscribers: number;
}
const streams = new Map<string, StreamEntry>();

let onWelcome: ((info: EngineInfo) => void) | null = null;
const infoListeners = new Set<(info: EngineInfo) => void>();

function post(message: ClientMessage) {
  bridge.send(JSON.stringify(message));
}

function parse<T>(json: string | null | undefined, fallback: T): T {
  if (json === null || json === undefined) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function applyState(key: string, json: string | null) {
  if (json === null) raw.delete(key);
  else raw.set(key, json);
  const store = syncedStores.get(key);
  if (store && json !== null) store.set(JSON.parse(json));
}

function handleWelcome(message: Extract<EngineMessage, { t: "welcome" }>) {
  // A reconnect means a new engine, which hasn't seen any of our sequence numbers.
  sequences.clear();

  for (const [key, json] of Object.entries(message.data)) {
    if (raw.get(key) !== json) applyState(key, json);
  }
  for (const [key, value] of Object.entries(message.mirrors)) {
    mirrorValues.set(key, value);
    mirrorStores.get(key)?.set(value);
  }
  for (const [key, entry] of streams) {
    if (entry.subscribers > 0 && !document.hidden) post({ t: "sub", k: key });
  }

  onWelcome?.(message.info);
  onWelcome = null;
  for (const listener of infoListeners) listener(message.info);
}

function handleMessage(json: string) {
  const message = JSON.parse(json) as EngineMessage;

  switch (message.t) {
    case "welcome":
      handleWelcome(message);
      break;
    case "state":
      // We've sent something newer, and the echo of that is on its way. Applying this would
      // put an older value under the cursor while someone is typing.
      if ((sequences.get(message.k) ?? 0) > message.a) break;
      if (raw.get(message.k) !== (message.v ?? undefined)) applyState(message.k, message.v);
      break;
    case "mirror":
      mirrorValues.set(message.k, message.v);
      mirrorStores.get(message.k)?.set(message.v);
      break;
    case "stream": {
      const entry = streams.get(message.k);
      if (!entry) break;
      if (message.r) entry.store.set(message.d);
      else entry.store.update((current) => ({ ...current, ...message.d }));
      break;
    }
  }
}

/** Resolves once the engine has handed over its state. Safe to wait on while it's booting. */
export function connectEngine(): Promise<EngineInfo> {
  return new Promise((resolve) => {
    onWelcome = resolve;
    bridge.onMessage(handleMessage);
    bridge.onConnected(() => post({ t: "hello" }));
    bridge.connect();

    // Hidden windows have nothing to draw, so the high-rate streams can stop.
    document.addEventListener("visibilitychange", () => {
      for (const [key, entry] of streams) {
        if (entry.subscribers > 0) post({ t: document.hidden ? "unsub" : "sub", k: key });
      }
    });
  });
}

/** Fires each time an engine picks this window up, so a restart can be noticed. */
export function onEngineInfo(listener: (info: EngineInfo) => void) {
  infoListeners.add(listener);
}

/** Calls a method on the engine. Rejects if the engine answers with an error or restarts. */
export function call<T = any>(method: string, ...args: unknown[]): Promise<T> {
  // JSON turns a trailing undefined into null, which would defeat default parameters.
  while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
  return bridge.call(method, JSON.stringify(args)) as Promise<T>;
}

/** For calls nothing waits on. A failure here has nowhere useful to go. */
export function fire(method: string, ...args: unknown[]) {
  call(method, ...args).catch((error) => console.warn(`${method} failed:`, error));
}

export function callModule<T = any>(id: string, method: string, ...args: unknown[]): Promise<T> {
  return call<T>("module.call", id, method, args);
}

// ---------------------------------------------------------------- local data

function writeRaw(key: string, json: string | null) {
  const sequence = (sequences.get(key) ?? 0) + 1;
  sequences.set(key, sequence);
  post({ t: "write", k: key, s: sequence, v: json });
}

export const rawStore = {
  get: (key: string) => raw.get(key) ?? null,
  set(key: string, json: string) {
    if (raw.get(key) === json) return;
    raw.set(key, json);
    writeRaw(key, json);
  },
  remove(key: string) {
    if (!raw.delete(key)) return;
    writeRaw(key, null);
  },
};

// -------------------------------------------------------------------- stores

/**
 * A persisted store. Writes apply here first and then go to the engine, so an input bound to
 * one never waits on a round trip.
 */
export function synced<T>(key: string, fallback: T): Writable<T> {
  const existing = handedOut.get(key);
  if (existing) return existing;

  // The engine's updates land on `inner` directly, so they never get sent back to it.
  const inner = writable<T>(parse(raw.get(key), fallback));
  syncedStores.set(key, inner);

  function set(value: T) {
    inner.set(value);
    // Runes proxies can be nested anywhere in here, and JSON is what gets them across.
    const json = JSON.stringify(value);
    if (json !== undefined) rawStore.set(key, json);
  }

  const store: Writable<T> = {
    subscribe: inner.subscribe,
    set,
    update: (fn) => set(fn(get(inner))),
  };
  handedOut.set(key, store);
  return store;
}

/** Read-only state published by the engine. Always current, so a plain `get` works. */
export function mirrored<T>(key: string, fallback: T): Readable<T> {
  let store = mirrorStores.get(key);
  if (!store) {
    store = writable<T>(mirrorValues.has(key) ? (mirrorValues.get(key) as T) : fallback);
    mirrorStores.set(key, store);
  }
  return { subscribe: store.subscribe };
}

/** High-rate state that only flows while something here is subscribed. */
export function streamed<V>(key: string): Readable<Record<string, V>> {
  const entry: StreamEntry = {
    store: writable<Record<string, any>>({}, () => {
      entry.subscribers = 1;
      if (!document.hidden) post({ t: "sub", k: key });
      return () => {
        entry.subscribers = 0;
        post({ t: "unsub", k: key });
      };
    }),
    subscribers: 0,
  };
  streams.set(key, entry);
  return { subscribe: entry.store.subscribe };
}
