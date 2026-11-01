import { moduleValues } from "../module-values";
import { WeatherConfig } from "$shared/chatbox/modules/weather";
import { chatbox } from "..";
import type { PlaceholdersRecord } from "$shared/chatbox/module-base";
import { canReachNetwork } from "../eval-context";
import {
  degreesToCompass,
  describeWeatherCode,
  parseCoordinates,
  precipitationUnitLabels,
  temperatureUnitLabels,
  weatherCodeEmoji,
  windSpeedUnitLabels,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherUnits,
} from "$shared/chatbox/weather";
import { fetchWeather, searchLocations } from "./weather/open-meteo";

/** How long a place name typed straight into a placeholder stays resolved. */
const GEOCODE_TTL = 24 * 60 * 60 * 1000;
/** Backoff after a failed request so a broken connection does not hammer the API. */
const ERROR_RETRY_DELAY = 60 * 1000;

interface WeatherCacheEntry {
  snapshot?: WeatherSnapshot;
  error?: string;
  lastAttempt: number;
  pending?: Promise<void>;
}

interface GeocodeCacheEntry {
  location: WeatherLocation | null;
  resolvedAt: number;
  pending?: Promise<WeatherLocation | null>;
}

export class ChatboxWeatherModule extends WeatherConfig {
  private weatherCache = new Map<string, WeatherCacheEntry>();
  private geocodeCache = new Map<string, GeocodeCacheEntry>();

  constructor() {
    super(moduleValues("Weather"));
  }

  // ------------------------------------------------------------- resolving

  /**
   * Turns the location parameter into coordinates. Empty falls back to the default
   * location, a saved name wins over everything else, then `lat,lon`, and finally a
   * place name that gets geocoded (and cached, so templates can use it every tick).
   */
  async resolveLocation(input: string): Promise<WeatherLocation | null> {
    const query = (input || "").trim();
    const locations = this.getLocations();

    if (!query) {
      const name = this.getDefaultLocationName();
      return name ? locations[name] ?? null : null;
    }

    if (locations[query]) return locations[query];

    const coordinates = parseCoordinates(query);
    if (coordinates) return coordinates;

    return await this.geocode(query);
  }

  private async geocode(query: string): Promise<WeatherLocation | null> {
    const key = query.toLowerCase();
    const cached = this.geocodeCache.get(key);
    const now = Date.now();

    // A preview runs on every keystroke, so a half-typed place name stays off the network.
    if (!canReachNetwork()) return cached?.location ?? null;

    if (cached) {
      if (cached.pending) return await cached.pending;
      if (now - cached.resolvedAt < GEOCODE_TTL) return cached.location;
    }

    const pending = (async () => {
      try {
        const results = await searchLocations(query, 1);
        const location = results[0] ?? null;
        this.geocodeCache.set(key, { location, resolvedAt: Date.now() });
        return location;
      } catch (e) {
        console.warn("Weather", "Failed to geocode", query, e);
        // Cache the miss briefly so a typo does not fire a request every render.
        this.geocodeCache.set(key, { location: null, resolvedAt: Date.now() - GEOCODE_TTL + ERROR_RETRY_DELAY });
        return null;
      }
    })();

    this.geocodeCache.set(key, { location: cached?.location ?? null, resolvedAt: cached?.resolvedAt ?? 0, pending });
    try {
      return await pending;
    } finally {
      const entry = this.geocodeCache.get(key);
      if (entry?.pending === pending) delete entry.pending;
    }
  }

  // -------------------------------------------------------------- fetching

  private cacheKey(location: WeatherLocation, units: WeatherUnits): string {
    return [
      location.latitude.toFixed(4),
      location.longitude.toFixed(4),
      units.temperature,
      units.windSpeed,
      units.precipitation,
    ].join("|");
  }

  /**
   * Returns cached weather, refreshing in the background once it goes stale. Only the
   * very first read for a location waits on the network, so renders stay cheap.
   */
  async getSnapshot(location: WeatherLocation): Promise<WeatherCacheEntry> {
    const units = this.getUnits();
    const key = this.cacheKey(location, units);

    if (!canReachNetwork()) return this.weatherCache.get(key) ?? { lastAttempt: 0 };

    const entry: WeatherCacheEntry = this.weatherCache.get(key) ?? { lastAttempt: 0 };
    this.weatherCache.set(key, entry);

    const now = Date.now();
    const maxAge = entry.error && !entry.snapshot
      ? ERROR_RETRY_DELAY
      : this.getRefreshMinutes() * 60 * 1000;
    const isStale = now - entry.lastAttempt >= maxAge;

    if (isStale && !entry.pending) {
      entry.lastAttempt = now;
      entry.pending = (async () => {
        try {
          entry.snapshot = await fetchWeather(location, units);
          entry.error = undefined;
        } catch (e) {
          entry.error = (e as Error).message || String(e);
          console.warn("Weather", "Failed to fetch weather", location.label, e);
        } finally {
          entry.lastAttempt = Date.now();
          delete entry.pending;
        }
      })();
    }

    // Nothing cached yet, so this read has to wait for the first response.
    if (!entry.snapshot && entry.pending) await entry.pending;

    return entry;
  }

  /** Forces the next read to hit the network again. Used by the settings tab. */
  invalidateCache() {
    this.weatherCache.clear();
  }

