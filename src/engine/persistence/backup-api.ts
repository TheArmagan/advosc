import * as fs from "fs";
import * as path from "path";
import type { BackupApi, BackupEntry, BackupResult } from "$shared/backup";
import { hostCall } from "../runtime/host";
import { backupDir, isBackupName } from "./backups";
import { DATA_FILE_NAME, KEY_PREFIX, type StoreEntries, type StoreMeta } from "./file-store";
import { localData } from "./local-data";

const KEEP_SAFETY_BACKUPS = 5;
const safetyBackupPattern = /^before-(restore|reimport)-\d{8}-\d{6}\.json$/;

interface ValidStore {
  meta: StoreMeta | null;
  entries: StoreEntries;
}

function stamp(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Checks everything before anything is touched, so a bad file can't do any harm. */
function validate(text: string): ValidStore | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { error: "That file isn't an ADVOSC backup. It isn't valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "That file isn't an ADVOSC backup." };
  }

  const { _meta, ...rest } = parsed as Record<string, unknown>;
  const schema = (_meta as StoreMeta | null | undefined)?.schema;
  if (schema !== undefined && schema !== 1) {
    return { error: "That backup came from a newer version of ADVOSC." };
  }

  const entries: StoreEntries = {};
  for (const [key, value] of Object.entries(rest)) {
    if (!key.startsWith(KEY_PREFIX) || typeof value !== "string") {
      return { error: "That file isn't an ADVOSC backup." };
    }
    try {
      JSON.parse(value);
    } catch {
      return { error: "That backup is damaged, so nothing was changed." };
    }
    entries[key] = value;
  }

  if (Object.keys(entries).length === 0) return { error: "That backup has no settings in it." };
  return { meta: (_meta as StoreMeta | null | undefined) ?? null, entries };
}

/** The store as it is right now, in the backups folder. Nothing goes ahead if this fails. */
function keepCurrentStore(reason: "restore" | "reimport") {
  localData.flush();
  if (localData.isDirty()) throw new Error("The current settings couldn't be saved.");

  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(
    path.join(path.dirname(backupDir), DATA_FILE_NAME),
    path.join(backupDir, `before-${reason}-${stamp(new Date())}.json`),
  );

  const old = fs.readdirSync(backupDir).filter((name) => safetyBackupPattern.test(name)).sort(byTimestamp);
  for (const name of old.slice(0, Math.max(0, old.length - KEEP_SAFETY_BACKUPS))) {
    fs.rmSync(path.join(backupDir, name), { force: true });
  }
}

/** `before-restore-` and `before-reimport-` differ, so a plain sort wouldn't order by time. */
function byTimestamp(a: string, b: string) {
  return a.slice(-20).localeCompare(b.slice(-20));
}

function failure(error: unknown, fallback: string): BackupResult {
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

function restore(text: string): BackupResult {
  const valid = validate(text);
  if ("error" in valid) return { ok: false, error: valid.error };

  try {
    keepCurrentStore("restore");
    // A backup that says the import hasn't run would get replaced by that import on restart.
    const meta = valid.meta?.migration?.done ? valid.meta : localData.getMeta();
    localData.replaceFile(meta, valid.entries);
    console.log(`Restored ${Object.keys(valid.entries).length} keys from a backup.`);
    return { ok: true, restartNeeded: true };
  } catch (error) {
    return failure(error, "The backup couldn't be restored. Your current settings weren't changed.");
  }
}

function dateOf(name: string, modified: Date): string {
  const daily = /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
  if (daily) return daily;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${modified.getFullYear()}-${pad(modified.getMonth() + 1)}-${pad(modified.getDate())}`;
}

function list(): BackupEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(backupDir).filter((name) => isBackupName(name) || safetyBackupPattern.test(name));
  } catch {
    return [];
  }

  const entries = names.flatMap((name) => {
    try {
      const stat = fs.statSync(path.join(backupDir, name));
      return [{ name, date: dateOf(name, stat.mtime), sizeBytes: stat.size, modified: stat.mtimeMs }];
    } catch {
      return [];
    }
  });

  return entries
    .sort((a, b) => b.modified - a.modified)
    .map(({ modified: _, ...entry }) => entry);
}

async function exportFile(): Promise<BackupResult> {
  const target = await hostCall("dialog.saveBackup", `advosc-backup-${stamp(new Date())}.json`);
  if (!target) return { ok: false, cancelled: true };

  try {
    const temp = `${target}.tmp`;
    fs.writeFileSync(temp, localData.serialize(), "utf-8");
    fs.renameSync(temp, target);
    return { ok: true };
  } catch (error) {
    return failure(error, "The backup couldn't be saved there.");
  }
}

async function restoreFile(): Promise<BackupResult> {
  const source = await hostCall("dialog.openBackup");
  if (!source) return { ok: false, cancelled: true };

  let text: string;
  try {
    text = fs.readFileSync(source, "utf-8");
  } catch (error) {
    return failure(error, "That file couldn't be read.");
  }
  return restore(text);
}

async function restoreDaily(name: string): Promise<BackupResult> {
  // The name comes from a window, so it only ever picks from this folder.
  if (path.basename(name) !== name || !(isBackupName(name) || safetyBackupPattern.test(name))) {
    return { ok: false, error: "That backup doesn't exist." };
  }

  let text: string;
  try {
    text = fs.readFileSync(path.join(backupDir, name), "utf-8");
  } catch (error) {
    return failure(error, "That backup couldn't be read.");
  }
  return restore(text);
}

async function reimportLegacy(): Promise<BackupResult> {
  if (localData.isFrozen()) return { ok: false, error: "Restart ADVOSC first. A restore is waiting to be picked up." };

  try {
    keepCurrentStore("reimport");
    localData.requestReimport();
    localData.flush();
    if (localData.isDirty()) throw new Error("The request couldn't be saved.");
    return { ok: true, restartNeeded: true };
  } catch (error) {
    return failure(error, "The import couldn't be set up. Your settings weren't changed.");
  }
}

export const backupApi = { list, exportFile, restoreFile, restoreDaily, reimportLegacy } satisfies BackupApi;
