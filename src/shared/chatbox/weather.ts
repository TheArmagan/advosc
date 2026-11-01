/** Shapes and pure helpers for Open-Meteo data. The network half lives in the engine. */

export type TemperatureUnit = "celsius" | "fahrenheit";
export type WindSpeedUnit = "kmh" | "ms" | "mph" | "kn";
export type PrecipitationUnit = "mm" | "inch";

export interface WeatherUnits {
  temperature: TemperatureUnit;
  windSpeed: WindSpeedUnit;
  precipitation: PrecipitationUnit;
}

export const defaultUnits: WeatherUnits = {
  temperature: "celsius",
  windSpeed: "kmh",
  precipitation: "mm",
};

export const temperatureUnitLabels: Record<TemperatureUnit, string> = {
  celsius: "°C",
  fahrenheit: "°F",
};

export const windSpeedUnitLabels: Record<WindSpeedUnit, string> = {
  kmh: "km/h",
  ms: "m/s",
  mph: "mph",
  kn: "kn",
};

export const precipitationUnitLabels: Record<PrecipitationUnit, string> = {
  mm: "mm",
  inch: "in",
};

export interface WeatherLocation {
  latitude: number;
  longitude: number;
  /** Human readable label shown in the UI and returned by the Location placeholder. */
  label: string;
}

export interface GeocodingResult extends WeatherLocation {
  country?: string;
  admin1?: string;
  timezone?: string;
}

export interface CurrentWeather {
  time: number;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  isDay: boolean;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weatherCode: number;
  cloudCover: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
}

export interface DailyWeather {
  /** Local calendar date of the entry, as returned by the API (yyyy-MM-dd). */
  date: string;
  weatherCode: number;
  temperatureMax: number;
  temperatureMin: number;
  apparentTemperatureMax: number;
  apparentTemperatureMin: number;
  sunrise: number;
  sunset: number;
  uvIndexMax: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
}

export interface WeatherSnapshot {
  current: CurrentWeather;
  daily: DailyWeather[];
  timezone: string;
  utcOffsetSeconds: number;
  fetchedAt: number;
}

/** Parses a `lat,lon` pair. Returns null when the text is not a coordinate pair. */
export function parseCoordinates(text: string): WeatherLocation | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return {
    latitude,
    longitude,
    label: `${latitude}, ${longitude}`,
  };
}

interface WeatherCodeInfo {
  text: string;
  /** Emoji for a daytime reading. */
  day: string;
  /** Emoji for a nighttime reading. */
  night: string;
}

/** WMO weather interpretation codes used by Open-Meteo. */
const weatherCodes: Record<number, WeatherCodeInfo> = {
  0: { text: "Clear sky", day: "☀️", night: "🌙" },
  1: { text: "Mainly clear", day: "🌤️", night: "🌙" },
  2: { text: "Partly cloudy", day: "⛅", night: "☁️" },
  3: { text: "Overcast", day: "☁️", night: "☁️" },
  45: { text: "Fog", day: "🌫️", night: "🌫️" },
  48: { text: "Depositing rime fog", day: "🌫️", night: "🌫️" },
  51: { text: "Light drizzle", day: "🌦️", night: "🌧️" },
  53: { text: "Moderate drizzle", day: "🌦️", night: "🌧️" },
  55: { text: "Dense drizzle", day: "🌧️", night: "🌧️" },
  56: { text: "Light freezing drizzle", day: "🌨️", night: "🌨️" },
  57: { text: "Dense freezing drizzle", day: "🌨️", night: "🌨️" },
  61: { text: "Slight rain", day: "🌦️", night: "🌧️" },
  63: { text: "Moderate rain", day: "🌧️", night: "🌧️" },
  65: { text: "Heavy rain", day: "🌧️", night: "🌧️" },
  66: { text: "Light freezing rain", day: "🌨️", night: "🌨️" },
  67: { text: "Heavy freezing rain", day: "🌨️", night: "🌨️" },
  71: { text: "Slight snow", day: "🌨️", night: "🌨️" },
  73: { text: "Moderate snow", day: "❄️", night: "❄️" },
  75: { text: "Heavy snow", day: "❄️", night: "❄️" },
  77: { text: "Snow grains", day: "🌨️", night: "🌨️" },
  80: { text: "Slight rain showers", day: "🌦️", night: "🌧️" },
  81: { text: "Moderate rain showers", day: "🌧️", night: "🌧️" },
  82: { text: "Violent rain showers", day: "⛈️", night: "⛈️" },
  85: { text: "Slight snow showers", day: "🌨️", night: "🌨️" },
  86: { text: "Heavy snow showers", day: "❄️", night: "❄️" },
  95: { text: "Thunderstorm", day: "⛈️", night: "⛈️" },
  96: { text: "Thunderstorm with slight hail", day: "⛈️", night: "⛈️" },
  99: { text: "Thunderstorm with heavy hail", day: "⛈️", night: "⛈️" },
};

export function describeWeatherCode(code: number): string {
  return weatherCodes[code]?.text ?? "Unknown";
}

export function weatherCodeEmoji(code: number, isDay = true): string {
  const info = weatherCodes[code];
  if (!info) return "❓";
  return isDay ? info.day : info.night;
}

const compassPoints = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function degreesToCompass(degrees: number): string {
  if (!isFinite(degrees)) return "";
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return compassPoints[index];
}
