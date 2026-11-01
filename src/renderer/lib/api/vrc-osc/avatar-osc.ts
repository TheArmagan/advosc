import {
  coerceParameterValue,
  guessParameterType,
  type AvatarOSCSchema,
  type AvatarParameterType,
  type OSCSendType,
  type ParameterAnimation,
  type SchemaEntry,
  type SentHistoryEntry,
} from "$shared/avatar-osc";
import { STREAM_CHANGED_AT, STREAM_PARAMETERS } from "$shared/engine-protocol";
import { get } from "$shared/store";
import { fire, mirrored, streamed, synced } from "../engine";

const schemaStore = mirrored<AvatarOSCSchema | null>("AvatarOSC;Schema", null);
const schemaIndexStore = mirrored<Record<string, SchemaEntry>>("AvatarOSC;SchemaIndex", {});
const avatarIdStore = mirrored<string | null>("AvatarOSC;AvatarId", null);
const lockedParameterAddresses = mirrored<string[]>("AvatarOSC;Locked", []);
const animationsStore = mirrored<Record<string, ParameterAnimation>>("AvatarOSC;Animations", {});
const observedTypesStore = mirrored<Record<string, AvatarParameterType>>("AvatarOSC;ObservedTypes", {});

const parametersStore = streamed<number>(STREAM_PARAMETERS);
const changedAtStore = streamed<number>(STREAM_CHANGED_AT);

const linksStore = synced<Record<string, string[]>>("AvatarOSC;Links", {});
const favoritesStore = synced<string[]>("AvatarOSC;Favorites", []);
const historyStore = synced<SentHistoryEntry[]>("AvatarOSC;SendHistory", []);

function getParameterType(address: string): AvatarParameterType | null {
  return get(schemaIndexStore)[address]?.type ?? get(observedTypesStore)[address] ?? null;
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
  getParameterType,
  /** True when the type comes from the schema or from VRChat's own messages rather than a guess. */
  isTypeKnown(address: string) {
    return !!(get(schemaIndexStore)[address] || get(observedTypesStore)[address]);
  },
  /** Send a parameter with an explicit type. Does not touch locks. */
  sendParameter(address: string, value: number, type?: AvatarParameterType | null) {
    const resolvedType = type ?? getParameterType(address) ?? guessParameterType(value);
    fire("avatarOSC.sendParameter", address, value, type);
    return coerceParameterValue(value, resolvedType);
  },
  /**
   * Send a value and set the lock state. Leaving `locked` false unlocks the
   * parameter, which is what loading a profile relies on.
   */
  setParameter(address: string, value: number, locked: boolean = false, type?: AvatarParameterType | null) {
    fire("avatarOSC.setParameter", address, value, locked, type);
  },
  setAllParameters(params: Record<string, number>) {
    fire("avatarOSC.setAllParameters", params);
  },
  lockParameter(address: string, value?: number, type?: AvatarParameterType | null) {
    fire("avatarOSC.lockParameter", address, value, type);
  },
  unlockParameter(address: string) {
    fire("avatarOSC.unlockParameter", address);
  },
  unlockAll() {
    fire("avatarOSC.unlockAll");
  },
  /**
   * Send anything to any address with the exact OSC type you pick. Used by the
   * Send tab, so it also records the send in history.
   */
  sendRaw(address: string, value: number | string | boolean, type: OSCSendType) {
    fire("avatarOSC.sendRaw", address, value, type);
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
  animate(config: ParameterAnimation) {
    fire("avatarOSC.animate", config);
  },
  stopAnimation(address: string) {
    fire("avatarOSC.stopAnimation", address);
  },
  stopAllAnimations() {
    fire("avatarOSC.stopAllAnimations");
  },
  get lastAvatarId() {
    return get(avatarIdStore);
  },
  updateOSCSchema() {
    fire("avatarOSC.updateOSCSchema");
  },
};
