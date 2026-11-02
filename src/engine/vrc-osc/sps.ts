import type { Automation } from "$shared/automation";
import { get } from "$shared/store";
import { rulesStore } from "../automations/rules-store";
import { native } from "../native";
import { synced } from "../sync/hub";
import { avatarOSC } from "./avatar-osc";

const OGB_PREFIX = "/avatar/parameters/OGB/";
const OGB_ENABLED_ADDRESS = "/avatar/parameters/OGB_ENABLED";
const OGB_ENABLED_NAME = "OGB_ENABLED";
const DERIVED_PREFIX = "/advosc/sps/";

const PUBLISH_INTERVAL_MS = 50;
/** Avatar OSC ignores input for 1 s after a change. */
const AVATAR_SETTLE_MS = 1100;
const RESEND_MIN_INTERVAL_MS = 1000;
/** Addresses come from the network, so this map can't be allowed to grow without limit. */
const MAX_SOURCES = 64;
/** VRCFury's fallback in `SpsDepthContacts`, used until a plug's length has been seen. */
const DEFAULT_PLUG_LENGTH_METERS = 0.3;
/** Share of each new sample in `speed`. OSC arrives unevenly, so raw deltas would flicker. */
const SPEED_SMOOTHING = 0.4;

export type SpsContacts =
  | { kind: "socket"; tip: number; root: number }
  | { kind: "plug"; pen: number };

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Raw OGB contact values to how far the plug is in, 0 to 1 of its length. `plugLength` is the
 * length in meters as known so far. Pass the returned one back in on the next call.
 *
 * This formula comes from the receiver geometry in VRCFury's source. It's been tried in VRChat
 * with a small test plug and ring, not across plug sizes.
 *
 * Socket (`BakeHapticSocketsService`): `PenSelfNewTip`, `PenOthersNewTip` and the matching
 * `NewRoot` receivers are Proximity, radius 1 m, at the socket origin. Plugs carry a sphere
 * sender of radius L at their root (`TPS_Pen_Penetrating`), and a 0.01 m sender there too
 * (`TPS_Pen_Root`). So `tip` reads as 1 - (distance from plug tip to socket) and saturates at 1
 * once the tip is past the origin, and `root` tells how far the base still is. `SpsDepthContacts`
 * reads the same contacts: the length comes from tip - root while the tip is outside, and is
 * held once inside. It adds the 0.01 back, but leaving it out here makes depth run from exactly
 * 0 at the entrance to 1 where `root` saturates, with no jump as the tip goes in.
 *
 * Plug (`BakeHapticPlugsService`): `PenSelf` and `PenOthers` are Proximity with radius L at the
 * plug root, tagged for a socket's radius 0 root sender, so the value is already a fraction of L.
 */
export function spsDepth(contacts: SpsContacts, plugLength = DEFAULT_PLUG_LENGTH_METERS): { depth: number; plugLength: number } {
  if (contacts.kind === "plug") return { depth: clamp01(contacts.pen), plugLength };

  const { tip, root } = contacts;
  if (tip <= 0 || root <= 0) return { depth: 0, plugLength: DEFAULT_PLUG_LENGTH_METERS };

  if (tip < 1) {
    const measured = tip - root;
    return { depth: 0, plugLength: measured > 0 ? measured : plugLength };
  }

  return { depth: clamp01((plugLength - (1 - root)) / plugLength), plugLength };
}

type Party = { tip: number; root: number; plugLength: number };

type SpsSource = {
  kind: "socket" | "plug";
  prefix: string;
  self: Party;
  others: Party;
  dirty: boolean;
  depth: number;
  speed: number;
  published: Record<string, number>;
};

/** Which raw value each suffix fills. Anything else on `OGB/*` isn't used for depth. */
const SUFFIXES: Record<string, { kind: SpsSource["kind"]; party: "self" | "others"; field: "tip" | "root" }> = {
  "Orf/PenSelfNewTip": { kind: "socket", party: "self", field: "tip" },
  "Orf/PenSelfNewRoot": { kind: "socket", party: "self", field: "root" },
  "Orf/PenOthersNewTip": { kind: "socket", party: "others", field: "tip" },
  "Orf/PenOthersNewRoot": { kind: "socket", party: "others", field: "root" },
  "Pen/PenSelf": { kind: "plug", party: "self", field: "tip" },
  "Pen/PenOthers": { kind: "plug", party: "others", field: "tip" },
};

