import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { AutomationAction, AutomationMode, AutomationRange } from "./automation";

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
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error("This link is corrupted or incomplete.");

  let json: string;
  try {
    const bytes = inflateSync(fromBase64Url(payload));
    if (bytes.length > MAX_BUNDLE_JSON) throw new Error("too large");
    json = strFromU8(bytes);
  } catch {
    throw new Error("This link is corrupted or incomplete.");
  }

  try {
    return JSON.parse(json);
  } catch {
    throw new Error("This link is corrupted or incomplete.");
  }
}
