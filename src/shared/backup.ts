export interface BackupEntry {
  /** File name in `engine-data/backups`. */
  name: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  sizeBytes: number;
}

export interface BackupResult {
  ok: boolean;
  /** Plain words, shown as they are. */
  error?: string;
  /** The user cancelled a file dialog. Not an error. */
  cancelled?: boolean;
  /** Restores replace the whole store, so the app has to restart to pick it up. */
  restartNeeded?: boolean;
}

/** Engine RPC surface for backups, under the `backup.` prefix. */
export interface BackupApi {
  list(): BackupEntry[];
  /** Asks where to save, then writes the full store, secrets included. */
  exportFile(): Promise<BackupResult>;
  /** Asks for a file, validates it, and keeps the current store as a backup first. */
  restoreFile(): Promise<BackupResult>;
  restoreDaily(name: string): Promise<BackupResult>;
  /** Runs the legacy localStorage import again on the next launch. */
  reimportLegacy(): Promise<BackupResult>;
}
