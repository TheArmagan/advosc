import { app, BrowserWindow } from 'electron';
import { OSC } from './lib/osc';
import { createWindow } from './lib/window';
import { startMediaMonitor, stopMediaMonitor } from './lib/media';
import { stopSystemMonitor } from './lib/system-monitor';
import { stopBleHeartRate } from './lib/ble-heart-rate';
import { setupIpcHandlers } from './lib/ipc-handlers';
import { stopSpeechServer } from './lib/speech-server';
import { loadOSCSources, toActiveSources } from './lib/osc-config';
import { handleSquirrelStartup } from './lib/squirrel-startup';
import { startAutoUpdater } from './lib/auto-updater';

// Re-export types for external use
export type { OSCMessage, MediaCommand, MediaInfo } from './lib/types';

// Has to run before anything else. Quitting here keeps 'ready' from ever firing,
// so the installer never gets a window, an OSC socket or a media monitor.
if (handleSquirrelStartup()) {
  app.quit();
}

// `loadOSCSources` needs app paths, so the instance is created after the app is ready.
let port: OSC;

app.whenReady().then(async () => {
  port = new OSC({ sources: toActiveSources(loadOSCSources()) });

  port.once("ready", () => {
    console.log("OSC connection opened.");
  });

  port.open();

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Setup all IPC handlers
  setupIpcHandlers(port);

  // Start media monitor
  startMediaMonitor();

  // Create main window
  createWindow();

  // After the window, so a slow or failing update check never delays startup.
  startAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMediaMonitor();
  stopSystemMonitor();
  stopBleHeartRate();
  stopSpeechServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
