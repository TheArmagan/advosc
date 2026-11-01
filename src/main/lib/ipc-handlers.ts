import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import { attachWindow } from './engine-host';
import { getMainWindow } from './window';

/** Everything else a window needs goes straight to the engine over its own port. */
export function setupIpcHandlers(): void {
  ipcMain.on('engine:connect', (event) => attachWindow(event.sender));

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
