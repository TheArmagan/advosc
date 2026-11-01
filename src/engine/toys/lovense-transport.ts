import * as http from "http";
import * as https from "https";
import type { LovenseStopTarget } from "$shared/engine-protocol";
import type {
  ToyFeature,
  ToyInfo,
  ToyPattern,
  ToyPresetName,
  ToyTransportEvents,
  ToyTransportId,
  ToyTransportStatus,
} from "$shared/toys";
import {
  LovenseError,
  LOVENSE_STOP_BODY,
  postLovense,
  type LovenseEndpoint,
  type LovenseScheme,
} from "./lovense-http";
import { assertBoundedSeconds, clampLevel, type EngineToyTransport } from "./transport";

/** Top of each feature's range. The service caps in 0 to 1, and these only ever round down. */
const FEATURE_SCALE: Record<ToyFeature, number> = {
  Vibrate: 20,
  Rotate: 20,
  Pump: 3,
  Thrusting: 20,
  Fingering: 20,
  Suction: 20,
  Depth: 3,
  Stroke: 100,
  Oscillate: 20,
};

const PATTERN_SCALE = 20;
/** Stroke has no letter, so a pattern can't drive it. */
const PATTERN_LETTERS: Partial<Record<ToyFeature, string>> = {
  Vibrate: "v",
  Rotate: "r",
  Pump: "p",
  Thrusting: "t",
  Fingering: "f",
  Suction: "s",
  Depth: "d",
  Oscillate: "o",
};

const FEATURES = Object.keys(FEATURE_SCALE) as ToyFeature[];
const SHORT_NAMES = Object.fromEntries(
  Object.entries(PATTERN_LETTERS).map(([feature, letter]) => [letter, feature]),
) as Record<string, ToyFeature>;

/** Lovense ignores Stroke unless its range spans at least this much. */
const STROKE_MIN_SPAN = 20;

const POLL_MS = 5000;
/** A lost connection is worth checking on sooner than the next regular poll. */
const RETRY_POLL_MS = 500;
const POLL_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = 1200;
const STOP_TIMEOUT_MS = 1000;

export interface LovenseRoute {
  ip: string;
  attempts: { scheme: LovenseScheme; port: number }[];
}

function featureFromName(name: string): ToyFeature | null {
  const text = String(name).replace(/\d+$/, "").toLowerCase();
  return FEATURES.find((feature) => feature.toLowerCase() === text) ?? SHORT_NAMES[text] ?? null;
}

function parseFeatures(raw: any): ToyFeature[] {
  const names = Array.isArray(raw?.fullFunctionNames)
    ? raw.fullFunctionNames
    : Array.isArray(raw?.shortFunctionNames)
      ? raw.shortFunctionNames
      : [];
  const features = names.map(featureFromName).filter(Boolean) as ToyFeature[];
  // Older app versions leave these out. Every Lovense toy vibrates or at least ignores it.
  return features.length ? [...new Set(features)] : ["Vibrate"];
}

/** `toys` is a JSON string keyed by toy id, and some app versions send the object itself. */
export function parseLovenseToys(transport: ToyTransportId, data: any): ToyInfo[] {
  const raw = typeof data?.toys === "string" ? JSON.parse(data.toys) : data?.toys;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new LovenseError("Lovense Remote sent a toy list ADVOSC couldn't read.", "reply");
  }

  const toys: ToyInfo[] = [];
  for (const [key, value] of Object.entries<any>(raw)) {
    if (!value || typeof value !== "object") continue;
    const id = String(value.id ?? key);
    const battery = Number(value.battery);
    toys.push({
      id: `${transport}:${id}`,
      name: String(value.nickName || value.name || id),
      transport,
      features: parseFeatures(value),
      battery: Number.isFinite(battery) && battery >= 0 ? Math.min(100, battery) : null,
      connected: Number(value.status) === 1,
    });
  }
  return toys;
}

/** Lovense's own phrasing for a set of levels, always rounding down. */
export function lovenseAction(levels: Partial<Record<ToyFeature, number>>): string | null {
  const parts: string[] = [];
  const thrusting = levels.Thrusting !== undefined && lovenseStep("Thrusting", levels.Thrusting) > 0;

  for (const [feature, level] of Object.entries(levels) as [ToyFeature, number][]) {
    const step = lovenseStep(feature, level);
    if (feature === "Stroke") {
      // The docs show `Stroke:0-20` and say it does nothing without Thrusting or below that span.
      if (thrusting && step >= STROKE_MIN_SPAN) parts.push(`Stroke:0-${step}`);
      continue;
    }
    parts.push(`${feature}:${step}`);
  }
  return parts.length ? parts.join(",") : null;
}

export function lovenseStep(feature: ToyFeature, level: number) {
  return Math.floor(clampLevel(level) * FEATURE_SCALE[feature]);
}

export function lovensePatternRule(pattern: ToyPattern) {
  const letters = pattern.features.map((feature) => PATTERN_LETTERS[feature]).filter(Boolean);
  if (!letters.length) return null;
  return {
    rule: `V:1;F:${letters.join(",")};S:${Math.round(pattern.stepMs)}#`,
    strength: pattern.steps.map((step) => Math.floor(clampLevel(step) * PATTERN_SCALE)).join(";"),
  };
}

export class LovenseTransport implements EngineToyTransport {
  readonly minSendIntervalMs = 100;
  readonly boundedCommands = true;

  private current: ToyTransportStatus;
  private toys: ToyInfo[] = [];
  private endpoint: LovenseEndpoint | null = null;
  private agent: http.Agent | null = null;
  private running = false;
  private polling = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: { [E in keyof ToyTransportEvents]: Set<ToyTransportEvents[E]> } = {
    status: new Set(),
    toys: new Set(),
  };

