import { app, autoUpdater, dialog } from 'electron';
import { offerRestartToUpdate } from './tray';
import { getMainWindow } from './window';
import * as path from 'path';
import * as fs from 'fs';

// Squirrel asks the feed for <feedURL>/RELEASES, so the URL has to stay the same
// across versions. A GitHub release URL has the tag in it, which rules it out.
// update.electronjs.org is Electron's own redirector: it looks up the newest
// release in the repo and serves that release's RELEASES and nupkg files.
// It needs the repo to be public and the release to be published, not a draft.
const REPO = 'TheArmagan/advosc';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Squirrel keeps Update.exe one level above the versioned app-x.y.z folder. */
function isSquirrelInstall(): boolean {
  return fs.existsSync(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'));
}

export function startAutoUpdater(): void {
  // Nothing to update in dev, and the zip build has no Update.exe next to it, so
  // asking Squirrel to check would only raise an error.
  if (!app.isPackaged || process.platform !== 'win32' || !isSquirrelInstall()) return;

  const feedURL = `https://update.electronjs.org/${REPO}/${process.platform}-${process.arch}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL({ url: feedURL });
  } catch (err) {
    console.error('Auto updater could not be set up:', err);
    return;
  }

  // A failed check is not worth bothering anyone about. No network, a rate limit
  // and a missing release all land here, and the app works fine without updating.
  autoUpdater.on('error', (err) => {
    console.error('Update check failed:', err.message);
  });

  let checkTimer: NodeJS.Timeout | null = null;

  autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
    // One update on disk is enough. In a long tray session, carrying on would download the
    // next release too and stack another prompt on top of this one.
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }

    offerRestartToUpdate(() => autoUpdater.quitAndInstall());

    // No window means the user is in a game. The tray item is there when they want it.
    const window = getMainWindow();
    if (!window) return;

    dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `ADVOSC ${releaseName} is ready to install.`,
      detail: 'Restarting takes a few seconds. Your settings, templates and profiles are kept.'
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Squirrel installs the update in the background and only tells us once it is
  // on disk, so checking on a timer costs the user nothing.
  autoUpdater.checkForUpdates();
  checkTimer = setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS);
}
