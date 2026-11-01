import * as path from "path";
import { engineConfig } from "../runtime/config";
import {
  KEY_PREFIX,
  loadStore,
  saveStore,
  type StoreEntries,
  type StoreMeta,
} from "./file-store";

/**
 * Same API as the renderer's old `localData`, on top of a JSON file. Values stay as JSON
 * strings in memory: `get` parses a fresh copy and `set` takes a snapshot, which is exactly
 * what localStorage did, so every caller keeps its old behaviour and stays synchronous.
 */

const FLUSH_DEBOUNCE_MS = 500;
const FLUSH_MAX_WAIT_MS = 3000;
const FLUSH_RETRY_MS = 1000;

const loaded = loadStore(engineConfig.dataDir);
if (loaded.source === "backup") console.warn("Loaded settings from the backup file.");

const meta: StoreMeta | null = loaded.meta;
const entries = new Map<string, string>(Object.entries(loaded.entries));

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirtySince = 0;

type ChangeListener = (key: string, json: string | null) => void;
const changeListeners = new Set<ChangeListener>();

function fullKey(key: string) {
  return `${KEY_PREFIX}${key}`;
}

function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!dirtySince) return;

  try {
    saveStore(engineConfig.dataDir, meta, Object.fromEntries(entries));
    dirtySince = 0;
  } catch (error) {
    console.error("Could not save settings, retrying:", error);
    flushTimer = setTimeout(flushNow, FLUSH_RETRY_MS);
  }
}

function scheduleFlush() {
  const now = Date.now();
  if (!dirtySince) dirtySince = now;
  if (flushTimer) clearTimeout(flushTimer);
  const wait = Math.min(FLUSH_DEBOUNCE_MS, Math.max(0, dirtySince + FLUSH_MAX_WAIT_MS - now));
  flushTimer = setTimeout(flushNow, wait);
}

function changed(key: string, json: string | null) {
  scheduleFlush();
  for (const listener of changeListeners) listener(key, json);
}

function getLocalData(key: string, defaultValue: any = null): any {
  const json = entries.get(fullKey(key));
  if (json === undefined) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

function setRaw(key: string, json: string) {
  const full = fullKey(key);
  if (entries.get(full) === json) return;
  entries.set(full, json);
  changed(key, json);
}

function setLocalData(key: string, value: any): void {
  const json = JSON.stringify(value);
  if (json === undefined) removeLocalData(key);
  else setRaw(key, json);
}

function removeLocalData(key: string): void {
  if (entries.delete(fullKey(key))) changed(key, null);
}

function updateLocalData(key: string, updater: (currentValue: any) => any) {
  const next = updater(getLocalData(key));
  setLocalData(key, next);
  return next;
}

async function hasLocalData(key: string): Promise<boolean> {
  return entries.has(fullKey(key));
}

export const localData = {
  get: getLocalData,
  set: setLocalData,
  has: hasLocalData,
  remove: removeLocalData,
  update: updateLocalData,
  /** The stored JSON for a key, without parsing it. */
  getRaw(key: string): string | null {
    return entries.get(fullKey(key)) ?? null;
  },
  setRaw,
  /** Every key without its prefix, for hydrating a window. */
  dump(): StoreEntries {
    const result: StoreEntries = {};
    for (const [key, json] of entries) {
      if (key.startsWith(KEY_PREFIX)) result[key.slice(KEY_PREFIX.length)] = json;
    }
    return result;
  },
  onChange(listener: ChangeListener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },
  /** Called on shutdown. Writes synchronously, so it's done when this returns. */
  flush: flushNow,
  /** What the legacy import recorded, such as the old audio outputs. */
  getMeta(): StoreMeta | null {
    return meta;
  },
  filePath: path.join(engineConfig.dataDir, "advosc-data.json"),
};
