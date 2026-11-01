import { get, writable } from "$shared/store";
import {
  MIRROR_TOYS,
  TOY_SETTINGS_KEY,
  defaultToySettings,
  type PanicHotkeyResult,
  type PanicState,
  type ToyFeature,
  type ToyInfo,
  type ToyPattern,
  type ToySettings,
  type ToyTransportId,
  type ToyTransportStatus,
  type ToysState,
} from "$shared/toys";
import { makeId } from "$shared/sound-effects";
import { call, fire, mirrored, synced } from "../engine";

export { defaultToySettings };

/** Hidden from the Modules page, the picker and input lists while toys are off. */
export const LOVENSE_MODULE_ID = "Lovense";

export type {
  PanicHotkeyResult,
  PanicState,
  ToyFeature,
  ToyInfo,
  ToyPattern,
  ToySettings,
  ToyTransportId,
  ToyTransportStatus,
  ToysState,
};

const settings = synced<ToySettings>(TOY_SETTINGS_KEY, defaultToySettings);
const state = mirrored<ToysState>(MIRROR_TOYS, { transports: [], toys: [], paused: null });

function updateSettings(patch: Partial<ToySettings>) {
  settings.update((prev) => ({ ...prev, ...patch }));
}

function addPattern(): ToyPattern {
  const pattern: ToyPattern = {
    id: makeId(),
    name: "",
    stepMs: 200,
    steps: [0.2, 0.5, 0.8, 0.5],
    features: ["Vibrate"],
  };
  settings.update((prev) => ({ ...prev, patterns: [...prev.patterns, pattern] }));
  return pattern;
}

function updatePattern(id: string, patch: Partial<ToyPattern>) {
  settings.update((prev) => ({
    ...prev,
    patterns: prev.patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }));
}

function removePattern(id: string) {
  settings.update((prev) => ({ ...prev, patterns: prev.patterns.filter((p) => p.id !== id) }));
}

export const toys = {
  settings,
  state,
  updateSettings,
  addPattern,
  updatePattern,
  removePattern,
  refresh: () => call<void>("toys.refresh"),
  testLovense: (host: string, port: number) =>
    call<{ ok: boolean; scheme?: "https" | "http"; error?: string }>("toys.testLovense", host, port),
  test: (toyId: string, feature: ToyFeature, level: number) =>
    call<void>("toys.test", toyId, feature, level),
  /** A plain stop. It doesn't set the panic latch. */
  stopAll: () => fire("toys.stopAll"),
};

// ---------------------------------------------------------------------- panic

/**
 * Panic goes straight to main over IPC, never through the engine, so the stop button and the
 * latch state keep working when the engine is hung.
 */
function panicApi() {
  return window.ADVOSCNative.panic;
}

const panicState = writable<PanicState>({ latched: false, hotkey: "" });

/** Whether main has answered yet. Until it does, `panicState` is only a placeholder. */
const panicReady = writable(false);

function applyPanic(next: PanicState) {
  panicState.set(next);
  panicReady.set(true);
}

function connectPanic() {
  const api = panicApi();
  if (!api) {
    console.error("The panic API isn't available.");
    return;
  }
  api.onChange(applyPanic);
  api.get().then(applyPanic, (error) => console.error("Could not read the panic state:", error));
}

connectPanic();

export const panic = {
  state: panicState,
  ready: panicReady,
  /** Latches and stops every toy. Falls back to a plain stop, so a failure here still stops things. */
  async trigger(): Promise<PanicState> {
    try {
      const next = await panicApi().trigger();
      applyPanic(next);
      return next;
    } catch (error) {
      toys.stopAll();
      throw error;
    }
  },
  async rearm(): Promise<PanicState> {
    const next = await panicApi().rearm();
    applyPanic(next);
    return next;
  },
  async setHotkey(accelerator: string): Promise<PanicHotkeyResult> {
    const result = await panicApi().setHotkey(accelerator);
    applyPanic(result.state);
    return result;
  },
  /** For code that isn't subscribed. */
  current: () => get(panicState),
};
