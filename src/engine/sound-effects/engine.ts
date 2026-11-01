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
import { AudioSidecar, migrateLegacyDevice, resolveDeviceId, type AudioEvent } from "../audio";
import { native } from "../native";
import { localData } from "../persistence/local-data";
import { onShutdown } from "../runtime/host";
import { notify } from "../runtime/notify";
import { nativeExePath } from "../services/natives";
import { shortcuts } from "../shortcuts";
import { mirror, synced } from "../sync/hub";
import { avatarOSC } from "../vrc-osc";

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

let audio: AudioSidecar;

function applyMasterGain() {
  const s = get(settingsStore);
  audio.setMaster(s.muted ? 0 : Math.max(0, Math.min(100, s.masterVolume)) / 100);
}

let appliedDeviceId: string | null = null;

async function applyOutputDevice() {
  const saved = get(settingsStore).outputDevice;
  if (!saved || appliedDeviceId === saved.id) return;
  appliedDeviceId = saved.id;

  if (!saved.id) {
    audio.setDevice("");
    return;
  }
  const { devices } = await audio.listDevices();
  audio.setDevice(resolveDeviceId(saved, devices));
}

/**
 * Moves the output picked in the old browser build over to a real device, once. The old id
 * means nothing here, so the label the import recorded is all there is to go on.
 */
async function migrateOutputDevice() {
  const settings = get(settingsStore);
  if (settings.outputDevice) return;

  const legacyId = settings.outputDeviceId;
  const recorded = localData.getMeta()?.migration?.audioOutputs ?? [];
  const label = recorded.find((output) => output.deviceId === legacyId)?.label ?? "";

  const { devices } = await audio.listDevices();
  // Nothing to compare against yet, so try again on the next `ready`.
  if (legacyId && !devices.length) return;

  const migrated = migrateLegacyDevice({ deviceId: legacyId, label }, devices);
  if (!migrated) {
    notify.warning("Sound Effects", {
      description: `Couldn't find ${label || "your old output device"}, so sounds will use the Windows default.`,
    });
  }
  settingsStore.update((prev) => ({ ...prev, outputDevice: migrated ?? { id: "", name: "" } }));
}

/** Sound id to the path handed to the sidecar. Decoding is costly, so only a new path reloads. */
const loaded = new Map<string, string>();

function setError(id: string, message: string | null) {
  errorsStore.update((prev) => {
    if ((prev[id] ?? null) === message) return prev;
    const next = { ...prev };
    if (message === null) delete next[id]; else next[id] = message;
    return next;
  });
}

function loadSound(sound: SoundEntry) {
  if (!sound.path) {
    setError(sound.id, "No file selected");
    return;
  }
  if (loaded.get(sound.id) === sound.path) return;
  loaded.set(sound.id, sound.path);
  setError(sound.id, null);
  audio.load(sound.id, sound.path);
}

interface Voice {
  soundId: string;
  gain: number;
  loop: boolean;
  /** The sidecar's voice, or null for a loop waiting out a sidecar crash. */
  sidecarVoice: number | null;
}

/**
 * Keyed by an id of our own, not the sidecar's. A loop that dies with the sidecar comes back as
 * a new sidecar voice, and whoever is holding this id (a rule, a Loop placeholder) can stop it
 * without knowing that happened.
 */
const voices = new Map<number, Voice>();
const bySidecarVoice = new Map<number, number>();
let voiceSeq = 0;
const lastPlayedAt = new Map<string, number>();

function voiceCount(soundId: string): number {
  let n = 0;
  for (const v of voices.values()) if (v.soundId === soundId) n++;
  return n;
}

