import { HOTKEY_PREFIX, HotkeyConfig } from "$shared/chatbox/modules/hotkey";
import { get } from "$shared/store";
import { callModule, mirrored } from "../../engine";
import { moduleValues } from "../module-client";

export { HOTKEY_PREFIX };

interface HotkeyState {
  lastPressedAt: number;
  isToggled: boolean;
}

const states = mirrored<Record<string, HotkeyState>>("ChatboxModule;Hotkey;States", {});

export class ChatboxHotkeyModule extends HotkeyConfig {
  constructor() {
    super(moduleValues("Hotkey"));
  }

  /** The settings tab reads this map directly to show what's pressed and toggled. */
  get hotkeyStates() {
    return new Map(Object.entries(get(states)));
  }

  setHotkey(name: string, accelerator: string): Promise<boolean> {
    return callModule("Hotkey", "setHotkey", name, accelerator);
  }

  removeHotkey(name: string): Promise<void> {
    return callModule("Hotkey", "removeHotkey", name);
  }
}
