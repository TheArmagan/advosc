/**
 * Thin client for the free, key-less Open-Meteo APIs (open-meteo.com).
 * Forecast: https://api.open-meteo.com/v1/forecast
 * Geocoding: https://geocoding-api.open-meteo.com/v1/search
 */

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

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "cloud_cover",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
];

const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "sunrise",
  "sunset",
  "uv_index_max",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
];

function num(value: unknown): number {
  const parsed = Number(value);
  return isFinite(parsed) ? parsed : NaN;
}

/**
 * The API returns local wall-clock ISO strings (no offset) when `timezone=auto`,
 * so the location's own UTC offset has to be applied to get a real timestamp.
 */
function localIsoToMillis(iso: string | undefined, utcOffsetSeconds: number): number {
  if (!iso) return NaN;
  const parsed = Date.parse(`${iso}Z`);
  if (isNaN(parsed)) return NaN;
  return parsed - utcOffsetSeconds * 1000;
}

export async function fetchWeather(
  location: WeatherLocation,
  units: WeatherUnits,
  signal?: AbortSignal
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: CURRENT_FIELDS.join(","),
    daily: DAILY_FIELDS.join(","),
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: units.temperature,
    wind_speed_unit: units.windSpeed,
    precipitation_unit: units.precipitation,
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Open-Meteo responded with ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data?.error) throw new Error(data.reason || "Open-Meteo returned an error");

  const utcOffsetSeconds = num(data.utc_offset_seconds) || 0;
  const current = data.current ?? {};
  const daily = data.daily ?? {};
  const dailyTimes: string[] = Array.isArray(daily.time) ? daily.time : [];

  return {
    timezone: data.timezone || "UTC",
    utcOffsetSeconds,
    fetchedAt: Date.now(),
    current: {
      time: localIsoToMillis(current.time, utcOffsetSeconds),
      temperature: num(current.temperature_2m),
      apparentTemperature: num(current.apparent_temperature),
      humidity: num(current.relative_humidity_2m),
      isDay: num(current.is_day) === 1,
      precipitation: num(current.precipitation),
      rain: num(current.rain),
      showers: num(current.showers),
      snowfall: num(current.snowfall),
      weatherCode: num(current.weather_code),
      cloudCover: num(current.cloud_cover),
      pressure: num(current.surface_pressure),
      windSpeed: num(current.wind_speed_10m),
      windDirection: num(current.wind_direction_10m),
      windGusts: num(current.wind_gusts_10m),
    },
    daily: dailyTimes.map((date, i) => ({
      date,
      weatherCode: num(daily.weather_code?.[i]),
      temperatureMax: num(daily.temperature_2m_max?.[i]),
      temperatureMin: num(daily.temperature_2m_min?.[i]),
      apparentTemperatureMax: num(daily.apparent_temperature_max?.[i]),
      apparentTemperatureMin: num(daily.apparent_temperature_min?.[i]),
      sunrise: localIsoToMillis(daily.sunrise?.[i], utcOffsetSeconds),
      sunset: localIsoToMillis(daily.sunset?.[i], utcOffsetSeconds),
      uvIndexMax: num(daily.uv_index_max?.[i]),
      precipitationSum: num(daily.precipitation_sum?.[i]),
      precipitationProbabilityMax: num(daily.precipitation_probability_max?.[i]),
      windSpeedMax: num(daily.wind_speed_10m_max?.[i]),
    })),
  };
}

export async function searchLocations(
  query: string,
  count = 8,
  signal?: AbortSignal
): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    name: trimmed,
    count: String(count),
    format: "json",
  });

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Geocoding responded with ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results: any[] = Array.isArray(data?.results) ? data.results : [];

  return results.map((result) => ({
    latitude: num(result.latitude),
    longitude: num(result.longitude),
    label: [result.name, result.admin1, result.country_code || result.country]
      .filter(Boolean)
      .join(", "),
    country: result.country,
    admin1: result.admin1,
    timezone: result.timezone,
  }));
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
