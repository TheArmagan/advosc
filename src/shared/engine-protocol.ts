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
}

export type HostMethodName = keyof HostMethods;

export type MainToEngine =
  /** Carries a MessagePortMain for a new window in `ports`. */
  | { t: "client"; id: number }
  | { t: "hb"; at: number }
  | { t: "res"; id: number; ok: boolean; v?: unknown; e?: string }
  | { t: "shortcut"; id: string }
  | { t: "shutdown" };

export type EngineToMain =
  | { t: "ready" }
  | { t: "hb"; at: number; active: boolean }
  | { t: "call"; id: number; m: HostMethodName; a: unknown[] }
  | { t: "shutdown-done" };

/** Handed to the engine at fork, through the environment. */
export interface EngineConfig {
  userData: string;
  dataDir: string;
  logDir: string;
  nativesDir: string;
  isDev: boolean;
  safeMode: boolean;
  version: string;
}

export const ENGINE_CONFIG_ENV = "ADVOSC_ENGINE_CONFIG";
