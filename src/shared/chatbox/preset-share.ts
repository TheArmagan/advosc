import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import type { Automation, AutomationActionType } from "../automation";
import { heartRatePlatforms } from "./heart-rate";

export type AllValues = {
  modules: Record<string, any>;
  settings: { template: string; autoSend: boolean; eggMode: boolean; debugMode: boolean };
  editorState?: {
    advancedTemplate?: string;
    simpleBlocks?: any[];
  };
  /** Missing from bundles older than Automations. */
  automations?: Automation[];
};

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

/**
 * A preset is a full snapshot of the chatbox setup (template, both editors' state and every
 * module's values), stored locally so users can keep several templates around and switch
 * between them. The same snapshot is what gets shared, minus credentials.
 */
export interface ChatboxPreset extends SharedPreset {
  id: string;
}

export const PRESETS_KEY = "Chatbox;Presets";
export const ACTIVE_PRESET_KEY = "Chatbox;ActivePresetId";

/** Appends " (2)", " (3)" and so on while `name` is already taken. */
export function uniquePresetName(presets: ChatboxPreset[], name: string, ignoreId?: string): string {
  const taken = new Set(
    presets.filter((preset) => preset.id !== ignoreId).map((preset) => preset.name.toLowerCase()),
  );
  const base = name.trim() || "Untitled";
  if (!taken.has(base.toLowerCase())) return base;
  let index = 2;
  while (taken.has(`${base} (${index})`.toLowerCase())) index++;
  return `${base} (${index})`;
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

/** Blanks query values and strips `user:pass@`, leaving the rest of the URL readable. */
function redactUrl(url: string): { url: string; changed: boolean } {
  let next = url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#@]*@/i, "$1");

  const queryStart = next.indexOf("?");
  if (queryStart >= 0) {
    const hashStart = next.indexOf("#", queryStart);
    const queryEnd = hashStart >= 0 ? hashStart : next.length;
    const query = next
      .slice(queryStart + 1, queryEnd)
      .split("&")
      .map((pair) => {
        const equals = pair.indexOf("=");
        return equals >= 0 ? pair.slice(0, equals + 1) : pair;
      })
      .join("&");
    next = next.slice(0, queryStart + 1) + query + next.slice(queryEnd);
  }

  return { url: next, changed: next !== url };
}

/**
 * A Request source can hold a token in any free-form field, so everything that isn't the
 * endpoint's shape goes: header values, the body, WebSocket messages, and URL query values.
 */
function redactRequestSources(sources: Record<string, any>, removed: string[]) {
  Object.entries(sources).forEach(([name, source]) => {
    if (!source || typeof source !== "object") return;

    if (typeof source.url === "string") {
      const { url, changed } = redactUrl(source.url);
      if (changed) {
        source.url = url;
        removed.push(`Request source "${name}": URL credentials and query values`);
      }
    }

    if (Array.isArray(source.headers)) {
      source.headers.forEach((header: any) => {
        if (!header || !header.value) return;
        header.value = "";
        removed.push(`Request source "${name}": ${header.key || "header"} header`);
      });
    }

    for (const field of ["body", "openMessage", "keepaliveMessage"]) {
      if (!source[field]) continue;
      source[field] = "";
      removed.push(`Request source "${name}": ${field}`);
    }
  });
}

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

  const requestSources = data.modules?.Request?.sources;
  if (requestSources && typeof requestSources === "object") {
    redactRequestSources(requestSources, removed);
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

// ------------------------------------------------------------------ toy content

const TOY_MODULE_ID = "lovense";

const TOY_PLACEHOLDER = /\{\{\s*Lovense\b[^}]*\}\}|\[\[\s*Lovense\b[^\]]*\]\]/gi;

/**
 * What a shared rule may do. It's a list of what's allowed, not of what isn't, so an action
 * type nobody has thought about here stays out of shares until someone has.
 */
const SHAREABLE_ACTIONS = new Set<AutomationActionType>([
  "sound",
  "osc",
  "setParameter",
  "loadProfile",
  "moduleInput",
  "setVariable",
]);

