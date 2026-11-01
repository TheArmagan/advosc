import gsap from "gsap";
import {
  coerceParameterValue,
  guessParameterType,
  type AnimationEase,
  type AvatarData,
  type AvatarOSCSchema,
  type AvatarParameterType,
  type OSCSendType,
  type ParameterAnimation,
  type SchemaEntry,
  type SentHistoryEntry,
} from "$shared/avatar-osc";
import { STREAM_CHANGED_AT, STREAM_PARAMETERS } from "$shared/engine-protocol";
import { get, writable } from "$shared/store";
import { native } from "../native";
import { mirror, stream, synced, type Stream } from "../sync/hub";

export type { AnimationEase, AvatarOSCSchema, AvatarParameterType, OSCSendType, ParameterAnimation, SchemaEntry };

const VRChatOSCBaseDir = native.path.join(native.env.get("APPDATA")!, "../LocalLow/VRChat/VRChat/OSC");
const VRChatLocalAvatarDataDir = native.path.join(native.env.get("APPDATA")!, "../LocalLow/VRChat/VRChat/LocalAvatarData");

const ANIMATION_SEND_INTERVAL_MS = 33;
const HISTORY_LIMIT = 30;

const schemaStore = writable<AvatarOSCSchema | null>(null);
const schemaIndexStore = writable<Record<string, SchemaEntry>>({});
const avatarIdStore = writable<string | null>(null);

/**
 * Plain maps, not stores. VRChat can send these at 30 Hz, and with no window open that has to
 * cost nothing beyond this assignment.
 */
let parameters: Record<string, number> = {};
let changedAt: Record<string, number> = {};
let parameterStream: Stream;
let changedAtStream: Stream;

let lockedParameters: Record<string, { value: number, type: AvatarParameterType | null }> = {};
const lockedParameterAddresses = writable<string[]>([]);

const linksStore = synced<Record<string, string[]>>("AvatarOSC;Links", {});
const favoritesStore = synced<string[]>("AvatarOSC;Favorites", []);
const historyStore = synced<SentHistoryEntry[]>("AvatarOSC;SendHistory", []);

const animationsStore = writable<Record<string, ParameterAnimation>>({});
const timelines: Record<string, gsap.core.Timeline> = {};

let observedTypes: Record<string, AvatarParameterType> = {};
const observedTypesStore = writable<Record<string, AvatarParameterType>>({});
let lastAvatarId: string | null = null;
let lastUserId: string | null = null;

let allLastParameters: Record<string, any[]> = {};

let onParameterChangeCallbacks: ((address: string, value: number) => void)[] = [];

// Incoming values from VRChat and our own optimistic writes are batched and
// flushed together so a burst of OSC traffic only goes out once per frame.
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

/** Send a parameter with an explicit type. Does not touch locks. */
function sendParameter(address: string, value: number, type?: AvatarParameterType | null) {
  const resolvedType = type ?? getParameterType(address) ?? guessParameterType(value);
  const coerced = coerceParameterValue(value, resolvedType);
  native.osc.sendCustom(address, [{ value: coerced, type: resolvedType }]);
  localUpdates[address] = coerced;
  return coerced;
}

function updateLockedAddresses() {
  lockedParameterAddresses.set(Object.keys(lockedParameters));
}

function lockParameter(address: string, value?: number, type?: AvatarParameterType | null) {
  const lockValue = value ?? parameters[address] ?? 0;
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

function setParameter(address: string, value: number, locked: boolean = false, type?: AvatarParameterType | null) {
  if (locked) {
    lockParameter(address, value, type);
  } else {
    unlockParameter(address);
    sendParameter(address, value, type);
  }
}

function sendRaw(address: string, value: number | string | boolean, type: OSCSendType) {
  if (type === "String") {
    native.osc.sendCustom(address, [{ value: String(value), type }]);
  } else {
    sendParameter(address, typeof value === "number" ? value : Number(value) || (value === true ? 1 : 0), type);
  }
  addHistory({ address, value, type, at: Date.now() });
}

export const avatarOSC = {
  schema: schemaStore,
  links: linksStore,
  getParameters: () => parameters,
  get allLastParameters() {
    return allLastParameters;
  },
  getParameterType,
  sendParameter,
  /**
   * Send a value and set the lock state. Leaving `locked` false unlocks the
   * parameter, which is what loading a profile relies on.
   */
  setParameter,
  setAllParameters(params: Record<string, number>) {
    for (const address in params) setParameter(address, params[address]);
  },
  lockParameter,
  unlockParameter,
  unlockAll,
  /**
   * Send anything to any address with the exact OSC type you pick. Used by the
   * Send tab, so it also records the send in history.
   */
  sendRaw,
  animate,
  stopAnimation,
  stopAllAnimations,
  get lastAvatarId() {
    return lastAvatarId;
  },
  onParameterChange(callback: (address: string, value: number) => void) {
    onParameterChangeCallbacks.push(callback);
    return () => {
      onParameterChangeCallbacks = onParameterChangeCallbacks.filter(cb => cb !== callback);
    };
  },
  updateOSCSchema,
};

function flushUpdates() {
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
      for (const cb of onParameterChangeCallbacks) {
        try {
          cb(address, value);
        } catch (error) {
          console.error("Parameter change callback failed:", error);
        }
      }
      for (const target of links[address] ?? []) {
        if (!(target in lockedParameters)) sendParameter(target, value);
      }
    }

    const now = Date.now();
    const changed: Record<string, number> = {};
    for (const address in incoming) {
      changedAt[address] = now;
      changed[address] = now;
    }
    if (changedAtStream.active()) changedAtStream.publish(changed);
  }

  // Incoming wins over our optimistic value, since it's what VRChat actually has.
  const merged = { ...local, ...incoming };
  Object.assign(parameters, merged);
  if (parameterStream.active()) parameterStream.publish(merged);
}

