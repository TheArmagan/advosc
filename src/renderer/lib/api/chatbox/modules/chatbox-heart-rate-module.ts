import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import {
  createConnection,
  isSourceConfigured,
  type HeartRateConnection,
  type HeartRateExtras,
  type HeartRatePlatform,
  type HeartRateSource,
} from "./heart-rate/providers";
// @ts-expect-error
import ChatboxHeartRateSettings from "$lib/components/chatbox-editor/modules/chatbox-heart-rate-settings.svelte";

const UUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prefix for the implicit sources created when a raw Pulsoid token is used inline. */
const RAW_TOKEN_PREFIX = "__raw:";

interface HeartRateEntry {
  timestamp: number;
  heartRate: number;
}

interface FeedState {
  connection: HeartRateConnection;
  /** Snapshot of the config this connection was opened with, to detect edits. */
  source: HeartRateSource;
  lastHeartRate?: number;
  isOnline: boolean;
  history: HeartRateEntry[];
  allTimeMax?: number;
  allTimeMin?: number;
  lastAccess: number;
  lastError?: string;
  /** Battery, contact and device name. Only the BLE platform fills these in. */
  extras: HeartRateExtras;
}

export class ChatboxHeartRateModule extends ChatboxModule {
  private feeds = new Map<string, FeedState>();
  private inactivityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: "HeartRate",
      name: "Heart Rate",
      description:
        "Live heart rate from a Bluetooth band or strap, Pulsoid, HypeRate, Stromno, or any custom WebSocket feed.",
      Component: ChatboxHeartRateSettings,
      examplePlaceholders: {
        "Source;HeartRate": {
          value: "75",
          description: "The current heart rate of the named source.",
          fillText: "HeartRate;${1:sourceName};HeartRate",
        },
        "Source;IsOnline": {
          value: "true",
          description: "Indicates whether the named source is currently connected and sending data.",
          fillText: "HeartRate;${1:sourceName};IsOnline",
        },
        "Source;AverageHR;Seconds": {
          value: "72",
          description:
            "The average heart rate over the specified duration in seconds (default: 300 = 5 minutes). Max 900 seconds.",
          fillText: "HeartRate;${1:sourceName};AverageHR;${2:300}",
        },
        "Source;MaxHR": {
          value: "120",
          description: "The all-time maximum heart rate recorded this session.",
          fillText: "HeartRate;${1:sourceName};MaxHR",
        },
        "Source;MinHR": {
          value: "55",
          description: "The all-time minimum heart rate recorded this session.",
          fillText: "HeartRate;${1:sourceName};MinHR",
        },
        "Source;Battery": {
          value: "84",
          description: "Battery percentage of the device. Bluetooth sources only.",
          fillText: "HeartRate;${1:sourceName};Battery",
        },
        "Source;HasContact": {
          value: "true",
          description:
            "Whether the device reports skin contact. Bluetooth sources only, and true when the device does not report it.",
          fillText: "HeartRate;${1:sourceName};HasContact",
        },
        "Source;DeviceName": {
          value: "Xiaomi Smart Band 10 Pro",
          description: "Advertised name of the device. Bluetooth sources only.",
          fillText: "HeartRate;${1:sourceName};DeviceName",
        },
        "Source;SensorLocation": {
          value: "Wrist",
          description:
            "Where the device is worn (Chest, Wrist, Finger, and so on), when it reports it. Bluetooth sources only.",
          fillText: "HeartRate;${1:sourceName};SensorLocation",
        },
      },
    });

    this.inactivityCheckInterval = setInterval(() => this.checkInactiveFeeds(), 15000);

    // Dropping or re-configuring a source must drop its live socket too. This subscribes
    // directly instead of using `onValuesChanged`, which the module registry takes over.
    this.values.subscribe(() => this.pruneStaleFeeds());
  }

  // ---------------------------------------------------------------- sources

  getSources(): Record<string, HeartRateSource> {
    return this.getValues().sources || {};
  }

  setSource(name: string, source: HeartRateSource) {
    const values = this.getValues();
    this.values.set({
      ...values,
      sources: { ...(values.sources || {}), [name]: source },
    });
  }

  removeSource(name: string) {
    const values = this.getValues();
    const sources = { ...(values.sources || {}) };
    delete sources[name];
    this.values.set({ ...values, sources });
    this.disconnectFeed(name);
  }

  /**
   * Resolves the first placeholder parameter. A configured source name wins; a bare
   * Pulsoid UUID still connects directly so pre-rename templates keep working.
   */
  private resolveSource(nameOrToken: string): { key: string; source: HeartRateSource } | null {
    const sources = this.getSources();
    if (sources[nameOrToken]) return { key: nameOrToken, source: sources[nameOrToken] };

    if (UUIDRegex.test(nameOrToken)) {
      return {
        key: `${RAW_TOKEN_PREFIX}${nameOrToken}`,
        source: { platform: "pulsoid", token: nameOrToken },
      };
    }
    return null;
  }

  // ------------------------------------------------------------ connections

  private getOrCreateFeed(key: string, source: HeartRateSource): FeedState {
    const existing = this.feeds.get(key);
    if (existing) return existing;

    const state: FeedState = {
      connection: null as unknown as HeartRateConnection,
      source,
      isOnline: false,
      history: [],
      lastAccess: Date.now(),
      extras: {},
    };

    state.connection = createConnection(source, {
      onHeartRate: (bpm) => {
        if (!isFinite(bpm)) return;
        state.isOnline = true;
        state.lastHeartRate = bpm;

        const now = Date.now();
        state.history.push({ timestamp: now, heartRate: bpm });
        // Keep 15 minutes of samples — the longest window AverageHR allows is 900s.
        const cutoff = now - 15 * 60 * 1000;
        state.history = state.history.filter((entry) => entry.timestamp >= cutoff);

        if (state.allTimeMax === undefined || bpm > state.allTimeMax) state.allTimeMax = bpm;
        if (state.allTimeMin === undefined || bpm < state.allTimeMin) state.allTimeMin = bpm;
      },
      onOnline: () => {
        state.isOnline = true;
        state.lastError = undefined;
      },
      onOffline: () => {
        state.isOnline = false;
      },
      onExtras: (extras) => {
        state.extras = { ...state.extras, ...extras };
      },
      onError: (error) => {
        console.error("HeartRate socket error:", error);
        state.isOnline = false;
        state.lastError = error instanceof Error ? error.message : "Connection error";
      },
    });

    this.feeds.set(key, state);
    state.connection.connect();
    return state;
  }

  private disconnectFeed(key: string) {
    const state = this.feeds.get(key);
    if (!state) return;
    try {
      state.connection.disconnect();
    } catch (e) {
      console.error("HeartRate: error closing connection", e);
    }
    this.feeds.delete(key);
  }

  /** Drops live feeds whose source was deleted or edited in the settings UI. */
  private pruneStaleFeeds() {
    const sources = this.getSources();
    for (const [key, state] of [...this.feeds.entries()]) {
      if (key.startsWith(RAW_TOKEN_PREFIX)) continue;
      const current = sources[key];
      if (!current || JSON.stringify(current) !== JSON.stringify(state.source)) {
        this.disconnectFeed(key);
      }
    }
  }

  private checkInactiveFeeds() {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const fifteenMinutesAgo = now - 15 * 60 * 1000;

    for (const [key, state] of [...this.feeds.entries()]) {
      if (state.lastAccess < oneMinuteAgo) {
        this.disconnectFeed(key);
      } else {
        state.history = state.history.filter((entry) => entry.timestamp >= fifteenMinutesAgo);
      }
    }
  }

  /** Live connection status for the settings UI. */
  getStatus(name: string): {
    connected: boolean;
    heartRate?: number;
    error?: string;
    extras?: HeartRateExtras;
  } {
    const state = this.feeds.get(name);
    if (!state) return { connected: false };
    return {
      connected: state.isOnline,
      heartRate: state.lastHeartRate,
      error: state.lastError,
      extras: state.extras,
    };
  }

  /** Keeps a source connected while its card is open in the settings UI. */
  keepAlive(name: string) {
    const resolved = this.resolveSource(name);
    if (!resolved || !isSourceConfigured(resolved.source)) return;
    const state = this.getOrCreateFeed(resolved.key, resolved.source);
    state.lastAccess = Date.now();
  }

  // ----------------------------------------------------------- placeholders

  async getPlaceholderValue(nameOrToken: string, key: string, ...args: string[]): Promise<string> {
    [nameOrToken, key, ...args] = await chatbox.fillTemplates(
      [nameOrToken, key, ...args],
      "[[:]]",
      false,
      chatbox.getInstanceKey(),
    );

    const resolved = this.resolveSource(nameOrToken);
    if (!resolved) return "(Unknown heart rate source)";
    if (!isSourceConfigured(resolved.source)) return "(Heart rate source is not configured)";

    const state = this.getOrCreateFeed(resolved.key, resolved.source);
    state.lastAccess = Date.now();

    switch (key) {
      case "HeartRate":
        return state.lastHeartRate !== undefined ? state.lastHeartRate.toString() : "0";
      case "IsOnline":
        return state.isOnline.toString();
      case "AverageHR": {
        const seconds = Math.min(900, parseInt(args[0]) || 300);
        const cutoff = Date.now() - seconds * 1000;
        const relevant = state.history.filter((entry) => entry.timestamp >= cutoff);
        if (relevant.length === 0) return "0";
        const sum = relevant.reduce((acc, entry) => acc + entry.heartRate, 0);
        return Math.round(sum / relevant.length).toString();
      }
      case "MaxHR":
        return state.allTimeMax !== undefined ? state.allTimeMax.toString() : "0";
      case "MinHR":
        return state.allTimeMin !== undefined ? state.allTimeMin.toString() : "0";
      case "Battery":
        return state.extras.battery !== undefined ? state.extras.battery.toString() : "0";
      case "HasContact":
        // Devices that do not support the contact bit report nothing, and "unknown" is
        // closer to worn than to not worn.
        return (state.extras.contact ?? true).toString();
      case "DeviceName":
        return state.extras.deviceName ?? "";
      case "SensorLocation":
        return state.extras.sensorLocation ?? "";
      default:
        return "";
    }
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const placeholders: PlaceholdersRecord = {};

    for (const name of Object.keys(this.getSources())) {
      placeholders[`${name};HeartRate`] = {
        value: "75",
        description: `Current heart rate from "${name}".`,
        fillText: `HeartRate;${name};HeartRate`,
      };
      placeholders[`${name};IsOnline`] = {
        value: "true",
        description: `Whether "${name}" is connected and sending data.`,
        fillText: `HeartRate;${name};IsOnline`,
      };
      placeholders[`${name};AverageHR`] = {
        value: "72",
        description: `Average heart rate from "${name}" over the given number of seconds (max 900).`,
        fillText: `HeartRate;${name};AverageHR;\${1:300}`,
      };
      placeholders[`${name};MaxHR`] = {
        value: "120",
        description: `Session maximum heart rate from "${name}".`,
        fillText: `HeartRate;${name};MaxHR`,
      };
      placeholders[`${name};MinHR`] = {
        value: "55",
        description: `Session minimum heart rate from "${name}".`,
        fillText: `HeartRate;${name};MinHR`,
      };
      placeholders[`${name};Battery`] = {
        value: "84",
        description: `Battery percentage of the "${name}" device. Bluetooth sources only.`,
        fillText: `HeartRate;${name};Battery`,
      };
      placeholders[`${name};HasContact`] = {
        value: "true",
        description: `Whether "${name}" reports skin contact. Bluetooth sources only.`,
        fillText: `HeartRate;${name};HasContact`,
      };
      placeholders[`${name};DeviceName`] = {
        value: "Xiaomi Smart Band 10 Pro",
        description: `Advertised name of the "${name}" device. Bluetooth sources only.`,
        fillText: `HeartRate;${name};DeviceName`,
      };
      placeholders[`${name};SensorLocation`] = {
        value: "Wrist",
        description: `Where "${name}" is worn, when the device reports it. Bluetooth sources only.`,
        fillText: `HeartRate;${name};SensorLocation`,
      };
    }

    return placeholders;
  }

  getCleanValues(): Record<string, any> {
    return { sources: this.getSources() };
  }

  dispose() {
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
    for (const key of [...this.feeds.keys()]) this.disconnectFeed(key);
  }
}

export type { HeartRatePlatform, HeartRateSource };
