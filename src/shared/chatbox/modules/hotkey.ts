import { ChatboxModule, type ChatboxModuleOptions } from "../module-base";
import type { Writable } from "../../store";

export const HOTKEY_PREFIX = "HotkeyModule;";

export const hotkeyOptions: ChatboxModuleOptions = {
  id: "Hotkey",
  name: "Hotkey",
  description: "Provides hotkey/shortcut state information for chatbox placeholders.",
  examplePlaceholders: {
    "IsPressed;HotkeyName;TimeoutMs": {
      value: "true",
      description: "Returns 'true' if the hotkey was pressed within the specified timeout (in milliseconds), 'false' otherwise. Default timeout is 1000ms.",
      fillText: "Hotkey;IsPressed;${1:hotkeyName};${2:1000}"
    },
    "IsToggled;HotkeyName": {
      value: "false",
      description: "Returns 'true' if the hotkey toggle state is on, 'false' otherwise. Each press toggles the state.",
      fillText: "Hotkey;IsToggled;${1:hotkeyName}"
    }
  }
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class HotkeyConfig extends ChatboxModule {
  constructor(values: Writable<Record<string, any>>) {
    super(hotkeyOptions, values);
  }

  /**
   * Get all hotkeys from values
   */
  getHotkeys(): Record<string, string> {
    return this.getValues().hotkeys || {};
  }

  getCleanValues(): Record<string, any> {
    return {
      hotkeys: this.getHotkeys()
    };
  }
}
