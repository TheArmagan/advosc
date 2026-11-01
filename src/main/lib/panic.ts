import { BrowserWindow, globalShortcut, ipcMain, Notification } from 'electron';
import { stopLovenseDirect } from '../../engine/toys/lovense-http';
import type { ToyFailsafe } from '../../shared/engine-protocol';
import type { PanicHotkeyResult, PanicState } from '../../shared/toys';
import { getBootstrap, updateBootstrap } from './bootstrap';
import { panicEngine, rearmEngine } from './engine-host';
import { isEngineShortcut } from './host-api';

/**
 * Panic lives in main because it has to work with the engine hung or dead. The latch and the
 * hotkey are in `bootstrap.json`, the hotkey is registered here before any engine exists, and
 * main reaches Lovense itself. Intiface's socket lives in the engine, so a hung engine gets
 * killed by `panicEngine`, and the latched engine that replaces it sends one `StopAllDevices`.
 * A latched engine never sends anything except a stop.
 */

const ATTEMPT_TIMEOUT_MS = 600;
const ATTEMPTS = 2;
const RETRY_MS = 100;
/** Worst case for one round of direct stops. The quit path and a respawn both wait on this. */
const DIRECT_STOP_LIMIT_MS = 1800;
/** An in-flight engine command can land just after the first Stop, so one more follows it. */
const FOLLOW_UP_STOP_MS = 150;

const changeListeners = new Set<(state: PanicState) => void>();
let hotkeyError: string | undefined;
/** What's registered right now, which isn't the saved value if registering it failed. */
let registeredHotkey = '';

export function panicState(): PanicState {
  const { panicLatched, panicHotkey } = getBootstrap();
  return { latched: panicLatched, hotkey: panicHotkey, ...(hotkeyError ? { hotkeyError } : {}) };
}

export function isPanicLatched() {
  return getBootstrap().panicLatched;
}

export function toyControlEnabled() {
  return getBootstrap().toyFailsafe.enabled;
}

/** Every source lands here, so windows and the tray can't disagree about the latch. */
function notifyChanged() {
  const state = panicState();
  for (const listener of changeListeners) listener(state);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('panic:changed', state);
  }
}

export function onPanicChanged(listener: (state: PanicState) => void) {
  changeListeners.add(listener);
}

