import { ChatboxModule, type ChatboxModuleOptions } from "../module-base";
import type { Writable } from "../../store";
import { defaultUnits, type WeatherLocation, type WeatherUnits } from "../weather";

const MIN_REFRESH_MINUTES = 1;
const MAX_REFRESH_MINUTES = 180;
const DEFAULT_REFRESH_MINUTES = 10;

export const weatherOptions: ChatboxModuleOptions = {
  id: "Weather",
  name: "Weather",
  description:
    "Live weather and forecast info.",
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
  inputs: [
    { id: "refresh", label: "Refresh", description: "Fetches the weather again on its next read.", params: [] },
  ],
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class WeatherConfig extends ChatboxModule {
  constructor(values: Writable<Record<string, any>>) {
    super(weatherOptions, values);
  }

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

  getCleanValues(): Record<string, any> {
    return {
      locations: this.getLocations(),
      defaultLocation: this.getDefaultLocationName(),
      units: this.getUnits(),
      refreshMinutes: this.getRefreshMinutes(),
    };
  }
}
