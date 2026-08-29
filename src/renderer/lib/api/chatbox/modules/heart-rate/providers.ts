import PulsoidSocket from "@pulsoid/socket";

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

export interface HeartRateHandlers {
  onHeartRate: (bpm: number) => void;
  onOnline: () => void;
  onOffline: () => void;
  onError: (error: unknown) => void;
  onExtras?: (extras: HeartRateExtras) => void;
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

/** Reads `data.heartRate` style paths out of an arbitrary payload. */
function readJsonPath(payload: any, path: string): unknown {
  return path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => (acc == null ? acc : acc[part]), payload);
}

/** Pulls a plausible BPM out of a payload when no explicit path is configured. */
function guessHeartRate(payload: any): number | null {
  if (typeof payload === "number") return payload;
  if (typeof payload === "string") {
    const parsed = Number(payload.trim());
    return isNaN(parsed) ? null : parsed;
  }
  if (payload && typeof payload === "object") {
    for (const key of ["heartRate", "heart_rate", "hr", "bpm", "value"]) {
      const found = guessHeartRate(payload[key]);
      if (found !== null) return found;
    }
    for (const key of ["data", "payload", "measurement"]) {
      if (payload[key] !== undefined) {
        const found = guessHeartRate(payload[key]);
        if (found !== null) return found;
      }
    }
  }
  return null;
}

export abstract class HeartRateConnection {
  protected closed = false;

  constructor(
    protected source: HeartRateSource,
    protected handlers: HeartRateHandlers,
  ) {}

  abstract connect(): void;
  abstract disconnect(): void;
}

/**
 * Shared plumbing for the raw-WebSocket platforms: reconnect with backoff while the
 * source is still in use, plus an optional keepalive ping.
 */
abstract class BaseSocketConnection extends HeartRateConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;

  protected abstract getUrl(): string;
  protected abstract handleMessage(raw: string): void;
  /** Sent right after the socket opens (HypeRate channel join). */
  protected getOpenMessages(): string[] {
    return [];
  }
  /** Sent every `keepaliveMs` while connected. */
  protected getKeepaliveMessage(): string | null {
    return null;
  }
  protected keepaliveMs = 25000;

  protected send(message: string) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
  }

  connect() {
    this.closed = false;
    if (this.socket) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.getUrl());
    } catch (e) {
      this.handlers.onError(e);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.handlers.onOnline();
      for (const message of this.getOpenMessages()) this.send(message);

      const keepalive = this.getKeepaliveMessage();
      if (keepalive) {
        this.keepaliveTimer = setInterval(() => this.send(keepalive), this.keepaliveMs);
      }
    };

    socket.onmessage = (event) => {
      try {
        this.handleMessage(typeof event.data === "string" ? event.data : String(event.data));
      } catch (e) {
        this.handlers.onError(e);
      }
    };

    socket.onerror = (event) => {
      this.handlers.onError(event);
    };

    socket.onclose = () => {
      this.teardownSocket();
      this.handlers.onOffline();
      this.scheduleReconnect();
    };
  }

  private teardownSocket() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket = null;
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.attempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.connect();
    }, delay);
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.teardownSocket();
    try {
      socket?.close();
    } catch (e) {
      console.error("HeartRate: error closing socket", e);
    }
  }
}

/** Pulsoid, via the official socket client (handles its own protocol details). */
class PulsoidConnection extends HeartRateConnection {
  private socket: PulsoidSocket | null = null;

  connect() {
    this.closed = false;
    if (this.socket) return;

    const socket = new PulsoidSocket(this.source.token.trim());
    this.socket = socket;

    socket.on("heart-rate", (data) => {
      this.handlers.onOnline();
      this.handlers.onHeartRate(data.heartRate);
    });
    socket.on("online", () => this.handlers.onOnline());
    socket.on("offline", () => this.handlers.onOffline());
    socket.on("close", () => this.handlers.onOffline());
    socket.on("error", (error: unknown) => {
      this.handlers.onError(error);
      this.handlers.onOffline();
    });

    socket.connect();
  }

  disconnect() {
    this.closed = true;
    try {
      this.socket?.disconnect();
    } catch (e) {
      console.error("HeartRate: error closing Pulsoid socket", e);
    }
    this.socket = null;
  }
}

/** Stromno's public realtime endpoint — same payload shape as Pulsoid. */
class StromnoConnection extends BaseSocketConnection {
  protected getUrl() {
    return `wss://app.stromno.com/v1/api/public/rt?authToken=${encodeURIComponent(this.source.token.trim())}`;
  }

  protected handleMessage(raw: string) {
    const bpm = guessHeartRate(JSON.parse(raw));
    if (bpm !== null) this.handlers.onHeartRate(bpm);
  }
}

/** HypeRate speaks the Phoenix channel protocol: join a `hr:<id>` topic, then heartbeat. */
class HypeRateConnection extends BaseSocketConnection {
  private ref = 0;
  protected keepaliveMs = 15000;

  private get topic() {
    return `hr:${(this.source.channel || "").trim()}`;
  }

