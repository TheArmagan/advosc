import * as fs from "fs";
import * as path from "path";
import { engineConfig } from "../runtime/config";
import { writeFileAtomicSync } from "./file-store";

/**
 * Throwaway data, in its own file so it stays out of settings, backups and the renderer's
 * hydration payload. Losing this file only means refetching.
 */

const FLUSH_DELAY_MS = 5000;

const cachePath = path.join(engineConfig.dataDir, "cache.json");

function read(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const entries = read();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  } else {
    return;
  }
  try {
    writeFileAtomicSync(cachePath, JSON.stringify(entries));
  } catch (error) {
    console.warn("Could not save the cache:", error);
  }
}

export const cacheData = {
  get<T>(key: string, defaultValue: T): T {
    return (entries[key] as T) ?? defaultValue;
  },
  set(key: string, value: unknown) {
    entries[key] = value;
    if (!flushTimer) flushTimer = setTimeout(flushNow, FLUSH_DELAY_MS);
  },
  flush: flushNow,
};
