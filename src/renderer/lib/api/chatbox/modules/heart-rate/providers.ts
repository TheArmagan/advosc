import PulsoidSocket from "@pulsoid/socket";

export type HeartRatePlatform = "pulsoid" | "hyperate" | "stromno" | "websocket";

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
}

export interface HeartRateHandlers {
  onHeartRate: (bpm: number) => void;
  onOnline: () => void;
  onOffline: () => void;
  onError: (error: unknown) => void;
}

export interface PlatformFieldMeta {
  key: "token" | "channel" | "url" | "jsonPath";
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
  hint?: string;
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

export function createConnection(source: HeartRateSource, handlers: HeartRateHandlers): HeartRateConnection {
  switch (source.platform) {
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
