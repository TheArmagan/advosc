import { writable, get } from "svelte/store";
import { toast } from "svelte-sonner";
import { localData } from "../local-data";
import { avatarOSC } from "../vrc-osc";
import { shortcuts } from "../shortcuts";

export type SoundOscType = "Bool" | "Int" | "Float";

export interface SoundEntry {
  id: string;
  name: string;
  path: string;
  /** 0-100 */
  volume: number;
  cooldownMs: number;
  /** Electron accelerator, "" for none */
  hotkey: string;
  oscEnabled: boolean;
  oscPath: string;
  oscType: SoundOscType;
  oscOnValue: string;
  oscOffValue: string;
}

export interface SoundTriggerRule {
  id: string;
  enabled: boolean;
  template: string;
  /** "1", "> 0.5", "!= idle"... a bare value means "=" */
  match: string;
  soundIds: string[];
}

export interface SoundSettings {
  /** 0-100 */
  masterVolume: number;
  muted: boolean;
  /** "" is the Windows default output */
  outputDeviceId: string;
  stopOnVrcMute: boolean;
  stopAllHotkey: string;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const SHORTCUT_PREFIX = "SoundEffects;";
const MUTE_ADDRESS = "/avatar/parameters/MuteSelf";

function defaultSoundFields(): Omit<SoundEntry, "id" | "name" | "path"> {
  return {
    volume: 100,
    cooldownMs: 0,
    hotkey: "",
    oscEnabled: false,
    oscPath: "",
    oscType: "Bool",
    oscOnValue: "true",
    oscOffValue: "false",
  };
}

export function defaultRule(): SoundTriggerRule {
  return { id: makeId(), enabled: true, template: "", match: "1", soundIds: [] };
}

const defaultSettings: SoundSettings = {
  masterVolume: 80,
  muted: false,
  outputDeviceId: "",
  stopOnVrcMute: false,
  stopAllHotkey: "",
};

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/** "true"/"1"/non-zero numbers are true; "", "false", "0", "null", "undefined" are false; other text is true. */
export function isTruthy(value: string): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "" || v === "false" || v === "null" || v === "undefined") return false;
  if (v === "true") return true;
  const n = Number(v);
  if (!Number.isNaN(n)) return n !== 0;
  return true;
}

