import { AppModule, type ModuleOptions } from "../module-base";
import type { Writable } from "../../store";

export const shortcutOptions: ModuleOptions = {
  id: "Shortcut",
  name: "Shortcut",
  description: "User-defined placeholder shortcuts.",
  examplePlaceholders: {}
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class ShortcutConfig extends AppModule {
  constructor(values: Writable<Record<string, any>>) {
    super(shortcutOptions, values);
  }

  getMaxParamCount(key: string): number {
    const shortcuts = this.getValues().shortcuts || {};
    if (!shortcuts[key]) return 0;
    return (shortcuts[key].match(/\$(\d+)/g)?.map((m: string) => parseInt(m.slice(1), 10) + 1).reduce((a: number, b: number) => Math.max(a, b), 0)) || 0;
  }

  getCleanValues(): Record<string, any> {
    const values = this.getValues();
    // Copy first: `getValues()` hands back the live store object, so deleting in place
    // would drop the user's own secret shortcuts every time anything exports.
    const shortcuts = { ...(values.shortcuts || {}) };
    (values.secrets || []).forEach((secretKey: string) => {
      delete shortcuts[secretKey];
    });
    Object.keys(shortcuts).forEach((key) => {
      if (key.startsWith("__SE_")) {
        delete shortcuts[key];
      }
    });
    return { shortcuts };
  }
}
