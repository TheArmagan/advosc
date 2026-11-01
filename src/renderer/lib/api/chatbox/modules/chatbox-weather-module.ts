import { WeatherConfig } from "$shared/chatbox/modules/weather";
import type { WeatherLocation, WeatherSnapshot } from "$shared/chatbox/weather";
import { callModule, fire } from "../../engine";
import { moduleValues } from "../module-client";

export class ChatboxWeatherModule extends WeatherConfig {
  constructor() {
    super(moduleValues("Weather"));
  }

  getStatus(location: WeatherLocation): Promise<{ snapshot?: WeatherSnapshot; error?: string; online: boolean }> {
    return callModule("Weather", "getStatus", location);
  }

  invalidateCache() {
    fire("module.call", "Weather", "invalidateCache", []);
  }

  getPlaceholderValue(...params: string[]): Promise<string> {
    return callModule("Weather", "getPlaceholderValue", ...params);
  }
}
