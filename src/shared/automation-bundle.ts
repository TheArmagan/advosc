import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { Automation, AutomationAction, AutomationMode, AutomationRange } from "./automation";
import { makeId } from "./sound-effects";
import type { ToyAction, ToyFeature, ToyPresetName } from "./toys";

/**
 * A bundle is a set of automations from outside the app: an `advosc://` link, a pasted code or a
 * `.advosc.json` file. Anyone can write one, so nothing here is trusted until `validateBundle` has
 * passed it. Unity's exporter writes this same format, so `Documentation~/contract.md` in the
 * advosc-triggers repo has to change along with this file.
 */

export const BUNDLE_KIND = "advosc.automation.bundle";
export const BUNDLE_VERSION = 1;
/** Marks the compact single-line form: prefix + base64url(raw deflate(json)). */
export const BUNDLE_CODE_PREFIX = "ADVOSCR1:";
export const BUNDLE_LINK_PREFIX = "advosc://import?d=";
export const BUNDLE_WEB_ORIGIN = "https://thearmagan.github.io/advosc-triggers/link/";

/** Longest encoded payload a link may carry. Larger bundles go through a file. */
export const MAX_LINK_PAYLOAD = 16 * 1024;
/** Most JSON a bundle may expand to, so a small payload can't inflate into a huge one. */
export const MAX_BUNDLE_JSON = 256 * 1024;
export const MAX_BUNDLE_RULES = 64;

/** A rule as it travels. It has no id and no `enabled`, because the app decides both on import. */
export interface BundleRule {
  /** Stable within a bundle. Importing again uses it to skip rules that are already there. */
  key: string;
  name: string;
  source: { kind: "parameter"; address: string };
  match: string;
  releaseMatch?: string;
  mode: AutomationMode;
  range?: AutomationRange;
  cooldownMs?: number;
  actions: AutomationAction[];
}

export interface AutomationBundle {
  kind: typeof BUNDLE_KIND;
  version: number;
  name: string;
  avatarName?: string;
  /** Blueprint ids. Left out when the avatar has never been uploaded. */
  avatarIds?: string[];
  rules: BundleRule[];
}

