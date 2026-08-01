import { get, writable } from "svelte/store";
import { localData } from "../local-data";
import { chatbox, type AllValues } from ".";
import {
  buildShareEnvelope,
  clonePresetData,
  encodeShareCode,
  parseShareInput,
  redactSecrets,
  shareFileName,
  type SharedPreset,
} from "./preset-share";
import {
  buildTemplateState,
  syncAutoShortcuts,
} from "$lib/components/chatbox-editor/simple-editor/template";

/**
 * A preset is a full snapshot of the chatbox setup (template, both editors' state and every
 * module's values), stored locally so users can keep several templates around and switch
 * between them. The same snapshot is what gets shared, minus credentials.
 */
export interface ChatboxPreset extends SharedPreset {
  id: string;
}

const PRESETS_KEY = "Chatbox;Presets";
const ACTIVE_PRESET_KEY = "Chatbox;ActivePresetId";

function newId(): string {
  return crypto.randomUUID();
}

/** Drops malformed entries instead of throwing away the whole list, like `sanitizeSources`. */
function sanitizePresets(input: any): ChatboxPreset[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((preset) => preset && typeof preset === "object")
    .filter((preset) => typeof preset.data?.settings?.template === "string")
    .map((preset) => ({
      id: typeof preset.id === "string" && preset.id ? preset.id : newId(),
      name: typeof preset.name === "string" && preset.name.trim() ? preset.name : "Untitled",
      description: typeof preset.description === "string" ? preset.description : "",
      createdAt: typeof preset.createdAt === "number" ? preset.createdAt : Date.now(),
      updatedAt: typeof preset.updatedAt === "number" ? preset.updatedAt : Date.now(),
      data: preset.data as AllValues,
    }));
}

const presets = writable<ChatboxPreset[]>(sanitizePresets(localData.get(PRESETS_KEY, [])));
presets.subscribe((value) => localData.set(PRESETS_KEY, value));

const activePresetId = writable<string | null>(localData.get(ACTIVE_PRESET_KEY, null));
activePresetId.subscribe((value) => localData.set(ACTIVE_PRESET_KEY, value));

// ------------------------------------------------------------------ capture / apply

/**
 * `getAllValues()` is already the export format, but `Shortcut.getCleanValues()` hides
 * shortcuts the user marked secret. Those belong in a local preset (they are only stripped
 * when sharing), so they get folded back in here.
 */
function captureCurrent(): AllValues {
  const values = clonePresetData(chatbox.getAllValues());
  const shortcutModule = chatbox.modules.get("Shortcut");
  if (!shortcutModule) return values;

  const raw = shortcutModule.getValues();
  const secrets: string[] = Array.isArray(raw.secrets) ? raw.secrets : [];
  if (!secrets.length) return values;

  const shortcuts: Record<string, string> = { ...(values.modules.Shortcut?.shortcuts ?? {}) };
  secrets.forEach((key) => {
    if (typeof raw.shortcuts?.[key] === "string") shortcuts[key] = raw.shortcuts[key];
  });
  values.modules.Shortcut = { ...(values.modules.Shortcut ?? {}), shortcuts, secrets: [...secrets] };
  return values;
}

/**
 * Simple-editor blocks compile to `__SE_*` auto-shortcuts, which never travel inside a
 * snapshot (they are derived, and excluded from clean values). They are normally rebuilt by
 * the simple editor's effect, which only runs while that tab is mounted, so a restored
 * preset would render broken placeholders until the user opened it. Rebuild them here.
 */
function rebuildAutoShortcuts(data: AllValues) {
  const blocks = data.editorState?.simpleBlocks;
  syncAutoShortcuts(Array.isArray(blocks) ? buildTemplateState(blocks as any).autoShortcuts : {});
}

function applyValues(data: AllValues) {
  chatbox.setAllValues(clonePresetData(data));
  rebuildAutoShortcuts(data);
  chatbox.updatePlaceholders();
}

// ------------------------------------------------------------------ preset management

function findPreset(id: string): ChatboxPreset | undefined {
  return get(presets).find((preset) => preset.id === id);
}

