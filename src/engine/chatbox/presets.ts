import {
  ACTIVE_PRESET_KEY,
  clonePresetData,
  PRESETS_KEY,
  uniquePresetName,
  type AllValues,
  type ChatboxPreset,
} from "$shared/chatbox/preset-share";
import { get } from "$shared/store";
import { chatbox } from ".";
import { synced } from "../sync/hub";

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

const presets = synced<ChatboxPreset[]>(PRESETS_KEY, [], sanitizePresets);
const activePresetId = synced<string | null>(ACTIVE_PRESET_KEY, null);

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

function applyValues(data: AllValues) {
  chatbox.setAllValues(clonePresetData(data));
  chatbox.updatePlaceholders();
}

// ------------------------------------------------------------------ preset management

/** Saves the current chatbox setup as a new preset and makes it the active one. */
function savePreset(name: string, description = ""): ChatboxPreset {
  const now = Date.now();
  const preset: ChatboxPreset = {
    id: newId(),
    name: uniquePresetName(get(presets), name),
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
function updatePreset(id: string): ChatboxPreset | undefined {
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
function applyPreset(id: string): boolean {
  const preset = get(presets).find((item) => item.id === id);
  if (!preset) return false;
  applyValues(preset.data);
  activePresetId.set(id);
  return true;
}

/** Renaming, ordering and sharing are pure, so the renderer's client does those itself. */
export const chatboxPresets = {
  savePreset,
  updatePreset,
  applyPreset,
};
