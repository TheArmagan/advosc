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
    const shortcuts = this.getValues().shortcuts || {};
    if (!shortcuts[key]) return key;
    params = await chatbox.fillTemplates(params, "{{;}}");
    return await chatbox.fillTemplate((shortcuts[key] || "").replace(/\$(\d+)/g, (itself: unknown, index: number) => params[index] || itself), "{{;}}");
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const shortcuts = this.getValues().shortcuts || {};
    return Object.fromEntries(Object.keys(shortcuts).map((key) => {
      const maxParams: number = (shortcuts[key].match(/\$(\d+)/g)?.map((m: string) => parseInt(m.slice(1), 10)).reduce((a: number, b: number) => Math.max(a, b), 0)) || 0;
      return [key, {
        value: shortcuts[key],
        description: `User-defined shortcut for: ${shortcuts[key]}`,
        fillText: `Shortcut;${key}${maxParams ? ";" : ""}${[...Array(maxParams).keys()].map(i => `\${${i + 1}:param${i + 1}}`).join(";")}`
      }];
    }));
  }

  getCleanValues(): Record<string, any> {
    const values = this.getValues();
    values.secrets.forEach((secretKey: string) => {
      delete values.shortcuts[secretKey];
    });
    return {
      shortcuts: values.shortcuts
    };
  }
}