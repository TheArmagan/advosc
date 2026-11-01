import type {
  ToyAction,
  ToyFeature,
  ToyInfo,
  ToyPattern,
  ToyPresetName,
  ToyRuleSink,
  ToySettings,
  ToysState,
  ToyTarget,
  ToyTransportId,
  ToyTransportStatus,
} from "$shared/toys";
import { IntifaceTransport } from "./intiface-transport";
import { LOVENSE_PC_ATTEMPTS, LOVENSE_PC_IP, parseLovenseIp } from "./lovense-http";
import { LovenseTransport, type LovenseRoute } from "./lovense-transport";
import { presetPattern, rotateSteps, sanitizePattern } from "./patterns";
import { clampLevel, type EngineToyTransport } from "./transport";

/**
 * The one place toy output is decided. Everything that wants a toy to move holds a claim, and
 * the claims turn into a desired state per toy. A sender then walks that state, one command in
 * flight per transport, paced to the transport's floor. Nothing else talks to a transport.
 *
 * Three rules keep this safe, and the code below is built around them:
 *
 * - Every claim runs out. `link` holds a 2 s lease, `run` is limited by its `seconds`, tests have
 *   a short lease of their own. A claim that isn't renewed turns into an explicit stop.
 * - The cap is applied in exactly one place, `capped`, and read again on every send.
 * - Stops don't queue. They skip pacing and the in-flight slot, they retry, and if a command was
 *   already on its way when one went out, the stop is sent again after it lands. HTTP requests
 *   can overtake each other, so otherwise a late command could restart a stopped toy.
 */

const LEASE_MS = 2000;
const TEST_LEASE_MS = 1500;
/** What a Lovense command runs for with no renewal. Never 0. */
const LEVEL_TIME_SEC = 2.5;
const RENEW_MS = 1000;
/** Patterns can't be renewed mid-step, so they're reissued ahead of running out. */
const PATTERN_SEND_SEC = 5;
const PATTERN_REISSUE_EARLY_MS = 500;
/** Lovense needs `timeSec` above 1, so a short tail still goes out with this and gets a stop. */
const MIN_SEND_SEC = 1.1;
const MAX_RUN_SEC = 600;

const TICK_MS = 50;
/** A backstop over each transport's own timeout, so the slot can't jam whatever it does. */
const SEND_TIMEOUT_MS = 2500;
const SEND_RETRY_MS = 500;
const STOP_TIMEOUT_MS = 1500;
const STOP_ATTEMPTS = 3;
const STOP_RETRY_MS = 150;
const SHUTDOWN_LIMIT_MS = 1500;

type ClaimBody =
  | { kind: "levels"; level: number }
  | { kind: "pattern"; pattern: ToyPattern; startedAt: number }
  | { kind: "preset"; preset: ToyPresetName; startedAt: number };

interface Claim {
  id: string;
  owner: string;
  target: ToyTarget;
  body: ClaimBody;
  /** `live` and `while` output, which OSC silence pauses. */
  pausable: boolean;
  /**
   * A `live` rule letting go when its level hits 0 is ordinary output, and it can happen on
   * every other sample of a 30 Hz signal. That stop stays paced, or it would break the floor.
   */
  pacedRelease: boolean;
  expiresAt: number;
  /** Toys, or `toy|feature` pairs, that a `stop` action took out of this claim. */
  excluded: Set<string>;
}

type Desired =
  | { kind: "idle" }
  | { kind: "levels"; key: string; levels: Partial<Record<ToyFeature, number>> }
  | { kind: "pattern"; key: string; pattern: ToyPattern; seconds: number }
  | { kind: "preset"; key: string; preset: ToyPresetName; seconds: number };

interface SentOutput {
  key: string;
  at: number;
  /** When this needs sending again even if nothing changed. */
  renewAt: number;
}

const ALL_TOYS = "*";

interface Slot {
  routeKey: string;
  transport: EngineToyTransport;
  toys: ToyInfo[];
  sent: Map<string, SentOutput>;
  retryAt: Map<string, number>;
  inFlight: boolean;
  /** Stops issued while a command was in flight, by toy id or `ALL_TOYS`. */
  stopsDuringFlight: Set<string>;
  lastSendAt: number;
  pumpTimer: ReturnType<typeof setTimeout> | null;
  retiring: boolean;
  unlisten: (() => void)[];
}

