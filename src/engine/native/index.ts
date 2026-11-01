import chokidar from "chokidar";
import * as fs from "fs";
import * as path from "path";
import type { MediaCommand, OSCIncomingMessage, WatchEventName } from "$shared/native-types";
import { hostCall, onHostShortcut } from "../runtime/host";
import { getOpenVRTrackers, getProcessStartTime } from "../services/advosc-utils";
import {
  connectBleDevice,
  disconnectBleDevice,
  getBleState,
  onBleEvent,
  startBleScan,
  stopBleScan,
} from "../services/ble-heart-rate";
import { performHttpRequest } from "../services/http-request";
import { executeMediaCommand, onMediaInfo } from "../services/media";
import { OSC } from "../services/osc";
import {
  DEFAULT_OSC_SOURCES,
  loadOSCSources,
  sanitizeSources,
  saveOSCSources,
  toActiveSources,
  type OSCSourceConfig,
} from "../services/osc-config";
import {
  getSpeechServerState,
  onSpeechEvent,
  openSpeechPage,
  sendSpeechCommand,
  setSpeechConfig,
  startSpeechServer,
  stopSpeechServer,
} from "../services/speech-server";
import { getSystemInfo } from "../services/system-monitor";

/**
 * The same shape the renderer's `window.ADVOSCNative` had, backed directly by the services
 * that now run here. Moved module code calls `native.x` and doesn't change otherwise.
 */

type OscValue = number | string | boolean | null | undefined;
type OscType = "Float" | "Int" | "Bool" | "String" | "Null" | "Undefined";

let port: OSC;
const oscListeners = new Set<(message: OSCIncomingMessage) => void>();

export function startOSCPort() {
  port = new OSC({ sources: toActiveSources(loadOSCSources()) });

  port.once("ready", () => console.log("OSC connection opened."));
  port.on("error", (error) => console.warn("OSC error:", error));

  port.on("message", (message) => {
    if (!message || !message.address) return;
    const incoming: OSCIncomingMessage = {
      address: message.address,
      args: message.args.map((arg: any) => arg.value),
      types: message.args.map((arg: any) => arg.type),
    };
    for (const listener of oscListeners) {
      try {
        listener(incoming);
      } catch (error) {
        console.error("OSC listener failed:", error);
      }
    }
  });

  port.open();
}

function applySources(sources: OSCSourceConfig[]) {
  saveOSCSources(sources);
  port.reconfigure(toActiveSources(sources));
  return { success: true as const, sources, status: port.getStatus() };
}

const osc = {
  send(address: string, ...args: OscValue[]) {
    // A user-configured setup may have no send endpoint at all.
    if (!port.hasSendTarget()) return;
    port.send({
      address,
      args: args
        .map((arg) => {
          if (arg === null || arg === undefined) return { type: "N", value: 0 };
          if (typeof arg === "number" && arg % 1 === 0) return { type: "i", value: arg };
          if (typeof arg === "number" && arg % 1 !== 0) return { type: "f", value: arg };
          if (typeof arg === "string") return { type: "s", value: arg };
          if (typeof arg === "boolean") return { type: arg ? "T" : "F" };
          return undefined;
        })
        .filter((arg) => arg) as any[],
    });
  },

  /** Lets the caller pick the exact OSC type instead of inferring it. */
  sendCustom(address: string, args: { value: OscValue; type: OscType }[] = []) {
    if (!port.hasSendTarget()) return;
    port.send({
      address,
      args: args.map((arg) => {
        switch (arg.type) {
          case "Float":
            return { type: "f", value: Number(arg.value) };
          case "Int":
            return { type: "i", value: Math.floor(Number(arg.value)) };
          case "Bool":
            return { type: arg.value ? "T" : "F" };
          case "String":
            return { type: "s", value: String(arg.value ?? "") };
          case "Null":
          case "Undefined":
          default:
            return { type: "N", value: 0 };
        }
      }) as any[],
    });
  },

  onMessage(listener: (message: OSCIncomingMessage) => void) {
    oscListeners.add(listener);
    return () => oscListeners.delete(listener);
  },

  getSources: () => loadOSCSources(),
  getDefaultSources: () => DEFAULT_OSC_SOURCES,
  getStatus: () => port.getStatus(),

  setSources(sources: unknown) {
    try {
      const sanitized = sanitizeSources(sources);
      if (!sanitized.length) {
        return { success: false as const, error: "At least one valid OSC source is required." };
      }
      return applySources(sanitized);
    } catch (error) {
      return { success: false as const, error: String(error) };
    }
  },

  resetSources() {
    try {
      return applySources([...DEFAULT_OSC_SOURCES]);
    } catch (error) {
      return { success: false as const, error: String(error) };
    }
  },
};

