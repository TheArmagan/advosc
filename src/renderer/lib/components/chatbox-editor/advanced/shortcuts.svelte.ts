import { chatbox } from "$lib/api/chatbox";
import type { ShortcutModule } from "$lib/api/chatbox/modules/chatbox-shortcut-module";
import { localData } from "$lib/api/local-data";
import { get } from "$shared/store";

/**
 * Shortcut editing for the Advanced Editor. The data is still the Shortcut module's values
 * (`{ shortcuts, secrets }`), so presets, shares and the engine see exactly what they did.
 * The Simple Editor keeps its own `__SE_*` shortcuts in the same object: every write here
 * spreads the existing object so those are never dropped, and nothing here lists them.
 */

const SE_PREFIX = "__SE_";
const TABS_KEY = "Chatbox;AdvancedEditor;Tabs";
const PANEL_KEY = "Chatbox;AdvancedEditor;Panel";

export type ShortcutPanel = "placeholders" | "shortcuts";
export const TEMPLATE_TAB = "";

const module = chatbox.modules.get("Shortcut") as ShortcutModule;
const values = module.values;

type Values = { shortcuts?: Record<string, string>; secrets?: string[] };

function current(): Values {
  return (get(values) ?? {}) as Values;
}

function write(next: Partial<Values>) {
  values.set({ ...current(), ...next });
}

export function isUserShortcut(key: string) {
  return !key.startsWith(SE_PREFIX);
}

class ShortcutState {
  all = $state<Record<string, string>>({});
  secrets = $state<string[]>([]);
  /** Open shortcut tabs, in the order they were opened. */
  tabs = $state<string[]>([]);
  /** The shortcut on screen, or `TEMPLATE_TAB` for the template. */
  active = $state<string>(TEMPLATE_TAB);
  panel = $state<ShortcutPanel>("placeholders");

  /** User shortcuts, sorted by name. */
  list = $derived(
    Object.entries(this.all)
      .filter(([key]) => isUserShortcut(key))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  );

  constructor() {
    const saved = localData.get(TABS_KEY, null) as { tabs?: string[]; active?: string } | null;
    this.tabs = Array.isArray(saved?.tabs) ? saved.tabs.filter((t) => typeof t === "string") : [];
    this.active = typeof saved?.active === "string" ? saved.active : TEMPLATE_TAB;
    this.loadPanel();

    values.subscribe((v) => {
      const next = (v ?? {}) as Values;
      this.all = { ...(next.shortcuts ?? {}) };
      this.secrets = [...(next.secrets ?? [])];
      this.prune();
    });
  }

  has(key: string) {
    return Object.prototype.hasOwnProperty.call(this.all, key);
  }

  isSecret(key: string) {
    return this.secrets.includes(key);
  }

  /** Same count as `getMaxParamCount`, but read from runes state so the UI follows edits. */
  paramCount(key: string) {
    return countParams(this.all[key] ?? "");
  }

  // ------------------------------------------------------------------ tabs

  private saveTabs() {
    localData.set(TABS_KEY, { tabs: this.tabs, active: this.active });
  }

  /** Drops tabs whose shortcut is gone, like after a delete or a preset import. */
  private prune() {
    const tabs = this.tabs.filter((key) => this.has(key));
    const active = this.active === TEMPLATE_TAB || this.has(this.active) ? this.active : TEMPLATE_TAB;
    if (tabs.length === this.tabs.length && active === this.active) return;
    this.tabs = tabs;
    this.active = active;
    this.saveTabs();
  }

  open(key: string) {
    if (key !== TEMPLATE_TAB && !this.tabs.includes(key)) this.tabs = [...this.tabs, key];
    this.active = key;
    this.saveTabs();
  }

  close(key: string) {
    const index = this.tabs.indexOf(key);
    if (index === -1) return;
    this.tabs = this.tabs.filter((t) => t !== key);
    if (this.active === key) this.active = this.tabs[Math.min(index, this.tabs.length - 1)] ?? TEMPLATE_TAB;
    this.saveTabs();
  }

  /** Modules > Shortcut sets the stored value before opening the editor, so it's read on mount. */
  loadPanel() {
    this.panel = localData.get(PANEL_KEY, "placeholders") === "shortcuts" ? "shortcuts" : "placeholders";
  }

  /** Bumped to ask the Shortcuts panel to open its name box. */
  newRequest = $state(0);
  /** The last request the panel acted on. Kept here, since the panel may mount after it. */
  handledRequest = 0;

  requestNew() {
    this.setPanel("shortcuts");
    this.newRequest++;
  }

  setPanel(panel: ShortcutPanel) {
    this.panel = panel;
    localData.set(PANEL_KEY, panel);
  }

  // ------------------------------------------------------------------ edits

  /** An error to show, or null when the name can be used. */
  validateName(raw: string, except?: string): string | null {
    const name = raw.trim();
    if (!name) return "Give it a name.";
    if (/[\s;:{}[\]$\\|]/.test(name)) return "Names can't have spaces or ; : { } [ ] $ \\ |";
    if (name.startsWith(SE_PREFIX)) return "Names starting with __SE_ belong to the Simple Editor.";
    if (name !== except && this.has(name)) return "There's already a shortcut with that name.";
    return null;
  }

