import WebSocket from "ws";
import type {
  ToyFeature,
  ToyInfo,
  ToyPattern,
  ToyTransportEvents,
  ToyTransportStatus,
} from "$shared/toys";
import { clampLevel, type EngineToyTransport } from "./transport";

/**
 * Buttplug spec v3 over a WebSocket, as served by Intiface Central. Every message goes in a JSON
 * array and every client message gets a reply with the same Id. Id 0 is reserved for messages
 * the server starts itself, like DeviceAdded.
 *
 * Nothing here can run for a bounded time, so `boundedCommands` is false and a lost ADVOSC
 * depends on the server. The spec says a server stops devices when a client disconnects or
 * misses a ping, but that's unverified against real Intiface. See `NO_PING_WARNING`.
 */

const MESSAGE_VERSION = 3;
const CLIENT_NAME = "ADVOSC";

const HANDSHAKE_TIMEOUT_MS = 3000;
const REPLY_TIMEOUT_MS = 1500;
const RECONNECT_MS = 3000;
const SCAN_MS = 15000;
const BATTERY_POLL_MS = 60000;
const MAX_PAYLOAD_BYTES = 1024 * 1024;

export const NO_PING_WARNING =
  "Intiface has no ping time set, so if ADVOSC crashes your toy might keep running. Set a max ping time in Intiface Central's server settings.";

/** ScalarCmd's actuator types that map to a feature. Position needs motion planning, so it's left out. */
const SCALAR_FEATURES: Record<string, ToyFeature> = {
  Vibrate: "Vibrate",
  Rotate: "Rotate",
  Oscillate: "Oscillate",
  Constrict: "Suction",
  Inflate: "Pump",
};

interface Actuator {
  index: number;
  steps: number;
  actuatorType: string;
  feature: ToyFeature;
}

interface Device {
  index: number;
  toyId: string;
  name: string;
  scalars: Actuator[];
  rotators: Actuator[];
  batterySensor: { index: number; max: number } | null;
  battery: number | null;
}

interface Pending {
  resolve: (body: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RunningPattern {
  timer: ReturnType<typeof setInterval>;
  until: number;
  sending: boolean;
}

function parseActuators(list: unknown, fallback: string | null): Actuator[] {
  if (!Array.isArray(list)) return [];
  const actuators: Actuator[] = [];
  list.forEach((attributes, index) => {
    const actuatorType = String(attributes?.ActuatorType ?? fallback ?? "");
    const feature = SCALAR_FEATURES[actuatorType];
    const steps = Math.floor(Number(attributes?.StepCount));
    if (feature && steps > 0) actuators.push({ index, steps, actuatorType, feature });
  });
  return actuators;
}

function parseBatterySensor(list: unknown): Device["batterySensor"] {
  if (!Array.isArray(list)) return null;
  const index = list.findIndex((attributes) => attributes?.SensorType === "Battery");
  if (index < 0) return null;
  const max = Number(list[index]?.SensorRange?.[0]?.[1]);
  return { index, max: Number.isFinite(max) && max > 0 ? max : 100 };
}

/**
 * The server turns a scalar into a device step itself, and Buttplug rounds that up. Sending the
 * capped level as it is could land a step above the cap, so this picks the step at or below it
 * and aims a quarter step under, which lands on that step however the server rounds.
 */
export function scalarForStep(step: number, steps: number) {
  return step <= 0 ? 0 : (step - 0.25) / steps;
}

export class IntifaceTransport implements EngineToyTransport {
  readonly id = "intiface" as const;
  readonly minSendIntervalMs = 50;
  readonly boundedCommands = false;

  private current: ToyTransportStatus = { id: "intiface", state: "disabled" };
  private socket: WebSocket | null = null;
  private running = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private devices = new Map<number, Device>();
  private patterns = new Map<string, RunningPattern>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private batteryTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: { [E in keyof ToyTransportEvents]: Set<ToyTransportEvents[E]> } = {
    status: new Set(),
    toys: new Set(),
  };

  /**
   * `stopOnConnect` is for an engine replacing one that died. Whatever that engine was running
   * only ends if the server stops devices on close, which isn't verified, and this is the first
   * connection that can ask directly. It's a stop, so it's fine after a crash. A latched engine
   * never gets this far, because it doesn't connect at all.
   */
  constructor(
    private url: string,
    private stopOnConnect = false,
  ) {}

  on<E extends keyof ToyTransportEvents>(event: E, listener: ToyTransportEvents[E]) {
    const set = this.listeners[event] as Set<ToyTransportEvents[E]>;
    set.add(listener);
    return () => set.delete(listener);
  }

  status() {
    return this.current;
  }

  private setStatus(status: Omit<ToyTransportStatus, "id">) {
    const next = { id: this.id, ...status };
    if (next.state === this.current.state && next.error === this.current.error) return;
    this.current = next;
    for (const listener of this.listeners.status) listener(next);
  }

  private toyList(): ToyInfo[] {
    return [...this.devices.values()].map((device) => {
      const actuators = [...device.scalars, ...device.rotators];
      return {
        id: device.toyId,
        name: device.name,
        transport: this.id,
        features: [...new Set(actuators.map((actuator) => actuator.feature))],
        battery: device.battery,
        connected: true,
        ...(actuators.length && actuators.every((actuator) => actuator.steps === 1) ? { onOff: true } : {}),
      };
    });
  }

  private emitToys() {
    const toys = this.toyList();
    for (const listener of this.listeners.toys) listener(toys);
  }

  // ---------------------------------------------------------------- connection

  async connect() {
    if (this.running) return;
    this.running = true;
    await this.open();
  }

  async disconnect() {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.teardown();
    this.setStatus({ state: "disabled" });
  }

  private scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, RECONNECT_MS);
  }

