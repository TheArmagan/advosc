import type { MessagePortMain } from "electron";
import type { ClientMessage, EngineMessage } from "$shared/engine-protocol";
import { writable, type Readable, type Writable } from "$shared/store";
import { localData } from "../persistence/local-data";
import { engineConfig } from "../runtime/config";

/**
 * The engine's side of the window connection. One `Client` per open window, gone when the
 * window is. With no client, none of this serializes anything: mirrors only remember their
 * latest value, and streams don't get published at all.
 *
 * Persisted stores (`synced`) are keyed by their localData key, and that key is the sync unit:
 * anything that changes a key reaches every window, whoever changed it.
 */

interface Client {
  id: number;
  port: MessagePortMain;
  /** Keys this window subscribed to. Only streams use this. */
  subs: Set<string>;
  /** Last write sequence applied per key, sent back so the window can spot stale echoes. */
  acks: Map<string, number>;
  /** Said hello before the engine finished booting. */
  helloPending: boolean;
  welcomed: boolean;
}

type Handler = (...args: any[]) => unknown;

const clients = new Map<number, Client>();
const handlers = new Map<string, Handler>();
const syncedStores = new Map<string, Writable<any>>();
const mirrors = new Map<string, () => unknown>();
const streams = new Map<string, () => Record<string, unknown>>();
const streamListeners = new Set<() => void>();

let ready = false;
/** The write being applied right now, so it isn't echoed straight back to its sender. */
let applying: { client: Client; json: string | null } | null = null;

function send(client: Client, message: EngineMessage) {
  try {
    client.port.postMessage(JSON.stringify(message));
  } catch (error) {
    console.warn("Dropping a window that can't be written to:", error);
    removeClient(client.id);
  }
}

function broadcast(message: EngineMessage) {
  for (const client of clients.values()) {
    if (client.welcomed) send(client, message);
  }
}

function welcome(client: Client) {
  client.welcomed = true;
  const mirrorValues: Record<string, unknown> = {};
  for (const [key, read] of mirrors) mirrorValues[key] = read();
  send(client, {
    t: "welcome",
    data: localData.dump(),
    mirrors: mirrorValues,
    info: { version: engineConfig.version, safeMode: engineConfig.safeMode },
  });
}

async function handleCall(client: Client, id: number, method: string, args: unknown[]) {
  const handler = handlers.get(method);
  if (!handler) {
    send(client, { t: "res", id, ok: false, e: `Unknown engine method: ${method}` });
    return;
  }
  try {
    send(client, { t: "res", id, ok: true, v: await handler(...args) });
  } catch (error) {
    send(client, { t: "res", id, ok: false, e: (error as Error)?.message || String(error) });
  }
}

function applyWrite(client: Client, key: string, sequence: number, json: string | null) {
  client.acks.set(key, sequence);
  if (json === localData.getRaw(key)) return;

  applying = { client, json };
  try {
    const store = syncedStores.get(key);
    if (json === null) localData.remove(key);
    else if (store) store.set(JSON.parse(json));
    else localData.setRaw(key, json);
  } catch (error) {
    console.error(`Could not apply a write to "${key}":`, error);
  } finally {
    applying = null;
  }
}

function broadcastKey(key: string, json: string | null) {
  for (const client of clients.values()) {
    if (!client.welcomed) continue;
    // A store subscriber can react by changing the value again, and the sender does need
    // that version, so this only skips the exact value it sent.
    if (applying?.client === client && applying.json === json) continue;
    send(client, { t: "state", k: key, v: json, a: client.acks.get(key) ?? 0 });
  }
}

function setSubscribed(client: Client, key: string, subscribed: boolean) {
  if (subscribed) {
    client.subs.add(key);
    const snapshot = streams.get(key);
    if (snapshot) send(client, { t: "stream", k: key, r: true, d: snapshot() });
  } else {
    client.subs.delete(key);
  }
  for (const listener of streamListeners) listener();
}

