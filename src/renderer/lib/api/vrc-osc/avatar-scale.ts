import { writable, get } from "svelte/store";
import { localData } from "$lib/api/local-data";
import { avatarOSC } from "./avatar-osc";

export const EYE_HEIGHT_ADDRESS = "/avatar/eyeheight";
export const EYE_HEIGHT_MIN = 0.01;
export const EYE_HEIGHT_MAX = 10.0;

export const DEFAULT_FORWARD_ADDRESS = "/avatar/parameters/advosc_eyeheight";

export type AvatarScalePreset = {
  id: string;
  name: string;
  value: number;
};

export type AvatarScaleSettings = {
  /** Re-apply the stored eye height whenever the avatar changes / an instance is joined. */
  perAvatarEnabled: boolean;
  /** Delay before re-applying after an avatar change, avatars need a moment to load. */
  restoreDelayMs: number;
  /** Listen for an avatar parameter and forward it to /avatar/eyeheight. */
  forwardingEnabled: boolean;
  forwardAddress: string;
  /**
   * `normalized` treats the incoming value as 0..1 and maps it onto
   * [forwardMin, forwardMax]; `direct` uses the value as meters as-is.
   */
  forwardMode: "normalized" | "direct";
  forwardMin: number;
  forwardMax: number;
};

const SETTINGS_KEY = "AvatarScale;Settings";
const PRESETS_KEY = "AvatarScale;Presets";
const PER_AVATAR_KEY = "AvatarScale;PerAvatar";

const defaultSettings: AvatarScaleSettings = {
  perAvatarEnabled: false,
  restoreDelayMs: 2000,
  forwardingEnabled: false,
  forwardAddress: DEFAULT_FORWARD_ADDRESS,
  forwardMode: "normalized",
  forwardMin: EYE_HEIGHT_MIN,
  forwardMax: 3,
};

const defaultPresets: AvatarScalePreset[] = [
  { id: "default-smallest", name: "Smallest (UI Brokes)", value: 0.01 },
  { id: "default-smallest-ui", name: "Smallest (UI Works)", value: 0.02 }
];

const settingsStore = writable<AvatarScaleSettings>({
  ...defaultSettings,
  ...localData.get(SETTINGS_KEY, {}),
});
settingsStore.subscribe((val) => localData.set(SETTINGS_KEY, val));

const presetsStore = writable<AvatarScalePreset[]>(
  localData.get(PRESETS_KEY, defaultPresets)
);
presetsStore.subscribe((val) => localData.set(PRESETS_KEY, val));

/** avatarId -> eye height in meters */
const perAvatarStore = writable<Record<string, number>>(
  localData.get(PER_AVATAR_KEY, {})
);
perAvatarStore.subscribe((val) => localData.set(PER_AVATAR_KEY, val));

/** Last value we sent out, not something VRChat reports back. */
const currentHeightStore = writable<number>(
  localData.get("AvatarScale;LastHeight", 1.5)
);
currentHeightStore.subscribe((val) => localData.set("AvatarScale;LastHeight", val));

const lastAppliedAtStore = writable<number>(0);

/** Reactive mirror of `avatarOSC.lastAvatarId` (that one is a plain getter). */
const currentAvatarIdStore = writable<string | null>(null);

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function clampEyeHeight(value: number): number {
  if (!Number.isFinite(value)) return EYE_HEIGHT_MIN;
  return Math.min(EYE_HEIGHT_MAX, Math.max(EYE_HEIGHT_MIN, value));
}

function sendEyeHeight(value: number) {
  window.ADVOSCNative.osc.sendCustom(EYE_HEIGHT_ADDRESS, [
    { value, type: "Float" },
  ]);
}

let restoreTimer: ReturnType<typeof setTimeout> | null = null;

