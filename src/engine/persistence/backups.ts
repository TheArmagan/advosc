import * as fs from "fs";
import * as path from "path";
import { engineConfig } from "../runtime/config";
import { DATA_FILE_NAME } from "./file-store";

const KEEP_BACKUPS = 7;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const backupDir = path.join(engineConfig.dataDir, "backups");
const backupPattern = /^advosc-data-\d{4}-\d{2}-\d{2}\.json$/;

export function isBackupName(name: string) {
  return backupPattern.test(name);
}

function localDate(now: Date) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function takeBackup() {
  try {
    const source = path.join(engineConfig.dataDir, DATA_FILE_NAME);
    if (!fs.existsSync(source)) return;

    fs.mkdirSync(backupDir, { recursive: true });
    const target = path.join(backupDir, `advosc-data-${localDate(new Date())}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);

    // The dates sort lexically, so the oldest files are at the front.
    const backups = fs.readdirSync(backupDir).filter((name) => backupPattern.test(name)).sort();
    for (const name of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) {
      fs.rmSync(path.join(backupDir, name), { force: true });
    }
  } catch (error) {
    console.warn("Could not take a daily backup:", error);
  }
}

/** One copy per calendar day, keeping the last seven days the app was running. */
export function startDailyBackups() {
  takeBackup();
  setInterval(takeBackup, CHECK_INTERVAL_MS).unref();
}
