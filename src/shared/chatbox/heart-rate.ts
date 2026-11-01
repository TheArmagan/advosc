/** Heart rate source shapes and platform metadata, used by the engine and the settings UI. */

export type HeartRatePlatform = "pulsoid" | "hyperate" | "stromno" | "websocket" | "ble";

/** A user-configured heart rate feed. `name` is the key used in placeholders. */
export interface HeartRateSource {
  platform: HeartRatePlatform;
  /** Pulsoid access token, HypeRate API key, or Stromno widget id. */
  token: string;
  /** HypeRate session/channel id. Unused by the other platforms. */
  channel?: string;
  /** Custom WebSocket URL (websocket platform only). */
  url?: string;
  /** Dot path into the received JSON, e.g. `data.heartRate` (websocket platform only). */
  jsonPath?: string;
  /** Bluetooth device address, `AA:BB:CC:DD:EE:FF` (ble platform only). */
  address?: string;
}

/** Extras only the BLE devices report. Every field is optional by design. */
export interface HeartRateExtras {
  battery?: number;
  /** Null when the device does not report skin contact at all. */
  contact?: boolean | null;
  deviceName?: string;
  sensorLocation?: string;
  rrIntervalsMs?: number[];
}

export interface PlatformFieldMeta {
  key: "token" | "channel" | "url" | "jsonPath" | "address";
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
  hint?: string;
  /** Renders a dedicated control instead of a text input. */
  kind?: "text" | "bleDevice";
}

export interface PlatformMeta {
  id: HeartRatePlatform;
  label: string;
  description: string;
  fields: PlatformFieldMeta[];
}

export const heartRatePlatforms: PlatformMeta[] = [
  {
    id: "pulsoid",
    label: "Pulsoid",
    description: "pulsoid.net: paste the access token from your Pulsoid widget/API page.",
    fields: [
      { key: "token", label: "Access Token", placeholder: "00000000-0000-0000-0000-000000000000", secret: true },
    ],
  },
  {
    id: "hyperate",
    label: "HypeRate",
    description: "hyperate.io: needs an API key plus the session id shown in the app.",
    fields: [
      { key: "token", label: "API Key", placeholder: "Your HypeRate API key", secret: true },
      { key: "channel", label: "Session ID", placeholder: "e.g. internal-testing" },
    ],
  },
  {
    id: "stromno",
    label: "Stromno",
    description: "stromno.com: paste the widget id from your Stromno realtime widget URL.",
    fields: [
      { key: "token", label: "Widget ID", placeholder: "Your Stromno widget id", secret: true },
    ],
  },
  {
    id: "ble",
    label: "Bluetooth (BLE)",
    description:
      "A band or chest strap that broadcasts the standard heart rate service. Scan and pick your device below.",
    fields: [
      {
        key: "address",
        label: "Device",
        placeholder: "AA:BB:CC:DD:EE:FF",
        kind: "bleDevice",
        hint: "Your device has to be broadcasting heart rate. On Xiaomi bands turn on Bluetooth broadcast in the heart rate settings, and do not pair the band in Windows Settings.",
      },
    ],
  },
  {
    id: "websocket",
    label: "Custom WebSocket",
    description: "Any WebSocket that pushes a BPM value. Works with HR bridges and self-hosted feeds.",
    fields: [
      { key: "url", label: "WebSocket URL", placeholder: "ws://127.0.0.1:8000/hr" },
      {
        key: "jsonPath",
        label: "JSON Path",
        placeholder: "data.heartRate",
        optional: true,
        hint: "Leave empty if the socket sends a bare number. Use dots for nesting, e.g. data.heartRate.",
      },
    ],
  },
];

export function getPlatformMeta(platform: HeartRatePlatform): PlatformMeta {
  return heartRatePlatforms.find((item) => item.id === platform) ?? heartRatePlatforms[0];
}

/** True when the source has everything its platform needs to connect. */
export function isSourceConfigured(source: HeartRateSource): boolean {
  return getPlatformMeta(source.platform).fields
    .filter((field) => !field.optional)
    .every((field) => !!(source[field.key] || "").trim());
}
