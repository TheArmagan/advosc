import gsap from "gsap"
import { writable, get } from "svelte/store"
import { localData } from "$lib/api/local-data"

export type AvatarParameterType = "Float" | "Int" | "Bool";
export type OSCSendType = AvatarParameterType | "String";

export type AvatarOSCSchema = {
  id: string,
  name: string,
  hash: number,
  parameters: {
    name: string,
    input?: {
      address: string,
      type: AvatarParameterType,
    },
    output?: {
      address: string,
      type: AvatarParameterType,
    }
  }[]
}

export type AvatarData = {
  eyeHeight: number,
  legacyFingers: boolean,
  animationParameters: {
    name: string,
    value: number
  }[]
}

export type SchemaEntry = {
  name: string,
  type: AvatarParameterType,
  writable: boolean,
  readable: boolean,
}

export type AnimationEase = "none" | "power1.inOut" | "power2.inOut" | "power3.inOut" | "sine.inOut" | "bounce.inOut" | "elastic.out";

export type ParameterAnimation = {
  address: string,
  from: number,
  to: number,
  duration: number,
  repeat: number,
  yoyo: boolean,
  ease: AnimationEase,
}

export type SentHistoryEntry = {
  address: string,
  value: number | string | boolean,
  type: OSCSendType,
  at: number,
}

/** Parameters VRChat drives on every avatar. Useful to hide when hunting for your own. */
export const VRCHAT_BUILTIN_PARAMETERS = new Set([
  "IsLocal", "PreviewMode", "Viseme", "Voice", "GestureLeft", "GestureRight",
  "GestureLeftWeight", "GestureRightWeight", "AngularY", "VelocityX", "VelocityY",
  "VelocityZ", "VelocityMagnitude", "Upright", "Grounded", "Seated", "AFK",
  "TrackingType", "VRMode", "MuteSelf", "InStation", "Earmuffs", "IsOnFriendsList",
  "AvatarVersion", "IsAnimatorEnabled", "ScaleModified", "ScaleFactor",
  "ScaleFactorInverse", "EyeHeightAsMeters", "EyeHeightAsPercent",
]);

export const AVATAR_PARAMETER_PREFIX = "/avatar/parameters/";

export function isBuiltinParameter(address: string) {
  return address.startsWith(AVATAR_PARAMETER_PREFIX)
    && VRCHAT_BUILTIN_PARAMETERS.has(address.slice(AVATAR_PARAMETER_PREFIX.length));
}

/** Coerce a number into what a parameter of `type` can actually hold. */
export function coerceParameterValue(value: number, type: AvatarParameterType | null) {
  if (!Number.isFinite(value)) value = 0;
  switch (type) {
    case "Bool": return value ? 1 : 0;
    case "Int": return Math.round(value);
    default: return value;
  }
}

const VRChatOSCBaseDir = window.ADVOSCNative.path.join(window.ADVOSCNative.env.get("APPDATA")!, "../LocalLow/VRChat/VRChat/OSC");
const VRChatLocalAvatarDataDir = window.ADVOSCNative.path.join(window.ADVOSCNative.env.get("APPDATA")!, "../LocalLow/VRChat/VRChat/LocalAvatarData");

const ANIMATION_SEND_INTERVAL_MS = 33;
const HISTORY_LIMIT = 30;

const schemaStore = writable<AvatarOSCSchema | null>(null);
const schemaIndexStore = writable<Record<string, SchemaEntry>>({});
const parametersStore = writable<Record<string, number>>({});
const changedAtStore = writable<Record<string, number>>({});
const avatarIdStore = writable<string | null>(null);

let lockedParameters: Record<string, { value: number, type: AvatarParameterType | null }> = {};
const lockedParameterAddresses = writable<string[]>([]);

const linksStore = writable<Record<string, string[]>>(localData.get("AvatarOSC;Links", {}));
linksStore.subscribe((val) => localData.set("AvatarOSC;Links", val));

const favoritesStore = writable<string[]>(localData.get("AvatarOSC;Favorites", []));
favoritesStore.subscribe((val) => localData.set("AvatarOSC;Favorites", val));

const historyStore = writable<SentHistoryEntry[]>(localData.get("AvatarOSC;SendHistory", []));
historyStore.subscribe((val) => localData.set("AvatarOSC;SendHistory", val));

