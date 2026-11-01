import type { GeocodingResult } from "$shared/chatbox/weather";
import { call } from "../../../engine";

export * from "$shared/chatbox/weather";

export function searchLocations(query: string, count?: number): Promise<GeocodingResult[]> {
  return call("weather.searchLocations", query, count);
}