function publishPlaying() {
  const counts: Record<string, number> = {};
  for (const v of voices.values()) counts[v.soundId] = (counts[v.soundId] ?? 0) + 1;
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

function startSidecarVoice(id: number, voice: Voice) {
  voice.sidecarVoice = audio.play(voice.soundId, { gain: voice.gain, loop: voice.loop });
  bySidecarVoice.set(voice.sidecarVoice, id);
}

function endVoice(id: number) {
  const voice = voices.get(id);
  if (!voice) return;
  voices.delete(id);
  if (voice.sidecarVoice !== null) bySidecarVoice.delete(voice.sidecarVoice);
  publishPlaying();
  if (voiceCount(voice.soundId) === 0) sendOscPulse(voice.soundId, false);
}

let deviceFallbackShown = false;

function handleAudioEvent(event: AudioEvent) {
  switch (event.type) {
    case "ready":
      void migrateOutputDevice().then(applyOutputDevice).catch((e) => {
        console.warn("SoundEffects", "Could not set the output device", e);
      });
      break;

    case "loaded":
      setError(event.id, null);
      // The sidecar only sends this again after a restart. Don't restart loops any sooner than
      // this: starting a voice from the exit itself would respawn past the sidecar's backoff.
      for (const [id, voice] of voices) {
        if (voice.soundId === event.id && voice.sidecarVoice === null) startSidecarVoice(id, voice);
      }
      break;

    case "load_error":
      setError(event.id, event.message);
      for (const [id, voice] of voices) {
        if (voice.soundId === event.id && voice.sidecarVoice === null) endVoice(id);
      }
      break;

    case "voice_ended": {
      const id = bySidecarVoice.get(event.voice);
      if (id === undefined) break;
      bySidecarVoice.delete(event.voice);

      const voice = voices.get(id);
      if (voice?.loop && event.reason === "sidecar_exit") voice.sidecarVoice = null;
      else endVoice(id);
      break;
    }

    case "device_changed":
      if (event.reason === "device_restored") deviceFallbackShown = false;
      if (event.fallback && !deviceFallbackShown) {
        deviceFallbackShown = true;
        const name = get(settingsStore).outputDevice?.name || "Your output device";
        notify.warning("Sound Effects", {
          description: `${name} isn't available, so sounds are using the Windows default until it's back.`,
        });
      }
      if (event.reason === "no_device") {
        notify.warning("Sound Effects", { description: "No audio output device could be opened." });
      }
      break;

    case "error":
      console.error("Audio sidecar error:", event.message);
      break;

    case "sidecar_exit":
      console.warn(`Audio sidecar exited (code ${event.code}).`);
      break;
  }
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

  // Covers a sound added a moment ago. A play sent during a decode waits for it.
  loadSound(sound);
  if (get(errorsStore)[sound.id]) return null;

  const id = ++voiceSeq;
  const wasSilent = voiceCount(sound.id) === 0;
  const voice: Voice = {
    soundId: sound.id,
    gain: Math.max(0, Math.min(100, sound.volume)) / 100,
    loop: !!options.loop,
    sidecarVoice: null,
  };
  voices.set(id, voice);
  startSidecarVoice(id, voice);
  publishPlaying();
  if (wasSilent) sendOscPulse(sound.id, true);
  return id;
}

function playRandom(refs: string[], options: { loop?: boolean } = {}): Promise<number | null> {
  const available = refs.filter((r) => findSound(r));
  if (available.length === 0) return Promise.resolve(null);
  return play(available[Math.floor(Math.random() * available.length)], options);
}

/** Stop one playback started by `play`. */
function stopVoice(id: number) {
  const voice = voices.get(id);
  if (!voice) return;
  // The sidecar's `voice_ended` finishes the job. A loop waiting out a crash has nothing to
  // stop, so it ends here.
  if (voice.sidecarVoice !== null) audio.stop(voice.sidecarVoice);
  else endVoice(id);
}

function stopVoices(filter: (soundId: string) => boolean) {
  for (const [id, voice] of voices) {
    if (filter(voice.soundId)) stopVoice(id);
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
  const { devices } = await audio.listDevices();
  return devices.map((device) => ({ deviceId: device.id, label: device.name }));
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
  audio.unload(id);
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
  if (sound) loadSound(sound);
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

  audio = new AudioSidecar(nativeExePath("advosc-audio.exe"));
  audio.onEvent(handleAudioEvent);
  onShutdown(() => audio.shutdown());

  // Nothing to move, so there's no reason to start the sidecar just to work that out.
  if (!get(settingsStore).outputDevice && !get(settingsStore).outputDeviceId) {
    settingsStore.update((prev) => ({ ...prev, outputDevice: { id: "", name: "" } }));
  }

  settingsStore.subscribe(() => {
    applyMasterGain();
    void applyOutputDevice().catch((e) => {
      console.warn("SoundEffects", "Could not set the output device", e);
    });
  });

  // Load new or changed files up front so the first trigger doesn't wait, and so the library
  // shows broken files right away.
  soundsStore.subscribe((sounds) => {
    const ids = new Set(sounds.map((s) => s.id));
    for (const id of loaded.keys()) {
      if (ids.has(id)) continue;
      loaded.delete(id);
      audio.unload(id);
    }
    for (const sound of sounds) loadSound(sound);
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