const animationsStore = writable<Record<string, ParameterAnimation>>({});
const timelines: Record<string, gsap.core.Timeline> = {};

let observedTypes: Record<string, AvatarParameterType> = {};
let lastAvatarId: string | null = null;
let lastUserId: string | null = null;

let allLastParameters: Record<string, any[]> = {};

let onParameterChangeCallbacks: ((address: string, value: number) => void)[] = [];

// Incoming values from VRChat and our own optimistic writes are batched and
// flushed together so a burst of OSC traffic only re-renders once per frame.
let incomingUpdates: Record<string, number> = {};
let localUpdates: Record<string, number> = {};

schemaStore.subscribe((schema) => {
  const index: Record<string, SchemaEntry> = {};
  for (const p of schema?.parameters ?? []) {
    const address = p.input?.address ?? p.output?.address;
    const type = p.input?.type ?? p.output?.type;
    if (!address || !type) continue;
    index[address] = { name: p.name, type, writable: !!p.input, readable: !!p.output };
    // Input and output addresses are the same in practice, but index both just in case.
    if (p.output && p.output.address !== address) {
      index[p.output.address] = { name: p.name, type: p.output.type, writable: false, readable: true };
    }
  }
  schemaIndexStore.set(index);
});

function getParameterType(address: string): AvatarParameterType | null {
  return get(schemaIndexStore)[address]?.type ?? observedTypes[address] ?? null;
}

function typeFromTag(tag: string | undefined): AvatarParameterType | null {
  switch (tag) {
    case "T": case "F": return "Bool";
    case "i": return "Int";
    case "f": return "Float";
    default: return null;
  }
}

function guessType(value: number): AvatarParameterType {
  if (value % 1 !== 0) return "Float";
  if (value === 0 || value === 1) return "Bool";
  return "Int";
}

/** Send a parameter with an explicit type. Does not touch locks. */
function sendParameter(address: string, value: number, type?: AvatarParameterType | null) {
  const resolvedType = type ?? getParameterType(address) ?? guessType(value);
  const coerced = coerceParameterValue(value, resolvedType);
  window.ADVOSCNative.osc.sendCustom(address, [{ value: coerced, type: resolvedType }]);
  localUpdates[address] = coerced;
  return coerced;
}

function updateLockedAddresses() {
  lockedParameterAddresses.set(Object.keys(lockedParameters));
}

function lockParameter(address: string, value?: number, type?: AvatarParameterType | null) {
  const lockValue = value ?? get(parametersStore)[address] ?? 0;
  const resolvedType = type ?? getParameterType(address);
  const sent = sendParameter(address, lockValue, resolvedType);
  lockedParameters[address] = { value: sent, type: resolvedType };
  updateLockedAddresses();
}

function unlockParameter(address: string) {
  if (!(address in lockedParameters)) return;
  delete lockedParameters[address];
  updateLockedAddresses();
}

function unlockAll() {
  lockedParameters = {};
  updateLockedAddresses();
}

function stopAnimation(address: string) {
  timelines[address]?.kill();
  delete timelines[address];
  animationsStore.update((prev) => {
    if (!(address in prev)) return prev;
    const { [address]: _, ...rest } = prev;
    return rest;
  });
}

function stopAllAnimations() {
  for (const address of Object.keys(timelines)) stopAnimation(address);
}

function animate(config: ParameterAnimation) {
  stopAnimation(config.address);
  const type = getParameterType(config.address);
  const state = { value: config.from };
  let lastSentAt = 0;
  const tl = gsap.timeline({
    repeat: config.repeat,
    yoyo: config.yoyo,
    onComplete: () => {
      sendParameter(config.address, state.value, type);
      stopAnimation(config.address);
    },
  });
  tl.to(state, {
    value: config.to,
    duration: Math.max(0.05, config.duration),
    ease: config.ease,
    onUpdate: () => {
      const now = performance.now();
      if (now - lastSentAt < ANIMATION_SEND_INTERVAL_MS) return;
      lastSentAt = now;
      sendParameter(config.address, state.value, type);
    },
  });
  timelines[config.address] = tl;
  animationsStore.update((prev) => ({ ...prev, [config.address]: config }));
}

