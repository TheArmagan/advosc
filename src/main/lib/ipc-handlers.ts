import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import type { StartupSettings } from '../../shared/native-types';
import { getBootstrap, updateBootstrap } from './bootstrap';
import { attachWindow } from './engine-host';
import { rebuildMenu } from './tray';
import { getMainWindow } from './window';

/** The GPU setting in effect now, which is what's on disk at launch until the next restart. */
let gpuAccelerationAtLaunch: boolean | null = null;

function startupSettings(): StartupSettings {
  const { startHidden, gpuAcceleration } = getBootstrap();
  return {
    startHidden,
    gpuAcceleration,
    restartNeeded: gpuAcceleration !== gpuAccelerationAtLaunch,
  };
}

/** Everything else a window needs goes straight to the engine over its own port. */
export function setupIpcHandlers(): void {
  gpuAccelerationAtLaunch = getBootstrap().gpuAcceleration;

  ipcMain.on('engine:connect', (event) => attachWindow(event.sender));

  // Startup settings live in main because they're needed before the engine exists
  ipcMain.handle('startup:get', () => startupSettings());

  ipcMain.handle('startup:set', (_event, patch: Partial<Pick<StartupSettings, 'startHidden' | 'gpuAcceleration'>>) => {
    const next: Parameters<typeof updateBootstrap>[0] = {};
    if (typeof patch?.startHidden === 'boolean') next.startHidden = patch.startHidden;
    if (typeof patch?.gpuAcceleration === 'boolean') next.gpuAcceleration = patch.gpuAcceleration;
    updateBootstrap(next);
    rebuildMenu();
    return startupSettings();
  });

  // Goes through 'before-quit', so the engine still stops toys and flushes first
  ipcMain.on('startup:restart', () => {
    app.relaunch();
    app.quit();
  });

  // Theme IPC: get current and emit on changes
  ipcMain.on('theme:get', (event) => {
    event.returnValue = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('theme:changed', theme));
  });

  // Frame controls
  ipcMain.on('frame:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('frame:maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('frame:close', () => {
    getMainWindow()?.close();
  });

  // App info
  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion();
  });

  // Open a link in the user's default browser (https only)
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { success: false, error: 'Only https links can be opened.' };
      }
      await shell.openExternal(parsed.toString());
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}