function isShareableAction(action: any): boolean {
  if (!SHAREABLE_ACTIONS.has(action?.type)) return false;
  if (action.type !== "moduleInput") return true;
  return String(action.moduleId ?? "").trim().toLowerCase() !== TOY_MODULE_ID;
}

/** Whether running this rule could touch a toy. */
export function ruleUsesToys(rule: Automation): boolean {
  return Array.isArray(rule?.actions) && rule.actions.some((action) => !isShareableAction(action));
}

function hasToyPlaceholder(value: unknown): boolean {
  return typeof value === "string" && value.search(TOY_PLACEHOLDER) >= 0;
}

/** Removes toy placeholders from every string under `value`, wherever it's nested. */
function stripPlaceholders<T>(value: T, onRemoved: () => void): T {
  if (typeof value === "string") {
    const next = value.replace(TOY_PLACEHOLDER, "");
    if (next !== value) onRemoved();
    return next as T;
  }
  if (Array.isArray(value)) return value.map((item) => stripPlaceholders(item, onRemoved)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stripPlaceholders(item, onRemoved)]),
    ) as T;
  }
  return value;
}

/**
 * Takes out anything that can reach a toy, so a preset can never drive someone else's device.
 * This runs when sharing and again when importing, because a share code can be written by hand,
 * and it isn't affected by "include secrets".
 */
export function stripToyContent(input: AllValues): RedactionReport {
  const data = clonePresetData(input);
  const removed: string[] = [];

  if (data.modules) {
    for (const id of Object.keys(data.modules)) {
      if (id.trim().toLowerCase() === TOY_MODULE_ID) delete data.modules[id];
    }
  }

  if (Array.isArray(data.automations)) {
    data.automations = data.automations.flatMap((rule) => {
      if (!rule || typeof rule !== "object") return [];
      const name = rule.name || "Unnamed";
      const source = rule.source as { template?: unknown; address?: unknown } | undefined;

      // Taking the placeholder out of a source would quietly change what the rule reacts to.
      if (hasToyPlaceholder(source?.template)) {
        removed.push(`Automation "${name}": reads toy values`);
        return [];
      }

      if (!Array.isArray(rule.actions)) {
        removed.push(`Automation "${name}": not a valid rule`);
        return [];
      }

      const actions = rule.actions;
      const shareable = actions.filter(isShareableAction);
      if (shareable.length === actions.length) return [rule];

      if (!shareable.length) {
        removed.push(`Automation "${name}": only controlled toys`);
        return [];
      }
      removed.push(`Automation "${name}": toy actions`);
      return [{ ...rule, actions: shareable }];
    });
  } else {
    delete data.automations;
  }

  let placeholders = 0;
  const cleaned = stripPlaceholders(data, () => placeholders++);
  if (placeholders) removed.push(`Toy placeholders in ${placeholders} place${placeholders === 1 ? "" : "s"}`);

  return { data: cleaned, removed };
}

// ------------------------------------------------------------------ encoding

export function buildShareEnvelope(
  preset: SharedPreset,
  includeSecrets: boolean,
  now: number,
): { envelope: PresetShareEnvelope; removed: string[] } {
  const toyFree = stripToyContent(preset.data);
  const redacted = includeSecrets
    ? { data: toyFree.data, removed: [] as string[] }
    : redactSecrets(toyFree.data);
  const data = redacted.data;
  const removed = [...toyFree.removed, ...redacted.removed];
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
 * What a preset from outside may bring in. Toy content goes, and the rules that remain are off
 * until the user has looked at them, since they can play sounds and send OSC.
 */
function sanitizeImportedData(input: AllValues): AllValues {
  const { data } = stripToyContent(input);
  if (data.automations) {
    data.automations = data.automations.map((rule) => ({ ...rule, enabled: false }));
  }
  return data;
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
      data: sanitizeImportedData(preset.data),
    };
  }

  // Legacy bundle: exactly what "Export All Settings" produced.
  if (typeof parsed?.settings?.template === "string") {
    return {
      name: "Imported preset",
      description: "",
      createdAt: now,
      updatedAt: now,
      data: sanitizeImportedData(parsed as AllValues),
    };
  }

  throw new Error("That does not look like an ADVOSC preset.");
}
