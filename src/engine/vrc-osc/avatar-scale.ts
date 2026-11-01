import {
  clampEyeHeight,
  defaultAvatarScaleSettings,
  EYE_HEIGHT_ADDRESS,
  type AvatarScaleSettings,
} from "$shared/avatar-osc";
import { get, writable } from "$shared/store";
import { native } from "../native";
import { mirror, synced } from "../sync/hub";
import { avatarOSC } from "./avatar-osc";

const settingsStore = synced<AvatarScaleSettings>(
  "AvatarScale;Settings",
  defaultAvatarScaleSettings,
  (stored) => ({ ...defaultAvatarScaleSettings, ...stored }),
);

/** avatarId -> eye height in meters */
const perAvatarStore = synced<Record<string, number>>("AvatarScale;PerAvatar", {});

/** Last value we sent out, not something VRChat reports back. */
const currentHeightStore = synced<number>("AvatarScale;LastHeight", 1.5);

const lastAppliedAtStore = writable<number>(0);

/** Reactive mirror of `avatarOSC.lastAvatarId` (that one is a plain getter). */
const currentAvatarIdStore = writable<string | null>(null);

let restoreTimer: ReturnType<typeof setTimeout> | null = null;

function sendEyeHeight(value: number) {
  native.osc.sendCustom(EYE_HEIGHT_ADDRESS, [{ value, type: "Float" }]);
}

export const avatarScale = {
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

function handleMessage(message: { address: string; args: any[] }) {
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
}

export function startAvatarScale() {
  mirror("AvatarScale;LastAppliedAt", lastAppliedAtStore);
  mirror("AvatarScale;CurrentAvatarId", currentAvatarIdStore);
  native.osc.onMessage(handleMessage);
}
