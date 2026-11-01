import * as fs from "fs";
import * as path from "path";

/**
 * The on-disk format, shared by main (which writes it once during the legacy import, before
 * the engine exists) and the engine (which owns it from then on). No electron imports here,
 * since both processes bundle this.
 */

export const DATA_FILE_NAME = "advosc-data.json";
export const KEY_PREFIX = "ADCOSC;";

export interface AudioOutputRecord {
  deviceId: string;
  label: string;
}

export interface MigrationMeta {
  done: boolean;
  at: number;
  /** Where the data came from: real localStorage, nothing to import, or the user chose defaults. */
  source: "localStorage" | "empty" | "defaults";
  /** Keys imported into the store. */
  keys: number;
  /** Keys that couldn't be parsed and went to the quarantine file instead. */
  quarantined: number;
  /** Browser device ids are origin-salted, so these are what maps an old output to a real device. */
  audioOutputs?: AudioOutputRecord[];
  /** Set by "Re-import from old version". The store has real data that the import mustn't lose. */
  reimport?: boolean;
}

export interface StoreMeta {
  schema: 1;
  migration: MigrationMeta;
}

/** Original `ADCOSC;...` keys, values kept exactly as localStorage held them. */
export type StoreEntries = Record<string, string>;

export interface LoadedStore {
  meta: StoreMeta | null;
  entries: StoreEntries;
  /** Which file the data came from, or null when there was nothing readable. */
  source: "main" | "backup" | null;
}

const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RETRY_DELAY_MS = 50;
const RETRY_ATTEMPTS = 10;

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Virus scanners and the search indexer briefly hold files open on Windows. */
function withRetry<T>(action: () => T): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return action();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= RETRY_ATTEMPTS || !code || !RETRY_CODES.has(code)) throw error;
      sleepSync(RETRY_DELAY_MS);
    }
  }
}

/**
 * Write, fsync, keep the previous file as `.bak`, rename. A crash at any point leaves either
 * the old file or the new one in place, never half of one.
 */
export function writeFileAtomicSync(target: string, text: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;

  const handle = fs.openSync(temp, "w");
  try {
    fs.writeFileSync(handle, text, "utf-8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }

  if (fs.existsSync(target)) withRetry(() => fs.copyFileSync(target, `${target}.bak`));
  withRetry(() => fs.renameSync(temp, target));
}

function parseStore(text: string): { meta: StoreMeta | null; entries: StoreEntries } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const { _meta, ...rest } = parsed as Record<string, unknown>;
  const entries: StoreEntries = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === "string") entries[key] = value;
  }
  return { meta: (_meta as StoreMeta) ?? null, entries };
}

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Reads the store, falling back to `.bak`. A main file that fails to parse is moved aside
 * rather than deleted, and so that the next write can't copy it over a good `.bak`.
 */
export function loadStore(dataDir: string): LoadedStore {
  const file = path.join(dataDir, DATA_FILE_NAME);

  const mainText = readIfExists(file);
  if (mainText !== null) {
    const parsed = parseStore(mainText);
    if (parsed) return { ...parsed, source: "main" };
    console.error(`${DATA_FILE_NAME} could not be parsed, trying the backup.`);
    withRetry(() => fs.renameSync(file, `${file}.corrupt-${Date.now()}`));
  }

  const backupText = readIfExists(`${file}.bak`);
  if (backupText !== null) {
    const parsed = parseStore(backupText);
    if (parsed) return { ...parsed, source: "backup" };
    console.error(`${DATA_FILE_NAME}.bak could not be parsed either.`);
  }

  return { meta: null, entries: {}, source: null };
}

export function serializeStore(meta: StoreMeta | null, entries: StoreEntries): string {
  return JSON.stringify({ _meta: meta, ...entries });
}

export function saveStore(dataDir: string, meta: StoreMeta | null, entries: StoreEntries) {
  writeFileAtomicSync(path.join(dataDir, DATA_FILE_NAME), serializeStore(meta, entries));
}