  constructor(
    readonly id: ToyTransportId,
    private route: LovenseRoute,
  ) {
    this.current = { id, state: "disabled" };
  }

  stopTarget(): LovenseStopTarget {
    const { attempts, ip } = this.route;
    const known = this.endpoint;
    return {
      ip,
      attempts: known
        ? [{ scheme: known.scheme, port: known.port }, ...attempts.filter((a) => a.port !== known.port || a.scheme !== known.scheme)]
        : attempts.map((attempt) => ({ ...attempt })),
    };
  }

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

  private setToys(toys: ToyInfo[]) {
    if (JSON.stringify(toys) === JSON.stringify(this.toys)) return;
    this.toys = toys;
    for (const listener of this.listeners.toys) listener(toys);
  }

  async connect() {
    if (this.running) return;
    this.running = true;
    this.setStatus({ state: "connecting" });
    await this.poll();
  }

  async disconnect() {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.agent?.destroy();
    this.agent = null;
    this.endpoint = null;
    this.setToys([]);
    this.setStatus({ state: "disabled" });
  }

  private pooledAgent(endpoint: LovenseEndpoint) {
    // A TLS handshake every 100 ms would be a lot of work for the phone. Sockets aren't capped,
    // so a stuck request can't queue the next one behind it.
    this.agent ??= new (endpoint.scheme === "https" ? https : http).Agent({ keepAlive: true });
    return this.agent;
  }

  private candidates(): LovenseEndpoint[] {
    const all = this.route.attempts.map((attempt) => ({ ...attempt, ip: this.route.ip }));
    if (!this.endpoint) return all;
    const known = this.endpoint;
    return [known, ...all.filter((other) => other.port !== known.port || other.scheme !== known.scheme)];
  }

  private async fetchToys(): Promise<ToyInfo[]> {
    let failure: unknown = new LovenseError("No way to reach Lovense Remote.", "network");
    for (const endpoint of this.candidates()) {
      try {
        const data = await postLovense(endpoint, { command: "GetToys" }, {
          timeoutMs: POLL_TIMEOUT_MS,
          agent: endpoint === this.endpoint ? this.pooledAgent(endpoint) : undefined,
        });
        const toys = parseLovenseToys(this.id, data);
        if (this.endpoint !== endpoint) {
          this.agent?.destroy();
          this.agent = null;
        }
        this.endpoint = endpoint;
        return toys;
      } catch (error) {
        failure = error;
        if (error instanceof LovenseError && error.kind === "certificate") break;
      }
    }
    throw failure;
  }

  private async poll() {
    if (this.polling || !this.running) return;
    this.polling = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    try {
      const toys = await this.fetchToys();
      if (!this.running) return;
      this.setToys(toys);
      this.setStatus({ state: "connected" });
    } catch (error) {
      if (!this.running) return;
      this.setToys([]);
      this.setStatus({ state: "error", error: plainMessage(error) });
    } finally {
      this.polling = false;
      if (this.running) this.pollTimer = setTimeout(() => void this.poll(), POLL_MS);
    }
  }

  async listToys() {
    await this.poll();
    return this.toys;
  }

  private deviceId(toyId: string) {
    return toyId.slice(this.id.length + 1);
  }

  private async command(body: Record<string, unknown>) {
    const endpoint = this.endpoint;
    if (!endpoint) throw new Error("Not connected to Lovense Remote.");
    try {
      await postLovense(endpoint, body, { timeoutMs: COMMAND_TIMEOUT_MS, agent: this.pooledAgent(endpoint) });
    } catch (error) {
      // A toy-level refusal says nothing about the link. Anything else does, so go and look.
      if (!(error instanceof LovenseError && error.kind === "device")) {
        this.setStatus({ state: "error", error: plainMessage(error) });
        if (this.running) {
          if (this.pollTimer) clearTimeout(this.pollTimer);
          this.pollTimer = setTimeout(() => void this.poll(), RETRY_POLL_MS);
        }
      }
      throw error;
    }
  }

  quantize(_toyId: string, feature: ToyFeature, level: number) {
    return lovenseStep(feature, level);
  }

  async setLevels(toyId: string, levels: Partial<Record<ToyFeature, number>>, seconds: number) {
    assertBoundedSeconds(seconds);
    const action = lovenseAction(levels);
    if (!action) return;
    await this.command({ command: "Function", action, timeSec: seconds, toy: this.deviceId(toyId), apiVer: 1 });
  }

  async playPreset(toyId: string, preset: ToyPresetName, seconds: number) {
    assertBoundedSeconds(seconds);
    await this.command({ command: "Preset", name: preset, timeSec: seconds, toy: this.deviceId(toyId), apiVer: 1 });
  }

  async playPattern(toyId: string, pattern: ToyPattern, seconds: number) {
    assertBoundedSeconds(seconds);
    const body = lovensePatternRule(pattern);
    if (!body) return;
    await this.command({ command: "Pattern", ...body, timeSec: seconds, toy: this.deviceId(toyId), apiVer: 2 });
  }

  async stop(toyId?: string) {
    const endpoint = this.endpoint;
    if (!endpoint) throw new Error("Not connected to Lovense Remote.");
    await postLovense(
      endpoint,
      { ...LOVENSE_STOP_BODY, ...(toyId ? { toy: this.deviceId(toyId) } : {}) },
      { timeoutMs: STOP_TIMEOUT_MS },
    );
  }
}

export function plainMessage(error: unknown) {
  if (error instanceof LovenseError) return error.message;
  return "Something went wrong talking to Lovense Remote.";
}
