import { app, autoUpdater, BrowserWindow, ipcMain, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { UpdateState } from '../../shared/native-types';
import { offerRestartToUpdate } from './tray';

// Squirrel asks the feed for <feedURL>/RELEASES, so the URL has to stay the same
// across versions. A GitHub release URL has the tag in it, which rules it out.
// update.electronjs.org is Electron's own redirector: it looks up the newest
// release in the repo and serves that release's RELEASES and nupkg files.
// It needs the repo to be public and the release to be published, not a draft.
const REPO = 'TheArmagan/advosc';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PROGRESS_POLL_MS = 500;

let state: UpdateState = { status: 'unsupported', reason: 'dev' };
let restart: (() => void) | null = null;
let check: (() => void) | null = null;

function setState(next: UpdateState) {
  state = next;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:changed', state);
  }
}

/** Squirrel keeps Update.exe one level above the versioned app-x.y.z folder. */
function installRoot() {
  return path.resolve(path.dirname(process.execPath), '..');
}

function isSquirrelInstall(): boolean {
  return fs.existsSync(path.join(installRoot(), 'Update.exe'));
}

/**
 * The windows ask for the state as they open, which can be before the first check, so
 * this goes in with the other IPC handlers.
 */
export function setupUpdateIpc(): void {
  ipcMain.handle('updates:get', () => state);
  ipcMain.on('updates:check', () => check?.());
  ipcMain.on('updates:restart', () => restart?.());
}

// ------------------------------------------------------------------ progress

type Release = { filename: string; version: string; size: number };

function compareVersions(a: string, b: string) {
  const pa = a.split(/[.-]/).map((part) => parseInt(part, 10) || 0);
  const pb = b.split(/[.-]/).map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/** RELEASES lines are `SHA1 filename size`. The newest full package is what Squirrel fetches. */
async function fetchNewestRelease(feedURL: string): Promise<Release | null> {
  try {
    const response = await net.fetch(`${feedURL}/RELEASES`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const releases = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length >= 3)
      .map(([, filename, size]) => ({
        filename,
        size: Number(size),
        version: /-(\d+\.\d+\.\d+(?:-[\w.]+)?)-full\.nupkg$/i.exec(filename)?.[1] ?? '',
      }))
      .filter((release) => release.version && release.size > 0);
    releases.sort((a, b) => compareVersions(b.version, a.version));
    return releases[0] ?? null;
  } catch {
    return null;
  }
}

/** How much of the package is on disk so far, from Squirrel's packages folder. */
function bytesOnDisk(filename: string | undefined, since: number): number | undefined {
  const dir = path.join(installRoot(), 'packages');
  let best: number | undefined;
  try {
    for (const name of fs.readdirSync(dir)) {
      const isOurs = filename ? name.startsWith(filename) : /\.nupkg/i.test(name);
      if (!isOurs) continue;
      const stat = fs.statSync(path.join(dir, name));
      // Without a name to go by, only a file written during this download counts.
      if (!filename && stat.mtimeMs < since - 1000) continue;
      best = Math.max(best ?? 0, stat.size);
    }
  } catch {
    return undefined;
  }
  return best;
}

// ------------------------------------------------------------------ updater

export function startAutoUpdater(): void {
  if (!app.isPackaged) {
    if (process.env.ADVOSC_FAKE_UPDATE === '1') startFakeUpdate();
    else setState({ status: 'unsupported', reason: 'dev' });
    return;
  }
  if (process.platform !== 'win32') {
    setState({ status: 'unsupported', reason: 'platform' });
    return;
  }
  // The zip build has no Update.exe next to it, so asking Squirrel to check would only
  // raise an error.
  if (!isSquirrelInstall()) {
    setState({ status: 'unsupported', reason: 'portable' });
    return;
  }

  const feedURL = `https://update.electronjs.org/${REPO}/${process.platform}-${process.arch}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL({ url: feedURL });
  } catch (err) {
    console.error('Auto updater could not be set up:', err);
    setState({ status: 'error', message: 'The updater could not be set up.', checkedAt: Date.now() });
    return;
  }

  let checkTimer: NodeJS.Timeout | null = null;
  let progressTimer: NodeJS.Timeout | null = null;
  let release: Release | null = null;

  function stopProgress() {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
  }

  check = () => {
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return;
    autoUpdater.checkForUpdates();
  };

  restart = () => {
    if (state.status === 'ready') autoUpdater.quitAndInstall();
  };

  autoUpdater.on('checking-for-update', () => {
    if (state.status !== 'downloading' && state.status !== 'ready') setState({ status: 'checking' });
  });

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'idle', checkedAt: Date.now() });
  });

  // Squirrel downloads as soon as it finds something, so this is the start of the download.
  autoUpdater.on('update-available', () => {
    const startedAt = Date.now();
    release = null;
    setState({ status: 'downloading', startedAt });

    fetchNewestRelease(feedURL).then((found) => {
      release = found;
      if (state.status === 'downloading' && found) {
        setState({ ...state, version: found.version, total: found.size });
      }
    });

    stopProgress();
    progressTimer = setInterval(() => {
      if (state.status !== 'downloading') return stopProgress();
      const received = bytesOnDisk(release?.filename, startedAt);
      if (received === undefined || received === state.received) return;
      setState({ ...state, received: state.total ? Math.min(received, state.total) : received });
    }, PROGRESS_POLL_MS);
  });

  // A failed check is not worth a popup. No network, a rate limit and a missing release
  // all land here, and the app works fine without updating. It shows in Settings instead.
  autoUpdater.on('error', (err) => {
    console.error('Update check failed:', err.message);
    stopProgress();
    if (state.status === 'ready') return;
    setState({ status: 'error', message: err.message || 'The update check failed.', checkedAt: Date.now() });
  });

  autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
    stopProgress();
    // One update on disk is enough. In a long tray session, carrying on would download the
    // next release too and stack another prompt on top of this one.
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }

    const version = release?.version || String(releaseName || '').replace(/^v/i, '') || 'A new version';
    setState({ status: 'ready', version });
    // The window says so itself. With no window open the user is likely in a game, and the
    // tray item is there for when they want it.
    offerRestartToUpdate(() => autoUpdater.quitAndInstall());
  });

  // Squirrel installs the update in the background and only tells us once it is
  // on disk, so checking on a timer costs the user nothing.
  autoUpdater.checkForUpdates();
  checkTimer = setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
}

/**
 * Dev only, with ADVOSC_FAKE_UPDATE=1: walks through checking, a download and ready, so
 * the update UI can be worked on without publishing a release. Restart just logs.
 */
function startFakeUpdate() {
  const total = 128 * 1024 * 1024;
  let timer: NodeJS.Timeout | null = null;

  const run = () => {
    if (timer) clearInterval(timer);
    setState({ status: 'checking' });
    setTimeout(() => {
      const startedAt = Date.now();
      setState({ status: 'downloading', version: '9.9.9', startedAt });
      setTimeout(() => {
        let received = 0;
        timer = setInterval(() => {
          received = Math.min(total, received + total / 40);
          if (received >= total) {
            clearInterval(timer!);
            setState({ status: 'ready', version: '9.9.9' });
            offerRestartToUpdate(() => console.log('[fake update] restart'));
            return;
          }
          setState({ status: 'downloading', version: '9.9.9', received, total, startedAt });
        }, PROGRESS_POLL_MS);
      }, 1500);
    }, 1500);
  };

  check = () => {
    if (state.status === 'idle' || state.status === 'error' || state.status === 'unsupported') run();
  };
  restart = () => console.log('[fake update] restart');
  run();
}
