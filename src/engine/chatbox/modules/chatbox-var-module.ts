import { moduleValues } from "../module-values";
import { VarConfig } from "$shared/chatbox/modules/var";
import { chatbox } from "..";
import type { PlaceholdersRecord } from "$shared/chatbox/module-base";
import { isReadOnly } from "../eval-context";

/** A live automation can set a variable 30 times a second, and that shouldn't reach the disk. */
const PERSIST_DELAY_MS = 500;

type ChangeListener = (name: string) => void;

/**
 * Variables stay in a plain map while running, because a write can come from a `live` rule at
 * full rate and a value change on a module rebuilds the whole placeholder list. The persisted
 * values follow a moment later. They are saved, since a variable that holds a mode or a counter
 * is no use if it forgets it on restart.
 *
 * They're state rather than settings, so `getCleanValues` stays empty and they stay out of
 * presets and share codes. A full backup still has them.
 */
export class VarModule extends VarConfig {
  private live: Map<string, string>;
  private listeners = new Set<ChangeListener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persisting = false;

  constructor() {
    super(moduleValues("Var"));
    this.live = new Map(Object.entries(this.getVariables()));
    this.onValuesChange(() => this.adoptStoredValues());
  }

  /** The stored values only move on their own after a restore or a write from a window. */
  private adoptStoredValues() {
    if (this.persisting) return;

    const stored = this.getVariables();
    const changed = new Set<string>();
    for (const [name, value] of this.live) {
      if (stored[name] !== value) changed.add(name);
    }
    for (const [name, value] of Object.entries(stored)) {
      if (this.live.get(name) !== value) changed.add(name);
    }

    this.live = new Map(Object.entries(stored));
    for (const name of changed) this.notify(name);
  }

  private notify(name: string) {
    for (const listener of this.listeners) listener(name);
  }

  private persistSoon() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => this.persist(), PERSIST_DELAY_MS);
  }

  /** Writes anything still waiting. Shutdown calls this, so a last change isn't lost. */
  persist() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persisting = true;
    try {
      this.values.update((current) => ({ ...current, variables: Object.fromEntries(this.live) }));
    } finally {
      this.persisting = false;
    }
  }

  /** Fires for each name whose value changed, whoever changed it. */
  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(name: string): string | undefined {
    return this.live.get(name);
  }

  set(name: string, value: string) {
    if (isReadOnly() || !name) return;
    if (this.live.get(name) === value) return;
    this.live.set(name, value);
    this.persistSoon();
    this.notify(name);
  }

  clear(name: string) {
    if (isReadOnly() || !this.live.delete(name)) return;
    this.persistSoon();
    this.notify(name);
  }

  runInput(inputId: string, args: Record<string, string>) {
    switch (inputId) {
      case "set": return this.set(args.name ?? "", args.value ?? "");
      case "clear": return this.clear(args.name ?? "");
      default: return super.runInput(inputId, args);
    }
  }

  async getPlaceholderValue(name: string, ...params: string[]): Promise<string> {
    [name, ...params] = await chatbox.fillTemplates([name ?? "", ...params], "[[:]]", false, chatbox.getInstanceKey());
    return this.live.get(name) ?? params[0] ?? "";
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const placeholders: PlaceholdersRecord = {};
    for (const [name, value] of this.live) {
      placeholders[name] = {
        value,
        description: `The "${name}" variable.`,
        fillText: `Var;${name.replace(/\\/g, "\\\\").replace(/;/g, "\\;")}`,
      };
    }
    return placeholders;
  }
}