  protected getUrl() {
    return `wss://app.hyperate.io/socket/websocket?token=${encodeURIComponent(this.source.token.trim())}`;
  }

  protected getOpenMessages() {
    return [
      JSON.stringify({ topic: this.topic, event: "phx_join", payload: {}, ref: ++this.ref }),
    ];
  }

  protected getKeepaliveMessage() {
    return JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: ++this.ref });
  }

  protected handleMessage(raw: string) {
    const message = JSON.parse(raw);
    if (message?.event !== "hr_update") return;
    const bpm = guessHeartRate(message.payload);
    if (bpm !== null) this.handlers.onHeartRate(bpm);
  }
}

/** Any WebSocket the user points us at, optionally with a JSON path to the BPM field. */
class CustomSocketConnection extends BaseSocketConnection {
  protected getUrl() {
    return (this.source.url || "").trim();
  }

  protected handleMessage(raw: string) {
    const path = (this.source.jsonPath || "").trim();
    let payload: any = raw;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Not JSON — leave it as the raw string so a bare "75" still works.
    }
    const bpm = path ? guessHeartRate(readJsonPath(payload, path)) : guessHeartRate(payload);
    if (bpm !== null) this.handlers.onHeartRate(bpm);
  }
}

/**
 * Several named sources can point at the same band, but the sidecar keeps one GATT link
 * per address, so connects are reference counted here and only the last disconnect for an
 * address actually drops it.
 */
const bleHolders = new Map<string, number>();

/** No packet for this long means the band is connected but has stopped broadcasting. */
const BLE_STALE_TIMEOUT = 5000;

/**
 * A BLE band or strap, via the `advosc-utils ble-hr` sidecar. Scanning, connecting and
 * the reconnect backoff all live in the sidecar; this just tracks one address.
 */
class BleConnection extends HeartRateConnection {
  private unsubscribe: (() => void) | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private lastPacketAt = 0;
  private online = false;

  private get address(): string {
    return (this.source.address || "").trim().toUpperCase();
  }

  connect() {
    this.closed = false;
    if (this.unsubscribe || !this.address) return;

    const ble = window.ADVOSCNative?.ble;
    if (!ble) {
      this.handlers.onError(new Error("Bluetooth support is unavailable"));
      return;
    }

    this.unsubscribe = ble.onEvent((event) => this.handleEvent(event));

    bleHolders.set(this.address, (bleHolders.get(this.address) ?? 0) + 1);
    ble.connect(this.address).then(
      (state) => this.applyState(state),
      (error) => this.handlers.onError(error),
    );

    // The sidecar only speaks when something happens, so a band that goes quiet without
    // dropping its connection has to be caught on this side.
    this.staleTimer = setInterval(() => {
      if (this.online && Date.now() - this.lastPacketAt > BLE_STALE_TIMEOUT) {
        this.online = false;
        this.handlers.onOffline();
      }
    }, 2000);
  }

  private applyState(state: { devices: { address: string; connected: boolean; bpm?: number }[] }) {
    const device = state.devices.find((item) => item.address === this.address);
    if (device?.connected) {
      this.online = true;
      this.handlers.onOnline();
      if (device.bpm !== undefined) this.handlers.onHeartRate(device.bpm);
    }
  }

  private handleEvent(event: any) {
    if (this.closed) return;
    // `state` snapshots carry no address, and every other event we care about is scoped
    // to one device.
    if (!event.address || event.address !== this.address) return;

    switch (event.type) {
      case "hr":
        this.lastPacketAt = Date.now();
        if (!this.online) {
          this.online = true;
          this.handlers.onOnline();
        }
        this.handlers.onHeartRate(event.bpm);
        this.handlers.onExtras?.({ contact: event.contact ?? null, rrIntervalsMs: event.rr_ms ?? [] });
        break;

      case "connected":
        this.online = true;
        this.lastPacketAt = Date.now();
        this.handlers.onOnline();
        this.handlers.onExtras?.({
          deviceName: event.name ?? undefined,
          sensorLocation: event.sensor_location ?? undefined,
        });
        break;

      case "battery":
        this.handlers.onExtras?.({ battery: event.percent });
        break;

      case "disconnected":
        this.online = false;
        this.handlers.onOffline();
        break;

      case "error":
        this.online = false;
        this.handlers.onError(new Error(event.message));
        break;
    }
  }

  disconnect() {
    this.closed = true;
    this.online = false;

    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;

      const remaining = (bleHolders.get(this.address) ?? 1) - 1;
      if (remaining > 0) {
        bleHolders.set(this.address, remaining);
      } else {
        bleHolders.delete(this.address);
        window.ADVOSCNative?.ble?.disconnect(this.address);
      }
    }
  }
}

export function createConnection(source: HeartRateSource, handlers: HeartRateHandlers): HeartRateConnection {
  switch (source.platform) {
    case "ble":
      return new BleConnection(source, handlers);
    case "hyperate":
      return new HypeRateConnection(source, handlers);
    case "stromno":
      return new StromnoConnection(source, handlers);
    case "websocket":
      return new CustomSocketConnection(source, handlers);
    case "pulsoid":
    default:
      return new PulsoidConnection(source, handlers);
  }
}
