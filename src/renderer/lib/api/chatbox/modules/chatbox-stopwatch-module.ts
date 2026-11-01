import { StopwatchConfig } from "$shared/chatbox/modules/stopwatch";
import { get } from "$shared/store";
import { fire, mirrored } from "../../engine";
import { moduleValues } from "../module-client";

interface StopwatchState {
  startTime: number;
  pausedTime: number;
  isPaused: boolean;
  isRunning: boolean;
}

const states = mirrored<Record<string, StopwatchState>>("ChatboxModule;Stopwatch;States", {});

export class StopwatchModule extends StopwatchConfig {
  constructor() {
    super(moduleValues("Stopwatch"));
  }

  /** The settings tab reads this map directly and works out elapsed time itself. */
  get stopwatches() {
    return new Map(Object.entries(get(states)));
  }

  startStopwatch(name: string) {
    fire("module.call", "Stopwatch", "startStopwatch", [name]);
  }

  pauseStopwatch(name: string) {
    fire("module.call", "Stopwatch", "pauseStopwatch", [name]);
  }

  resetStopwatch(name: string) {
    fire("module.call", "Stopwatch", "resetStopwatch", [name]);
  }

  stopStopwatch(name: string) {
    fire("module.call", "Stopwatch", "stopStopwatch", [name]);
  }
}