async function stopTarget(target: ToyFailsafe['lovense'][number]) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await stopLovenseDirect(target, ATTEMPT_TIMEOUT_MS);
      return;
    } catch (error) {
      if (attempt === ATTEMPTS) console.error(`Direct toy stop failed for ${target.ip}: ${(error as Error).message}`);
      else await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

/** POSTs Stop to every Lovense app the engine last told us about. Never rejects. */
export function directStop(): Promise<void> {
  const targets = getBootstrap().toyFailsafe.lovense;
  if (!targets.length) return Promise.resolve();
  return new Promise((resolve) => {
    const limit = setTimeout(resolve, DIRECT_STOP_LIMIT_MS);
    void Promise.all(targets.map(stopTarget)).finally(() => {
      clearTimeout(limit);
      resolve();
    });
  });
}

/**
 * Latch, tell the engine, POST Stop. `panicEngine` settles once the engine has acked or been
 * killed for not doing so. Safe to call again: every call sends everything again, which is what
 * you want from someone mashing the hotkey.
 */
export async function triggerPanic(source: string): Promise<PanicState> {
  console.warn(`Panic triggered from ${source}.`);

  const first = !isPanicLatched();
  if (first) updateBootstrap({ panicLatched: true });

  const engineDone = panicEngine();
  const stopped = directStop();
  if (first) notifyChanged();

  await Promise.all([engineDone, stopped]);
  setTimeout(() => void directStop(), FOLLOW_UP_STOP_MS);
  return panicState();
}

export function rearmPanic(): PanicState {
  if (isPanicLatched()) {
    updateBootstrap({ panicLatched: false });
    rearmEngine();
    notifyChanged();
  }
  return panicState();
}

export function setToyFailsafe(failsafe: ToyFailsafe) {
  if (JSON.stringify(failsafe) === JSON.stringify(getBootstrap().toyFailsafe)) return;
  const enabledChanged = failsafe.enabled !== toyControlEnabled();
  updateBootstrap({ toyFailsafe: failsafe });
  // The tray only shows panic once toys are on, so it has to hear about this.
  if (enabledChanged) notifyChanged();
}

/** A clean shutdown stopped everything, so the next start has nothing to clean up. */
export function markToyOutputStopped() {
  const { toyFailsafe } = getBootstrap();
  if (toyFailsafe.outputActive) updateBootstrap({ toyFailsafe: { ...toyFailsafe, outputActive: false } });
}

// ------------------------------------------------------------------- hotkey

const MODIFIER_ALIASES: Record<string, string> = {
  commandorcontrol: 'ctrl',
  cmdorctrl: 'ctrl',
  control: 'ctrl',
  command: 'meta',
  cmd: 'meta',
  super: 'meta',
  option: 'alt',
};

/** Electron has several spellings for one key combination, and they must compare equal. */
function normalizeAccelerator(accelerator: string) {
  return accelerator
    .toLowerCase()
    .split('+')
    .map((part) => MODIFIER_ALIASES[part.trim()] ?? part.trim())
    .sort()
    .join('+');
}

export function isPanicAccelerator(accelerator: string) {
  return !!registeredHotkey && normalizeAccelerator(accelerator) === normalizeAccelerator(registeredHotkey);
}

function registerHotkey(accelerator: string): string | null {
  try {
    if (globalShortcut.register(accelerator, () => void triggerPanic('the hotkey'))) return null;
    return 'Another app is using that shortcut. Pick a different one.';
  } catch {
    return "That isn't a shortcut ADVOSC can use. Pick a different one.";
  }
}

/** Registers first and saves only on success, so a failed change leaves the old hotkey working. */
function setHotkey(accelerator: string): PanicHotkeyResult {
  const next = accelerator.trim();
  const fail = (error: string): PanicHotkeyResult => ({ ok: false, error, state: panicState() });

  if (next && registeredHotkey && normalizeAccelerator(next) === normalizeAccelerator(registeredHotkey)) {
    updateBootstrap({ panicHotkey: next });
    notifyChanged();
    return { ok: true, state: panicState() };
  }

  if (next) {
    const normalized = normalizeAccelerator(next);
    // Electron would hand the key over silently, and the module's binding would just stop working.
    if (isEngineShortcut((other) => normalizeAccelerator(other) === normalized)) {
      return fail('That shortcut is already used by the Hotkey module. Pick a different one.');
    }
    const error = registerHotkey(next);
    if (error) return fail(error);
  }

  if (registeredHotkey) globalShortcut.unregister(registeredHotkey);
  registeredHotkey = next;
  hotkeyError = undefined;
  updateBootstrap({ panicHotkey: next });
  notifyChanged();
  return { ok: true, state: panicState() };
}

/** Before the engine and independent of it. A key that can't be registered gets said out loud. */
function registerSavedHotkey() {
  const { panicHotkey } = getBootstrap();
  if (!panicHotkey) return;

  const error = registerHotkey(panicHotkey);
  if (!error) {
    registeredHotkey = panicHotkey;
    return;
  }

  hotkeyError = `Your panic hotkey (${panicHotkey}) didn't register. ${error}`;
  console.error(hotkeyError);
  if (Notification.isSupported()) new Notification({ title: 'ADVOSC', body: hotkeyError }).show();
}

export function setupPanic() {
  ipcMain.handle('panic:get', () => panicState());
  ipcMain.handle('panic:trigger', () => triggerPanic('a window'));
  ipcMain.handle('panic:rearm', () => rearmPanic());
  ipcMain.handle('panic:setHotkey', (_event, accelerator: unknown) => setHotkey(String(accelerator ?? '')));

  registerSavedHotkey();
}