function handleMessage(client: Client, raw: string) {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    console.warn("Ignoring a malformed message from a window.");
    return;
  }

  switch (message.t) {
    case "hello":
      if (ready) welcome(client);
      else client.helloPending = true;
      break;
    case "call":
      void handleCall(client, message.id, message.m, message.a);
      break;
    case "write":
      applyWrite(client, message.k, message.s, message.v);
      break;
    case "sub":
      setSubscribed(client, message.k, true);
      break;
    case "unsub":
      setSubscribed(client, message.k, false);
      break;
  }
}

export function addClient(id: number, port: MessagePortMain) {
  const client: Client = {
    id,
    port,
    subs: new Set(),
    acks: new Map(),
    helloPending: false,
    welcomed: false,
  };
  clients.set(id, client);
  port.on("message", (event) => handleMessage(client, event.data as string));
  port.on("close", () => removeClient(id));
  port.start();
}

function removeClient(id: number) {
  if (!clients.delete(id)) return;
  for (const listener of streamListeners) listener();
}

/** Everything is wired up, so windows waiting on `hello` can be answered. */
export function markReady() {
  ready = true;
  for (const client of clients.values()) {
    if (client.helloPending) welcome(client);
  }
}

export function hasClients() {
  return clients.size > 0;
}

// ---------------------------------------------------------------------- rpc

export function handle(method: string, handler: Handler) {
  handlers.set(method, handler);
}

/** Registers every method of `target` as `<prefix>.<name>`. */
export function handleAll(prefix: string, target: Record<string, Handler>) {
  for (const [name, handler] of Object.entries(target)) handle(`${prefix}.${name}`, handler);
}

// ------------------------------------------------------------------- events

export function emit(name: string, payload?: unknown) {
  broadcast({ t: "evt", n: name, p: payload });
}

// ------------------------------------------------------------------- synced

/**
 * A persisted store that every window sees and can write. A window's write lands here as a
 * normal `set`, so engine code reacts to it the same way it reacts to its own changes, and
 * that also covers imports and restored presets.
 */
export function synced<T>(
  key: string,
  initial: T,
  /** Normalizes what's on disk, such as filling in fields added since it was saved. */
  load: (stored: any) => T = (stored) => stored,
): Writable<T> {
  const store = writable<T>(load(localData.get(key, initial)));
  store.subscribe((value) => localData.set(key, value));
  syncedStores.set(key, store);
  return store;
}

localData.onChange(broadcastKey);

// ------------------------------------------------------------------ mirrors

/**
 * Publishes a read-only store. Sends trail by `coalesceMs`, so a burst only costs one frame,
 * and a window that connects gets the latest value in its `welcome`.
 */
export function mirror<T>(key: string, store: Readable<T>, coalesceMs = 100) {
  let latest!: T;
  let timer: ReturnType<typeof setTimeout> | null = null;

  store.subscribe((value) => {
    latest = value;
    if (timer || clients.size === 0) return;
    timer = setTimeout(() => {
      timer = null;
      broadcast({ t: "mirror", k: key, v: latest });
    }, coalesceMs);
  });

  mirrors.set(key, () => latest);
}

// ------------------------------------------------------------------ streams

export interface Stream {
  /** True while at least one window is subscribed. Check this before doing any work for it. */
  active(): boolean;
  publish(delta: Record<string, unknown>): void;
  /** Replaces what windows hold, for when the whole set changed. */
  reset(full: Record<string, unknown>): void;
}

export function stream(key: string, snapshot: () => Record<string, unknown>): Stream {
  streams.set(key, snapshot);

  const subscribers = () => [...clients.values()].filter((client) => client.subs.has(key));

  return {
    active: () => subscribers().length > 0,
    publish(delta) {
      for (const client of subscribers()) send(client, { t: "stream", k: key, d: delta });
    },
    reset(full) {
      for (const client of subscribers()) send(client, { t: "stream", k: key, r: true, d: full });
    },
  };
}