/** Stored on imported rules. Skips a rule that's already there when a bundle comes in again. */
export function importKeyOf(bundle: AutomationBundle, rule: BundleRule): string {
  return `${bundle.name}/${rule.key}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBundlePayload(bundle: AutomationBundle): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify(bundle)), { level: 9 }));
}

export function bundleLink(bundle: AutomationBundle): string {
  return `${BUNDLE_LINK_PREFIX}${encodeBundlePayload(bundle)}`;
}

/** Returns parsed JSON, not a bundle. It still has to go through `validateBundle`. */
export function decodeBundlePayload(payload: string): unknown {
  // Checked first: this caps what the inflate below can expand to, at about 12 MB.
  if (payload.length > MAX_LINK_PAYLOAD) throw new Error("This link is too long. Use the .advosc.json file instead.");
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error(CORRUPTED);

  let bytes: Uint8Array;
  try {
    bytes = inflateSync(fromBase64Url(payload));
  } catch {
    throw new Error(CORRUPTED);
  }
  if (bytes.length > MAX_BUNDLE_JSON) throw new Error(TOO_LARGE);

  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(CORRUPTED);
  }
}

/** Takes an `advosc://` link, a web link, an `ADVOSCR1:` code or a bundle's raw JSON. */
export function parseBundleInput(input: string): AutomationBundle {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Nothing to import.");

  for (const prefix of [BUNDLE_LINK_PREFIX, `${BUNDLE_WEB_ORIGIN}#`, BUNDLE_CODE_PREFIX]) {
    if (trimmed.startsWith(prefix)) {
      return validateBundle(decodeBundlePayload(trimmed.slice(prefix.length).replace(/\s+/g, "")));
    }
  }

  if (trimmed.length > MAX_BUNDLE_JSON) throw new Error(TOO_LARGE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("That is neither an ADVOSC link nor valid JSON.");
  }
  return validateBundle(parsed);
}

// ------------------------------------------------------------------------- validation

const CORRUPTED = "This link is corrupted or incomplete.";
const TOO_LARGE = "This bundle is too large.";

const MAX_NAME = 120;
const MAX_ADDRESS = 256;
const MAX_MATCH = 128;
const MAX_VALUE = 512;
const MAX_ACTIONS = 32;
const MAX_AVATAR_IDS = 16;
const MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_TOY_SECONDS = 60;
/** The deepest a valid bundle goes is a toy feature, so this leaves plenty of room. */
const MAX_DEPTH = 12;

const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const AVATAR_ID = /^avtr_[A-Za-z0-9_-]{1,64}$/;
/** An OSC address can't hold spaces, and these others are its pattern characters. */
const OSC_ADDRESS = /^[^\s\x00-\x1f\x7f#*,?[\]{}]+$/;
/** `resolveText` evaluates these in action values, which can make network reads. */
const PLACEHOLDER = /\{\{|\[\[/;

const SOURCE_PREFIXES = ["/avatar/parameters/", "/advosc/sps/"];
const ACTION_PREFIX = "/avatar/parameters/";
const MODES: AutomationMode[] = ["edge", "while", "live"];
const OSC_TYPES = ["Float", "Int", "Bool"];
const TOY_PRESETS: ToyPresetName[] = ["pulse", "wave", "fireworks", "earthquake"];
const TOY_FEATURES: ToyFeature[] = [
  "Vibrate",
  "Rotate",
  "Pump",
  "Thrusting",
  "Fingering",
  "Suction",
  "Depth",
  "Stroke",
  "Oscillate",
];
/** What each toy action may carry beyond `kind` and `target`. `pattern` isn't here: its ids are local. */
const TOY_FIELDS: Partial<Record<ToyAction["kind"], string[]>> = {
  link: [],
  pulse: ["level", "seconds"],
  preset: ["preset", "seconds"],
  stop: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${where} isn't valid.`);
  return value;
}

function requireFields(record: Record<string, unknown>, allowed: string[], where: string) {
  for (const field of Object.keys(record)) {
    if (!allowed.includes(field)) throw new Error(`${where} has a field ADVOSC doesn't allow: ${field.slice(0, 48)}.`);
  }
}

function requireText(value: unknown, max: number, what: string): string {
  if (typeof value !== "string") throw new Error(`${what} has to be text.`);
  if (value.length > max) throw new Error(`${what} is too long.`);
  return value;
}

function requireName(value: unknown, max: number, what: string): string {
  const text = requireText(value, max, what);
  if (!text.trim()) throw new Error(`${what} can't be empty.`);
  return text;
}

function requireAddress(value: unknown, prefixes: string[], what: string) {
  const address = requireText(value, MAX_ADDRESS, what);
  const inside = prefixes.some((prefix) => address.startsWith(prefix) && address.length > prefix.length);
  if (!inside || !OSC_ADDRESS.test(address)) throw new Error(`${what} has to be under ${prefixes.join(" or ")}.`);
}

function requireNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${what} has to be a number.`);
  return value;
}

/** Runs before the shape checks, so a future field can't let a placeholder through by mistake. */
function rejectPlaceholders(value: unknown, depth = 0) {
  if (typeof value === "string") {
    if (PLACEHOLDER.test(value)) throw new Error("Bundles can't contain {{ or [[. Their values are literal.");
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (depth >= MAX_DEPTH) throw new Error("This bundle is nested too deeply.");
  for (const item of Array.isArray(value) ? value : Object.values(value)) rejectPlaceholders(item, depth + 1);
}

function validateToy(value: unknown, mode: AutomationMode, where: string) {
  const action = requireRecord(value, `${where}'s toy action`);
  const kind = action.kind as ToyAction["kind"];
  const fields = typeof kind === "string" && Object.hasOwn(TOY_FIELDS, kind) ? TOY_FIELDS[kind] : undefined;
  if (!fields) throw new Error(`${where} has a toy action that can't come from a bundle.`);
  requireFields(action, ["kind", "target", ...fields], `${where}'s toy action`);

  if (kind === "link" && mode !== "live") throw new Error(`${where} can only follow a value in live mode.`);
  if (kind !== "link" && mode === "live") throw new Error(`${where} has a toy action that can't run in live mode.`);

  const target = requireRecord(action.target, `${where}'s toy target`);
  requireFields(target, ["toyIds", "features"], `${where}'s toy target`);
  if (!Array.isArray(target.toyIds) || target.toyIds.length) throw new Error(`${where} can't name specific toys.`);
  const { features } = target;
  if (!Array.isArray(features) || !features.length || !features.every((feature) => TOY_FEATURES.includes(feature))) {
    throw new Error(`${where} needs a list of toy features ADVOSC knows.`);
  }

  if (kind === "pulse") {
    const level = requireNumber(action.level, `${where}'s toy level`);
    if (level < 0 || level > 1) throw new Error(`${where}'s toy level has to be from 0 to 1.`);
  }
  if (kind === "pulse" || kind === "preset") {
    const seconds = requireNumber(action.seconds, `${where}'s toy duration`);
    if (seconds <= 0 || seconds > MAX_TOY_SECONDS) {
      throw new Error(`${where}'s toy duration has to be above 0 and at most ${MAX_TOY_SECONDS} seconds.`);
    }
  }
  if (kind === "preset" && !TOY_PRESETS.includes(action.preset as ToyPresetName)) {
    throw new Error(`${where} uses a toy preset ADVOSC doesn't know.`);
  }
}

function validateAction(value: unknown, mode: AutomationMode, where: string) {
  const action = requireRecord(value, `An action on ${where}`);

  switch (action.type) {
    case "setParameter":
      requireFields(action, ["type", "address", "value"], `${where}'s action`);
      requireAddress(action.address, [ACTION_PREFIX], `${where}'s parameter address`);
      requireText(action.value, MAX_VALUE, `${where}'s parameter value`);
      return;

    case "osc":
      requireFields(action, ["type", "address", "oscType", "value"], `${where}'s action`);
      requireAddress(action.address, [ACTION_PREFIX], `${where}'s OSC address`);
      if (!OSC_TYPES.includes(action.oscType as string)) throw new Error(`${where}'s OSC type has to be Float, Int or Bool.`);
      requireText(action.value, MAX_VALUE, `${where}'s OSC value`);
      return;

    case "setVariable":
      requireFields(action, ["type", "name", "value"], `${where}'s action`);
      requireName(action.name, MAX_NAME, `${where}'s variable name`);
      requireText(action.value, MAX_VALUE, `${where}'s variable value`);
      return;

    case "sound":
      requireFields(action, ["type", "soundIds", "soundNames", "loop", "stopOnEnd"], `${where}'s action`);
      if (mode === "live") throw new Error(`${where} can't play a sound in live mode.`);
      for (const list of [action.soundIds, action.soundNames]) {
        if (!Array.isArray(list) || list.length) throw new Error(`${where} can't name sounds. You pick them in ADVOSC.`);
      }
      if (typeof action.loop !== "boolean" || typeof action.stopOnEnd !== "boolean") {
        throw new Error(`${where}'s sound settings aren't valid.`);
      }
      return;

    case "toy":
      requireFields(action, ["type", "action"], `${where}'s action`);
      validateToy(action.action, mode, where);
      return;

    default:
      throw new Error(`${where} has an action that can't come from a bundle.`);
  }
}

function validateRange(value: unknown, where: string) {
  const range = requireRecord(value, `${where}'s range`);
  requireFields(range, ["inMin", "inMax", "outMin", "outMax"], `${where}'s range`);
  for (const field of ["inMin", "inMax", "outMin", "outMax"]) requireNumber(range[field], `${where}'s ${field}`);
}

/** Returns the rule's key. */
function validateRule(value: unknown, where: string): string {
  const rule = requireRecord(value, where);
  requireFields(rule, ["key", "name", "source", "match", "releaseMatch", "mode", "range", "cooldownMs", "actions"], where);

  if (typeof rule.key !== "string" || !KEY.test(rule.key)) {
    throw new Error(`${where}'s key can only use letters, digits, _ and -, up to 64 of them.`);
  }
  requireName(rule.name, MAX_NAME, `${where}'s name`);

  const source = requireRecord(rule.source, `${where}'s source`);
  requireFields(source, ["kind", "address"], `${where}'s source`);
  if (source.kind !== "parameter") throw new Error(`${where}'s source has to be a parameter.`);
  requireAddress(source.address, SOURCE_PREFIXES, `${where}'s source address`);

  requireText(rule.match, MAX_MATCH, `${where}'s match`);
  if (rule.releaseMatch !== undefined) requireName(rule.releaseMatch, MAX_MATCH, `${where}'s release match`);

  const mode = rule.mode as AutomationMode;
  if (!MODES.includes(mode)) throw new Error(`${where}'s mode has to be edge, while or live.`);

  if (rule.range !== undefined) validateRange(rule.range, where);
  else if (mode === "live") throw new Error(`${where} is live, so it needs a range.`);

  if (rule.cooldownMs !== undefined) {
    const cooldown = requireNumber(rule.cooldownMs, `${where}'s cooldown`);
    if (cooldown < 0 || cooldown > MAX_COOLDOWN_MS) throw new Error(`${where}'s cooldown is out of range.`);
  }

  if (!Array.isArray(rule.actions)) throw new Error(`${where}'s actions aren't valid.`);
  if (rule.actions.length > MAX_ACTIONS) throw new Error(`${where} has too many actions.`);
  for (const action of rule.actions) validateAction(action, mode, where);

  return rule.key;
}

/**
 * The only way into the app for a bundle. Anything outside the contract rejects the whole bundle
 * rather than being stripped, so what the review shows is exactly what the file says.
 */
export function validateBundle(input: unknown): AutomationBundle {
  if (!isRecord(input) || input.kind !== BUNDLE_KIND) throw new Error("This isn't an ADVOSC bundle.");

  const { version } = input;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("This bundle's version isn't valid.");
  }
  if (version > BUNDLE_VERSION) throw new Error("This bundle was made with a newer version of ADVOSC.");

  rejectPlaceholders(input);
  // After the walk, which has already turned down anything circular.
  if (strToU8(JSON.stringify(input)).length > MAX_BUNDLE_JSON) throw new Error(TOO_LARGE);

  requireFields(input, ["kind", "version", "name", "avatarName", "avatarIds", "rules"], "This bundle");
  requireName(input.name, MAX_NAME, "The bundle's name");
  if (input.avatarName !== undefined) requireText(input.avatarName, MAX_NAME, "The avatar name");

  if (input.avatarIds !== undefined) {
    const ids = input.avatarIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_AVATAR_IDS) {
      throw new Error("The avatar id list isn't valid. Leave it out if there's no blueprint id.");
    }
    if (!ids.every((id) => typeof id === "string" && AVATAR_ID.test(id))) {
      throw new Error("One of the avatar ids isn't valid.");
    }
  }

  const { rules } = input;
  if (!Array.isArray(rules)) throw new Error("This bundle has no rule list.");
  if (rules.length > MAX_BUNDLE_RULES) throw new Error(`A bundle can hold at most ${MAX_BUNDLE_RULES} rules.`);

  const keys = new Set<string>();
  rules.forEach((rule, index) => {
    const key = validateRule(rule, `Rule ${index + 1}`);
    if (keys.has(key)) throw new Error(`Rule ${index + 1} has the same key as an earlier rule.`);
    keys.add(key);
  });

  return input as unknown as AutomationBundle;
}

/**
 * Turns a reviewed bundle into stored rules: off, with new ids. Validated again here because this
 * is the last step before they're saved. `skipped` names rules an earlier import already added.
 */
export function bundleToRules(bundle: AutomationBundle, existing: Automation[]): { rules: Automation[]; skipped: string[] } {
  validateBundle(bundle);

  const ids = new Set(existing.map((rule) => rule.id));
  const importKeys = new Set(existing.map((rule) => rule.importKey));
  const rules: Automation[] = [];
  const skipped: string[] = [];

  for (const rule of bundle.rules) {
    const importKey = importKeyOf(bundle, rule);
    if (importKeys.has(importKey)) {
      skipped.push(rule.name);
      continue;
    }

    let id = makeId();
    while (ids.has(id)) id = makeId();
    ids.add(id);

    const { key: _key, ...fields } = rule;
    rules.push({
      ...JSON.parse(JSON.stringify(fields)),
      id,
      enabled: false,
      ...(bundle.avatarIds ? { avatarIds: [...bundle.avatarIds] } : {}),
      importKey,
    });
  }

  return { rules, skipped };
}
