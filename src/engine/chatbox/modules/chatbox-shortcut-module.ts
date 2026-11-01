import { moduleValues } from "../module-values";
import { ShortcutConfig } from "$shared/chatbox/modules/shortcut";
import { chatbox } from "..";
import { ChatboxModule, type PlaceholdersRecord } from "$shared/chatbox/module-base";

export class ChatboxShortcutModule extends ShortcutConfig {
  constructor() {
    super(moduleValues("Shortcut"));
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

}