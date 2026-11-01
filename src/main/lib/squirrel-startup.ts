import { app } from 'electron';
import * as path from 'path';
import { spawn } from 'child_process';

// Squirrel does not have an installer process of its own. It unpacks the app and
// then runs our exe with a flag for each lifecycle step, and expects us to do the
// shortcut work and quit. Anything we do not handle here boots the whole app in
// the middle of an install or an uninstall.

function runUpdater(args: string[], done: () => void): void {
  // Update.exe sits one level above the versioned app-x.y.z folder we run from.
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');

  try {
    spawn(updateExe, args, { detached: true }).on('close', done);
  } catch {
    done();
  }
}

/**
 * The launch right after an install finishes. It always shows the window, whatever start
 * hidden says, or it would look like the installer did nothing.
 */
export function isFirstRun(): boolean {
  return process.argv.includes('--squirrel-firstrun');
}

/**
 * An uninstall can't remove files a running tray instance holds. The instance lock is the one
 * channel that reaches it, so this asks it to quit. Only an uninstall does: a background
 * update runs the new exe while the old one is meant to keep working.
 */
export function requestRunningInstanceQuit() {
  if (process.argv[1] === '--squirrel-uninstall') app.requestSingleInstanceLock({ quit: true });
}

/**
 * Returns true when the app was started by Squirrel for a lifecycle step rather
 * than by the user. The caller should quit when it does.
 */
export function handleSquirrelStartup(): boolean {
  if (process.platform !== 'win32' || process.argv.length < 2) return false;

  const exeName = path.basename(process.execPath);

  switch (process.argv[1]) {
    // Fresh install, and every update after it. Both need the shortcuts written.
    case '--squirrel-install':
    case '--squirrel-updated':
      runUpdater([`--createShortcut=${exeName}`], app.quit);
      return true;

    case '--squirrel-uninstall':
      runUpdater([`--removeShortcut=${exeName}`], app.quit);
      return true;

    // An older version being retired after an update. Nothing to clean up.
    case '--squirrel-obsolete':
      app.quit();
      return true;

    // --squirrel-firstrun is the real launch right after an install finishes, so
    // it falls through and starts normally.
    default:
      return false;
  }
}