const files = {
  async readText(filePath: string, encoding: BufferEncoding = "utf-8") {
    if (!fs.existsSync(filePath)) return null;
    return await fs.promises.readFile(filePath, encoding);
  },

  async readJSON(filePath: string, encoding: BufferEncoding = "utf-8") {
    if (!fs.existsSync(filePath)) return null;
    const text = await fs.promises.readFile(filePath, encoding);
    return JSON.parse(text.replace(/﻿/g, ""));
  },

  watch(
    filePaths: string[],
    callback: (eventName: WatchEventName, path: string) => void,
    options: { ignoreInitial?: boolean } = {},
  ) {
    const watcher = chokidar.watch(filePaths, { ignoreInitial: options.ignoreInitial ?? true });
    watcher.on("add", (file) => callback("add", file));
    watcher.on("change", (file) => callback("change", file));
    watcher.on("unlink", (file) => callback("unlink", file));
    return () => {
      watcher.removeAllListeners();
      void watcher.close();
    };
  },
};

const shortcutCallbacks = new Map<string, () => void>();

onHostShortcut((id) => shortcutCallbacks.get(id)?.());

const globalShortcut = {
  async register(accelerator: string, callback: () => void) {
    const id = `${accelerator}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    shortcutCallbacks.set(id, callback);
    const result = await hostCall("shortcut.register", accelerator, id);
    if (!result.success) shortcutCallbacks.delete(id);
    return result;
  },
  async unregister(accelerator: string) {
    for (const id of shortcutCallbacks.keys()) {
      if (id.startsWith(`${accelerator}-`)) shortcutCallbacks.delete(id);
    }
    return await hostCall("shortcut.unregister", accelerator);
  },
  async unregisterAll() {
    shortcutCallbacks.clear();
    return await hostCall("shortcut.unregisterAll");
  },
  isRegistered: (accelerator: string) => hostCall("shortcut.isRegistered", accelerator),
};

export const native = {
  env: { get: (key: string) => process.env[key] },
  path: { join: (...paths: string[]) => path.join(...paths), sep: path.sep },
  osc,
  files,
  globalShortcut,
  media: {
    execute: (command: MediaCommand) => executeMediaCommand(command),
    onMediaInfo,
  },
  utils: {
    getStartTime: (processName: string) => getProcessStartTime(processName),
    getOpenVRTrackers: () => getOpenVRTrackers(),
    getSystemInfo: async () => getSystemInfo(),
  },
  http: { request: performHttpRequest },
  ble: {
    scan: async (options: { seconds?: number; all?: boolean } = {}) => startBleScan(options),
    stopScan: async () => stopBleScan(),
    connect: async (address: string) => connectBleDevice(address),
    disconnect: async (address: string) => disconnectBleDevice(address),
    getState: async () => getBleState(),
    onEvent: onBleEvent,
  },
  speech: {
    start: startSpeechServer,
    stop: stopSpeechServer,
    getState: async () => getSpeechServerState(),
    setConfig: async (config: Parameters<typeof setSpeechConfig>[0]) => setSpeechConfig(config),
    command: async (action: Parameters<typeof sendSpeechCommand>[0]) => sendSpeechCommand(action),
    openPage: openSpeechPage,
    onTranscript: (listener: (transcript: any) => void) => onSpeechEvent("speech:transcript", listener),
    onStatus: (listener: (status: any) => void) => onSpeechEvent("speech:status", listener),
    onState: (listener: (state: any) => void) => onSpeechEvent("speech:state", listener),
  },
  dialog: { openAudioFiles: () => hostCall("dialog.openAudioFiles") },
};
