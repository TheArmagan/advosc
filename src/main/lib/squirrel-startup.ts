import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { isDev } from './paths';

// Squirrel does not have an installer process of its own. It unpacks the app and
// then runs our exe with a flag for each lifecycle step, and expects us to do the
// shortcut work and quit. Anything we do not handle here boots the whole app in
// the middle of an install or an uninstall.

const LINK_PROTOCOL = 'advosc';

/** One level above the versioned app-x.y.z folder we run from. */
function installRoot(): string {
  return path.resolve(path.dirname(process.execPath), '..');
}

/**
 * Squirrel's stub at the install root starts the newest app-x.y.z. Links have to point here,
 * because a later update deletes the versioned folder.
 */
function rootStub(): string {
  return path.join(installRoot(), path.basename(process.execPath));
}

/** A failure only costs links, and it must not stop an install or a launch. */
function setLinkProtocol(target: string, register: boolean) {
  const verb = register ? 'register' : 'remove';
  try {
    const done = register
      ? app.setAsDefaultProtocolClient(LINK_PROTOCOL, target)
      : app.removeAsDefaultProtocolClient(LINK_PROTOCOL, target);
    if (!done) console.error(`Could not ${verb} ${LINK_PROTOCOL}:// links.`);
  } catch (error) {
    console.error(`Could not ${verb} ${LINK_PROTOCOL}:// links:`, error);
  }
}

/**
 * Runs at every packaged launch. The zip build has no installer step, so this is the only place
 * it gets registered, and a Squirrel install gets its entry back if something overwrote it.
 */
export function registerLinkProtocol() {
  if (isDev || !app.isPackaged) return;
  const squirrel = fs.existsSync(path.join(installRoot(), 'Update.exe'));
  setLinkProtocol(squirrel ? rootStub() : process.execPath, true);
}

function runUpdater(args: string[], done: () => void): void {
  // Update.exe sits one level above the versioned app-x.y.z folder we run from.
  const updateExe = path.join(installRoot(), 'Update.exe');

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
    // Fresh install, and every update after it. Both need the shortcuts written. The protocol
    // calls are synchronous and go first, because `main.ts` quits right after this returns, so
    // the callback passed to `runUpdater` may never run.
    case '--squirrel-install':
    case '--squirrel-updated':
      setLinkProtocol(rootStub(), true);
      runUpdater([`--createShortcut=${exeName}`], app.quit);
      return true;

    case '--squirrel-uninstall':
      setLinkProtocol(rootStub(), false);
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
