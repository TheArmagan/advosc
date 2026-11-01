import { dialog, globalShortcut, shell } from 'electron';
import type { HostMethodName, HostMethods } from '../../shared/engine-protocol';
import { getMainWindow } from './window';
import { sendShortcutTriggered } from './engine-host';
import { isPanicAccelerator, setToyFailsafe, triggerPanic } from './panic';

/** accelerator -> callback id, for the accelerators the current engine registered. */
const shortcutCallbacks = new Map<string, string>();

/** Whether a Hotkey module binding holds this key, under any spelling of it. */
export function isEngineShortcut(matches: (accelerator: string) => boolean) {
  return [...shortcutCallbacks.keys()].some(matches);
}

const methods: { [M in HostMethodName]: (...args: Parameters<HostMethods[M]>) => ReturnType<HostMethods[M]> | Promise<ReturnType<HostMethods[M]>> } = {
  'shortcut.register': (accelerator, callbackId) => {
    // Registering again would replace the callback, and panic has to stay on its key.
    if (isPanicAccelerator(accelerator)) {
      return { success: false, accelerator, error: 'That shortcut is your panic hotkey.' };
    }
    try {
      if (shortcutCallbacks.has(accelerator)) globalShortcut.unregister(accelerator);
      const success = globalShortcut.register(accelerator, () => sendShortcutTriggered(callbackId));
      if (success) shortcutCallbacks.set(accelerator, callbackId);
      return { success, accelerator };
    } catch (error) {
      return { success: false, accelerator, error: String(error) };
    }
  },

  'shortcut.unregister': (accelerator) => {
    try {
      if (!isPanicAccelerator(accelerator)) globalShortcut.unregister(accelerator);
      shortcutCallbacks.delete(accelerator);
      return { success: true, accelerator };
    } catch (error) {
      return { success: false, accelerator, error: String(error) };
    }
  },

  // Only what the engine registered. `globalShortcut.unregisterAll` would take panic with it.
  'shortcut.unregisterAll': () => {
    try {
      for (const accelerator of shortcutCallbacks.keys()) globalShortcut.unregister(accelerator);
      shortcutCallbacks.clear();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  'shortcut.isRegistered': (accelerator) => globalShortcut.isRegistered(accelerator),

  'dialog.openAudioFiles': async () => {
    const win = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Add sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'webm', 'opus'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  },

  'dialog.saveBackup': async (defaultName) => {
    const win = getMainWindow();
    const options: Electron.SaveDialogOptions = {
      title: 'Save backup',
      defaultPath: defaultName,
      filters: [{ name: 'ADVOSC backup', extensions: ['json'] }],
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  },

  'dialog.openBackup': async () => {
    const win = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Restore backup',
      properties: ['openFile'],
      filters: [{ name: 'ADVOSC backup', extensions: ['json'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  },

  // Only reached for URLs the engine built itself, like the local speech page, which is why
  // plain http is allowed here but not in the renderer's `shell:openExternal`.
  'shell.openExternal': async (url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  'panic.trigger': async () => {
    const { latched } = await triggerPanic('the Lovense module');
    return { latched };
  },

  'toys.setFailsafe': (failsafe) => setToyFailsafe(failsafe),
};

export function handleHostCall(method: HostMethodName, args: unknown[]): Promise<unknown> {
  const handler = methods[method] as ((...values: unknown[]) => unknown) | undefined;
  if (!handler) return Promise.reject(new Error(`Unknown host method: ${method}`));
  return Promise.resolve().then(() => handler(...args));
}

/** A new engine starts with no callbacks, so anything the old one registered has to go. */
export function resetHostState() {
  if (shortcutCallbacks.size === 0) return;
  for (const accelerator of shortcutCallbacks.keys()) globalShortcut.unregister(accelerator);
  shortcutCallbacks.clear();
}
