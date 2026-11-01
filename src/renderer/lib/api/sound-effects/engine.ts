import {
  defaultRule,
  defaultSoundSettings,
  isTruthy,
  makeId,
  matches,
  type SoundEntry,
  type SoundOscType,
  type SoundSettings,
  type SoundTriggerRule,
} from "$shared/sound-effects";
import { get } from "$shared/store";
import { call, fire, mirrored, synced } from "../engine";

export { defaultRule, isTruthy, makeId, matches };
export type { SoundEntry, SoundOscType, SoundSettings, SoundTriggerRule };

const soundsStore = synced<SoundEntry[]>("SoundEffects;Sounds", []);
const rulesStore = synced<SoundTriggerRule[]>("SoundEffects;Rules", []);
const settingsStore = synced<SoundSettings>("SoundEffects;Settings", defaultSoundSettings);

/** Load error per sound id. */
const errorsStore = mirrored<Record<string, string>>("SoundEffects;Errors", {});
/** Number of playing copies per sound id. */
const playingStore = mirrored<Record<string, number>>("SoundEffects;Playing", {});
const vrcMutedStore = mirrored<boolean>("SoundEffects;VrcMuted", false);

function findSound(ref: string): SoundEntry | undefined {
  const sounds = get(soundsStore);
  const key = ref.trim().toLowerCase();
  return sounds.find((s) => s.id === ref) ?? sounds.find((s) => s.name.trim().toLowerCase() === key);
}

function updateSound(id: string, patch: Partial<SoundEntry>) {
  soundsStore.update((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

function updateSettings(patch: Partial<SoundSettings>) {
  settingsStore.update((prev) => ({ ...prev, ...patch }));
}

function setMasterVolume(volume: number) {
  if (Number.isNaN(volume)) return;
  updateSettings({ masterVolume: Math.max(0, Math.min(100, Math.round(volume))) });
}

export const soundEngine = {
  sounds: soundsStore,
  rules: rulesStore,
  settings: settingsStore,
  errors: errorsStore,
  playing: playingStore,
  vrcMuted: vrcMutedStore,
  updateSound,
  updateSettings,
  setMasterVolume,
  pickFiles: () => call<void>("sound.pickFiles"),
  removeSound: (id: string) => fire("sound.removeSound", id),
  reload: (id: string) => fire("sound.reload", id),
  listAudioOutputs: () => call<{ deviceId: string; label: string }[]>("sound.listAudioOutputs"),
  play: (ref: string, options: { loop?: boolean } = {}) => call<number | null>("sound.play", ref, options),
  stop: (ref: string) => fire("sound.stop", ref),
  stopVoice: (id: number) => fire("sound.stopVoice", id),
  stopAll: () => fire("sound.stopAll"),
  isPlaying(ref: string) {
    const sound = findSound(ref);
    return !!sound && !!get(playingStore)[sound.id];
  },
  playingNames() {
    const counts = get(playingStore);
    return get(soundsStore).filter((s) => counts[s.id]).map((s) => s.name);
  },
};
