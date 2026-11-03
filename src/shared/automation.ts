import type { SoundOscType } from "./sound-effects";
import type { ToyAction } from "./toys";

/**
 * Automations: when a value does something, do something else.
 *
 * - `edge` fires once each time the source starts matching.
 * - `while` starts when it starts matching and ends when it stops.
 * - `live` runs continuously, passing the source through `range` as a number.
 */

export const AUTOMATIONS_KEY = "Automations;Rules";
/** Set once `SoundEffects;Rules` has been moved over. That key is left as it was for rollback. */
export const AUTOMATIONS_MIGRATED_KEY = "Automations;MigratedSoundRules";

export type AutomationMode = "edge" | "while" | "live";

export type AutomationSource =
  /** Any placeholder text. Evaluated read-only, so `{{Sound;Play;x}}` here does nothing. */
  | { kind: "template"; template: string }
  /** Full OSC address, like `/avatar/parameters/X`. Skips template work entirely. */
  | { kind: "parameter"; address: string };

export interface AutomationRange {
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}

export type AutomationAction =
  | {
      type: "sound";
      soundIds: string[];
      /** Exports don't carry the sound library, so names let a rule find its sounds again. */
      soundNames: string[];
      loop: boolean;
      /** Stop the sound when a `while` rule ends. */
      stopOnEnd: boolean;
    }
  /** `value` may hold placeholders. In `live` mode it's ignored and the mapped value is sent. */
  | { type: "osc"; address: string; oscType: SoundOscType | "String"; value: string }
  /** Same as `osc`, but through avatar OSC so locks and the parameter list stay right. */
  | { type: "setParameter"; address: string; value: string }
  | { type: "loadProfile"; profileId: string }
  /** Arg values may hold placeholders. */
  | { type: "moduleInput"; moduleId: string; inputId: string; args: Record<string, string> }
  /** `$value` in `value` stands for the variable's current value. */
  | { type: "setVariable"; name: string; value: string }
  /** Does math on a variable's current value. An unset or empty variable counts as 0. */
  | { type: "changeVariable"; name: string; op: VariableOp; value: string }
  | { type: "toy"; action: ToyAction };

export type AutomationActionType = AutomationAction["type"];

export type VariableOp = "add" | "subtract" | "multiply" | "divide" | "modulo" | "min" | "max" | "append";

export const VARIABLE_OPS: VariableOp[] = ["add", "subtract", "multiply", "divide", "modulo", "min", "max", "append"];

/** Stands for the variable's current value in a Set a variable action. */
export const VARIABLE_SELF = "$value";

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  source: AutomationSource;
  /** Existing match syntax: "1", "> 0.5", "!= idle". A bare value means "=". Unused by `live`. */
  match: string;
  /**
   * Same syntax as `match`. Once matched, an `edge` or `while` rule stays matched until this is
   * true, so a float settling around a threshold doesn't fire again. Left out, `match` decides.
   */
  releaseMatch?: string;
  mode: AutomationMode;
  /** Required on `live`, where it's the mapping from source to output. */
  range?: AutomationRange;
  cooldownMs?: number;
  /** Blueprint ids this rule runs on. Left out, it runs on every avatar. */
  avatarIds?: string[];
  /** Set on rules that came from a bundle, so importing it again doesn't add them twice. */
  importKey?: string;
  /** A migrated Sound Effects rule whose template relied on placeholders with side effects. */
  legacySideEffects?: boolean;
  actions: AutomationAction[];
}

export type AutomationHealth = "ok" | "no-data" | "error" | "tripped";

export interface AutomationStatus {
  id: string;
  health: AutomationHealth;
  /** The source's last resolved value, as text. */
  lastValue?: string;
  active: boolean;
  /** Plain words. Set for `error` and `tripped`. */
  message?: string;
}

/** Mirror key for `Record<automation id, AutomationStatus>`. */
export const MIRROR_AUTOMATIONS = "Automations;Status";

/** Engine RPC surface for Automations, under the `automations.` prefix. */
export interface AutomationsApi {
  /** Read-only evaluation for previews. Never fires anything. */
  preview(template: string): Promise<string>;
  /** Runs an action list once, ignoring the rule's source. Toy actions stay under the cap. */
  test(automationId: string): Promise<void>;
  /** Clears a `tripped` rule. */
  reset(automationId: string): Promise<void>;
}

/** Maps a number through a range, clamped to the output range. An empty input range gives outMin. */
export function mapRange(value: number, range: AutomationRange): number {
  const span = range.inMax - range.inMin;
  if (span === 0) return range.outMin;
  const t = Math.min(1, Math.max(0, (value - range.inMin) / span));
  return range.outMin + t * (range.outMax - range.outMin);
}