  runInput(inputId: string, args: Record<string, string>) {
    if (inputId !== "refresh") return super.runInput(inputId, args);
    this.invalidateCache();
  }

  async getStatus(location: WeatherLocation) {
    const entry = await this.getSnapshot(location);
    return {
      snapshot: entry.snapshot,
      error: entry.error,
      online: !!entry.snapshot && !entry.error,
    };
  }

  // ---------------------------------------------------------- placeholders

  private format(value: number, decimals = 1): string {
    if (!isFinite(value)) return "";
    const fixed = value.toFixed(decimals);
    // Trim the decimal part when it carries nothing, so 21.0 reads as 21.
    if (!fixed.includes(".")) return fixed;
    return fixed.replace(/\.?0+$/, "") || "0";
  }

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    try {
      if (key === "Unit") {
        const units = this.getUnits();
        switch ((params[0] || "Temperature").toLowerCase()) {
          case "temperature": return temperatureUnitLabels[units.temperature];
          case "wind":
          case "windspeed": return windSpeedUnitLabels[units.windSpeed];
          case "precipitation": return precipitationUnitLabels[units.precipitation];
          default: return "";
        }
      }

      const location = await this.resolveLocation(params[0] || "");
      if (!location) {
        if (key === "IsOnline") return "false";
        return "";
      }

      switch (key) {
        case "Location": return location.label;
        case "Latitude": return String(location.latitude);
        case "Longitude": return String(location.longitude);
      }

      const entry = await this.getSnapshot(location);
      const snapshot = entry.snapshot;

      if (key === "IsOnline") return snapshot && !entry.error ? "true" : "false";
      if (!snapshot) return "";

      const current = snapshot.current;

      switch (key) {
        case "Temperature": return this.format(current.temperature);
        case "FeelsLike": return this.format(current.apparentTemperature);
        case "Humidity": return this.format(current.humidity, 0);
        case "Precipitation": return this.format(current.precipitation, 2);
        case "Rain": return this.format(current.rain + current.showers, 2);
        case "Snowfall": return this.format(current.snowfall, 2);
        case "WindSpeed": return this.format(current.windSpeed);
        case "WindGusts": return this.format(current.windGusts);
        case "WindDirection": return this.format(current.windDirection, 0);
        case "WindCompass": return degreesToCompass(current.windDirection);
        case "CloudCover": return this.format(current.cloudCover, 0);
        case "Pressure": return this.format(current.pressure, 0);
        case "IsDay": return current.isDay ? "true" : "false";
        case "Code": return this.format(current.weatherCode, 0);
        case "Condition": return describeWeatherCode(current.weatherCode);
        case "Emoji": return weatherCodeEmoji(current.weatherCode, current.isDay);
        case "Timezone": return snapshot.timezone;
        case "UpdatedAt": return String(snapshot.fetchedAt);
      }

      const dayOffset = Math.max(0, Math.min(snapshot.daily.length - 1, parseInt(params[1] || "0") || 0));
      const day = snapshot.daily[dayOffset];
      if (!day) return "";

      switch (key) {
        case "High": return this.format(day.temperatureMax);
        case "Low": return this.format(day.temperatureMin);
        case "FeelsLikeHigh": return this.format(day.apparentTemperatureMax);
        case "FeelsLikeLow": return this.format(day.apparentTemperatureMin);
        case "Sunrise": return isFinite(day.sunrise) ? String(day.sunrise) : "";
        case "Sunset": return isFinite(day.sunset) ? String(day.sunset) : "";
        case "UVIndex": return this.format(day.uvIndexMax);
        case "PrecipitationChance": return this.format(day.precipitationProbabilityMax, 0);
        case "PrecipitationSum": return this.format(day.precipitationSum, 2);
        case "MaxWindSpeed": return this.format(day.windSpeedMax);
        case "DailyCode": return this.format(day.weatherCode, 0);
        case "DailyCondition": return describeWeatherCode(day.weatherCode);
        case "DailyEmoji": return weatherCodeEmoji(day.weatherCode, true);
        case "Date": return day.date;
      }

      return "";
    } catch (e) {
      return `(Weather error: ${e})`;
    }
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const placeholders: PlaceholdersRecord = {};

    for (const [name, location] of Object.entries(this.getLocations())) {
      placeholders[`Temperature;${name}`] = {
        value: "21.4",
        description: `Current temperature in ${location.label}.`,
        fillText: `Weather;Temperature;${name}`,
      };
      placeholders[`Condition;${name}`] = {
        value: "Partly cloudy",
        description: `Current condition in ${location.label}.`,
        fillText: `Weather;Condition;${name}`,
      };
      placeholders[`Emoji;${name}`] = {
        value: "⛅",
        description: `Current condition emoji for ${location.label}.`,
        fillText: `Weather;Emoji;${name}`,
      };
      placeholders[`High;${name}`] = {
        value: "24.1",
        description: `Today's highest temperature in ${location.label}.`,
        fillText: `Weather;High;${name};0`,
      };
      placeholders[`Low;${name}`] = {
        value: "12.6",
        description: `Today's lowest temperature in ${location.label}.`,
        fillText: `Weather;Low;${name};0`,
      };
    }

    return placeholders;
  }

}
