import { app, Menu, nativeImage, Tray } from 'electron';
import iconUrl from '../../../build/icon.png?inline';
import { getBootstrap, updateBootstrap } from './bootstrap';
import { isSafeMode, onSafeModeChanged } from './engine-host';
import { showMainWindow } from './window';

const TRAY_ICON_SIZE = 16;

let tray: Tray | null = null;
let restartToUpdate: (() => void) | null = null;

export function rebuildMenu() {
  if (!tray) return;

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'Open ADVOSC', click: showMainWindow },
    { type: 'separator' },
  ];

  if (restartToUpdate) {
    template.push({ label: 'Restart to update', click: restartToUpdate }, { type: 'separator' });
  }

  template.push(
    {
      label: 'Start hidden',
      type: 'checkbox',
      checked: getBootstrap().startHidden,
      click: (item) => updateBootstrap({ startHidden: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(isSafeMode() ? 'ADVOSC (safe mode)' : 'ADVOSC');
}

export function setupTray() {
  // Inlined because the packager's whitelist drops build/.
  const image = nativeImage.createFromDataURL(iconUrl).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE });

  tray = new Tray(image);
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  rebuildMenu();

  onSafeModeChanged(rebuildMenu);
}

/** Adds the item once an update is on disk. */
export function offerRestartToUpdate(restart: () => void) {
  restartToUpdate = restart;
  rebuildMenu();
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