export const avatarScale = {
  settings: settingsStore,
  presets: presetsStore,
  perAvatar: perAvatarStore,
  currentHeight: currentHeightStore,
  lastAppliedAt: lastAppliedAtStore,
  currentAvatarId: currentAvatarIdStore,

  /**
   * Send an eye height to VRChat. `persist` writes it to the per-avatar map when
   * per-avatar saving is on (skipped for values that came from a restore).
   */
  setHeight(value: number, persist: boolean = true): number {
    const clamped = clampEyeHeight(value);
    sendEyeHeight(clamped);
    currentHeightStore.set(clamped);
    lastAppliedAtStore.set(Date.now());

    if (persist && get(settingsStore).perAvatarEnabled) {
      const avatarId = avatarOSC.lastAvatarId;
      if (avatarId) {
        perAvatarStore.update((prev) => ({ ...prev, [avatarId]: clamped }));
      }
    }
    return clamped;
  },

  /** Push the last known height again, e.g. after VRChat lost it. */
  reapply(): number {
    return this.setHeight(get(currentHeightStore), false);
  },

  addPreset(name: string, value: number): AvatarScalePreset {
    const preset: AvatarScalePreset = {
      id: makeId(),
      name: name.trim() || `${clampEyeHeight(value).toFixed(2)}m`,
      value: clampEyeHeight(value),
    };
    presetsStore.update((prev) => [...prev, preset]);
    return preset;
  },

  updatePreset(id: string, patch: Partial<Pick<AvatarScalePreset, "name" | "value">>) {
    presetsStore.update((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
            ...p,
            ...patch,
            value: patch.value === undefined ? p.value : clampEyeHeight(patch.value),
          }
          : p
      )
    );
  },

  removePreset(id: string) {
    presetsStore.update((prev) => prev.filter((p) => p.id !== id));
  },

  resetPresets() {
    presetsStore.set([...defaultPresets]);
  },

  updateSettings(patch: Partial<AvatarScaleSettings>) {
    settingsStore.update((prev) => ({ ...prev, ...patch }));
  },

  /** Store the current height against the avatar that is worn right now. */
  saveForCurrentAvatar(): boolean {
    const avatarId = avatarOSC.lastAvatarId;
    if (!avatarId) return false;
    perAvatarStore.update((prev) => ({
      ...prev,
      [avatarId]: get(currentHeightStore),
    }));
    return true;
  },

  forgetAvatar(avatarId: string) {
    perAvatarStore.update((prev) => {
      const next = { ...prev };
      delete next[avatarId];
      return next;
    });
  },

  forgetAllAvatars() {
    perAvatarStore.set({});
  },

  getSavedHeight(avatarId: string): number | undefined {
    return get(perAvatarStore)[avatarId];
  },
};

/**
 * VRChat re-sends /avatar/change both on avatar swaps and when an instance is
 * joined, so a single hook covers both restore cases.
 */
function onAvatarChange(avatarId: string) {
  const settings = get(settingsStore);
  if (!settings.perAvatarEnabled) return;

  const saved = get(perAvatarStore)[avatarId];
  if (saved === undefined) return;

  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    avatarScale.setHeight(saved, false);
    console.log("Avatar scale restored:", avatarId, saved);
  }, Math.max(0, settings.restoreDelayMs));
}

window.ADVOSCNative.osc.onMessage((message) => {
  if (message.address === "/avatar/change") {
    const avatarId = message.args[0] as string;
    currentAvatarIdStore.set(avatarId);
    onAvatarChange(avatarId);
    return;
  }

  const settings = get(settingsStore);
  if (!settings.forwardingEnabled) return;
  if (message.address !== settings.forwardAddress) return;

  const raw = Number(message.args[0]);
  if (!Number.isFinite(raw)) return;

  let height = raw;
  if (settings.forwardMode === "normalized") {
    const normalized = Math.min(1, Math.max(0, raw));
    height = settings.forwardMin + normalized * (settings.forwardMax - settings.forwardMin);
  }

  avatarScale.setHeight(height);
});