function addHistory(entry: SentHistoryEntry) {
  historyStore.update((prev) => {
    const deduped = prev.filter((h) => !(h.address === entry.address && h.type === entry.type && h.value === entry.value));
    return [entry, ...deduped].slice(0, HISTORY_LIMIT);
  });
}

export const avatarOSC = {
  parameters: parametersStore,
  schema: schemaStore,
  /** Address -> name/type/direction, rebuilt whenever the schema changes. */
  schemaIndex: schemaIndexStore,
  /** Address -> Date.now() of the last value change seen from VRChat. */
  changedAt: changedAtStore,
  avatarId: avatarIdStore,
  lockedParameterAddresses,
  links: linksStore,
  favorites: favoritesStore,
  animations: animationsStore,
  history: historyStore,
  get allLastParameters() {
    return allLastParameters;
  },
  getParameterType,
  /** True when the type comes from the schema or from VRChat's own messages rather than a guess. */
  isTypeKnown(address: string) {
    return !!(get(schemaIndexStore)[address] || observedTypes[address]);
  },
  sendParameter,
  /**
   * Send a value and set the lock state. Leaving `locked` false unlocks the
   * parameter, which is what loading a profile relies on.
   */
  setParameter(address: string, value: number, locked: boolean = false, type?: AvatarParameterType | null) {
    if (locked) {
      lockParameter(address, value, type);
    } else {
      unlockParameter(address);
      sendParameter(address, value, type);
    }
  },
  setAllParameters(params: Record<string, number>) {
    for (const address in params) {
      this.setParameter(address, params[address]);
    }
  },
  lockParameter,
  unlockParameter,
  unlockAll,
  /**
   * Send anything to any address with the exact OSC type you pick. Used by the
   * Send tab, so it also records the send in history.
   */
  sendRaw(address: string, value: number | string | boolean, type: OSCSendType) {
    if (type === "String") {
      window.ADVOSCNative.osc.sendCustom(address, [{ value: String(value), type }]);
    } else {
      sendParameter(address, typeof value === "number" ? value : Number(value) || (value === true ? 1 : 0), type);
    }
    addHistory({ address, value, type, at: Date.now() });
  },
  sendCustomParameter(address: string, value: number, type: AvatarParameterType) {
    return window.ADVOSCNative.osc.sendCustom(address, [{ value, type }]);
  },
  clearHistory() {
    historyStore.set([]);
  },
  link(from: string, to: string) {
    if (from === to) return false;
    let added = false;
    linksStore.update((prev) => {
      const existing = prev[from] ?? [];
      if (existing.includes(to)) return prev;
      added = true;
      return { ...prev, [from]: [...existing, to] };
    });
    return added;
  },
  unlink(from: string, to?: string) {
    linksStore.update((prev) => {
      const remaining = to ? (prev[from] ?? []).filter((a) => a !== to) : [];
      const { [from]: _, ...rest } = prev;
      return remaining.length ? { ...rest, [from]: remaining } : rest;
    });
  },
  clearLinks() {
    linksStore.set({});
  },
  toggleFavorite(address: string) {
    favoritesStore.update((prev) => prev.includes(address) ? prev.filter((a) => a !== address) : [...prev, address]);
  },
  animate,
  stopAnimation,
  stopAllAnimations,
  get lastAvatarId() {
    return lastAvatarId;
  },
  get lastUserId() {
    return lastUserId;
  },
  onParameterChange(callback: (address: string, value: number) => void) {
    onParameterChangeCallbacks.push(callback);
    return () => {
      onParameterChangeCallbacks = onParameterChangeCallbacks.filter(cb => cb !== callback);
    };
  },
  updateOSCSchema,
}

setInterval(() => {
  const incoming = incomingUpdates;
  const local = localUpdates;
  const hasIncoming = Object.keys(incoming).length > 0;
  const hasLocal = Object.keys(local).length > 0;
  if (!hasIncoming && !hasLocal) return;

  incomingUpdates = {};
  localUpdates = {};

  if (hasIncoming) {
    const links = get(linksStore);
    for (const address in incoming) {
      const value = incoming[address];
      for (const cb of onParameterChangeCallbacks) cb(address, value);
      for (const target of links[address] ?? []) {
        if (!(target in lockedParameters)) sendParameter(target, value);
      }
    }
    const now = Date.now();
    changedAtStore.update((prev) => {
      const next = { ...prev };
      for (const address in incoming) next[address] = now;
      return next;
    });
  }

  // Incoming wins over our optimistic value, since it's what VRChat actually has.
  parametersStore.update((existing) => ({ ...existing, ...local, ...incoming }));
}, 33);

