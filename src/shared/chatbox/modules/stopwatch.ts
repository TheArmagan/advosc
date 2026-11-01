import { ChatboxModule, type ChatboxModuleOptions, type ModuleInputParam } from "../module-base";
import type { Writable } from "../../store";

const stopwatchParam: ModuleInputParam = { id: "name", label: "Stopwatch", type: "text", placeholder: "stopwatchName" };

export interface StopwatchSettings {
  startHotkey: string;       // Hotkey name to start/resume
  pauseHotkey: string;       // Hotkey name to pause
  resetHotkey: string;       // Hotkey name to reset
  stopHotkey: string;        // Hotkey name to stop (reset + pause)
  resetStartHotkey: string;  // Hotkey name to reset and immediately start
}

export const stopwatchOptions: ChatboxModuleOptions = {
  id: "Stopwatch",
  name: "Stopwatch",
  description: "Provides stopwatch/timer functionality controlled by hotkeys from the Hotkey module.",
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
  },
  inputs: [
    {
      id: "start",
      label: "Start",
      description: "Starts the stopwatch, or resumes it if it's paused.",
      params: [stopwatchParam],
    },
    {
      id: "pause",
      label: "Pause",
      description: "Pauses the stopwatch and keeps its time.",
      params: [stopwatchParam],
    },
    {
      id: "toggle",
      label: "Start or pause",
      description: "Pauses the stopwatch if it's running, otherwise starts it.",
      params: [stopwatchParam],
    },
    {
      id: "reset",
      label: "Reset",
      description: "Sets the time back to zero. A running stopwatch keeps running.",
      params: [stopwatchParam],
    },
    {
      id: "stop",
      label: "Stop",
      description: "Stops the stopwatch and sets the time back to zero.",
      params: [stopwatchParam],
    },
    {
      id: "resetStart",
      label: "Reset and start",
      description: "Sets the time back to zero and starts straight away.",
      params: [stopwatchParam],
    },
  ],
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class StopwatchConfig extends ChatboxModule {
  constructor(values: Writable<Record<string, any>>) {
    super(stopwatchOptions, values);
  }

  /**
   * Get all stopwatch configurations
   */
  getStopwatchConfigs(): Record<string, StopwatchSettings> {
    return this.getValues().stopwatches || {};
  }

  /**
   * Set a stopwatch configuration
   */
  setStopwatchConfig(name: string, config: Partial<StopwatchSettings>): void {
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


    this.values.set({
      ...values,
      stopwatches
    });
  }

  getCleanValues(): Record<string, any> {
    return {
      stopwatches: this.getStopwatchConfigs()
    };
  }
}