export interface ToyServiceHooks {
  /** Toys, transports, or a pause changed. */
  onState(state: ToysState): void;
  /** Whether any toy could be moving, for the watchdog's short limit. */
  onActive(active: boolean): void;
  /** Where main can reach toys by itself changed. */
  onRoutes(routes: { enabled: boolean; lovense: { ip: string; attempts: LovenseRoute["attempts"] }[] }): void;
}

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out talking to the toy.")), ms);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class ToyService {
  private settings: ToySettings;
  private slots = new Map<ToyTransportId, Slot>();
  private claims = new Map<string, Claim>();
  private rearmListeners = new Set<() => void>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private transportSync: Promise<void> = Promise.resolve();

  private started = false;
  private latched: boolean;
  private safeMode = false;
  private silencePaused = false;
  private vrchatPaused = false;
  private shuttingDown = false;
  /** A new engine after a crash. Listeners that register get the rearm signal straight away. */
  private muteOnRegister: boolean;
  private active = false;

  /** What Automations hold. The method names are the contract, so this is a plain object. */
  readonly sink: ToyRuleSink;

  constructor(
    settings: ToySettings,
    options: { latched: boolean; muted: boolean },
    private hooks: ToyServiceHooks,
  ) {
    this.settings = settings;
    this.latched = options.latched;
    this.muteOnRegister = options.muted;

    const service = this;
    this.sink = {
      get armed() {
        return service.armed;
      },
      link: (ruleId, target, level) => this.link(ruleId, target, level),
      run: (ruleId, action, mode) => this.run(ruleId, action, mode),
      release: (ruleId) => this.release(ruleId),
      onRearm: (listener) => {
        this.rearmListeners.add(listener);
        if (this.muteOnRegister) listener();
        return () => this.rearmListeners.delete(listener);
      },
    };
  }

  // --------------------------------------------------------------------- gates

  /** On, not latched, not in safe mode, not on the way out. */
  get armed() {
    return this.settings.enabled && !this.latched && !this.safeMode && !this.shuttingDown;
  }

  /** Read fresh on every send, so a lowered cap can't be outrun. */
  private get cap() {
    const { maxLevel } = this.settings;
    return Number.isFinite(maxLevel) ? clampLevel(maxLevel) : 0;
  }

  private capped(level: number) {
    return Math.min(clampLevel(level), this.cap);
  }

  private get pausedReason(): ToysState["paused"] {
    if (this.safeMode) return "safe-mode";
    if (this.vrchatPaused) return "vrchat-closed";
    if (this.silencePaused) return "osc-silence";
    return null;
  }

  isLatched() {
    return this.latched;
  }

  // ---------------------------------------------------------------- transports

  start(options: { safeMode: boolean }) {
    this.safeMode = options.safeMode;
    this.started = true;
    this.syncTransports();
    this.publish();
  }

  private routes(): { id: ToyTransportId; key: string; route: unknown }[] {
    if (!this.started || !this.settings.enabled || this.latched || this.safeMode || this.shuttingDown) return [];
    return this.configuredRoutes();
  }

  private configuredRoutes(): { id: ToyTransportId; key: string; route: unknown }[] {
    const { lovensePc, lovenseLan, intiface } = this.settings;
    const routes: { id: ToyTransportId; key: string; route: unknown }[] = [];

    if (lovensePc.enabled) {
      const route: LovenseRoute = { ip: LOVENSE_PC_IP, attempts: LOVENSE_PC_ATTEMPTS.map((attempt) => ({ ...attempt })) };
      routes.push({ id: "lovense-pc", key: JSON.stringify(route), route });
    }

    const lanIp = lovenseLan.enabled ? parseLovenseIp(lovenseLan.host) : null;
    if (lanIp && lovenseLan.port > 0 && lovenseLan.port < 65536) {
      const route: LovenseRoute = {
        ip: lanIp,
        attempts: [
          { scheme: "https", port: lovenseLan.port },
          { scheme: "http", port: lovenseLan.port },
        ],
      };
      routes.push({ id: "lovense-lan", key: JSON.stringify(route), route });
    }

    if (intiface.enabled && intiface.url) {
      routes.push({ id: "intiface", key: intiface.url, route: intiface.url });
    }
    return routes;
  }

  private createTransport(id: ToyTransportId, route: unknown): EngineToyTransport {
    if (id === "intiface") return new IntifaceTransport(route as string, this.muteOnRegister);
    return new LovenseTransport(id, route as LovenseRoute);
  }

  /** Serialized, because a slow retire must finish before its replacement connects. */
  private syncTransports() {
    this.transportSync = this.transportSync.then(() => this.applyTransports()).catch((error) => {
      console.error("Could not update toy connections:", error);
    });
    return this.transportSync;
  }

  private async applyTransports() {
    const wanted = this.routes();

    const retiring = [...this.slots.entries()].filter(
      ([id, slot]) => !wanted.some((route) => route.id === id && route.key === slot.routeKey),
    );
    await Promise.all(retiring.map(([id, slot]) => this.retire(id, slot)));

    for (const { id, key, route } of wanted) {
      if (this.slots.has(id)) continue;
      const transport = this.createTransport(id, route);
      const slot: Slot = {
        routeKey: key,
        transport,
        toys: [],
        sent: new Map(),
        retryAt: new Map(),
        inFlight: false,
        stopsDuringFlight: new Set(),
        lastSendAt: 0,
        pumpTimer: null,
        retiring: false,
        unlisten: [],
      };
      slot.unlisten.push(
        transport.on("toys", (toys) => this.handleToys(slot, toys)),
        transport.on("status", (status) => this.handleStatus(slot, status)),
      );
      this.slots.set(id, slot);
      void transport.connect().catch((error) => console.warn(`Toy transport ${id} failed to connect:`, error));
    }

    this.publish();
    this.publishRoutes();
  }

  /** Stops first, so nothing is left running behind a connection that's about to go away. */
  private async retire(id: ToyTransportId, slot: Slot) {
    slot.retiring = true;
    if (slot.pumpTimer) clearTimeout(slot.pumpTimer);
    slot.pumpTimer = null;

    await this.hardStop(slot);
    await this.waitForFlight(slot);

    for (const unlisten of slot.unlisten) unlisten();
    try {
      await slot.transport.disconnect();
    } catch (error) {
      console.warn(`Toy transport ${id} failed to disconnect:`, error);
    }
    if (this.slots.get(id) === slot) this.slots.delete(id);
  }

  private async waitForFlight(slot: Slot) {
    const giveUpAt = Date.now() + STOP_TIMEOUT_MS;
    while (slot.inFlight && Date.now() < giveUpAt) await new Promise((resolve) => setTimeout(resolve, 20));
  }

  private handleToys(slot: Slot, toys: ToyInfo[]) {
    slot.toys = toys;
    // A failed link empties the list too, but the toy may still be running what it last got.
    // Keeping the record means the stop still goes out when the claim ends.
    if (slot.transport.status().state === "connected") {
      for (const toyId of slot.sent.keys()) {
        if (!toys.some((toy) => toy.id === toyId && toy.connected)) slot.sent.delete(toyId);
      }
    }
    this.publish();
    this.refreshActive();
    this.pump(slot);
  }

  private handleStatus(slot: Slot, status: ToyTransportStatus) {
    // Nothing says what survived the outage, so everything active goes out again.
    if (status.state === "connected") {
      for (const output of slot.sent.values()) output.renewAt = 0;
      // Now the working scheme is known, so main's direct Stop can try it first.
      this.publishRoutes();
    }
    this.publish();
    this.refreshActive();
    this.pump(slot);
  }

  // -------------------------------------------------------------------- claims

  private link(ruleId: string, target: ToyTarget, level: number) {
    if (!this.mayStartRule()) return;
    const id = `${ruleId}\0link\0${JSON.stringify(target)}`;
    const existing = this.claims.get(id);
    const now = Date.now();
    if (existing?.body.kind === "levels") {
      existing.body.level = clampLevel(level);
      existing.expiresAt = now + LEASE_MS;
    } else {
      this.addClaim({
        id,
        owner: ruleId,
        target,
        body: { kind: "levels", level: clampLevel(level) },
        pausable: true,
        pacedRelease: true,
        expiresAt: now + LEASE_MS,
        excluded: new Set(),
      });
    }
    this.wake();
  }

  private run(ruleId: string, action: Exclude<ToyAction, { kind: "link" }>, mode: "edge" | "while" = "while") {
    if (!this.mayStartRule()) return;

    if (action.kind === "stop") {
      this.stopTarget(action.target);
      return;
    }

    const seconds = Number(action.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const now = Date.now();
    const expiresAt = now + Math.min(seconds, MAX_RUN_SEC) * 1000;

    let body: ClaimBody;
    if (action.kind === "pulse") {
      body = { kind: "levels", level: clampLevel(action.level) };
    } else if (action.kind === "preset") {
      if (!presetPattern(action.preset, [])) return;
      body = { kind: "preset", preset: action.preset, startedAt: now };
    } else {
      const stored = this.settings.patterns.find((pattern) => pattern.id === action.patternId);
      const pattern = stored && sanitizePattern(stored);
      if (!pattern) {
        console.warn(`A rule asked for a toy pattern that doesn't exist: ${action.patternId}`);
        return;
      }
      body = { kind: "pattern", pattern, startedAt: now };
    }

    this.addClaim({
      id: `${ruleId}\0run\0${action.kind}\0${JSON.stringify(action.target)}`,
      owner: ruleId,
      target: action.target,
      body,
      pausable: mode === "while",
      pacedRelease: false,
      expiresAt,
      excluded: new Set(),
    });
    this.wake();
  }

  private release(ruleId: string) {
    let immediate = false;
    let paced = false;
    for (const [id, claim] of this.claims) {
      if (claim.owner !== ruleId) continue;
      this.claims.delete(id);
      if (claim.pacedRelease) paced = true;
      else immediate = true;
    }
    if (immediate) this.afterClaimsDropped();
    else if (paced) this.wake();
  }

  /** Rules wait out a closed VRChat. Manual tests don't: that's when you'd run one. */
  private mayStartRule() {
    return this.armed && !this.vrchatPaused;
  }

  private addClaim(claim: Claim) {
    // Delete first so a replaced claim counts as the newest. Patterns pick the newest.
    this.claims.delete(claim.id);
    this.claims.set(claim.id, claim);
  }

  /** Takes these toys out of every claim. The claims themselves may still cover other toys. */
  private stopTarget(target: ToyTarget) {
    for (const slot of this.slots.values()) {
      for (const toy of slot.toys) {
        if (target.toyIds.length && !target.toyIds.includes(toy.id)) continue;
        for (const claim of this.claims.values()) {
          if (target.features.length) for (const feature of target.features) claim.excluded.add(`${toy.id}|${feature}`);
          else claim.excluded.add(toy.id);
        }
      }
    }

    // Stopping everything reaches toys with nothing on record, like one a crashed engine left on.
    if (target.toyIds.length === 0 && target.features.length === 0) {
      for (const slot of this.slots.values()) void this.hardStop(slot);
      this.refreshActive();
    } else {
      this.afterClaimsDropped();
    }
  }

  /** The lease ran out, a rule let go, or a pause began: whatever is now idle gets a real stop. */
  private afterClaimsDropped() {
    const now = Date.now();
    for (const slot of this.slots.values()) {
      for (const toyId of [...slot.sent.keys()]) {
        const toy = slot.toys.find((entry) => entry.id === toyId);
        if (!toy || this.desiredFor(slot, toy, now).kind === "idle") void this.hardStop(slot, toyId);
      }
      this.pump(slot);
    }
    this.refreshActive();
  }

  private coveredFeatures(claim: Claim, toy: ToyInfo) {
    if (claim.excluded.has(toy.id)) return [];
    if (claim.target.toyIds.length && !claim.target.toyIds.includes(toy.id)) return [];
    const wanted = claim.target.features.length ? claim.target.features : toy.features;
    return wanted.filter((feature) => toy.features.includes(feature) && !claim.excluded.has(`${toy.id}|${feature}`));
  }

  private desiredFor(slot: Slot, toy: ToyInfo, now: number): Desired {
    let sequence: { claim: Claim; features: ToyFeature[] } | null = null;
    const levels: Partial<Record<ToyFeature, number>> = {};

    for (const claim of this.claims.values()) {
      if (now >= claim.expiresAt) continue;
      if (claim.pausable && this.silencePaused) continue;
      const features = this.coveredFeatures(claim, toy);
      if (!features.length) continue;

      if (claim.body.kind === "levels") {
        for (const feature of features) {
          levels[feature] = Math.max(levels[feature] ?? 0, claim.body.level);
        }
      } else {
        // Map order is age, so this ends on the newest.
        sequence = { claim, features };
      }
    }

    if (sequence) return this.desiredSequence(slot, toy, sequence.claim, sequence.features, now);

    const quantized = Object.entries(levels).map(([feature, level]) => {
      const cappedLevel = this.capped(level);
      levels[feature as ToyFeature] = cappedLevel;
      return [feature, slot.transport.quantize(toy.id, feature as ToyFeature, cappedLevel)] as const;
    });
    if (quantized.every(([, step]) => step === 0)) return { kind: "idle" };
    return {
      kind: "levels",
      levels,
      key: quantized
        .map(([feature, step]) => `${feature}=${step}`)
        .sort()
        .join(","),
    };
  }

  private desiredSequence(slot: Slot, toy: ToyInfo, claim: Claim, features: ToyFeature[], now: number): Desired {
    const remainingSec = (claim.expiresAt - now) / 1000;
    const seconds = Math.max(MIN_SEND_SEC, Math.min(PATTERN_SEND_SEC, remainingSec));
    const body = claim.body as Exclude<ClaimBody, { kind: "levels" }>;

    // Native presets have no strength field, so one can only run with nothing to cap.
    if (body.kind === "preset" && this.cap >= 1 && slot.transport.playPreset) {
      return { kind: "preset", key: `preset:${claim.id}`, preset: body.preset, seconds };
    }

    const table = body.kind === "preset" ? presetPattern(body.preset, features) : body.pattern;
    if (!table) return { kind: "idle" };

    const usable = table.features.length ? features.filter((feature) => table.features.includes(feature)) : features;
    if (!usable.length) return { kind: "idle" };

    const steps = rotateSteps(table.steps, table.stepMs, now - body.startedAt).map((step) => this.capped(step));
    if (steps.every((step) => usable.every((feature) => slot.transport.quantize(toy.id, feature, step) === 0))) {
      return { kind: "idle" };
    }
    return {
      kind: "pattern",
      pattern: { ...table, steps, features: usable },
      seconds,
      // The cap is in here so lowering it reissues the running pattern.
      key: `pattern:${claim.id}:${this.cap}`,
    };
  }

  // -------------------------------------------------------------------- sender

  private wake() {
    if (!this.ticker) this.ticker = setInterval(() => this.tick(), TICK_MS);
    for (const slot of this.slots.values()) this.pump(slot);
    this.refreshActive();
  }

  private tick() {
    const now = Date.now();
    let dropped = false;
    for (const [id, claim] of this.claims) {
      if (now < claim.expiresAt) continue;
      this.claims.delete(id);
      dropped = true;
    }
    if (dropped) this.afterClaimsDropped();

    for (const slot of this.slots.values()) {
      // A toy that dropped off the list with nothing left claiming it never reaches the sender.
      if (this.claims.size === 0) {
        for (const toyId of [...slot.sent.keys()]) {
          if (!slot.toys.some((toy) => toy.id === toyId && toy.connected)) void this.hardStop(slot, toyId);
        }
      }
      this.pump(slot);
    }

    const busy = this.claims.size > 0 || [...this.slots.values()].some((slot) => slot.sent.size > 0 || slot.inFlight);
    if (!busy && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.refreshActive();
  }

  private pump(slot: Slot) {
    if (slot.inFlight || slot.pumpTimer || slot.retiring) return;
    if (slot.transport.status().state !== "connected") return;
    if (!this.armed) return;

    const now = Date.now();
    const next = this.nextSend(slot, now);
    if (!next) return;

    const wait = slot.lastSendAt + slot.transport.minSendIntervalMs - now;
    if (wait > 0) {
      slot.pumpTimer = setTimeout(() => {
        slot.pumpTimer = null;
        this.pump(slot);
      }, wait);
      return;
    }
    void this.send(slot, next.toy, next.desired, now);
  }

  /** Whoever has waited longest goes first, so one busy toy can't starve another. */
  private nextSend(slot: Slot, now: number) {
    let best: { toy: ToyInfo; desired: Desired; age: number } | null = null;

    for (const toy of slot.toys) {
      if (!toy.connected) continue;
      if ((slot.retryAt.get(toy.id) ?? 0) > now) continue;

      const desired = this.desiredFor(slot, toy, now);
      const sent = slot.sent.get(toy.id);
      const key = desired.kind === "idle" ? null : desired.key;
      const due = key === null ? sent !== undefined : sent?.key !== key || now >= sent.renewAt;
      if (!due) continue;

      const age = now - (sent?.at ?? 0);
      if (!best || age > best.age) best = { toy, desired, age };
    }
    return best;
  }

  private dispatch(slot: Slot, toyId: string, desired: Desired): Promise<void> {
    const { transport } = slot;
    switch (desired.kind) {
      case "idle":
        return transport.stop(toyId);
      case "levels":
        return transport.setLevels(toyId, desired.levels, LEVEL_TIME_SEC);
      case "preset":
        return transport.playPreset!(toyId, desired.preset, desired.seconds);
      case "pattern":
        return transport.playPattern(toyId, desired.pattern, desired.seconds);
    }
  }

  private renewAt(slot: Slot, desired: Desired, now: number) {
    if (desired.kind === "levels") return slot.transport.boundedCommands ? now + RENEW_MS : Infinity;
    if (desired.kind === "pattern" || desired.kind === "preset") {
      return now + Math.max(RENEW_MS, desired.seconds * 1000 - PATTERN_REISSUE_EARLY_MS);
    }
    return Infinity;
  }

  private async send(slot: Slot, toy: ToyInfo, desired: Desired, now: number) {
    slot.inFlight = true;
    slot.lastSendAt = now;
    slot.stopsDuringFlight.clear();

    let succeeded = false;
    try {
      await withTimeout(this.dispatch(slot, toy.id, desired), SEND_TIMEOUT_MS);
      succeeded = true;
    } catch (error) {
      console.warn(`Toy command failed: ${(error as Error).message}`);
      slot.retryAt.set(toy.id, Date.now() + SEND_RETRY_MS);
    }

    slot.inFlight = false;
    const stoppedMeanwhile = slot.stopsDuringFlight.has(ALL_TOYS) || slot.stopsDuringFlight.has(toy.id);
    slot.stopsDuringFlight.clear();

    if (stoppedMeanwhile) {
      // Don't record this as sent, and stop again: the command may have landed after the stop.
      if (this.desiredFor(slot, toy, Date.now()).kind === "idle" || !this.armed) void this.hardStop(slot, toy.id);
    } else if (succeeded) {
      slot.retryAt.delete(toy.id);
      if (desired.kind === "idle") slot.sent.delete(toy.id);
      else slot.sent.set(toy.id, { key: desired.key, at: now, renewAt: this.renewAt(slot, desired, now) });
    }

    this.refreshActive();
    this.pump(slot);
  }

  /** Resolves true once the far end confirmed. Skips pacing and doesn't wait for the slot. */
  private async hardStop(slot: Slot, toyId?: string): Promise<boolean> {
    if (toyId) slot.sent.delete(toyId);
    else slot.sent.clear();
    if (slot.inFlight) slot.stopsDuringFlight.add(toyId ?? ALL_TOYS);

    for (let attempt = 1; attempt <= STOP_ATTEMPTS; attempt++) {
      try {
        await withTimeout(slot.transport.stop(toyId), STOP_TIMEOUT_MS);
        return true;
      } catch (error) {
        console.warn(`Toy stop failed (attempt ${attempt}): ${(error as Error).message}`);
        // Something new may have started since. It's that command's turn to be stopped.
        if (toyId && slot.sent.has(toyId)) return false;
        if (attempt < STOP_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, STOP_RETRY_MS));
      }
    }
    return false;
  }

  /** Drops every claim and stops every toy this service can reach. */
  private stopEverything() {
    this.claims.clear();
    return Promise.all([...this.slots.values()].map((slot) => this.hardStop(slot)));
  }

  private fireRearm() {
    for (const listener of this.rearmListeners) {
      try {
        listener();
      } catch (error) {
        console.error("A toy rearm listener failed:", error);
      }
    }
  }

  // ---------------------------------------------------------- state and events

  private refreshActive() {
    const active =
      this.claims.size > 0 || [...this.slots.values()].some((slot) => slot.sent.size > 0 || slot.inFlight);
    if (active === this.active) return;
    this.active = active;
    this.hooks.onActive(active);
  }

  getToys(): ToyInfo[] {
    return [...this.slots.values()].flatMap((slot) => slot.toys);
  }

  getTransports(): ToyTransportStatus[] {
    return [...this.slots.values()].map((slot) => slot.transport.status());
  }

  private publish() {
    this.hooks.onState({
      transports: this.getTransports(),
      toys: this.getToys(),
      paused: this.pausedReason,
    });
  }

  private publishRoutes() {
    const lovense = this.settings.enabled
      ? this.configuredRoutes()
          .filter((route) => route.id !== "intiface")
          .map((route) => {
            const slot = this.slots.get(route.id);
            if (slot?.transport instanceof LovenseTransport) return slot.transport.stopTarget();
            return route.route as LovenseRoute;
          })
      : [];
    this.hooks.onRoutes({ enabled: this.settings.enabled, lovense });
  }

  // ------------------------------------------------------------------ settings

  applySettings(next: ToySettings) {
    const previous = this.settings;
    this.settings = next;
    if (!this.started) return;

    if (!next.enabled && previous.enabled) this.claims.clear();
    // Turning it back on shouldn't start anything by itself, same as a re-arm.
    if (next.enabled && !previous.enabled) this.fireRearm();
    void this.syncTransports();

    // A new cap changes every desired key, so this goes out through the normal sender.
    if (next.maxLevel !== previous.maxLevel) {
      for (const slot of this.slots.values()) this.pump(slot);
    }
  }

  // ------------------------------------------------------------- safety signals

  /** VRChat went away. A hard stop, and rules stay out until it's seen again. */
  vrchatExited() {
    if (this.vrchatPaused) return;
    console.log("VRChat closed, stopping toys.");
    this.vrchatPaused = true;
    this.interrupt();
    this.publish();
  }

  vrchatSeen() {
    if (!this.vrchatPaused) return;
    this.vrchatPaused = false;
    this.publish();
  }

  /** Stops output without latching. Rules wait for their source to go inactive once, like after a re-arm. */
  interrupt() {
    this.fireRearm();
    void this.stopEverything();
    this.refreshActive();
  }

  setSilencePaused(paused: boolean) {
    if (this.silencePaused === paused) return;
    this.silencePaused = paused;
    console.log(paused ? "OSC went quiet, pausing live toy output." : "OSC is back, resuming toy output.");
    if (paused) this.afterClaimsDropped();
    else for (const slot of this.slots.values()) this.pump(slot);
    this.publish();
  }

  // ----------------------------------------------------------------------- api

  /**
   * Latches and stops everything. Resolves true when it's safe to tell main so: every transport
   * with no bounded commands confirmed its stop, since nothing else would end that output.
   */
  async panic(): Promise<boolean> {
    this.latched = true;
    this.claims.clear();

    const unbounded = [...this.slots.values()].filter(
      (slot) => !slot.transport.boundedCommands && slot.transport.status().state === "connected",
    );
    const stops = new Map([...this.slots.values()].map((slot) => [slot, this.hardStop(slot)]));
    this.refreshActive();
    this.publish();

    const results = await Promise.all(unbounded.map((slot) => stops.get(slot)!));

    // Only let go of connections once the stops are done. A latched service holds none.
    void Promise.all(stops.values()).then(() => this.syncTransports());
    return results.every(Boolean);
  }

  rearm() {
    if (!this.latched) return;
    // Before the latch clears, so no rule can jump in between the two.
    this.fireRearm();
    this.latched = false;
    void this.syncTransports();
    this.publish();
  }

  async stopAll() {
    await this.stopEverything();
    this.refreshActive();
  }

  async test(toyId: string, feature: ToyFeature, level: number) {
    if (!this.settings.enabled) throw new Error("Turn on toy control first.");
    if (this.latched) throw new Error("Panic is on. Re-arm before testing.");
    if (this.safeMode) throw new Error("Toys are off in safe mode.");

    const toy = this.getToys().find((entry) => entry.id === toyId);
    if (!toy?.connected) throw new Error("That toy isn't connected.");
    if (!toy.features.includes(feature)) throw new Error("That toy can't do that.");

    this.addClaim({
      id: `test\0${toyId}\0${feature}`,
      owner: `test:${toyId}`,
      target: { toyIds: [toyId], features: [feature] },
      body: { kind: "levels", level: clampLevel(level) },
      pausable: false,
      pacedRelease: false,
      expiresAt: Date.now() + TEST_LEASE_MS,
      excluded: new Set(),
    });
    this.wake();
  }

  async refresh() {
    await Promise.all([...this.slots.values()].map((slot) => slot.transport.listToys().catch(() => [])));
    this.publish();
  }

  /** The engine is going away. Stops before anything else, and never waits past the limit. */
  async shutdown() {
    this.shuttingDown = true;
    this.claims.clear();
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;

    const finished = this.syncTransports();
    await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, SHUTDOWN_LIMIT_MS))]);
  }
}