let pauseUntil = 0;

function handleAvatarChange(message: { address: string; args: any[] }) {
  const avatarId = message.args[0];
  console.log("Avatar changed:", avatarId);
  lastAvatarId = avatarId as string;
  avatarIdStore.set(lastAvatarId);
  stopAllAnimations();
  parameters = {};
  changedAt = {};
  parameterStream.reset({});
  changedAtStream.reset({});
  incomingUpdates = {};
  localUpdates = {};
  unlockAll();
  observedTypes = {};
  observedTypesStore.set(observedTypes);
  allLastParameters = {
    [message.address]: message.args
  };
  pauseUntil = Date.now() + 1000; // give VRChat a moment to write the new schema file
  void updateOSCSchema();
}

function handleMessage(message: { address: string; args: any[]; types?: string[] }) {
  allLastParameters[message.address] = message.args;

  if (message.address === "/avatar/change") {
    handleAvatarChange(message);
    return;
  }

  if (!message.address.startsWith("/avatar/") || Date.now() <= pauseUntil) return;

  const raw = message.args[0];
  if (typeof raw !== "number" && typeof raw !== "boolean") return;

  const wireType = typeFromTag(message.types?.[0]) ?? (typeof raw === "boolean" ? "Bool" : null);
  if (wireType && observedTypes[message.address] !== wireType) {
    observedTypes[message.address] = wireType;
    observedTypesStore.set(observedTypes);
  }

  let value = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;

  const lock = lockedParameters[message.address];
  if (lock !== undefined) {
    if (value !== lock.value) {
      native.osc.sendCustom(message.address, [{ value: lock.value, type: lock.type ?? getParameterType(message.address) ?? guessParameterType(lock.value) }]);
    }
    value = lock.value;
  }

  incomingUpdates[message.address] = coerceParameterValue(value, getParameterType(message.address));
}

const PathVerifiers = {
  "VRChatOSCBaseDir": `VRChat${native.path.sep}OSC`,
  "VRChatLocalAvatarDataDir": `VRChat${native.path.sep}LocalAvatarData`
};

async function updateOSCSchema() {
  const oscFilePath = native.path.join(
    VRChatOSCBaseDir,
    lastUserId || "Unk",
    "Avatars",
    `${lastAvatarId}.json`
  );
  const oscData = await native.files.readJSON(oscFilePath);
  if (!oscData) return;
  schemaStore.set(oscData as AvatarOSCSchema);
  console.log("Avatar OSC schema loaded:", (oscData as AvatarOSCSchema).name);
}

async function handleVRChatFile(eventName: string, path: string) {
  if (eventName !== "change" && eventName !== "add") return;
  await new Promise(resolve => setTimeout(resolve, 500)); // wait a bit for file to be fully written

  if (path.includes(PathVerifiers.VRChatLocalAvatarDataDir)) {
    const pathSplit = path.split(native.path.sep);
    const userId = pathSplit[pathSplit.lastIndexOf("LocalAvatarData") + 1];
    lastUserId = userId;
  }

  if (path.includes(PathVerifiers.VRChatOSCBaseDir)) {
    const pathSplit = path.split(native.path.sep);
    const userId = pathSplit[pathSplit.lastIndexOf("OSC") + 1];
    lastUserId = userId;
  }

  if (lastAvatarId && path.includes(lastAvatarId)) {
    const data = await native.files.readJSON(path);
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
        Object.assign(parameters, updates);
        if (parameterStream.active()) parameterStream.publish(updates);
      }
    }

    void updateOSCSchema();
  }
}

export function startAvatarOSC() {
  parameterStream = stream(STREAM_PARAMETERS, () => parameters);
  changedAtStream = stream(STREAM_CHANGED_AT, () => changedAt);

  mirror("AvatarOSC;Schema", schemaStore);
  mirror("AvatarOSC;SchemaIndex", schemaIndexStore);
  mirror("AvatarOSC;AvatarId", avatarIdStore);
  mirror("AvatarOSC;Locked", lockedParameterAddresses, 50);
  mirror("AvatarOSC;Animations", animationsStore, 50);
  mirror("AvatarOSC;ObservedTypes", observedTypesStore, 250);

  setInterval(flushUpdates, 33);
  native.osc.onMessage(handleMessage);
  native.files.watch([VRChatOSCBaseDir, VRChatLocalAvatarDataDir], (eventName, path) => {
    handleVRChatFile(eventName, path).catch((error) => console.warn("Could not read a VRChat file:", error));
  });
}
