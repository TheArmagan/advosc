/**
 * Wire format between a window and the engine. Every frame on the port is a JSON string: the
 * renderer's objects can be `$state` proxies, which neither the context bridge nor a
 * structured clone will accept, and one encoder in one place is the simplest fix.
 *
 * `state`/`write` carry persisted stores, `mirror` carries read-only engine state, `stream`
 * carries high-rate deltas that only flow while a window is subscribed.
 */

export interface EngineInfo {
  version: string;
  safeMode: boolean;
}

export type ClientMessage =
  | { t: "hello" }
  | { t: "call"; id: number; m: string; a: unknown[] }
  /** `v` is the value as a JSON string, or null to remove the key. `s` is the sender's sequence number. */
  | { t: "write"; k: string; s: number; v: string | null }
  | { t: "sub"; k: string }
  | { t: "unsub"; k: string };

export type EngineMessage =
  | { t: "welcome"; data: Record<string, string>; mirrors: Record<string, unknown>; info: EngineInfo }
  | { t: "res"; id: number; ok: boolean; v?: unknown; e?: string }
  /** `a` is the last write sequence from this client the engine had applied when it sent this. */
  | { t: "state"; k: string; v: string | null; a: number }
  | { t: "mirror"; k: string; v: unknown }
  /** `r` means replace everything the client holds for this stream, not merge. */
  | { t: "stream"; k: string; r?: boolean; d: Record<string, unknown> }
  | { t: "evt"; n: string; p?: unknown };

/** Stream keys. Listed here because both ends have to agree on them. */
export const STREAM_PARAMETERS = "AvatarOSC;Parameters";
export const STREAM_CHANGED_AT = "AvatarOSC;ChangedAt";

/** Where main can reach a Lovense app with no engine. `attempts` are tried in order. */
export interface LovenseStopTarget {
  ip: string;
  attempts: { scheme: "https" | "http"; port: number }[];
}

/**
 * What main needs to stop toys on its own, kept current by the engine. Intiface isn't in here:
 * its socket lives in the engine, and killing the engine is what closes it.
 */
export interface ToyFailsafe {
  enabled: boolean;
  lovense: LovenseStopTarget[];
}

export interface HostShortcutResult {
  success: boolean;
  accelerator: string;
  error?: string;
}

/** What the engine asks main for, since Tray, globalShortcut, dialog and shell don't exist in a utility process. */
export interface HostMethods {
  "shortcut.register": (accelerator: string, callbackId: string) => HostShortcutResult;
  "shortcut.unregister": (accelerator: string) => HostShortcutResult;
  "shortcut.unregisterAll": () => { success: boolean; error?: string };
  "shortcut.isRegistered": (accelerator: string) => boolean;
  "dialog.openAudioFiles": () => string[];
  "shell.openExternal": (url: string) => { success: boolean; error?: string };
  /** The Lovense module's Panic input. Main owns the latch, so this only asks. */
  "panic.trigger": () => { latched: boolean };
  "toys.setFailsafe": (failsafe: ToyFailsafe) => void;
}

export type HostMethodName = keyof HostMethods;

export type MainToEngine =
  /** Carries a MessagePortMain for a new window in `ports`. */
  | { t: "client"; id: number }
  | { t: "hb"; at: number }
  | { t: "res"; id: number; ok: boolean; v?: unknown; e?: string }
  | { t: "shortcut"; id: string }
  | { t: "shutdown" }
  /** Latch, stop everything, then answer with `panic-ack`. No answer in 300 ms gets the engine killed. */
  | { t: "panic"; id: number }
  | { t: "rearm" }
  /** A plain stop that doesn't latch, for the PC going to sleep. */
  | { t: "toys-stop" };

export type EngineToMain =
  | { t: "ready" }
  | { t: "hb"; at: number; active: boolean }
  | { t: "call"; id: number; m: HostMethodName; a: unknown[] }
  | { t: "shutdown-done" }
  | { t: "panic-ack"; id: number };

/** Handed to the engine at fork, through the environment. */
export interface EngineConfig {
  userData: string;
  dataDir: string;
  logDir: string;
  nativesDir: string;
  isDev: boolean;
  safeMode: boolean;
  version: string;
  /** Start with the latch set: connect nothing, send nothing. */
  panicLatched: boolean;
  /** This engine replaced one that died, so `while` and `live` rules wait for their source to go inactive once. */
  toysMuted: boolean;
}

export const ENGINE_CONFIG_ENV = "ADVOSC_ENGINE_CONFIG";
