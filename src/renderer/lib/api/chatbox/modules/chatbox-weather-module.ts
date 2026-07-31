import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import {
  defaultUnits,
  degreesToCompass,
  describeWeatherCode,
  fetchWeather,
  parseCoordinates,
  precipitationUnitLabels,
  searchLocations,
  temperatureUnitLabels,
  weatherCodeEmoji,
  windSpeedUnitLabels,
  type WeatherLocation,
  type WeatherSnapshot,
  type WeatherUnits,
} from "./weather/open-meteo";
// @ts-expect-error
import ChatboxWeatherSettings from "$lib/components/chatbox-editor/modules/chatbox-weather-settings.svelte";

const MIN_REFRESH_MINUTES = 1;
const MAX_REFRESH_MINUTES = 180;
const DEFAULT_REFRESH_MINUTES = 10;
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

export class ChatboxWeatherModule extends ChatboxModule {
  private weatherCache = new Map<string, WeatherCacheEntry>();
  private geocodeCache = new Map<string, GeocodeCacheEntry>();

  constructor() {
    super({
      id: "Weather",
      name: "Weather",
      description:
        "Live weather and forecast info.",
      Component: ChatboxWeatherSettings,
      examplePlaceholders: {
        "Temperature": {
          value: "21.4",
          description:
            "Current temperature. Leave the location empty to use your default location, or pass a saved location name, a place name, or 'lat,lon'.",
          fillText: "Weather;Temperature;${1:location}",
        },
        "FeelsLike": {
          value: "19.8",
          description: "Current apparent (feels like) temperature.",
          fillText: "Weather;FeelsLike;${1:location}",
        },
        "Condition": {
          value: "Partly cloudy",
          description: "Current weather condition as text.",
          fillText: "Weather;Condition;${1:location}",
        },
        "Emoji": {
          value: "⛅",
          description: "Current weather condition as an emoji, day and night aware.",
          fillText: "Weather;Emoji;${1:location}",
        },
        "Code": {
          value: "2",
          description: "Current WMO weather code.",
          fillText: "Weather;Code;${1:location}",
        },
        "Humidity": {
          value: "63",
          description: "Current relative humidity in percent.",
          fillText: "Weather;Humidity;${1:location}",
        },
        "Precipitation": {
          value: "0.2",
          description: "Precipitation of the last hour, in your chosen precipitation unit.",
          fillText: "Weather;Precipitation;${1:location}",
        },
        "Rain": {
          value: "0.2",
          description: "Rain of the last hour, in your chosen precipitation unit.",
          fillText: "Weather;Rain;${1:location}",
        },
        "Snowfall": {
          value: "0",
          description: "Snowfall of the last hour, in your chosen precipitation unit.",
          fillText: "Weather;Snowfall;${1:location}",
        },
        "WindSpeed": {
          value: "12",
          description: "Current wind speed in your chosen wind unit.",
          fillText: "Weather;WindSpeed;${1:location}",
        },
        "WindGusts": {
          value: "24",
          description: "Current wind gusts in your chosen wind unit.",
          fillText: "Weather;WindGusts;${1:location}",
        },
        "WindDirection": {
          value: "270",
          description: "Wind direction in degrees.",
          fillText: "Weather;WindDirection;${1:location}",
        },
        "WindCompass": {
          value: "W",
          description: "Wind direction as a compass point such as N, NE or WSW.",
          fillText: "Weather;WindCompass;${1:location}",
        },
        "CloudCover": {
          value: "48",
          description: "Cloud cover in percent.",
          fillText: "Weather;CloudCover;${1:location}",
        },
        "Pressure": {
          value: "1013",
          description: "Surface pressure in hPa.",
          fillText: "Weather;Pressure;${1:location}",
        },
        "IsDay": {
          value: "true",
          description: "Returns 'true' while it is daytime at the location.",
          fillText: "Weather;IsDay;${1:location}",
        },
        "High": {
          value: "24.1",
          description: "Highest temperature of the day. Day offset 0 is today, 1 is tomorrow, up to 6.",
          fillText: "Weather;High;${1:location};${2:0}",
        },
        "Low": {
          value: "12.6",
          description: "Lowest temperature of the day. Day offset 0 is today, 1 is tomorrow, up to 6.",
          fillText: "Weather;Low;${1:location};${2:0}",
        },
        "Sunrise": {
          value: "1700000000000",
          description:
            "Sunrise time in milliseconds since the Unix epoch. Format it with {{Time;Timestamp;...;HH:mm}}.",
          fillText: "Weather;Sunrise;${1:location};${2:0}",
        },
        "Sunset": {
          value: "1700000000000",
          description:
            "Sunset time in milliseconds since the Unix epoch. Format it with {{Time;Timestamp;...;HH:mm}}.",
          fillText: "Weather;Sunset;${1:location};${2:0}",
        },
        "UVIndex": {
          value: "5.3",
          description: "Maximum UV index of the day.",
          fillText: "Weather;UVIndex;${1:location};${2:0}",
        },
        "PrecipitationChance": {
          value: "40",
          description: "Highest chance of precipitation for the day, in percent.",
          fillText: "Weather;PrecipitationChance;${1:location};${2:0}",
        },
        "PrecipitationSum": {
          value: "3.4",
          description: "Total precipitation of the day, in your chosen precipitation unit.",
          fillText: "Weather;PrecipitationSum;${1:location};${2:0}",
        },
        "DailyCondition": {
          value: "Slight rain",
          description: "Condition text for the whole day.",
          fillText: "Weather;DailyCondition;${1:location};${2:0}",
        },
        "DailyEmoji": {
          value: "🌦️",
          description: "Condition emoji for the whole day.",
          fillText: "Weather;DailyEmoji;${1:location};${2:0}",
        },
        "DailyCode": {
          value: "61",
          description: "WMO weather code for the whole day.",
          fillText: "Weather;DailyCode;${1:location};${2:0}",
        },
        "Date": {
          value: "2023-11-14",
          description: "Local calendar date of the given day offset.",
          fillText: "Weather;Date;${1:location};${2:0}",
        },
        "Location": {
          value: "Berlin, Berlin, DE",
          description: "Name of the resolved location.",
          fillText: "Weather;Location;${1:location}",
        },
        "Latitude": {
          value: "52.52",
          description: "Latitude of the resolved location.",
          fillText: "Weather;Latitude;${1:location}",
        },
        "Longitude": {
          value: "13.41",
          description: "Longitude of the resolved location.",
          fillText: "Weather;Longitude;${1:location}",
        },
        "Timezone": {
          value: "Europe/Berlin",
          description: "Timezone reported for the location.",
          fillText: "Weather;Timezone;${1:location}",
        },
        "UpdatedAt": {
          value: "1700000000000",
          description: "When the weather data was last fetched, in milliseconds since the Unix epoch.",
          fillText: "Weather;UpdatedAt;${1:location}",
        },
        "IsOnline": {
          value: "true",
          description: "Returns 'true' when weather data for the location was fetched successfully.",
          fillText: "Weather;IsOnline;${1:location}",
        },
        "Unit": {
          value: "°C",
          description:
            "Unit symbol for the chosen kind: Temperature, Wind or Precipitation. This key takes the kind instead of a location.",
          fillText: "Weather;Unit;${1|Temperature,Wind,Precipitation|}",
        },
      },
    });
  }