const sources = new Map<string, SpsSource>();
let publishTimer: ReturnType<typeof setInterval> | null = null;
let lastPublishAt = 0;

function newParty(): Party {
  return { tip: 0, root: 0, plugLength: DEFAULT_PLUG_LENGTH_METERS };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function handleOgbParameter(address: string, value: number) {
  const parts = address.slice(OGB_PREFIX.length).split("/");
  if (parts.length !== 3) return;
  const [family, id, suffix] = parts;
  if (!id) return;
  const binding = SUFFIXES[`${family}/${suffix}`];
  if (!binding) return;

  const key = `${binding.kind}/${id}`;
  let source = sources.get(key);
  if (!source) {
    if (sources.size >= MAX_SOURCES) return;
    source = {
      kind: binding.kind,
      prefix: `${DERIVED_PREFIX}${key}/`,
      self: newParty(),
      others: newParty(),
      dirty: true,
      depth: 0,
      speed: 0,
      published: {},
    };
    sources.set(key, source);
  }

  source[binding.party][binding.field] = value;
  source.dirty = true;
  startPublishing();
}

function startPublishing() {
  if (publishTimer) return;
  lastPublishAt = performance.now();
  publishTimer = setInterval(publishChanges, PUBLISH_INTERVAL_MS);
}

function stopPublishing() {
  if (publishTimer) clearInterval(publishTimer);
  publishTimer = null;
}

function publishMetric(source: SpsSource, metric: string, value: number) {
  if (source.published[metric] === value) return;
  source.published[metric] = value;
  avatarOSC.publishDerived(source.prefix + metric, value);
}

function readDepth(source: SpsSource, party: Party) {
  const contacts: SpsContacts = source.kind === "socket"
    ? { kind: "socket", tip: party.tip, root: party.root }
    : { kind: "plug", pen: party.tip };
  const result = spsDepth(contacts, party.plugLength);
  party.plugLength = result.plugLength;
  return round(result.depth);
}

/** Speed has to fall back to 0 after the depth stops moving, and VRChat sends nothing then. */
function publishChanges() {
  const now = performance.now();
  const seconds = (now - lastPublishAt) / 1000;
  lastPublishAt = now;
  if (seconds <= 0) return;

  let moving = false;
  for (const source of sources.values()) {
    if (!source.dirty && source.speed === 0) continue;
    source.dirty = false;

    const depthSelf = readDepth(source, source.self);
    const depthOthers = readDepth(source, source.others);
    const depth = Math.max(depthSelf, depthOthers);

    const sample = Math.abs(depth - source.depth) / seconds;
    // The running value stays unrounded, or a decay would stick at the smallest rounded step.
    const smoothed = source.speed + (sample - source.speed) * SPEED_SMOOTHING;
    const speed = round(smoothed);
    source.speed = speed > 0 ? smoothed : 0;
    source.depth = depth;
    if (speed > 0) moving = true;

    publishMetric(source, "depth", depth);
    publishMetric(source, "depthSelf", depthSelf);
    publishMetric(source, "depthOthers", depthOthers);
    publishMetric(source, "active", depth > 0 ? 1 : 0);
    publishMetric(source, "speed", speed);
  }

  if (!moving) stopPublishing();
}

// ------------------------------------------------------------------------ OGB_ENABLED

export const SPS_KEEP_HAPTICS_ON_KEY = "Sps;KeepHapticsOn";

/** Keeps the receivers on with no rule using them, for other apps that read `OGB/*`. */
const keepHapticsOnStore = synced<boolean>(SPS_KEEP_HAPTICS_ON_KEY, false);

let settled = true;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let resendTimer: ReturnType<typeof setTimeout> | null = null;
let reportedThisAvatar = false;
let schemaIsCurrent = true;
/** What we last asked for on this avatar. Null means we haven't, or VRChat has undone it. */
let lastSent: boolean | null = null;
let lastSentAt = 0;
let running = false;

function ruleUsesSpsData(rule: Automation) {
  if (!rule.enabled || rule.source?.kind !== "parameter") return false;
  const { address } = rule.source;
  return address.startsWith(DERIVED_PREFIX) || address.includes("/OGB/") || address.includes("/VFH/");
}

function avatarHasOgbEnabled() {
  if (reportedThisAvatar) return true;
  // A Build and Test avatar may have no schema to read, and it can't report the parameter until
  // haptics are on. Sending to one that doesn't have it does nothing.
  if (avatarOSC.lastAvatarId?.startsWith("local:")) return true;
  // After a switch the store still holds the old avatar until the new file has been read.
  if (!schemaIsCurrent) return false;
  return get(avatarOSC.schema)?.parameters.some((parameter) => parameter.name === OGB_ENABLED_NAME) ?? false;
}

function shouldEnableHaptics() {
  if (!avatarHasOgbEnabled()) return false;
  return get(keepHapticsOnStore) || get(rulesStore).some(ruleUsesSpsData);
}

function sendOgbEnabled(value: boolean) {
  avatarOSC.sendParameter(OGB_ENABLED_ADDRESS, value ? 1 : 0, "Bool");
  lastSent = value;
  lastSentAt = Date.now();
}

/** Off only undoes our own on, so another app that turned it on isn't fought over. */
function reconcileOgbEnabled() {
  if (!running || !settled || avatarOSC.isLocked(OGB_ENABLED_ADDRESS)) return;
  const wanted = shouldEnableHaptics();
  if (wanted && lastSent !== true) sendOgbEnabled(true);
  else if (!wanted && lastSent === true) sendOgbEnabled(false);
}

function handleOgbEnabledReport(value: number) {
  const firstReport = !reportedThisAvatar;
  reportedThisAvatar = true;

  if (value === 0 && lastSent === true) {
    lastSent = null;
    if (resendTimer) return;
    resendTimer = setTimeout(() => {
      resendTimer = null;
      reconcileOgbEnabled();
    }, Math.max(0, lastSentAt + RESEND_MIN_INTERVAL_MS - Date.now()));
  } else if (firstReport) {
    reconcileOgbEnabled();
  }
}

// --------------------------------------------------------------------------- lifecycle

function handleParameter(address: string, value: number) {
  if (address === OGB_ENABLED_ADDRESS) handleOgbEnabledReport(value);
  else if (address.startsWith(OGB_PREFIX)) handleOgbParameter(address, value);
}

function clearTimers() {
  stopPublishing();
  if (settleTimer) clearTimeout(settleTimer);
  if (resendTimer) clearTimeout(resendTimer);
  settleTimer = null;
  resendTimer = null;
}

function handleOsc(message: { address: string }) {
  if (message.address !== "/avatar/change") return;

  clearTimers();
  sources.clear();
  reportedThisAvatar = false;
  schemaIsCurrent = false;
  lastSent = null;
  settled = false;
  settleTimer = setTimeout(() => {
    settleTimer = null;
    settled = true;
    reconcileOgbEnabled();
  }, AVATAR_SETTLE_MS);
}

export function startSps({ safeMode }: { safeMode: boolean }) {
  if (safeMode) return;
  running = true;

  avatarOSC.onParameterChange(handleParameter);
  native.osc.onMessage(handleOsc);
  // Avatar OSC only ever reads the current avatar's file, so any new schema belongs to it.
  avatarOSC.schema.subscribe(() => {
    schemaIsCurrent = true;
    reconcileOgbEnabled();
  });
  rulesStore.subscribe(reconcileOgbEnabled);
  keepHapticsOnStore.subscribe(reconcileOgbEnabled);
}

export function stopSps() {
  clearTimers();
  if (lastSent === true && !avatarOSC.isLocked(OGB_ENABLED_ADDRESS)) sendOgbEnabled(false);
  running = false;
}
