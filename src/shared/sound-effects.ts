export type SoundOscType = "Bool" | "Int" | "Float";

export interface SoundEntry {
  id: string;
  name: string;
  path: string;
  /** 0-100 */
  volume: number;
  cooldownMs: number;
  /** Electron accelerator, "" for none */
  hotkey: string;
  oscEnabled: boolean;
  oscPath: string;
  oscType: SoundOscType;
  oscOnValue: string;
  oscOffValue: string;
}

export interface SoundTriggerRule {
  id: string;
  enabled: boolean;
  template: string;
  /** "1", "> 0.5", "!= idle"... a bare value means "=" */
  match: string;
  soundIds: string[];
  /** Keep looping the picked sound while the rule matches. */
  loop: boolean;
  /** Cut the sound off as soon as the rule stops matching. */
  stopOnUnmatch: boolean;
}

export interface SoundSettings {
  /** 0-100 */
  masterVolume: number;
  muted: boolean;
  /**
   * The browser's origin-salted id from before native playback. Kept as it was for rollback.
   * Nothing reads it except the one-time move to `outputDevice`.
   */
  outputDeviceId: string;
  /** An empty id is the Windows default. Unset until the old device has been moved over. */
  outputDevice?: { id: string; name: string };
  stopOnVrcMute: boolean;
  stopAllHotkey: string;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultSoundFields(): Omit<SoundEntry, "id" | "name" | "path"> {
  return {
    volume: 100,
    cooldownMs: 0,
    hotkey: "",
    oscEnabled: false,
    oscPath: "",
    oscType: "Bool",
    oscOnValue: "true",
    oscOffValue: "false",
  };
}

export function defaultRule(): SoundTriggerRule {
  return { id: makeId(), enabled: true, template: "", match: "1", soundIds: [], loop: false, stopOnUnmatch: false };
}

export const defaultSoundSettings: SoundSettings = {
  masterVolume: 80,
  muted: false,
  outputDeviceId: "",
  stopOnVrcMute: false,
  stopAllHotkey: "",
};

/** "true"/"1"/non-zero numbers are true; "", "false", "0", "null", "undefined" are false; other text is true. */
export function isTruthy(value: string): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "" || v === "false" || v === "null" || v === "undefined") return false;
  if (v === "true") return true;
  const n = Number(v);
  if (!Number.isNaN(n)) return n !== 0;
  return true;
}

function toComparableNumber(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v === "true") return 1;
  if (v === "false") return 0;
  if (v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Compare a resolved template against a rule's match string ("1", "> 0.5", "!= idle"). */
export function matches(value: string, match: string): boolean {
  const parsed = /^\s*(==|=|!=|>=|<=|>|<)?\s*([\s\S]*)$/.exec(match ?? "");
  const op = parsed?.[1] ?? "=";
  const target = (parsed?.[2] ?? "").trim();
  const a = toComparableNumber(value);
  const b = toComparableNumber(target);

  switch (op) {
    case "=":
    case "==":
    case "!=": {
      const equal = a !== null && b !== null
        ? a === b
        : value.trim().toLowerCase() === target.toLowerCase();
      return op === "!=" ? !equal : equal;
    }
    case ">": return a !== null && b !== null && a > b;
    case "<": return a !== null && b !== null && a < b;
    case ">=": return a !== null && b !== null && a >= b;
    case "<=": return a !== null && b !== null && a <= b;
  }
  return false;
}
