import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import { shortcuts, type ShortcutTriggerEvent } from "../../shortcuts";
import { HOTKEY_PREFIX } from "./chatbox-hotkey-module";
// @ts-expect-error
import ChatboxStopwatchSettings from "$lib/components/chatbox-editor/modules/chatbox-stopwatch-settings.svelte";

interface StopwatchState {
  startTime: number;      // When the stopwatch was started (0 = not started)
  pausedTime: number;     // Accumulated time when paused (in ms)
  isPaused: boolean;      // Whether currently paused
  isRunning: boolean;     // Whether the stopwatch is active
}

interface StopwatchConfig {
  startHotkey: string;       // Hotkey name to start/resume
  pauseHotkey: string;       // Hotkey name to pause
  resetHotkey: string;       // Hotkey name to reset
  stopHotkey: string;        // Hotkey name to stop (reset + pause)
  resetStartHotkey: string;  // Hotkey name to reset and immediately start
}

export class ChatboxStopwatchModule extends ChatboxModule {
  private stopwatches = new Map<string, StopwatchState>();
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super({
      id: "Stopwatch",
      name: "Stopwatch",
      description: "Provides stopwatch/timer functionality controlled by hotkeys from the Hotkey module.",
      Component: ChatboxStopwatchSettings,
      examplePlaceholders: {
        "ElapsedMs;StopwatchName": {
          value: "0",
          description: "Returns the elapsed time in milliseconds.",
          fillText: "Stopwatch;ElapsedMs;${1:stopwatchName}"
        },
        "IsRunning;StopwatchName": {
          value: "false",
          description: "Returns 'true' if the stopwatch is running, 'false' otherwise.",
          fillText: "Stopwatch;IsRunning;${1:stopwatchName}"
        },
        "IsPaused;StopwatchName": {
          value: "false",
          description: "Returns 'true' if the stopwatch is paused, 'false' otherwise.",
          fillText: "Stopwatch;IsPaused;${1:stopwatchName}"
        }
      }
    });

    // Subscribe to shortcut triggers from the Hotkey module
    this.unsubscribe = shortcuts.onTriggered((event) => this.handleShortcutTriggered(event));

    // Initialize stopwatch states from stored configs
    this.syncStopwatchStates();

