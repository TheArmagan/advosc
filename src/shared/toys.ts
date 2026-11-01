/**
 * Toy control, shared by the engine's service, its transports, Automations and the UI.
 *
 * Levels are always 0 to 1 here. Each transport converts them to what its device takes, and the
 * global strength cap is applied once, in the service, before a transport ever sees a level.
 */

export const TOY_SETTINGS_KEY = "Toys;Settings";

export type ToyFeature =
  | "Vibrate"
  | "Rotate"
  | "Pump"
  | "Thrusting"
  | "Fingering"
  | "Suction"
  | "Depth"
  | "Stroke"
  | "Oscillate";

export type ToyPresetName = "pulse" | "wave" | "fireworks" | "earthquake";

export type ToyTransportId = "lovense-pc" | "lovense-lan" | "intiface";

export interface ToyInfo {
  /** Unique across transports: `<transport>:<device id>`. */
  id: string;
  name: string;
  transport: ToyTransportId;
  features: ToyFeature[];
  /** 0 to 100, null when the device doesn't report it. */
  battery: number | null;
  connected: boolean;
}

export type ToyTransportState = "disabled" | "connecting" | "connected" | "error";

export interface ToyTransportStatus {
  id: ToyTransportId;
  state: ToyTransportState;
  /** Plain words, shown as they are in the UI. */
  error?: string;
}

/** A pattern is steps played in order and repeated, so a bounded send can be reissued. */
export interface ToyPattern {
  id: string;
  name: string;
  /** Milliseconds per step. Lovense requires more than 100. */
  stepMs: number;
  /** 0 to 1, at most 50 of them. */
  steps: number[];
  features: ToyFeature[];
}

/** Empty `toyIds` means every connected toy. */
export interface ToyTarget {
  toyIds: string[];
  features: ToyFeature[];
}

export type ToyAction =
  /** Follow the rule's mapped value. Only valid on a `live` automation. */
  | { kind: "link"; target: ToyTarget }
  /** `seconds` is a limit on the run, not on the rule. Only for `edge`, and `while` stops early. */
  | { kind: "pulse"; target: ToyTarget; level: number; seconds: number }
  | { kind: "preset"; target: ToyTarget; preset: ToyPresetName; seconds: number }
  | { kind: "pattern"; target: ToyTarget; patternId: string; seconds: number }
  | { kind: "stop"; target: ToyTarget };

export interface ToySettings {
  /** Off until turned on in Settings. Nothing connects and no placeholder acts while off. */
  enabled: boolean;
  /** 0 to 1. Applies to every level from every source, manual test buttons included. */
  maxLevel: number;
  /** Pause `live` and `while` output after this much OSC silence. 0 turns it off. */
  silencePauseSec: number;
  stopOnAvatarChange: boolean;
  lovensePc: { enabled: boolean };
  /** `port` is whatever the phone's Game Mode screen shows. */
  lovenseLan: { enabled: boolean; host: string; port: number };
  intiface: { enabled: boolean; url: string };
  patterns: ToyPattern[];
}

export const defaultToySettings: ToySettings = {
  enabled: false,
  maxLevel: 0.5,
  silencePauseSec: 120,
  stopOnAvatarChange: false,
  lovensePc: { enabled: true },
  lovenseLan: { enabled: false, host: "", port: 0 },
  intiface: { enabled: false, url: "ws://127.0.0.1:12345" },
  patterns: [],
};

export interface ToyTransportEvents {
  status: (status: ToyTransportStatus) => void;
  toys: (toys: ToyInfo[]) => void;
}

/**
 * One way of reaching toys. Rate limiting, leases, renewal, the cap and panic all live in the
 * service above this, so a transport only has to do what it's told and report failures by
 * rejecting.
 */
