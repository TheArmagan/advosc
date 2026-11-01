import { moduleValues } from "../module-values";
import { HOTKEY_PREFIX, HotkeyConfig } from "$shared/chatbox/modules/hotkey";
import { writable } from "$shared/store";
import { mirror } from "../../sync/hub";
import { chatbox } from "..";
import type { PlaceholdersRecord } from "$shared/chatbox/module-base";
import { shortcuts, type ShortcutTriggerEvent } from "../../shortcuts";

interface HotkeyState {
  lastPressedAt: number;
  isToggled: boolean;
}

export { HOTKEY_PREFIX };

export class ChatboxHotkeyModule extends HotkeyConfig {
  private hotkeyStates = new Map<string, HotkeyState>();
  /** What the settings tab reads. Only changes on a key press. */
  private statesStore = writable<Record<string, HotkeyState>>({});
  private unsubscribe: (() => void) | null = null;
  private syncQueue: Promise<void> = Promise.resolve();

  constructor() {
    super(moduleValues("Hotkey"));

    mirror("ChatboxModule;Hotkey;States", this.statesStore, 50);

    // Subscribe to shortcut triggers
    this.unsubscribe = shortcuts.onTriggered((event) => this.handleShortcutTriggered(event));

    // Initialize hotkeys from stored values, then keep the shortcuts system matched to them.
    this.queueSync(this.getHotkeys());
    this.onValuesChange((values) => this.queueSync(values.hotkeys || {}));
  }

  /** Runs one sync at a time, so two quick edits can't interleave their registrations. */
  private queueSync(hotkeys: Record<string, string>) {
    this.syncQueue = this.syncQueue
      .then(() => this.syncHotkeysToShortcuts(hotkeys))
      .catch((error) => console.error("Hotkey sync failed:", error));
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
    this.statesStore.set(Object.fromEntries(this.hotkeyStates));
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

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.hotkeyStates.clear();
  }
}