  // -------------------------------------------------------------- settings

  getLocations(): Record<string, WeatherLocation> {
    return this.getValues().locations || {};
  }

  setLocation(name: string, location: WeatherLocation) {
    const values = this.getValues();
    const locations = { ...(values.locations || {}), [name]: location };
    this.values.set({
      ...values,
      locations,
      // The first saved location becomes the default so placeholders work right away.
      defaultLocation: values.defaultLocation || name,
    });
  }

  removeLocation(name: string) {
    const values = this.getValues();
    const locations = { ...(values.locations || {}) };
    delete locations[name];
    const defaultLocation =
      values.defaultLocation === name ? Object.keys(locations)[0] : values.defaultLocation;
    this.values.set({ ...values, locations, defaultLocation });
  }

  getDefaultLocationName(): string {
    const values = this.getValues();
    const locations = values.locations || {};
    if (values.defaultLocation && locations[values.defaultLocation]) return values.defaultLocation;
    return Object.keys(locations)[0] ?? "";
  }

  setDefaultLocationName(name: string) {
    this.values.set({ ...this.getValues(), defaultLocation: name });
  }

  getUnits(): WeatherUnits {
    return { ...defaultUnits, ...(this.getValues().units || {}) };
  }

  setUnits(units: Partial<WeatherUnits>) {
    const values = this.getValues();
    this.values.set({ ...values, units: { ...this.getUnits(), ...units } });
  }

  getRefreshMinutes(): number {
    const raw = Number(this.getValues().refreshMinutes);
    if (!isFinite(raw) || raw <= 0) return DEFAULT_REFRESH_MINUTES;
    return Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, Math.round(raw)));
  }

  setRefreshMinutes(minutes: number) {
    this.values.set({ ...this.getValues(), refreshMinutes: minutes });
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

  getCleanValues(): Record<string, any> {
    return {
      locations: this.getLocations(),
      defaultLocation: this.getDefaultLocationName(),
      units: this.getUnits(),
      refreshMinutes: this.getRefreshMinutes(),
    };
  }
}