function toComparableNumber(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v === "true") return 1;
  if (v === "false") return 0;
  if (v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Compare a resolved template against a rule's match string ("1", "> 0.5", "!= idle"). */
export function matches(value: string, match: string): boolean {
  const parsed = /^\s*(==|=|!=|>=|<=|>|<)?\s*([\s\S]*)$/.exec(match ?? "");
  const op = parsed?.[1] ?? "=";
  const target = (parsed?.[2] ?? "").trim();
  const a = toComparableNumber(value);
  const b = toComparableNumber(target);

  switch (op) {
    case "=":
    case "==":
    case "!=": {
      const equal = a !== null && b !== null
        ? a === b
        : value.trim().toLowerCase() === target.toLowerCase();
      return op === "!=" ? !equal : equal;
    }
    case ">": return a !== null && b !== null && a > b;
    case "<": return a !== null && b !== null && a < b;
    case ">=": return a !== null && b !== null && a >= b;
    case "<=": return a !== null && b !== null && a <= b;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

const soundsStore = writable<SoundEntry[]>(
  (localData.get("SoundEffects;Sounds", []) as SoundEntry[]).map((s) => ({ ...defaultSoundFields(), ...s })),
);
soundsStore.subscribe((val) => localData.set("SoundEffects;Sounds", val));

const rulesStore = writable<SoundTriggerRule[]>(
  (localData.get("SoundEffects;Rules", []) as SoundTriggerRule[]).map((r) => ({ ...defaultRule(), ...r })),
);
rulesStore.subscribe((val) => localData.set("SoundEffects;Rules", val));

const settingsStore = writable<SoundSettings>({
  ...defaultSettings,
  ...localData.get("SoundEffects;Settings", {}),
});
settingsStore.subscribe((val) => localData.set("SoundEffects;Settings", val));

/** Load/decode error per sound id. */
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
// Audio engine
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let appliedSinkId: string | null = null;

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyMasterGain();
    applySink();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => { });
  return ctx;
}

function applyMasterGain() {
  if (!master) return;
  const s = get(settingsStore);
  master.gain.value = s.muted ? 0 : Math.max(0, Math.min(100, s.masterVolume)) / 100;
}

async function applySink() {
  if (!ctx) return;
  const deviceId = get(settingsStore).outputDeviceId;
  if (appliedSinkId === deviceId) return;
  appliedSinkId = deviceId;
  const c = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (!c.setSinkId) return;
  try {
    await c.setSinkId(deviceId);
  } catch (e) {
    console.warn("SoundEffects", "Could not use output device, falling back to default", e);
    try {
      await c.setSinkId("");
    } catch { }
  }
}

settingsStore.subscribe(() => {
  applyMasterGain();
  applySink();
});

const buffers = new Map<string, { path: string; promise: Promise<AudioBuffer | null> }>();

function setError(id: string, message: string | null) {
  errorsStore.update((prev) => {
    if ((prev[id] ?? null) === message) return prev;
    const next = { ...prev };
    if (message === null) delete next[id]; else next[id] = message;
    return next;
  });
}

function loadBuffer(sound: SoundEntry): Promise<AudioBuffer | null> {
  const cached = buffers.get(sound.id);
  if (cached && cached.path === sound.path) return cached.promise;

  const promise = (async () => {
    try {
      if (!sound.path) throw new Error("No file selected");
      const data = await window.ADVOSCNative.files.readBinary(sound.path);
      if (!data) throw new Error("File not found");
      const buffer = await getContext().decodeAudioData(data);
      setError(sound.id, null);
      return buffer;
    } catch (e) {
      setError(sound.id, (e as Error)?.message || "Could not load this file");
      return null;
    }
  })();
  buffers.set(sound.id, { path: sound.path, promise });
  return promise;
}

interface Voice {
  soundId: string;
  source: AudioBufferSourceNode;
}

const voices = new Map<number, Voice>();
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
  window.ADVOSCNative.osc.sendCustom(sound.oscPath, [{ value, type: sound.oscType }]);
}

let vrcMuted = false;

function isBlocked(): boolean {
  const s = get(settingsStore);
  return s.muted || (s.stopOnVrcMute && vrcMuted);
}

/** Play a library sound by name (case-insensitive) or id. Resolves to whether it started. */
async function play(ref: string): Promise<boolean> {
  const sound = findSound(ref);
  if (!sound || isBlocked()) return false;

  const now = Date.now();
  if (sound.cooldownMs > 0 && now - (lastPlayedAt.get(sound.id) ?? 0) < sound.cooldownMs) return false;
  // Set before loading so rapid triggers during a decode still respect the cooldown.
  lastPlayedAt.set(sound.id, now);

  const buffer = await loadBuffer(sound);
  if (!buffer || isBlocked()) return false;

  const c = getContext();
  const gain = c.createGain();
  gain.gain.value = Math.max(0, Math.min(100, sound.volume)) / 100;
  gain.connect(master!);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);

  const id = ++voiceSeq;
  const wasSilent = voiceCount(sound.id) === 0;
  voices.set(id, { soundId: sound.id, source });
  source.onended = () => {
    voices.delete(id);
    gain.disconnect();
    publishPlaying();
    if (voiceCount(sound.id) === 0) sendOscPulse(sound.id, false);
  };
  source.start();
  publishPlaying();
  if (wasSilent) sendOscPulse(sound.id, true);
  return true;
}

