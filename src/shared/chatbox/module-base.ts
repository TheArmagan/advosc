import { get, type Writable } from "../store";

export type PlaceholdersRecord = Record<string, {
  value: string;
  description: string;
  fillText?: string;
}>;

export interface ChatboxModuleOptions {
  id: string;
  name: string;
  description: string;
  examplePlaceholders: PlaceholdersRecord;
  /** Settings UI. Only the renderer's client sets this, so it stays typed loosely here. */
  Component?: any;
  constants?: Record<string, any>;
}

type ValuesListener = (values: Record<string, any>, previous: Record<string, any>) => void;

/**
 * Base for both sides of a module: the engine module that does the work, and the renderer
 * client that wraps the same settings over a synced store. Each side passes its own store.
 */
export class ChatboxModule {
  private valuesListeners = new Set<ValuesListener>();
  private lastValues: Record<string, any> = {};

  constructor(
    public options: ChatboxModuleOptions,
    public values: Writable<Record<string, any>>,
  ) {
    this.values.subscribe((next) => {
      const previous = this.lastValues;
      this.lastValues = next;
      for (const listener of this.valuesListeners) listener(next, previous);
    });
  }

  /**
   * Runs on every change, with the values from before it. Any number of listeners can
   * register, so the registry and a module's own reactions can't overwrite each other.
   */
  onValuesChange(listener: ValuesListener): () => void {
    this.valuesListeners.add(listener);
    return () => this.valuesListeners.delete(listener);
  }

  getValues(): Record<string, any> {
    return get(this.values);
  }

  getCleanValues(): Record<string, any> {
    return {};
  }

  /**
   * What the module's values should be after importing a bundle. A bundle only carries the
   * keys `getCleanValues()` exports, so the default keeps everything else. Override it when a
   * nested object is only partly exported.
   */
  mergeImportedValues(current: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
    return { ...current, ...incoming };
  }

  getPlaceholderValue(...params: string[]): Promise<string> | string {
    return "";
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    return {};
  }
}