export interface ToyTransport {
  readonly id: ToyTransportId;
  /** Floor between sends. The service paces to this. */
  readonly minSendIntervalMs: number;
  /**
   * False when the far end can't run a command for a bounded time, so a lost ADVOSC relies on
   * the connection closing instead of a command running out. Intiface is false.
   */
  readonly boundedCommands: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): ToyTransportStatus;
  listToys(): Promise<ToyInfo[]>;
  on<E extends keyof ToyTransportEvents>(event: E, listener: ToyTransportEvents[E]): () => void;

  /**
   * Sets levels on one toy. `seconds` is how long it may run with no further command, ignored
   * when `boundedCommands` is false. It has to be above 1 and is never 0.
   */
  setLevels(toyId: string, levels: Partial<Record<ToyFeature, number>>, seconds: number): Promise<void>;
  /** Only on transports with native presets. The service checks the strength cap first. */
  playPreset?(toyId: string, preset: ToyPresetName, seconds: number): Promise<void>;
  playPattern(toyId: string, pattern: ToyPattern, seconds: number): Promise<void>;
  /** Skips all pacing. Omit `toyId` to stop everything this transport reaches. */
  stop(toyId?: string): Promise<void>;
}

/**
 * How Automations reach the toy service. The automation engine only knows this interface, and
 * the toy service hands an implementation over at startup, so neither imports the other. Until
 * then, and whenever toys are disabled, rules with toy actions do nothing.
 */
export interface ToyRuleSink {
  /** Whether a toy action may start. False while the panic latch is set. */
  readonly armed: boolean;
  /** A `live` rule's mapped level, 0 to 1. Holds a lease, so a rule that goes quiet stops by itself. */
  link(ruleId: string, target: ToyTarget, level: number): void;
  run(ruleId: string, action: Exclude<ToyAction, { kind: "link" }>): void;
  /** The rule ended, was disabled, or was edited. Drops everything it holds. */
  release(ruleId: string): void;
  /**
   * After a re-arm, `while` and `live` rules stay muted until their source goes inactive once,
   * so nothing jumps back on. The automation engine tracks that from this.
   */
  onRearm(listener: () => void): () => void;
}

/** What main holds about panic. `hotkey` is an Electron accelerator, "" when unset. */
export interface PanicState {
  latched: boolean;
  hotkey: string;
}

export interface PanicHotkeyResult {
  ok: boolean;
  /** Plain words, shown as they are. Set when the hotkey couldn't be registered. */
  error?: string;
  state: PanicState;
}

/**
 * Exposed as `window.ADVOSCNative.panic`, and handled in main, never through the engine. Panic
 * has to work when the engine is hung, and the hotkey has to fire with no engine at all, so
 * this goes over plain IPC and both values live in `bootstrap.json`.
 */
export interface PanicApi {
  get(): Promise<PanicState>;
  /** Latches, stops every toy, and returns once main has done its part. Safe to call twice. */
  trigger(): Promise<PanicState>;
  /** Clears the latch. `while` and `live` rules stay muted until their source goes inactive once. */
  rearm(): Promise<PanicState>;
  /** Registers it first and only saves on success. An empty string clears it. */
  setHotkey(accelerator: string): Promise<PanicHotkeyResult>;
  onChange(callback: (state: PanicState) => void): () => void;
}

/**
 * Engine RPC surface for toys, under the `toys.` prefix. Panic isn't here: see `PanicApi`.
 * `stopAll` is a plain stop that doesn't latch.
 */
export interface ToysApi {
  getTransports(): ToyTransportStatus[];
  getToys(): ToyInfo[];
  refresh(): Promise<void>;
  /** Tries HTTPS then HTTP on the given port. Certificate failures are reported, never bypassed. */
  testLovense(host: string, port: number): Promise<{ ok: boolean; scheme?: "https" | "http"; error?: string }>;
  /** Short manual test with its own lease, always under the cap. */
  test(toyId: string, feature: ToyFeature, level: number): Promise<void>;
  stopAll(): Promise<void>;
}

/** Mirror key for `ToysState`. */
export const MIRROR_TOYS = "Toys;State";

/** Comes from the engine, so it can go stale. Read panic state from `PanicApi` instead. */
export interface ToysState {
  transports: ToyTransportStatus[];
  toys: ToyInfo[];
  /** Why output is paused right now, if it is. */
  paused: null | "osc-silence" | "vrchat-closed" | "safe-mode";
}