  create(raw: string, body = "", open = true) {
    const name = raw.trim();
    write({ shortcuts: { ...(current().shortcuts ?? {}), [name]: body } });
    if (open) this.open(name);
    return name;
  }

  /** `Shortcut1`, `Shortcut2`... whichever is free. */
  suggestName() {
    let n = this.list.length + 1;
    while (this.has(`Shortcut${n}`)) n++;
    return `Shortcut${n}`;
  }

  setBody(key: string, body: string) {
    const shortcuts = current().shortcuts ?? {};
    if (shortcuts[key] === body) return;
    write({ shortcuts: { ...shortcuts, [key]: body } });
  }

  /** Returns what Undo needs to put it back. */
  remove(key: string) {
    const { [key]: body, ...rest } = current().shortcuts ?? {};
    const wasSecret = this.isSecret(key);
    write({
      shortcuts: rest,
      secrets: (current().secrets ?? []).filter((s) => s !== key),
    });
    return { key, body: body ?? "", wasSecret };
  }

  restore({ key, body, wasSecret }: { key: string; body: string; wasSecret: boolean }) {
    const secrets = current().secrets ?? [];
    write({
      shortcuts: { ...(current().shortcuts ?? {}), [key]: body },
      secrets: wasSecret && !secrets.includes(key) ? [...secrets, key] : secrets,
    });
  }

  duplicate(key: string) {
    const base = key.replace(/\d+$/, "") || key;
    let n = 2;
    while (this.has(`${base}${n}`)) n++;
    const name = `${base}${n}`;
    this.create(name, this.all[key] ?? "");
    if (this.isSecret(key)) this.toggleSecret(name);
    return name;
  }

  toggleSecret(key: string) {
    const secrets = current().secrets ?? [];
    write({
      secrets: secrets.includes(key) ? secrets.filter((s) => s !== key) : [...secrets, key],
    });
  }

  /**
   * Renames a shortcut and rewrites calls to it in the advanced template and in the other
   * shortcuts. Returns how many places changed.
   */
  rename(oldKey: string, raw: string): number {
    const newKey = raw.trim();
    if (newKey === oldKey) return 0;
    const pattern = referencePattern(oldKey);
    let changed = 0;
    const swap = (text: string) => {
      const next = text.replace(pattern, (_m, open: string, sep: string) => `${open}Shortcut${sep}${newKey}`);
      if (next !== text) changed++;
      return next;
    };

    const shortcuts: Record<string, string> = {};
    for (const [key, body] of Object.entries(current().shortcuts ?? {})) {
      const target = key === oldKey ? newKey : key;
      shortcuts[target] = isUserShortcut(key) ? swap(body) : body;
    }
    const secrets = (current().secrets ?? []).map((s) => (s === oldKey ? newKey : s));

    // Move the tab first: the write below runs `prune` straight away, and it would close a
    // tab still named after the old key.
    this.tabs = this.tabs.map((t) => (t === oldKey ? newKey : t));
    if (this.active === oldKey) this.active = newKey;
    this.saveTabs();
    write({ shortcuts, secrets });

    const template = get(chatbox.advancedTemplate);
    const nextTemplate = swap(template);
    if (nextTemplate !== template) {
      chatbox.advancedTemplate.set(nextTemplate);
      const settings = get(chatbox.settings);
      if (settings.template === template) chatbox.settings.set({ ...settings, template: nextTemplate });
    }
    return changed;
  }

  // ------------------------------------------------------------------ import / export

  exportJson() {
    return JSON.stringify(module.getCleanValues().shortcuts, null, 2);
  }

  /** Merges an object of name to text. Returns how many it added or replaced. */
  importJson(json: string): number {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected an object of shortcut names and their text.");
    }
    const incoming: Record<string, string> = {};
    for (const [key, body] of Object.entries(parsed)) {
      if (typeof body !== "string") throw new Error(`"${key}" has to be text.`);
      const error = this.validateName(key, key);
      if (error) throw new Error(`"${key}": ${error}`);
      incoming[key] = body;
    }
    write({ shortcuts: { ...(current().shortcuts ?? {}), ...incoming } });
    return Object.keys(incoming).length;
  }
}

/** `$2` in the text means it takes three params: $0, $1 and $2. */
export function countParams(body: string) {
  let max = 0;
  for (const match of body.matchAll(/\$(\d+)/g)) max = Math.max(max, parseInt(match[1], 10) + 1);
  return max;
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `{{Shortcut;Name` and `[[Shortcut:Name`, only when the name ends right there. */
function referencePattern(key: string) {
  return new RegExp(`(\\{\\{|\\[\\[)Shortcut([;:])${escapeRegex(key)}(?=[;:}\\]])`, "g");
}

/** Monaco snippet text for calling a shortcut, with a tabstop per param. */
export function shortcutSnippet(key: string, form: "outer" | "inner") {
  const count = shortcuts.paramCount(key);
  const sep = form === "outer" ? ";" : ":";
  const params = Array.from({ length: count }, (_, i) => `\${${i + 1}:param${i}}`);
  const body = ["Shortcut", key, ...params].join(sep);
  return form === "outer" ? `{{${body}}}` : `[[${body}]]`;
}

export const shortcuts = new ShortcutState();
