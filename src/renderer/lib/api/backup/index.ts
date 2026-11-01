import type { BackupEntry, BackupResult } from "$shared/backup";
import { writable } from "$shared/store";
import { call } from "../engine";

export type { BackupEntry, BackupResult };

/** Lives here, not in the page, so moving around Settings doesn't lose the restart prompt. */
const restartNeeded = writable(false);

export const backup = {
  restartNeeded,
  list: () => call<BackupEntry[]>("backup.list"),
  exportFile: () => call<BackupResult>("backup.exportFile"),
  restoreFile: () => call<BackupResult>("backup.restoreFile"),
  restoreDaily: (name: string) => call<BackupResult>("backup.restoreDaily", name),
  reimportLegacy: () => call<BackupResult>("backup.reimportLegacy"),
};
