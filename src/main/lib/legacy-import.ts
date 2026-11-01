import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import {
  KEY_PREFIX,
  loadStore,
  saveStore,
  writeFileAtomicSync,
  type AudioOutputRecord,
  type MigrationMeta,
  type StoreEntries,
  type StoreMeta,
} from '../../engine/persistence/file-store';
import { isDev, resolveDataDir } from './paths';

/**
 * Moves settings from the renderer's localStorage into the engine's data file, once, before
 * the engine starts. localStorage is only ever read, so an older build keeps working and a
 * bad import can be redone.
 *
 * It runs here rather than in the renderer because the engine has to start with the data
 * already in place: the window might start hidden, and nothing else can read localStorage.
 */

const LOAD_TIMEOUT_MS = 15000;

/** Lyrics were a cache, and they get refetched. They're also the biggest thing in there. */
const LYRIC_CACHE_PREFIX = `${KEY_PREFIX}ChatboxMediaModule;LyricsCache`;

const DUMP_SCRIPT = `(async () => {
  const entries = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(${JSON.stringify(KEY_PREFIX)})) entries[key] = localStorage.getItem(key);
  }
  let audioOutputs = [];
  try {
    audioOutputs = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
  } catch {}
  return { entries, audioOutputs };
})()`;

interface LocalStorageDump {
  entries: StoreEntries;
  audioOutputs: AudioOutputRecord[];
}

function loadMigratePage(page: BrowserWindow) {
  return isDev
    ? page.loadURL('http://localhost:5173/migrate.html')
    : page.loadFile(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'migrate.html'));
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), LOAD_TIMEOUT_MS);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** Same origin as the real page, so it sees the same localStorage, but with no app code in it. */
async function dumpLocalStorage(): Promise<LocalStorageDump> {
  const page = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await withTimeout(loadMigratePage(page), 'Loading the import page');
    return await withTimeout(page.webContents.executeJavaScript(DUMP_SCRIPT), 'Reading localStorage');
  } finally {
    page.destroy();
  }
}

/** Sorts a dump into what goes in the store and what can't be trusted. */
function splitDump(dump: LocalStorageDump) {
  const entries: StoreEntries = {};
  const quarantined: StoreEntries = {};

  for (const [key, value] of Object.entries(dump.entries)) {
    if (key.startsWith(LYRIC_CACHE_PREFIX)) continue;
    try {
      JSON.parse(value);
      entries[key] = value;
    } catch {
      quarantined[key] = value;
    }
  }

  return { entries, quarantined };
}

function makeMeta(migration: MigrationMeta): StoreMeta {
  return { schema: 1, migration };
}

/** Reads the file back, because "the write didn't throw" isn't the same as "the data is there". */
function verify(dataDir: string, entries: StoreEntries) {
  const written = loadStore(dataDir);
  const expected = Object.keys(entries);
  const mismatched = expected.filter((key) => written.entries[key] !== entries[key]);
  if (mismatched.length || Object.keys(written.entries).length !== expected.length) {
    throw new Error(`The imported file doesn't match: ${mismatched.length} of ${expected.length} keys differ.`);
  }
}

async function importOnce(dataDir: string) {
  const dump = await dumpLocalStorage();
  const { entries, quarantined } = splitDump(dump);
  const keys = Object.keys(entries).length;
  const quarantinedCount = Object.keys(quarantined).length;

  if (quarantinedCount > 0) {
    writeFileAtomicSync(path.join(dataDir, 'import-quarantine.json'), JSON.stringify(quarantined, null, 2));
    console.warn(`Legacy import: ${quarantinedCount} key(s) could not be parsed and were quarantined.`);
  }
  if (keys + quarantinedCount > 0) {
    writeFileAtomicSync(path.join(dataDir, 'import-raw-dump.json'), JSON.stringify(dump.entries));
  }

  saveStore(
    dataDir,
    makeMeta({
      done: true,
      at: Date.now(),
      source: keys > 0 ? 'localStorage' : 'empty',
      keys,
      quarantined: quarantinedCount,
      audioOutputs: dump.audioOutputs,
    }),
    entries,
  );
  verify(dataDir, entries);

  console.log(`Legacy import done: ${keys} keys, ${quarantinedCount} quarantined.`);
}

function continueWithDefaults(dataDir: string) {
  saveStore(
    dataDir,
    makeMeta({ done: true, at: Date.now(), source: 'defaults', keys: 0, quarantined: 0 }),
    {},
  );
}

/**
 * Returns once the data file is in place. On failure nothing has been written and the engine
 * hasn't started, so the user can safely retry. Quits the app if they choose to.
 */
export async function runLegacyImport(): Promise<void> {
  const dataDir = resolveDataDir();
  if (loadStore(dataDir).meta?.migration?.done) return;

  for (;;) {
    try {
      await importOnce(dataDir);
      return;
    } catch (error) {
      console.error('Legacy import failed:', error);

      const { response } = await dialog.showMessageBox({
        type: 'error',
        title: 'ADVOSC',
        message: "ADVOSC couldn't read your settings from the previous version.",
        detail: `${(error as Error).message}\n\nYour old settings are still there. Nothing has been changed.`,
        buttons: ['Retry', 'Continue with defaults', 'Quit'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });

      if (response === 0) continue;
      if (response === 1) {
        continueWithDefaults(dataDir);
        return;
      }
      app.exit(0);
      return;
    }
  }
}
