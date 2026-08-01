import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { heartRatePlatforms } from "./modules/heart-rate/providers";
import type { AllValues } from ".";

/**
 * Everything needed to turn a preset snapshot into something shareable and back. Kept free
 * of stores and DOM access so it stays a pure, testable layer under `presets.ts`.
 */

export const SHARE_KIND = "advosc.chatbox.preset";
export const SHARE_VERSION = 1;
/** Marks the compact single-line form: prefix + base64(deflate(json)). */
export const SHARE_CODE_PREFIX = "ADVOSC1:";

export interface SharedPreset {
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  data: AllValues;
}

export interface PresetShareEnvelope {
  kind: typeof SHARE_KIND;
  version: number;
  exportedAt: number;
  preset: SharedPreset;
}

export function clonePresetData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ------------------------------------------------------------------ secret redaction

/** Field names each heart rate platform treats as a credential. */
const heartRateSecretFields = new Set<string>(
  heartRatePlatforms.flatMap((platform) =>
    platform.fields.filter((field) => field.secret).map((field) => field.key),
  ),
);

/**
 * Custom WebSocket URLs regularly carry a token in the query string, and even when they do
 * not they point at the sharer's own machine, so they go too.
 */
const heartRateSecretExtras = new Set(["url"]);

export interface RedactionReport {
  data: AllValues;
  /** Human-readable list of what was removed, shown before the user copies anything. */
  removed: string[];
}

/** Strips credentials from a snapshot so it is safe to hand to someone else. */
export function redactSecrets(input: AllValues): RedactionReport {
  const data = clonePresetData(input);
  const removed: string[] = [];

  const sources = data.modules?.HeartRate?.sources;
  if (sources && typeof sources === "object") {
    Object.entries(sources as Record<string, any>).forEach(([name, source]) => {
      if (!source || typeof source !== "object") return;
      Object.keys(source).forEach((field) => {
        const isSecret = heartRateSecretFields.has(field) || heartRateSecretExtras.has(field);
        if (!isSecret || !source[field]) return;
        source[field] = "";
        removed.push(`Heart Rate source "${name}": ${field}`);
      });
    });
  }

  const shortcutValues = data.modules?.Shortcut;
  const shortcutSecrets: string[] = Array.isArray(shortcutValues?.secrets)
    ? shortcutValues.secrets
    : [];
  if (shortcutValues?.shortcuts) {
    shortcutSecrets.forEach((key) => {
      if (shortcutValues.shortcuts[key] === undefined) return;
      delete shortcutValues.shortcuts[key];
      removed.push(`Hidden shortcut "${key}"`);
    });
    delete shortcutValues.secrets;
  }

  return { data, removed };
}

// ------------------------------------------------------------------ encoding

export function buildShareEnvelope(
  preset: SharedPreset,
  includeSecrets: boolean,
  now: number,
): { envelope: PresetShareEnvelope; removed: string[] } {
  const { data, removed } = includeSecrets
    ? { data: clonePresetData(preset.data), removed: [] as string[] }
    : redactSecrets(preset.data);
  return {
    envelope: {
      kind: SHARE_KIND,
      version: SHARE_VERSION,
      exportedAt: now,
      preset: {
        name: preset.name,
        description: preset.description,
        createdAt: preset.createdAt,
        updatedAt: preset.updatedAt,
        data,
      },
    },
    removed,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Compact one-line form, meant for pasting into Discord and the like. */
export function encodeShareCode(envelope: PresetShareEnvelope): string {
  const compressed = deflateSync(strToU8(JSON.stringify(envelope)), { level: 9 });
  return `${SHARE_CODE_PREFIX}${bytesToBase64(compressed)}`;
}

/** Safe file name for the .json download: keeps it recognisable, drops path-hostile chars. */
export function shareFileName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-");
  return `${safe || "chatbox-preset"}.advosc.json`;
}

// ------------------------------------------------------------------ decoding

function isEnvelope(value: any): value is PresetShareEnvelope {
  return !!value && value.kind === SHARE_KIND && !!value.preset;
}

/**
 * Accepts anything a user might paste: a share code, a share envelope, or a bare
 * `getAllValues()` bundle from the older "Export All Settings" button.
 */
export function parseShareInput(input: string, now: number): SharedPreset {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Nothing to import.");

  let parsed: any;
  if (trimmed.startsWith(SHARE_CODE_PREFIX)) {
    const payload = trimmed.slice(SHARE_CODE_PREFIX.length).replace(/\s+/g, "");
    try {
      parsed = JSON.parse(strFromU8(inflateSync(base64ToBytes(payload))));
    } catch {
      throw new Error("This share code is corrupted or incomplete.");
    }
  } else {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("That is neither a share code nor valid JSON.");
    }
  }

  if (isEnvelope(parsed)) {
    if (typeof parsed.version === "number" && parsed.version > SHARE_VERSION) {
      throw new Error("This preset was made with a newer version of ADVOSC.");
    }
    const preset = parsed.preset;
    if (typeof preset?.data?.settings?.template !== "string") {
      throw new Error("This preset is missing its template.");
    }
    return {
      name: typeof preset.name === "string" && preset.name.trim() ? preset.name : "Imported preset",
      description: typeof preset.description === "string" ? preset.description : "",
      createdAt: typeof preset.createdAt === "number" ? preset.createdAt : now,
      updatedAt: now,
      data: preset.data,
    };
  }

  // Legacy bundle: exactly what "Export All Settings" produced.
  if (typeof parsed?.settings?.template === "string") {
    return {
      name: "Imported preset",
      description: "",
      createdAt: now,
      updatedAt: now,
      data: parsed as AllValues,
    };
  }

  throw new Error("That does not look like an ADVOSC preset.");
}
