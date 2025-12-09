import { app, BrowserWindow } from 'electron';
import { OSC } from './lib/osc';
import { createWindow } from './lib/window';
import { startMediaMonitor, stopMediaMonitor } from './lib/media';
import { setupIpcHandlers } from './lib/ipc-handlers';

// Re-export types for external use
export type { OSCMessage, MediaCommand, MediaInfo } from './lib/types';

const port = new OSC({
  local: { address: '0.0.0.0', port: 9001 },
  remote: { address: '0.0.0.0', port: 9000 }
});

app.whenReady().then(async () => {
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMediaMonitor();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
