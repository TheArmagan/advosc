import type { ToyFailsafe } from "$shared/engine-protocol";
import { get, writable } from "$shared/store";
import {
  defaultToySettings,
  MIRROR_TOYS,
  TOY_SETTINGS_KEY,
  type ToyFeature,
  type ToyRuleSink,
  type ToySettings,
  type ToysApi,
  type ToysState,
} from "$shared/toys";
import { engineConfig } from "../runtime/config";
import { ackPanic, hostCall, setOutputsActive, setToyHostHandler } from "../runtime/host";
import { handleAll, mirror, synced } from "../sync/hub";
import { LovenseError, parseLovenseIp, postLovense } from "./lovense-http";
import { startSafetySignals } from "./safety-signals";
import { ToyService } from "./service";
import { clampLevel } from "./transport";

const TEST_TIMEOUT_MS = 2000;

/**
 * Stand-in until Automations merges. Replace it with
 * `import { setToySink } from "../automations/toy-sink";`, and the call in `startToys` stays.
 */
function setToySink(_sink: ToyRuleSink) {}

/** A window can write this store directly, so every value is checked on the way in. */
function normalizeSettings(stored: unknown): ToySettings {
  const value = (stored && typeof stored === "object" ? stored : {}) as Partial<ToySettings>;
  return {
    ...defaultToySettings,
    ...value,
    enabled: value.enabled === true,
    // A value that isn't a number means no output. Only a missing one gets the default.
    maxLevel: value.maxLevel === undefined ? defaultToySettings.maxLevel : clampLevel(Number(value.maxLevel)),
    silencePauseSec: Math.max(0, Number(value.silencePauseSec ?? defaultToySettings.silencePauseSec) || 0),
    stopOnAvatarChange: value.stopOnAvatarChange === true,
    lovensePc: { ...defaultToySettings.lovensePc, ...value.lovensePc },
    lovenseLan: { ...defaultToySettings.lovenseLan, ...value.lovenseLan },
    intiface: { ...defaultToySettings.intiface, ...value.intiface },
    patterns: Array.isArray(value.patterns) ? value.patterns : [],
  };
}

export const toySettings = synced<ToySettings>(TOY_SETTINGS_KEY, defaultToySettings, normalizeSettings);

const toysState = writable<ToysState>({ transports: [], toys: [], paused: null });

let lastFailsafe = "";

function publishFailsafe(failsafe: ToyFailsafe) {
  const text = JSON.stringify(failsafe);
  if (text === lastFailsafe) return;
  lastFailsafe = text;
  hostCall("toys.setFailsafe", failsafe).catch((error) => {
    lastFailsafe = "";
    console.error("Could not tell main how to reach toys:", error);
  });
}

export const toyService = new ToyService(
  normalizeSettings(get(toySettings)),
  { latched: engineConfig.panicLatched, muted: engineConfig.toysMuted },
  {
    onState: (state) => toysState.set(state),
    onActive: setOutputsActive,
    onRoutes: publishFailsafe,
  },
);

export function getToysState() {
  return get(toysState);
}

export function getToySettings() {
  return normalizeSettings(get(toySettings));
}

/** The module's Panic input. Stops here right away, then lets main latch, which it always owns. */
export async function requestPanic() {
  if (!getToySettings().enabled) return;
  await toyService.panic();
  await hostCall("panic.trigger");
}

async function testLovense(host: string, port: number): ReturnType<ToysApi["testLovense"]> {
  if (!toyService.armed) return { ok: false, error: "Turn on toy control first, and re-arm if panic is on." };

  const ip = parseLovenseIp(String(host ?? ""));
  if (!ip) return { ok: false, error: "Enter the IP address from the Game Mode screen, like 192.168.1.44." };
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return { ok: false, error: "Enter the port from the Game Mode screen." };

  let error: string | undefined;
  for (const scheme of ["https", "http"] as const) {
    try {
      await postLovense({ ip, port, scheme }, { command: "GetToys" }, { timeoutMs: TEST_TIMEOUT_MS });
      return { ok: true, scheme };
    } catch (failure) {
      error ??= failure instanceof LovenseError ? failure.message : "Couldn't reach Lovense Remote.";
      // Falling back to plain HTTP here would quietly be the bypass this exists to avoid.
      if (failure instanceof LovenseError && failure.kind === "certificate") break;
    }
  }
  return { ok: false, error };
}

const api: ToysApi = {
  getTransports: () => toyService.getTransports(),
  getToys: () => toyService.getToys(),
  refresh: () => toyService.refresh(),
  testLovense,
  test: (toyId: string, feature: ToyFeature, level: number) => toyService.test(toyId, feature, level),
  stopAll: () => toyService.stopAll(),
};

/** Run as the first thing in a shutdown: toys stop before anything is flushed. */
export function stopToysForShutdown() {
  return toyService.shutdown();
}

export function startToys(options: { safeMode: boolean }) {
  setToyHostHandler((message) => {
    switch (message.t) {
      case "panic":
        // No ack unless the stop landed, so main falls back to killing this engine.
        void toyService.panic().then((confirmed) => {
          if (confirmed) ackPanic(message.id);
          else console.error("A toy didn't confirm its panic stop, leaving it to main.");
        });
        break;
      case "rearm":
        toyService.rearm();
        break;
      case "toys-stop":
        toyService.interrupt();
        break;
    }
  });

  mirror(MIRROR_TOYS, toysState);
  handleAll("toys", api as unknown as Record<string, (...args: any[]) => unknown>);

  setToySink(toyService.sink);

  toySettings.subscribe((value) => toyService.applySettings(normalizeSettings(value)));
  toyService.start(options);
  startSafetySignals(toyService, getToySettings);
}