function playRandom(refs: string[]): Promise<boolean> {
  const available = refs.filter((r) => findSound(r));
  if (available.length === 0) return Promise.resolve(false);
  return play(available[Math.floor(Math.random() * available.length)]);
}

function stopVoices(filter: (v: Voice) => boolean) {
  for (const v of voices.values()) {
    if (!filter(v)) continue;
    try {
      v.source.stop();
    } catch { }
  }
}

function stop(ref: string) {
  const sound = findSound(ref);
  if (!sound) return;
  stopVoices((v) => v.soundId === sound.id);
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

function updateSettings(patch: Partial<SoundSettings>) {
  settingsStore.update((prev) => ({ ...prev, ...patch }));
}

function setMasterVolume(volume: number) {
  if (Number.isNaN(volume)) return;
  updateSettings({ masterVolume: Math.max(0, Math.min(100, Math.round(volume))) });
}

async function listAudioOutputs(): Promise<{ deviceId: string; label: string }[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output ${i + 1}` }));
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
  const paths = await window.ADVOSCNative.dialog.openAudioFiles();
  if (paths.length) addFiles(paths);
}

function updateSound(id: string, patch: Partial<SoundEntry>) {
  soundsStore.update((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

function removeSound(id: string) {
  stopVoices((v) => v.soundId === id);
  buffers.delete(id);
  setError(id, null);
  soundsStore.update((prev) => prev.filter((s) => s.id !== id));
  rulesStore.update((prev) =>
    prev.map((r) => (r.soundIds.includes(id) ? { ...r, soundIds: r.soundIds.filter((s) => s !== id) } : r)),
  );
}

function reload(id: string) {
  buffers.delete(id);
  setError(id, null);
  const sound = get(soundsStore).find((s) => s.id === id);
  if (sound) loadBuffer(sound);
}

// Decode new or changed files up front so the first trigger doesn't wait, and so the library shows broken files right away.
soundsStore.subscribe((sounds) => {
  const ids = new Set(sounds.map((s) => s.id));
  for (const id of buffers.keys()) if (!ids.has(id)) buffers.delete(id);
  for (const sound of sounds) loadBuffer(sound);
});

// ---------------------------------------------------------------------------
// OSC: VRChat mute
// ---------------------------------------------------------------------------

function setVrcMuted(muted: boolean) {
  const wasMuted = vrcMuted;
  vrcMuted = muted;
  vrcMutedStore.set(muted);
  if (muted && !wasMuted && get(settingsStore).stopOnVrcMute) stopAll();
}

window.ADVOSCNative.osc.onMessage((message) => {
  if (message.address === MUTE_ADDRESS) setVrcMuted(isTruthy(String(message.args[0])));
});

{
  const last = avatarOSC.allLastParameters[MUTE_ADDRESS]?.[0];
  if (last !== undefined) setVrcMuted(isTruthy(String(last)));
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
        toast.warning("Sound Effects", {
          description: `Couldn't register ${accelerator}. Another app may already be using it.`,
        });
      }
    }
  }).catch((e) => console.error("SoundEffects", "Hotkey sync failed", e));
}

soundsStore.subscribe(syncShortcuts);
settingsStore.subscribe(syncShortcuts);

shortcuts.onTriggered(({ name }) => {
  if (!name.startsWith(SHORTCUT_PREFIX)) return;
  const action = name.slice(SHORTCUT_PREFIX.length);
  if (action === "StopAll") stopAll();
  else if (action.startsWith("Play;")) play(action.slice("Play;".length));
});

export const soundEngine = {
  sounds: soundsStore,
  rules: rulesStore,
  settings: settingsStore,
  errors: errorsStore,
  playing: playingStore,
  vrcMuted: vrcMutedStore,
  pickFiles,
  addFiles,
  updateSound,
  removeSound,
  reload,
  updateSettings,
  setMasterVolume,
  listAudioOutputs,
  play,
  playRandom,
  stop,
  stopAll,
  isPlaying,
  playingNames,
};
