import type { Automation, AutomationRange } from "$shared/automation";
import type { EvalFailure } from "../chatbox/eval-context";
import type { TemplateScan } from "./dependencies";

/** A `live` rule's output. The source only updates this. The sender decides what goes out. */
export interface LiveState {
  /** First look happened. Nothing goes out until the value moves after this. */
  seeded: boolean;
  input: number | null;
  /** Latest mapped value, or null until the first real change. */
  level: number | null;
  /** Off the low end of the input range. Sitting on it is what counts as inactive for a re-arm. */
  active: boolean;
  /** What each action last sent, so an unchanged value isn't sent again. */
  sent: Map<number, number | string | boolean>;
  lastSentAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Holds a toy lease that has to be given back. */
  linked: boolean;
}

export interface RuleState {
  rule: Automation;
  /** Bumped by every edit, so a result from before it is thrown away. */
  generation: number;
  scan: TemplateScan | null;
  /** Why this rule can't run as it's written. */
  problem: EvalFailure | null;

  /** Last match result. Undefined means the next look only seeds it and doesn't fire. */
  matched: boolean | undefined;
  /** A `while` rule's actions ran and it hasn't ended yet. */
  started: boolean;
  /** Bumped when a run ends, which is how actions still in flight find out. */
  runId: number;

  evaluating: boolean;
  lastEvalAt: number;
  /** Last time a real value came back, for the staleness timeout. */
  lastGoodAt: number;
  /** Set while the source can't be read. The match state stays as it was. */
  failing: EvalFailure | null;
  backoffUntil: number;
  lastValue?: string;

  lastFiredAt: number;
  fires: number[];
  tripped: boolean;
  actionError: string | null;

  /** Toy output stays off until the source goes inactive once, after a re-arm. */
  toyMuted: boolean;
  /** Voices to stop when the rule ends. */
  voices: Set<number>;
  live: LiveState | null;
}

export function newLiveState(): LiveState {
  return { seeded: false, input: null, level: null, active: false, sent: new Map(), lastSentAt: 0, timer: null, linked: false };
}

export function newRuleState(rule: Automation): RuleState {
  return {
    rule,
    generation: 0,
    scan: null,
    problem: null,
    matched: undefined,
    started: false,
    runId: 0,
    evaluating: false,
    lastEvalAt: 0,
    lastGoodAt: Date.now(),
    failing: null,
    backoffUntil: 0,
    lastFiredAt: 0,
    fires: [],
    tripped: false,
    actionError: null,
    toyMuted: false,
    voices: new Set(),
    live: rule.mode === "live" ? newLiveState() : null,
  };
}

export function hasToyAction(rule: Automation): boolean {
  // Rules can arrive from an import, so this runs on ones `findProblem` has yet to turn down.
  return Array.isArray(rule.actions) && rule.actions.some((action) => action.type === "toy");
}

/**
 * How close to the end of the range counts as being on it. OSC floats are 32-bit, so a 0.1 from
 * VRChat arrives as 0.100000001 and would never compare as reaching a range that starts at 0.1.
 */
const RANGE_EDGE = 1e-5;

/** Sitting at `inMin` counts as off, whichever way round the range is. */
export function isLiveInactive(value: number, range: AutomationRange): boolean {
  const span = range.inMax - range.inMin;
  if (span === 0) return true;
  return (value - range.inMin) / span <= RANGE_EDGE;
}

export function toNumber(text: string): number | null {
  const value = text.trim().toLowerCase();
  if (value === "") return null;
  if (value === "true") return 1;
  if (value === "false") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
