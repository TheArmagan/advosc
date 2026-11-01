import {
  clampEyeHeight,
  defaultAvatarScaleSettings,
  type AvatarScalePreset,
  type AvatarScaleSettings,
} from "$shared/avatar-osc";
import { get } from "$shared/store";
import { fire, mirrored, synced } from "../engine";
import { avatarOSC } from "./avatar-osc";

const defaultPresets: AvatarScalePreset[] = [
  { id: "default-smallest", name: "Smallest (UI Brokes)", value: 0.01 },
  { id: "default-smallest-ui", name: "Smallest (UI Works)", value: 0.02 }
];

const settingsStore = synced<AvatarScaleSettings>("AvatarScale;Settings", defaultAvatarScaleSettings);
const presetsStore = synced<AvatarScalePreset[]>("AvatarScale;Presets", defaultPresets);
/** avatarId -> eye height in meters */
const perAvatarStore = synced<Record<string, number>>("AvatarScale;PerAvatar", {});
/** Last value we sent out, not something VRChat reports back. */
const currentHeightStore = synced<number>("AvatarScale;LastHeight", 1.5);

const lastAppliedAtStore = mirrored<number>("AvatarScale;LastAppliedAt", 0);
const currentAvatarIdStore = mirrored<string | null>("AvatarScale;CurrentAvatarId", null);

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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
    fire("avatarScale.setHeight", value, persist);
    return clampEyeHeight(value);
  },

  /** Push the last known height again, e.g. after VRChat lost it. */
  reapply() {
    fire("avatarScale.reapply");
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