    // Watch for value changes to sync stopwatch states
    this.onValuesChanged = () => {
      this.syncStopwatchStates();
    };
  }

  /**
   * Sync in-memory stopwatch states with stored configs
   */
  private syncStopwatchStates(): void {
    const configs = this.getStopwatchConfigs();
    const configNames = new Set(Object.keys(configs));

    // Remove states for stopwatches that no longer exist in config
    for (const name of this.stopwatches.keys()) {
      if (!configNames.has(name)) {
        this.stopwatches.delete(name);
      }
    }

    // Ensure all configured stopwatches have a state (don't overwrite existing)
    for (const name of configNames) {
      if (!this.stopwatches.has(name)) {
        this.stopwatches.set(name, {
          startTime: 0,
          pausedTime: 0,
          isPaused: false,
          isRunning: false
        });
      }
    }
  }

  /**
   * Get or create a stopwatch state
   */
  private getStopwatchState(name: string): StopwatchState {
    if (!this.stopwatches.has(name)) {
      this.stopwatches.set(name, {
        startTime: 0,
        pausedTime: 0,
        isPaused: false,
        isRunning: false
      });
    }
    return this.stopwatches.get(name)!;
  }

  /**
   * Get the elapsed time in milliseconds for a stopwatch
   */
  private getElapsedMs(name: string): number {
    const state = this.getStopwatchState(name);

    if (!state.isRunning) {
      return state.pausedTime;
    }

    if (state.isPaused) {
      return state.pausedTime;
    }

    return state.pausedTime + (Date.now() - state.startTime);
  }

  /**
   * Start or resume a stopwatch
   */
  startStopwatch(name: string): void {
    const state = this.getStopwatchState(name);

    if (state.isRunning && !state.isPaused) {
      // Already running, do nothing
      return;
    }

    state.startTime = Date.now();
    state.isRunning = true;
    state.isPaused = false;
  }

  /**
   * Pause a stopwatch
   */
  pauseStopwatch(name: string): void {
    const state = this.getStopwatchState(name);

    if (!state.isRunning || state.isPaused) {
      return;
    }

    // Save the accumulated time
    state.pausedTime += Date.now() - state.startTime;
    state.isPaused = true;
  }

  /**
   * Reset a stopwatch (keeps it running if it was running)
   */
  resetStopwatch(name: string): void {
    const state = this.getStopwatchState(name);

    state.pausedTime = 0;
    if (state.isRunning && !state.isPaused) {
      state.startTime = Date.now();
    }
  }

  /**
   * Stop a stopwatch (reset and pause)
   */
  stopStopwatch(name: string): void {
    const state = this.getStopwatchState(name);

    state.startTime = 0;
    state.pausedTime = 0;
    state.isPaused = false;
    state.isRunning = false;
  }

  /**
   * Toggle start/pause for a stopwatch
   */
  toggleStopwatch(name: string): void {
    const state = this.getStopwatchState(name);

    if (!state.isRunning || state.isPaused) {
      this.startStopwatch(name);
    } else {
      this.pauseStopwatch(name);
    }
  }

  /**
   * Reset and immediately start a stopwatch
   */
  resetStartStopwatch(name: string): void {
    const state = this.getStopwatchState(name);

    state.pausedTime = 0;
    state.startTime = Date.now();
    state.isRunning = true;
    state.isPaused = false;
  }

  private handleShortcutTriggered(event: ShortcutTriggerEvent): void {
    const { name } = event;

    // Only handle hotkeys with the Hotkey module prefix
    if (!name.startsWith(HOTKEY_PREFIX)) return;

    const hotkeyName = name.slice(HOTKEY_PREFIX.length);
    const configs = this.getStopwatchConfigs();

    // Check each stopwatch config to see if this hotkey matches
    for (const [stopwatchName, config] of Object.entries(configs)) {
      if (config.startHotkey === hotkeyName) {
        this.toggleStopwatch(stopwatchName);
      }
      if (config.pauseHotkey === hotkeyName) {
        this.pauseStopwatch(stopwatchName);
      }
      if (config.resetHotkey === hotkeyName) {
        this.resetStopwatch(stopwatchName);
      }
      if (config.stopHotkey === hotkeyName) {
        this.stopStopwatch(stopwatchName);
      }
      if (config.resetStartHotkey === hotkeyName) {
        this.resetStartStopwatch(stopwatchName);
      }
    }
  }

  /**
   * Get all stopwatch configurations
   */
  getStopwatchConfigs(): Record<string, StopwatchConfig> {
    return this.getValues().stopwatches || {};
  }

  /**
   * Set a stopwatch configuration
   */
  setStopwatchConfig(name: string, config: Partial<StopwatchConfig>): void {
    const values = this.getValues();
    const stopwatches = values.stopwatches || {};

    stopwatches[name] = {
      startHotkey: "",
      pauseHotkey: "",
      resetHotkey: "",
      stopHotkey: "",
      resetStartHotkey: "",
      ...stopwatches[name],
      ...config
    };

    this.values.set({
      ...values,
      stopwatches
    });
  }

  /**
   * Remove a stopwatch configuration
   */
  removeStopwatchConfig(name: string): void {
    const values = this.getValues();
    const stopwatches = { ...(values.stopwatches || {}) };
    delete stopwatches[name];

    // Also remove the state
    this.stopwatches.delete(name);

    this.values.set({
      ...values,
      stopwatches
    });
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    switch (key) {
      case "ElapsedMs": {
        const stopwatchName = params[0];
        if (!stopwatchName) return "0";

        return this.getElapsedMs(stopwatchName).toString();
      }

      case "IsRunning": {
        const stopwatchName = params[0];
        if (!stopwatchName) return "false";

        const state = this.getStopwatchState(stopwatchName);
        return (state.isRunning && !state.isPaused) ? "true" : "false";
      }

      case "IsPaused": {
        const stopwatchName = params[0];
        if (!stopwatchName) return "false";

        const state = this.getStopwatchState(stopwatchName);
        return state.isPaused ? "true" : "false";
      }

      default:
        return "";
    }
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const configs = this.getStopwatchConfigs();
    const placeholders: PlaceholdersRecord = {};

    for (const stopwatchName of Object.keys(configs)) {
      placeholders[`ElapsedMs;${stopwatchName}`] = {
        value: "0",
        description: `Elapsed milliseconds for "${stopwatchName}" stopwatch.`,
        fillText: `Stopwatch;ElapsedMs;${stopwatchName}`
      };
      placeholders[`IsRunning;${stopwatchName}`] = {
        value: "false",
        description: `Whether "${stopwatchName}" stopwatch is running.`,
        fillText: `Stopwatch;IsRunning;${stopwatchName}`
      };
      placeholders[`IsPaused;${stopwatchName}`] = {
        value: "false",
        description: `Whether "${stopwatchName}" stopwatch is paused.`,
        fillText: `Stopwatch;IsPaused;${stopwatchName}`
      };
    }

    return placeholders;
  }

  getCleanValues(): Record<string, any> {
    return {
      stopwatches: this.getStopwatchConfigs()
    };
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.stopwatches.clear();
  }
}
