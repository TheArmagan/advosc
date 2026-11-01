import { startSoundEngine } from "./engine";

export * from "./engine";

/** Trigger rules live in Automations now. This is only the sound library and its playback. */
export function startSoundEffects() {
  startSoundEngine();
}