  private async open() {
    if (!this.running || this.socket) return;
    this.setStatus({ state: "connecting" });

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url, {
        handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
        perMessageDeflate: false,
        maxPayload: MAX_PAYLOAD_BYTES,
      });
    } catch {
      this.setStatus({ state: "error", error: "That Intiface address isn't valid. It should look like ws://127.0.0.1:12345." });
      return;
    }
    this.socket = socket;

    let failure: string | null = null;
    socket.on("message", (data) => this.handleFrame(socket, data.toString()));
    socket.on("error", () => {
      failure ??= "Couldn't reach Intiface. Check that Intiface Central is open and its server is running.";
    });
    socket.on("close", () => {
      if (this.socket !== socket) return;
      const wasConnected = this.current.state === "connected";
      this.teardown();
      if (!this.running) return;
      this.setStatus({
        state: "error",
        error: failure ?? (wasConnected ? "Lost the connection to Intiface." : "Couldn't connect to Intiface."),
      });
      this.scheduleReconnect();
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("close", () => reject(new Error("closed")));
      });
      await this.handshake();
    } catch (error) {
      if (this.socket === socket) {
        failure ??= (error as Error).message;
        socket.terminate();
      }
    }
  }

  private async handshake() {
    const info = await this.request({
      RequestServerInfo: { ClientName: CLIENT_NAME, MessageVersion: MESSAGE_VERSION },
    });
    if (info?.MessageVersion !== MESSAGE_VERSION) {
      throw new Error("This Intiface version doesn't speak the protocol ADVOSC uses. Updating it may help.");
    }

    const maxPing = Number(info?.MaxPingTime);
    const hasPing = Number.isFinite(maxPing) && maxPing > 0;
    if (hasPing) this.startPinging(maxPing);

    const list = await this.request({ RequestDeviceList: {} });
    this.devices.clear();
    for (const raw of Array.isArray(list?.Devices) ? list.Devices : []) this.addDevice(raw);

    if (this.stopOnConnect) {
      this.stopOnConnect = false;
      await this.request({ StopAllDevices: {} }).catch((error) => {
        console.warn(`Couldn't stop Intiface devices after a restart: ${error.message}`);
      });
    }

    this.setStatus(hasPing ? { state: "connected" } : { state: "connected", error: NO_PING_WARNING });
    this.emitToys();
    this.scan();
    void this.readBatteries();
    this.batteryTimer = setInterval(() => void this.readBatteries(), BATTERY_POLL_MS);
  }

  /** Half the limit, so one late timer can't cost the connection. */
  private startPinging(maxPingMs: number) {
    const interval = Math.max(20, Math.floor(maxPingMs / 2));
    this.pingTimer = setInterval(() => {
      this.request({ Ping: {} }).catch(() => this.socket?.terminate());
    }, interval);
  }

  /** Devices only connect while something scans, and nothing else is going to ask. */
  private scan() {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.request({ StartScanning: {} }).catch(() => {});
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.request({ StopScanning: {} }).catch(() => {});
    }, SCAN_MS);
  }

  private teardown() {
    const socket = this.socket;
    this.socket = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.batteryTimer) clearInterval(this.batteryTimer);
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.pingTimer = this.batteryTimer = this.scanTimer = null;

    for (const pattern of this.patterns.values()) clearInterval(pattern.timer);
    this.patterns.clear();

    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Lost the connection to Intiface."));
    }
    this.pending.clear();

    const hadDevices = this.devices.size > 0;
    this.devices.clear();
    if (hadDevices) this.emitToys();

    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  // ------------------------------------------------------------------ messages

  private request(message: Record<string, Record<string, unknown>>): Promise<any> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to Intiface."));
    }
    const [name, body] = Object.entries(message)[0];
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Intiface didn't answer in time."));
      }, REPLY_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify([{ [name]: { Id: id, ...body } }]), (error) => {
        if (!error) return;
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        clearTimeout(entry.timer);
        entry.reject(new Error("Lost the connection to Intiface."));
      });
    });
  }

  private settle(id: number, body: any, failed: boolean) {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (failed) entry.reject(new Error(String(body?.ErrorMessage || "Intiface refused that command.")));
    else entry.resolve(body);
    return true;
  }

  private handleFrame(socket: WebSocket, text: string) {
    if (socket !== this.socket) return;
    let messages: unknown;
    try {
      messages = JSON.parse(text);
    } catch {
      console.warn("Intiface sent something that isn't JSON. Ignoring it.");
      return;
    }
    if (!Array.isArray(messages)) return;

    for (const message of messages) {
      if (!message || typeof message !== "object") continue;
      for (const [name, body] of Object.entries<any>(message)) {
        if (!body || typeof body !== "object") continue;
        this.handleMessage(name, body);
      }
    }
  }

  private handleMessage(name: string, body: any) {
    switch (name) {
      case "DeviceAdded":
        this.addDevice(body);
        this.emitToys();
        void this.readBattery(this.devices.get(Number(body.DeviceIndex)));
        return;
      case "DeviceRemoved": {
        const device = this.devices.get(Number(body.DeviceIndex));
        if (!device) return;
        this.clearPattern(device.toyId);
        this.devices.delete(device.index);
        this.emitToys();
        return;
      }
      case "ScanningFinished":
        return;
      case "Error":
        if (this.settle(Number(body.Id), body, true)) return;
        // Id 0 means the server gave up on the session, usually over a missed ping.
        if (Number(body.Id) === 0) console.warn(`Intiface reported an error: ${body.ErrorCode}`);
        return;
      default:
        this.settle(Number(body.Id), body, false);
    }
  }

  private addDevice(raw: any) {
    const index = Number(raw?.DeviceIndex);
    if (!Number.isInteger(index) || index < 0) return;
    const messages = raw?.DeviceMessages ?? {};
    this.devices.set(index, {
      index,
      toyId: `${this.id}:${index}`,
      name: String(raw?.DeviceDisplayName || raw?.DeviceName || `Device ${index}`),
      scalars: parseActuators(messages.ScalarCmd, null),
      rotators: parseActuators(messages.RotateCmd, "Rotate"),
      batterySensor: parseBatterySensor(messages.SensorReadCmd),
      battery: null,
    });
  }

  private async readBattery(device: Device | undefined) {
    if (!device?.batterySensor) return;
    try {
      const reading = await this.request({
        SensorReadCmd: { DeviceIndex: device.index, SensorIndex: device.batterySensor.index, SensorType: "Battery" },
      });
      const value = Number(reading?.Data?.[0]);
      if (!Number.isFinite(value)) return;
      const battery = Math.round(Math.min(100, Math.max(0, (value / device.batterySensor.max) * 100)));
      if (battery === device.battery) return;
      device.battery = battery;
      this.emitToys();
    } catch {
      // Battery is nice to have, and some devices refuse while they're busy.
    }
  }

  private async readBatteries() {
    for (const device of this.devices.values()) await this.readBattery(device);
  }

  async listToys() {
    if (this.socket?.readyState === WebSocket.OPEN) this.scan();
    return this.toyList();
  }

  // ------------------------------------------------------------------- output

  private device(toyId: string) {
    const device = [...this.devices.values()].find((entry) => entry.toyId === toyId);
    if (!device) throw new Error("That toy isn't connected to Intiface.");
    return device;
  }

  quantize(toyId: string, feature: ToyFeature, level: number) {
    const device = [...this.devices.values()].find((entry) => entry.toyId === toyId);
    const actuators = device ? [...device.scalars, ...device.rotators].filter((a) => a.feature === feature) : [];
    // Devices with mismatched motors change the step of whichever is finest.
    const steps = Math.max(0, ...actuators.map((actuator) => actuator.steps));
    return Math.floor(clampLevel(level) * steps);
  }

  private async sendLevels(toyId: string, levels: Partial<Record<ToyFeature, number>>) {
    const device = this.device(toyId);
    const scalars = device.scalars
      .filter((actuator) => levels[actuator.feature] !== undefined)
      .map((actuator) => ({
        Index: actuator.index,
        Scalar: scalarForStep(Math.floor(clampLevel(levels[actuator.feature]!) * actuator.steps), actuator.steps),
        ActuatorType: actuator.actuatorType,
      }));
    const rotations = device.rotators
      .filter((actuator) => levels[actuator.feature] !== undefined)
      .map((actuator) => ({
        Index: actuator.index,
        Speed: scalarForStep(Math.floor(clampLevel(levels[actuator.feature]!) * actuator.steps), actuator.steps),
        Clockwise: true,
      }));

    const sends: Promise<unknown>[] = [];
    if (scalars.length) sends.push(this.request({ ScalarCmd: { DeviceIndex: device.index, Scalars: scalars } }));
    if (rotations.length) sends.push(this.request({ RotateCmd: { DeviceIndex: device.index, Rotations: rotations } }));
    await Promise.all(sends);
  }

  private clearPattern(toyId: string) {
    const running = this.patterns.get(toyId);
    if (!running) return;
    clearInterval(running.timer);
    this.patterns.delete(toyId);
  }

  async setLevels(toyId: string, levels: Partial<Record<ToyFeature, number>>, _seconds: number) {
    this.clearPattern(toyId);
    await this.sendLevels(toyId, levels);
  }

  /** There's no native pattern, so the steps run here. `seconds` still bounds it on this side. */
  async playPattern(toyId: string, pattern: ToyPattern, seconds: number) {
    this.clearPattern(toyId);
    const features = pattern.features;
    const levelsAt = (index: number) =>
      Object.fromEntries(features.map((feature) => [feature, pattern.steps[index % pattern.steps.length]]));

    await this.sendLevels(toyId, levelsAt(0));

    let index = 1;
    const running: RunningPattern = {
      until: Date.now() + seconds * 1000,
      sending: false,
      timer: setInterval(() => {
        if (Date.now() >= running.until) {
          this.clearPattern(toyId);
          void this.stop(toyId).catch(() => {});
          return;
        }
        if (running.sending) return;
        running.sending = true;
        void this.sendLevels(toyId, levelsAt(index++))
          .catch(() => {})
          .finally(() => {
            running.sending = false;
          });
      }, pattern.stepMs),
    };
    this.patterns.set(toyId, running);
  }

  async stop(toyId?: string) {
    if (toyId) {
      this.clearPattern(toyId);
      const device = this.device(toyId);
      await this.request({ StopDeviceCmd: { DeviceIndex: device.index } });
      return;
    }
    for (const id of [...this.patterns.keys()]) this.clearPattern(id);
    await this.request({ StopAllDevices: {} });
  }
}
