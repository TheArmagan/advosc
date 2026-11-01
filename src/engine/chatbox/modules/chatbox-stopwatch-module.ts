import { moduleValues } from "../module-values";
import { StopwatchConfig } from "$shared/chatbox/modules/stopwatch";
import { writable } from "$shared/store";
import { mirror } from "../../sync/hub";
import { chatbox } from "..";
import type { PlaceholdersRecord } from "$shared/chatbox/module-base";
import { shortcuts, type ShortcutTriggerEvent } from "../../shortcuts";
import { HOTKEY_PREFIX } from "$shared/chatbox/modules/hotkey";
import { isReadOnly } from "../eval-context";

interface StopwatchState {
  startTime: number;      // When the stopwatch was started (0 = not started)
  pausedTime: number;     // Accumulated time when paused (in ms)
  isPaused: boolean;      // Whether currently paused
  isRunning: boolean;     // Whether the stopwatch is active
}

export class StopwatchModule extends StopwatchConfig {
  private stopwatches = new Map<string, StopwatchState>();
  /** What the settings tab reads. Holds start times, so it only changes on an action. */
  private statesStore = writable<Record<string, StopwatchState>>({});
  /** Names in the last config seen. See `syncStopwatchStates`. */
  private configuredNames = new Set<string>();
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super(moduleValues("Stopwatch"));

    // Subscribe to shortcut triggers from the Hotkey module
    this.unsubscribe = shortcuts.onTriggered((event) => this.handleShortcutTriggered(event));

    mirror("ChatboxModule;Stopwatch;States", this.statesStore, 50);

    // Initialize stopwatch states from stored configs
    this.syncStopwatchStates();

    // Watch for value changes to sync stopwatch states
    this.onValuesChange(() => this.syncStopwatchStates());
  }

  private publishStates() {
    this.statesStore.set(Object.fromEntries(this.stopwatches));
  }

  /**
   * Sync in-memory stopwatch states with stored configs
   */
  private syncStopwatchStates(): void {
    const configs = this.getStopwatchConfigs();
    const configNames = new Set(Object.keys(configs));

    // Only drop names that were in the previous config. A stopwatch a template reads without
    // ever configuring it lives here too, and has to survive unrelated settings changes.
    for (const name of this.configuredNames) {
      if (!configNames.has(name)) {
        this.stopwatches.delete(name);
      }
    }
    this.configuredNames = configNames;

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
    this.publishStates();
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
    this.publishStates();
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
    this.publishStates();
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
    this.publishStates();
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
    this.publishStates();
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
    this.publishStates();
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

  runInput(inputId: string, args: Record<string, string>) {
    const name = args.name ?? "";
    if (!name) return;

    switch (inputId) {
      case "start": return this.startStopwatch(name);
      case "pause": return this.pauseStopwatch(name);
      case "toggle": return this.toggleStopwatch(name);
      case "reset": return this.resetStopwatch(name);
      case "stop": return this.stopStopwatch(name);
      case "resetStart": return this.resetStartStopwatch(name);
      default: return super.runInput(inputId, args);
    }
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    // Reading a stopwatch creates it, so a read-only evaluation of a name that doesn't exist
    // answers as if it did and leaves nothing behind.
    if (isReadOnly() && params[0] && !this.stopwatches.has(params[0])) {
      switch (key) {
        case "ElapsedMs": return "0";
        case "IsRunning":
        case "IsPaused": return "false";
        default: return "";
      }
    }

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

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.stopwatches.clear();
  }
}
