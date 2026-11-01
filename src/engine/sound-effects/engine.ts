import { get, writable } from "$shared/store";
import {
  defaultRule,
  defaultSoundFields,
  defaultSoundSettings,
  isTruthy,
  makeId,
  matches,
  type SoundEntry,
  type SoundSettings,
  type SoundTriggerRule,
} from "$shared/sound-effects";
import { native } from "../native";
import { notify } from "../runtime/notify";
import { shortcuts } from "../shortcuts";
import { mirror, synced } from "../sync/hub";
import { avatarOSC } from "../vrc-osc";
import { createUnavailableBackend, type AudioBackend } from "./audio-backend";

export { defaultRule, isTruthy, makeId, matches };
export type { SoundEntry, SoundSettings, SoundTriggerRule };

const SHORTCUT_PREFIX = "SoundEffects;";
const MUTE_ADDRESS = "/avatar/parameters/MuteSelf";

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const soundsStore = synced<SoundEntry[]>("SoundEffects;Sounds", [], (stored: SoundEntry[]) =>
  stored.map((s) => ({ ...defaultSoundFields(), ...s })),
);

const rulesStore = synced<SoundTriggerRule[]>("SoundEffects;Rules", [], (stored: SoundTriggerRule[]) =>
  stored.map((r) => ({ ...defaultRule(), ...r })),
);

const settingsStore = synced<SoundSettings>("SoundEffects;Settings", defaultSoundSettings, (stored) => ({
  ...defaultSoundSettings,
  ...stored,
}));

/** Load error per sound id. */
const errorsStore = writable<Record<string, string>>({});
/** Number of playing copies per sound id. */
const playingStore = writable<Record<string, number>>({});
const vrcMutedStore = writable(false);

