import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
// @ts-expect-error
import ChatboxShortcutSettings from "$lib/components/chatbox-editor/modules/chatbox-shortcut-settings.svelte";

export class ChatboxShortcutModule extends ChatboxModule {
  constructor() {
    super({
      id: "Shortcut",
      name: "Shortcut",
      description: "User-defined placeholder shortcuts.",
      Component: ChatboxShortcutSettings,
      examplePlaceholders: {}
    });
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    const instanceKey = chatbox.getInstanceKey();
    const shortcuts = this.getValues().shortcuts || {};
    if (!shortcuts[key]) return key;
    params = await chatbox.fillTemplates(params, "[[:]]", false, instanceKey);
    const maxParams = this.getMaxParamCount(key);
    if (params.length < maxParams) {
      if (chatbox.getSettings().debugMode) {
        console.warn("Chatbox > Shortcut Module", `Placeholder "${key}" expected ${maxParams} parameters, but got ${params.length}.`);
      }
      return `(Requires ${maxParams} parameters, but got ${params.length})`;
    }

    if (chatbox.getSettings().debugMode) {
      console.log("Chatbox > Shortcut Module", `Filling shortcut "${key}" with params:`, params);
    }
    // Scope the expansion to this occurrence: using the same shortcut twice must give
    // each copy its own state instead of both driving a single shared animation.
    return await chatbox.fillTemplate((shortcuts[key] || "").replace(/\$(\d+)/g, (itself: unknown, index: number) => params[index] || itself), "{{;}}", false, instanceKey);
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const shortcuts = Object.fromEntries(
      Object.entries(this.getValues().shortcuts || {}).filter(([key]) => !key.startsWith("__SE_"))
    ) as Record<string, string>;
    return Object.fromEntries(Object.keys(shortcuts).map((key) => {
      const maxParams = this.getMaxParamCount(key);
      return [key, {
        value: shortcuts[key],
        description: `User-defined shortcut.`,
        fillText: `Shortcut;${key}${maxParams ? ";" : ""}${[...Array(maxParams).keys()].map(i => `\${${i + 1}:param${i + 1}}`).join(";")}`
      }];
    }));
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