let pauseUntil = 0;

window.ADVOSCNative.osc.onMessage((message) => {
  allLastParameters[message.address] = message.args;

  if (message.address === "/avatar/change") {
    const avatarId = message.args[0];
    console.log("Avatar changed:", avatarId);
    lastAvatarId = avatarId as string;
    avatarIdStore.set(lastAvatarId);
    stopAllAnimations();
    parametersStore.set({});
    changedAtStore.set({});
    incomingUpdates = {};
    localUpdates = {};
    unlockAll();
    observedTypes = {};
    allLastParameters = {
      [message.address]: message.args
    };
    pauseUntil = Date.now() + 1000; // give VRChat a moment to write the new schema file
    updateOSCSchema();
    return;
  }

  if (!message.address.startsWith("/avatar/") || Date.now() <= pauseUntil) return;

  const raw = message.args[0];
  if (typeof raw !== "number" && typeof raw !== "boolean") return;

  const wireType = typeFromTag(message.types?.[0]) ?? (typeof raw === "boolean" ? "Bool" : null);
  if (wireType) observedTypes[message.address] = wireType;

  let value = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;

  const lock = lockedParameters[message.address];
  if (lock !== undefined) {
    if (value !== lock.value) {
      window.ADVOSCNative.osc.sendCustom(message.address, [{ value: lock.value, type: lock.type ?? getParameterType(message.address) ?? guessType(lock.value) }]);
    }
    value = lock.value;
  }

  incomingUpdates[message.address] = coerceParameterValue(value, getParameterType(message.address));
});

const PathVerifiers = {
  "VRChatOSCBaseDir": `VRChat${window.ADVOSCNative.path.sep}OSC`,
  "VRChatLocalAvatarDataDir": `VRChat${window.ADVOSCNative.path.sep}LocalAvatarData`
};

async function updateOSCSchema() {
  const oscFilePath = window.ADVOSCNative.path.join(
    VRChatOSCBaseDir,
    lastUserId || "Unk",
    "Avatars",
    `${lastAvatarId}.json`
  );
  const oscData = await window.ADVOSCNative.files.readJSON(oscFilePath);
  if (!oscData) return;
  schemaStore.set(oscData as AvatarOSCSchema);
  console.log("Avatar OSC schema loaded from existing file:", oscData);
}

window.ADVOSCNative.files.watch(
  [VRChatOSCBaseDir, VRChatLocalAvatarDataDir],
  async (eventName, path) => {
    if (eventName !== "change" && eventName !== "add") return;
    await new Promise(resolve => setTimeout(resolve, 500)); // wait a bit for file to be fully written

    if (path.includes(PathVerifiers.VRChatLocalAvatarDataDir)) {
      const pathSplit = path.split(window.ADVOSCNative.path.sep);
      const userId = pathSplit[pathSplit.lastIndexOf("LocalAvatarData") + 1];
      lastUserId = userId;
    }

    if (path.includes(PathVerifiers.VRChatOSCBaseDir)) {
      const pathSplit = path.split(window.ADVOSCNative.path.sep);
      const userId = pathSplit[pathSplit.lastIndexOf("OSC") + 1];
      lastUserId = userId;
    }

    if (lastAvatarId && path.includes(lastAvatarId)) {
      const data = await window.ADVOSCNative.files.readJSON(path);
      if (data && path.includes(PathVerifiers.VRChatLocalAvatarDataDir)) {
        const existingParameters = (data as AvatarData).animationParameters || [];
        const schema = get(schemaStore);
        const updates: Record<string, number> = {};
        existingParameters.forEach(param => {
          const schemaParam = schema?.parameters.find(p => p.name === param.name);
          const address = schemaParam?.input?.address ?? schemaParam?.output?.address;
          if (address && !(address in lockedParameters)) {
            updates[address] = param.value;
          }
        });
        if (Object.keys(updates).length) {
          parametersStore.update(prev => ({ ...prev, ...updates }));
        }
        console.log("Avatar data updated:", data);
      }

      updateOSCSchema();
    }
  }
)