function findSound(ref: string): SoundEntry | undefined {
  const sounds = get(soundsStore);
  const key = ref.trim().toLowerCase();
  return sounds.find((s) => s.id === ref) ?? sounds.find((s) => s.name.trim().toLowerCase() === key);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

let backend: AudioBackend = createUnavailableBackend();
let appliedDeviceId: string | null = null;

/** The sidecar client takes over from the stub through this. */
export function setAudioBackend(next: AudioBackend) {
  backend = next;
}

function applyMasterGain() {
  const s = get(settingsStore);
  backend.setMasterGain(s.muted ? 0 : Math.max(0, Math.min(100, s.masterVolume)) / 100);
}

async function applyOutputDevice() {
  const deviceId = get(settingsStore).outputDeviceId;
  if (appliedDeviceId === deviceId) return;
  appliedDeviceId = deviceId;
  try {
    await backend.setOutputDevice(deviceId ? { id: deviceId, name: "" } : null);
  } catch (e) {
    console.warn("SoundEffects", "Could not use output device, falling back to default", e);
    await backend.setOutputDevice(null).catch(() => {});
  }
}

const loaded = new Map<string, { path: string; promise: Promise<boolean> }>();

function setError(id: string, message: string | null) {
  errorsStore.update((prev) => {
    if ((prev[id] ?? null) === message) return prev;
    const next = { ...prev };
    if (message === null) delete next[id]; else next[id] = message;
    return next;
  });
}

function loadSound(sound: SoundEntry): Promise<boolean> {
  const cached = loaded.get(sound.id);
  if (cached && cached.path === sound.path) return cached.promise;

  const promise = (async () => {
    try {
      if (!sound.path) throw new Error("No file selected");
      await backend.load(sound.id, sound.path);
      setError(sound.id, null);
      return true;
    } catch (e) {
      setError(sound.id, (e as Error)?.message || "Could not load this file");
      return false;
    }
  })();
  loaded.set(sound.id, { path: sound.path, promise });
  return promise;
}

const voices = new Map<number, string>();
let voiceSeq = 0;
const lastPlayedAt = new Map<string, number>();

function voiceCount(soundId: string): number {
  let n = 0;
  for (const id of voices.values()) if (id === soundId) n++;
  return n;
}

function publishPlaying() {
  const counts: Record<string, number> = {};
  for (const id of voices.values()) counts[id] = (counts[id] ?? 0) + 1;
  playingStore.set(counts);
}

function sendOscPulse(soundId: string, on: boolean) {
  const sound = get(soundsStore).find((s) => s.id === soundId);
  if (!sound?.oscEnabled || !sound.oscPath) return;
  const raw = on ? sound.oscOnValue : sound.oscOffValue;
  let value: number | boolean;
  if (sound.oscType === "Bool") {
    value = isTruthy(raw);
  } else {
    let n = parseFloat(raw);
    if (Number.isNaN(n)) n = 0;
    value = sound.oscType === "Int" ? Math.round(n) : n;
  }
  native.osc.sendCustom(sound.oscPath, [{ value, type: sound.oscType }]);
}

let vrcMuted = false;

function isBlocked(): boolean {
  const s = get(settingsStore);
  return s.muted || (s.stopOnVrcMute && vrcMuted);
}

function handleVoiceEnded(voice: number) {
  const soundId = voices.get(voice);
  if (soundId === undefined) return;
  voices.delete(voice);
  publishPlaying();
  if (voiceCount(soundId) === 0) sendOscPulse(soundId, false);
}

/**
 * Play a library sound by name (case-insensitive) or id.
 * Resolves to the id of the new playback (for `stopVoice`), or null if it didn't start.
 */
async function play(ref: string, options: { loop?: boolean } = {}): Promise<number | null> {
  const sound = findSound(ref);
  if (!sound || isBlocked()) return null;

  const now = Date.now();
  if (sound.cooldownMs > 0 && now - (lastPlayedAt.get(sound.id) ?? 0) < sound.cooldownMs) return null;
  // Set before loading so rapid triggers during a decode still respect the cooldown.
  lastPlayedAt.set(sound.id, now);

  const ready = await loadSound(sound);
  if (!ready || isBlocked()) return null;

  const id = ++voiceSeq;
  const wasSilent = voiceCount(sound.id) === 0;
  voices.set(id, sound.id);
  publishPlaying();
  if (wasSilent) sendOscPulse(sound.id, true);

  try {
    await backend.play(id, sound.id, {
      gain: Math.max(0, Math.min(100, sound.volume)) / 100,
      loop: !!options.loop,
    });
    return id;
  } catch (e) {
    setError(sound.id, (e as Error)?.message || "Could not play this file");
    handleVoiceEnded(id);
    return null;
  }
}

function playRandom(refs: string[], options: { loop?: boolean } = {}): Promise<number | null> {
  const available = refs.filter((r) => findSound(r));
  if (available.length === 0) return Promise.resolve(null);
  return play(available[Math.floor(Math.random() * available.length)], options);
}

/** Stop one playback started by `play`. */
function stopVoice(id: number) {
  if (voices.has(id)) backend.stopVoice(id);
}

function stopVoices(filter: (soundId: string) => boolean) {
  for (const [voice, soundId] of voices) {
    if (filter(soundId)) backend.stopVoice(voice);
  }
}

function stop(ref: string) {
  const sound = findSound(ref);
  if (!sound) return;
  stopVoices((soundId) => soundId === sound.id);
}

function stopAll() {
  stopVoices(() => true);
}

function isPlaying(ref: string): boolean {
  const sound = findSound(ref);
  return !!sound && voiceCount(sound.id) > 0;
}

function playingNames(): string[] {
  const counts = get(playingStore);
  return get(soundsStore).filter((s) => counts[s.id]).map((s) => s.name);
}

function setMasterVolume(volume: number) {
  if (Number.isNaN(volume)) return;
  settingsStore.update((prev) => ({ ...prev, masterVolume: Math.max(0, Math.min(100, Math.round(volume))) }));
}

async function listAudioOutputs(): Promise<{ deviceId: string; label: string }[]> {
  try {
    const devices = await backend.listDevices();
    return devices.map((device) => ({ deviceId: device.id, label: device.name }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Library editing
// ---------------------------------------------------------------------------

function uniqueName(base: string, taken: Set<string>): string {
  let name = base || "sound";
  let n = 2;
  while (taken.has(name.toLowerCase())) name = `${base} ${n++}`;
  taken.add(name.toLowerCase());
  return name;
}

function addFiles(paths: string[]) {
  soundsStore.update((prev) => {
    const taken = new Set(prev.map((s) => s.name.toLowerCase()));
    const added = paths.map((p) => {
      const file = p.split(/[\\/]/).pop() ?? p;
      const base = file.replace(/\.[^.]+$/, "").replace(/;/g, " ").trim();
      return { id: makeId(), name: uniqueName(base, taken), path: p, ...defaultSoundFields() };
    });
    return [...prev, ...added];
  });
}

async function pickFiles() {
  const paths = await native.dialog.openAudioFiles();
  if (paths.length) addFiles(paths);
}

function removeSound(id: string) {
  stopVoices((soundId) => soundId === id);
  loaded.delete(id);
  backend.unload(id);
  setError(id, null);
  soundsStore.update((prev) => prev.filter((s) => s.id !== id));
  rulesStore.update((prev) =>
    prev.map((r) => (r.soundIds.includes(id) ? { ...r, soundIds: r.soundIds.filter((s) => s !== id) } : r)),
  );
}

function reload(id: string) {
  loaded.delete(id);
  setError(id, null);
  const sound = get(soundsStore).find((s) => s.id === id);
  if (sound) void loadSound(sound);
}

// ---------------------------------------------------------------------------
// OSC: VRChat mute
// ---------------------------------------------------------------------------

function setVrcMuted(muted: boolean) {
  const wasMuted = vrcMuted;
  vrcMuted = muted;
  vrcMutedStore.set(muted);
  if (muted && !wasMuted && get(settingsStore).stopOnVrcMute) stopAll();
}

// ---------------------------------------------------------------------------
// Hotkeys
// ---------------------------------------------------------------------------

let shortcutSync: Promise<void> = Promise.resolve();

function syncShortcuts() {
  shortcutSync = shortcutSync.then(async () => {
    const wanted: Record<string, string> = {};
    for (const sound of get(soundsStore)) {
      if (sound.hotkey) wanted[`${SHORTCUT_PREFIX}Play;${sound.id}`] = sound.hotkey;
    }
    const stopAllHotkey = get(settingsStore).stopAllHotkey;
    if (stopAllHotkey) wanted[`${SHORTCUT_PREFIX}StopAll`] = stopAllHotkey;

    const current = shortcuts.getAllTriggers();
    for (const name of Object.keys(current)) {
      if (name.startsWith(SHORTCUT_PREFIX) && !(name in wanted)) await shortcuts.removeTrigger(name);
    }
    for (const [name, accelerator] of Object.entries(wanted)) {
      if (current[name] === accelerator) continue;
      const ok = await shortcuts.setTrigger(name, accelerator);
      if (!ok) {
        notify.warning("Sound Effects", {
          description: `Couldn't register ${accelerator}. Another app may already be using it.`,
        });
      }
    }
  }).catch((e) => console.error("SoundEffects", "Hotkey sync failed", e));
}

export const soundEngine = {
  sounds: soundsStore,
  rules: rulesStore,
  settings: settingsStore,
  errors: errorsStore,
  playing: playingStore,
  vrcMuted: vrcMutedStore,
  pickFiles,
  addFiles,
  removeSound,
  reload,
  setMasterVolume,
  listAudioOutputs,
  play,
  playRandom,
  stop,
  stopVoice,
  stopAll,
  isPlaying,
  playingNames,
};

export function startSoundEngine() {
  mirror("SoundEffects;Errors", errorsStore);
  mirror("SoundEffects;Playing", playingStore, 50);
  mirror("SoundEffects;VrcMuted", vrcMutedStore);

  backend.onVoiceEnded(handleVoiceEnded);

  settingsStore.subscribe(() => {
    applyMasterGain();
    void applyOutputDevice();
  });

  // Load new or changed files up front so the first trigger doesn't wait, and so the library
  // shows broken files right away.
  soundsStore.subscribe((sounds) => {
    const ids = new Set(sounds.map((s) => s.id));
    for (const id of loaded.keys()) {
      if (ids.has(id)) continue;
      loaded.delete(id);
      backend.unload(id);
    }
    for (const sound of sounds) void loadSound(sound);
  });

  native.osc.onMessage((message) => {
    if (message.address === MUTE_ADDRESS) setVrcMuted(isTruthy(String(message.args[0])));
  });

  const last = avatarOSC.allLastParameters[MUTE_ADDRESS]?.[0];
  if (last !== undefined) setVrcMuted(isTruthy(String(last)));

  soundsStore.subscribe(syncShortcuts);
  settingsStore.subscribe(syncShortcuts);

  shortcuts.onTriggered(({ name }) => {
    if (!name.startsWith(SHORTCUT_PREFIX)) return;
    const action = name.slice(SHORTCUT_PREFIX.length);
    if (action === "StopAll") stopAll();
    else if (action.startsWith("Play;")) void play(action.slice("Play;".length));
  });
}
