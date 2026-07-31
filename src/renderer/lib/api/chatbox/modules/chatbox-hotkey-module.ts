import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import { shortcuts, type ShortcutTriggerEvent } from "../../shortcuts";
// @ts-expect-error
import ChatboxHotkeySettings from "$lib/components/chatbox-editor/modules/chatbox-hotkey-settings.svelte";

interface HotkeyState {
  lastPressedAt: number;
  isToggled: boolean;
}

export const HOTKEY_PREFIX = "HotkeyModule;";

export class ChatboxHotkeyModule extends ChatboxModule {
  private hotkeyStates = new Map<string, HotkeyState>();
  private unsubscribe: (() => void) | null = null;
  private isInitialized = false;

  constructor() {
    super({
      id: "Hotkey",
      name: "Hotkey",
      description: "Provides hotkey/shortcut state information for chatbox placeholders.",
      Component: ChatboxHotkeySettings,
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
    });

    // Subscribe to shortcut triggers
    this.unsubscribe = shortcuts.onTriggered((event) => this.handleShortcutTriggered(event));

    // Initialize hotkeys from stored values
    this.initializeHotkeys();

    // Watch for value changes to sync with shortcuts system
    this.onValuesChanged = (values) => {
      if (this.isInitialized) {
        this.syncHotkeysToShortcuts(values.hotkeys || {});
      }
    };
  }

  private async initializeHotkeys() {
    const values = this.getValues();
    const hotkeys = values.hotkeys || {};
    await this.syncHotkeysToShortcuts(hotkeys);
    this.isInitialized = true;
  }

  private async syncHotkeysToShortcuts(hotkeys: Record<string, string>) {
    // Get current registered hotkeys with our prefix
    const allTriggers = shortcuts.getAllTriggers();
    const currentHotkeys = new Set<string>();

    for (const name of Object.keys(allTriggers)) {
      if (name.startsWith(HOTKEY_PREFIX)) {
        currentHotkeys.add(name.slice(HOTKEY_PREFIX.length));
      }
    }

    // Remove hotkeys that are no longer in values
    for (const name of currentHotkeys) {
      if (!(name in hotkeys)) {
        await shortcuts.removeTrigger(`${HOTKEY_PREFIX}${name}`);
      }
    }

    // Add/update hotkeys from values
    for (const [name, accelerator] of Object.entries(hotkeys)) {
      if (accelerator) {
        await shortcuts.setTrigger(`${HOTKEY_PREFIX}${name}`, accelerator);
      }
    }
  }

  /**
   * Add or update a hotkey
   */
  async setHotkey(name: string, accelerator: string): Promise<boolean> {
    const fullName = `${HOTKEY_PREFIX}${name}`;
    const success = await shortcuts.setTrigger(fullName, accelerator);

    if (success) {
      const values = this.getValues();
      this.values.set({
        ...values,
        hotkeys: {
          ...(values.hotkeys || {}),
          [name]: accelerator
        }
      });
    }

    return success;
  }

  /**
   * Remove a hotkey
   */
  async removeHotkey(name: string): Promise<void> {
    const fullName = `${HOTKEY_PREFIX}${name}`;
    await shortcuts.removeTrigger(fullName);

    const values = this.getValues();
    const hotkeys = { ...(values.hotkeys || {}) };
    delete hotkeys[name];

    this.values.set({
      ...values,
      hotkeys
    });
  }

  /**
   * Get all hotkeys from values
   */
  getHotkeys(): Record<string, string> {
    return this.getValues().hotkeys || {};
  }

  private handleShortcutTriggered(event: ShortcutTriggerEvent): void {
    const { name } = event;

    // Only handle hotkeys with our prefix
    if (!name.startsWith(HOTKEY_PREFIX)) return;

    // Remove the prefix to get the user-facing hotkey name
    const hotkeyName = name.slice(HOTKEY_PREFIX.length);
    const currentState = this.hotkeyStates.get(hotkeyName) || { lastPressedAt: 0, isToggled: false };

    this.hotkeyStates.set(hotkeyName, {
      lastPressedAt: Date.now(),
      isToggled: !currentState.isToggled
    });
  }

  private getHotkeyState(hotkeyName: string): HotkeyState {
    if (!this.hotkeyStates.has(hotkeyName)) {
      this.hotkeyStates.set(hotkeyName, { lastPressedAt: 0, isToggled: false });
    }
    return this.hotkeyStates.get(hotkeyName)!;
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    switch (key) {
      case "IsPressed": {
        const hotkeyName = params[0];
        if (!hotkeyName) return "false";

        const timeoutMs = parseInt(params[1]) || 1000;
        const state = this.getHotkeyState(hotkeyName);
        const now = Date.now();

        // Check if the hotkey was pressed within the timeout period
        const isPressed = state.lastPressedAt > 0 && (now - state.lastPressedAt) < timeoutMs;
        return isPressed ? "true" : "false";
      }

      case "IsToggled": {
        const hotkeyName = params[0];
        if (!hotkeyName) return "false";

        const state = this.getHotkeyState(hotkeyName);
        return state.isToggled ? "true" : "false";
      }

      default:
        return "";
    }
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const hotkeys = this.getHotkeys();
    const placeholders: PlaceholdersRecord = {};

    for (const hotkeyName of Object.keys(hotkeys)) {
      placeholders[`IsPressed;${hotkeyName}`] = {
        value: "false",
        description: `Returns 'true' if "${hotkeyName}" was pressed within the timeout.`,
        fillText: `Hotkey;IsPressed;${hotkeyName};\${1:1000}`
      };
      placeholders[`IsToggled;${hotkeyName}`] = {
        value: "false",
        description: `Returns 'true' if "${hotkeyName}" toggle state is on.`,
        fillText: `Hotkey;IsToggled;${hotkeyName}`
      };
    }

    return placeholders;
  }

  getCleanValues(): Record<string, any> {
    return {
      hotkeys: this.getHotkeys()
    };
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.hotkeyStates.clear();
  }
}
