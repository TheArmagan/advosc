import { app, Notification } from 'electron';
import { createWindow, showMainWindow } from './lib/window';
import { setupIpcHandlers } from './lib/ipc-handlers';
import { handleSquirrelStartup, isFirstRun, requestRunningInstanceQuit } from './lib/squirrel-startup';
import { startAutoUpdater } from './lib/auto-updater';
import { onSafeModeChanged, startEngine, stopEngine } from './lib/engine-host';
import { runLegacyImport } from './lib/legacy-import';
import { getBootstrap } from './lib/bootstrap';
import { isDev } from './lib/paths';
import { destroyTray, setupTray } from './lib/tray';

/** Sent through the single instance lock by an uninstall, so a tray instance lets go of its files. */
interface SecondInstanceData {
  quit?: boolean;
}

function acquireInstanceLock(): boolean {
  // Dev and a packaged build share a profile folder but not their data, and running both side
  // by side is normal. Without this exception one would silently refuse to start.
  if (isDev) {
    console.warn('Skipping the single instance lock in dev.');
    return true;
  }
  return app.requestSingleInstanceLock();
}

function start() {
  // With no listener, Electron quits when the last window closes. The app lives in the tray,
  // and the engine keeps working with no window at all.
  app.on('window-all-closed', () => {});

  // One shot. `preventDefault` holds the quit while the engine stops toys and flushes, then
  // `app.quit()` comes back through here with `quitting` set. Update restarts land here too.
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    destroyTray();
    void stopEngine().finally(() => app.quit());
  });

  app.on('second-instance', (_event, _argv, _cwd, data) => {
    if ((data as SecondInstanceData | undefined)?.quit) app.quit();
    else showMainWindow();
  });

  app.whenReady().then(async () => {
    // Before the engine, which needs the data file in place.
    await runLegacyImport();

    setupIpcHandlers();
    startEngine();
    setupTray();

    onSafeModeChanged((active) => {
      if (!active || !Notification.isSupported()) return;
      new Notification({
        title: 'ADVOSC',
        body: 'ADVOSC kept crashing, so it started in safe mode. Restart it to go back to normal.',
      }).show();
    });

    // The first launch after an install always shows the window, or it would look like the
    // installer did nothing.
    if (!getBootstrap().startHidden || isFirstRun()) createWindow();

    // After the window, so a slow or failing update check never delays startup.
    startAutoUpdater();
  });
}

// Has to run before anything else. Quitting here keeps 'ready' from ever firing,
// so the installer never gets a window, an OSC socket or a media monitor.
if (handleSquirrelStartup()) {
  requestRunningInstanceQuit();
  app.quit();
} else if (!acquireInstanceLock()) {
  app.quit();
} else {
  start();
}
