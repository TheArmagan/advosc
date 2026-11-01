import {
  ACTIVE_PRESET_KEY,
  buildShareEnvelope,
  clonePresetData,
  encodeShareCode,
  parseShareInput,
  PRESETS_KEY,
  redactSecrets,
  shareFileName,
  uniquePresetName,
  type ChatboxPreset,
} from "$shared/chatbox/preset-share";
import { get } from "$shared/store";
import { call, synced } from "../engine";

export type { ChatboxPreset };

const presets = synced<ChatboxPreset[]>(PRESETS_KEY, []);
const activePresetId = synced<string | null>(ACTIVE_PRESET_KEY, null);

function newId(): string {
  return crypto.randomUUID();
}

function findPreset(id: string): ChatboxPreset | undefined {
  return get(presets).find((preset) => preset.id === id);
}

function uniqueName(name: string, ignoreId?: string): string {
  return uniquePresetName(get(presets), name, ignoreId);
}

/** Saves the current chatbox setup as a new preset and makes it the active one. */
export function savePreset(name: string, description = ""): Promise<ChatboxPreset> {
  return call("presets.savePreset", name, description);
}

/** Overwrites an existing preset with the current chatbox setup. */
export function updatePreset(id: string): Promise<ChatboxPreset | undefined> {
  return call("presets.updatePreset", id);
}

/** Replaces the whole chatbox setup with the preset's snapshot. */
export function applyPreset(id: string): Promise<boolean> {
  return call("presets.applyPreset", id);
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