/** Appends " (2)", " (3)" … while `name` is already taken. */
function uniqueName(name: string, ignoreId?: string): string {
  const taken = new Set(
    get(presets)
      .filter((preset) => preset.id !== ignoreId)
      .map((preset) => preset.name.toLowerCase()),
  );
  const base = name.trim() || "Untitled";
  if (!taken.has(base.toLowerCase())) return base;
  let index = 2;
  while (taken.has(`${base} (${index})`.toLowerCase())) index++;
  return `${base} (${index})`;
}

/** Saves the current chatbox setup as a new preset and makes it the active one. */
export function savePreset(name: string, description = ""): ChatboxPreset {
  const now = Date.now();
  const preset: ChatboxPreset = {
    id: newId(),
    name: uniqueName(name),
    description,
    createdAt: now,
    updatedAt: now,
    data: captureCurrent(),
  };
  presets.update((list) => [...list, preset]);
  activePresetId.set(preset.id);
  return preset;
}

/** Overwrites an existing preset with the current chatbox setup. */
export function updatePreset(id: string): ChatboxPreset | undefined {
  const data = captureCurrent();
  let updated: ChatboxPreset | undefined;
  presets.update((list) =>
    list.map((preset) => {
      if (preset.id !== id) return preset;
      updated = { ...preset, data, updatedAt: Date.now() };
      return updated;
    }),
  );
  if (updated) activePresetId.set(id);
  return updated;
}

/** Replaces the whole chatbox setup with the preset's snapshot. */
export function applyPreset(id: string): boolean {
  const preset = findPreset(id);
  if (!preset) return false;
  applyValues(preset.data);
  activePresetId.set(id);
  return true;
}

export function renamePreset(id: string, name: string, description?: string) {
  presets.update((list) =>
    list.map((preset) =>
      preset.id === id
        ? {
            ...preset,
            name: uniqueName(name, id),
            description: description ?? preset.description,
            updatedAt: Date.now(),
          }
        : preset,
    ),
  );
}

export function deletePreset(id: string) {
  presets.update((list) => list.filter((preset) => preset.id !== id));
  if (get(activePresetId) === id) activePresetId.set(null);
}

export function duplicatePreset(id: string): ChatboxPreset | undefined {
  const preset = findPreset(id);
  if (!preset) return undefined;
  const now = Date.now();
  const copy: ChatboxPreset = {
    ...clonePresetData(preset),
    id: newId(),
    name: uniqueName(`${preset.name} copy`),
    createdAt: now,
    updatedAt: now,
  };
  presets.update((list) => [...list, copy]);
  return copy;
}

export function movePreset(id: string, direction: -1 | 1) {
  presets.update((list) => {
    const index = list.findIndex((preset) => preset.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= list.length) return list;
    const reordered = [...list];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    return reordered;
  });
}

// ------------------------------------------------------------------ sharing

/** Pretty JSON, for the clipboard and the .json file. */
export function shareJSON(preset: ChatboxPreset, includeSecrets = false) {
  const { envelope, removed } = buildShareEnvelope(preset, includeSecrets, Date.now());
  return { text: JSON.stringify(envelope, null, 2), removed };
}

/** Compact single-line code, for pasting into chat. */
export function shareCode(preset: ChatboxPreset, includeSecrets = false) {
  const { envelope, removed } = buildShareEnvelope(preset, includeSecrets, Date.now());
  return { text: encodeShareCode(envelope), removed };
}

/** Imports without touching the live chatbox: the user applies it when they want to. */
export function importPreset(input: string): ChatboxPreset {
  const parsed = parseShareInput(input, Date.now());
  const preset: ChatboxPreset = { ...parsed, id: newId(), name: uniqueName(parsed.name) };
  presets.update((list) => [...list, preset]);
  return preset;
}

export const chatboxPresets = {
  presets,
  activePresetId,
  captureCurrent,
  applyValues,
  savePreset,
  updatePreset,
  applyPreset,
  renamePreset,
  deletePreset,
  duplicatePreset,
  movePreset,
  shareJSON,
  shareCode,
  shareFileName: (preset: ChatboxPreset) => shareFileName(preset.name),
  importPreset,
  redactSecrets,
};
