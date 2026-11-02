import {
  MIRROR_AUTOMATIONS,
  mapRange,
  type Automation,
  type AutomationsApi,
  type AutomationStatus,
} from "$shared/automation";
import { matches } from "$shared/sound-effects";
import type { OSCIncomingMessage } from "$shared/native-types";
import { get, writable } from "$shared/store";
import type { ToyRuleSink } from "$shared/toys";
import { chatbox } from "../chatbox";
import type { EvalFailure } from "../chatbox/eval-context";
import type { VarModule } from "../chatbox/modules/chatbox-var-module";
import { native } from "../native";
import { soundEngine } from "../sound-effects/engine";
import { mirror } from "../sync/hub";
import { avatarOSC } from "../vrc-osc";
import { renewToyLink, runActions, sendLiveLevel, stopRuleVoices } from "./actions";
import { scanTemplate } from "./dependencies";
import { takeSoundRuleMigration } from "./migrate";
import { hasToyAction, isLiveInactive, newLiveState, newRuleState, toNumber, type RuleState } from "./rule-state";
import { rulesStore } from "./rules-store";
import { getToySink, onToySinkChange } from "./toy-sink";

export { setToySink } from "./toy-sink";

/** A burst of OSC settles into one pass. Also gives avatar OSC time to record the new value. */
const COALESCE_MS = 16;
/** No rule evaluates or sends faster than this, about 30 Hz. */
const RULE_FLOOR_MS = 33;
const TICK_MS = 100;
const SLOW_TICK_MS = 250;
/** A timer can land a hair early, and missing by that much would skip a whole tick. */
const TICK_SLACK_MS = 5;
/** Longer than a slow network read, shorter than anyone would wait on a stuck rule. */
const EVALUATION_TIMEOUT_MS = 5000;
/** How long a rule holds its state with no data before it's treated as having ended. */
const STALE_AFTER_MS = 5000;
/** A recursive template costs a full budget each try, so it doesn't get to retry every tick. */
const RUNAWAY_BACKOFF_MS = 1000;
/**
 * Fires per window that trip a rule. OSC tops out at 30 updates a second, which is 15 rising
 * edges, so a limit of a sustained 10 a second catches two rules setting each other off through
 * VRChat, and leaves a contact or a button alone.
 */
const BREAKER_FIRES = 30;
const BREAKER_WINDOW_MS = 3000;
/** Avatar OSC ignores everything for a second after an avatar change. */
const AVATAR_SETTLE_MS = 1100;
/** Addresses ADVOSC makes up itself, like `/advosc/sps/...`. Only avatar OSC may deliver them. */
const INTERNAL_PREFIX = "/advosc/";

const TRIPPED_MESSAGE = `Turned off because it fired ${BREAKER_FIRES} times in ${BREAKER_WINDOW_MS / 1000} seconds. Check for rules setting each other off, then reset it.`;
const SAFE_MODE_MESSAGE = "Automations are off in safe mode.";

const statusStore = writable<Record<string, AutomationStatus>>({});

const states = new Map<string, RuleState>();
let safeMode = false;

// What wakes each rule. Rebuilt whenever the rules or the shortcuts change.
const parameterRules = new Map<string, RuleState[]>();
const oscDependents = new Map<string, Set<RuleState>>();
const varDependents = new Map<string, Set<RuleState>>();
const anyOscDependents = new Set<RuleState>();
const anyVarDependents = new Set<RuleState>();

const dirty = new Set<RuleState>();
let dirtyTimer: ReturnType<typeof setTimeout> | null = null;
let statusDirty = false;
let avatarSettleTimer: ReturnType<typeof setTimeout> | null = null;

function shortcuts(): Record<string, string> {
  return chatbox.modules.get("Shortcut")?.getValues().shortcuts ?? {};
}

function isAvatarLocked(rule: Automation): boolean {
  return Array.isArray(rule.avatarIds) && rule.avatarIds.length > 0;
}

/** `local:` ids come from Build and Test, which a blueprint id could never match. */
function runsOnThisAvatar(rule: Automation): boolean {
  if (!isAvatarLocked(rule)) return true;
  const avatarId = avatarOSC.lastAvatarId;
  if (typeof avatarId !== "string") return false;
  return avatarId.startsWith("local:") || rule.avatarIds!.includes(avatarId);
}

function isRunnable(state: RuleState): boolean {
  return state.rule.enabled && !state.problem && !state.tripped && runsOnThisAvatar(state.rule);
}

function isActive(state: RuleState): boolean {
  if (state.rule.mode === "live") return !!state.live?.active;
  if (state.rule.mode === "while") return state.started;
  return state.matched === true;
}

function findProblem(rule: Automation): EvalFailure | null {
  if (rule.source?.kind === "template") {
    if (!rule.source.template?.trim()) return { kind: "no-data", message: "This rule has no source yet." };
  } else if (rule.source?.kind === "parameter") {
    if (!rule.source.address?.trim()) return { kind: "no-data", message: "This rule has no parameter yet." };
  } else {
    return { kind: "error", message: "This rule's source isn't valid." };
  }
  if (rule.mode !== "edge" && rule.mode !== "while" && rule.mode !== "live") {
    return { kind: "error", message: "This rule's mode isn't valid." };
  }
  if (rule.mode === "live" && !rule.range) return { kind: "error", message: "A live rule needs a range." };
  if (!Array.isArray(rule.actions)) return { kind: "error", message: "This rule's actions aren't valid." };
  // Sound ids don't travel, so a bundle can only bring a placeholder. Only imported rules wait for
  // one: a rule of the user's own keeps running its other actions if its last sound goes away.
  if (rule.importKey && rule.actions.some((action) => action?.type === "sound" && !action.soundIds?.length && !action.soundNames?.length)) {
    return { kind: "no-data", message: "Pick a sound." };
  }
  return null;
}

// ------------------------------------------------------------------------- status

function statusOf(state: RuleState): AutomationStatus {
  const { rule, lastValue } = state;
  const base = { id: rule.id, lastValue };

  if (state.tripped) return { ...base, health: "tripped", active: false, message: TRIPPED_MESSAGE };
  if (!rule.enabled) return { ...base, health: "ok", active: false };

  // A rule waiting for its avatar isn't reading its source, so its last failure is out of date.
  const failure = state.problem ?? (runsOnThisAvatar(rule) ? state.failing : null);
  if (failure) {
    return {
      ...base,
      health: failure.kind === "error" ? "error" : "no-data",
      active: isActive(state),
      message: failure.message,
    };
  }
  if (state.actionError) return { ...base, health: "error", active: isActive(state), message: state.actionError };
  return { ...base, health: "ok", active: isActive(state) };
}

function publishStatus() {
  if (!statusDirty) return;
  statusDirty = false;
  const next: Record<string, AutomationStatus> = {};
  for (const [id, state] of states) next[id] = statusOf(state);
  statusStore.set(next);
}

// --------------------------------------------------------------------- running

function stopLiveTimer(state: RuleState) {
  if (state.live?.timer) {
    clearTimeout(state.live.timer);
    state.live.timer = null;
  }
}

/** Ends whatever the rule has going, without touching what it remembers about its source. */
function endRun(state: RuleState) {
  state.started = false;
  state.runId++;
  stopRuleVoices(state);
  stopLiveTimer(state);
  if (state.live) state.live.linked = false;
  if (hasToyAction(state.rule)) getToySink()?.release(state.rule.id);
}

/** Back to a first look: the next value seeds the rule and doesn't fire it. */
function forgetSource(state: RuleState) {
  state.matched = undefined;
  if (state.live) {
    const { sent } = state.live;
    state.live = newLiveState();
    state.live.sent = sent;
  }
}

function trip(state: RuleState) {
  state.tripped = true;
  endRun(state);
  dirty.delete(state);
  console.warn(`Automation ${state.rule.id} tripped its breaker.`);
}

/** True when this fire was one too many. */
function countFire(state: RuleState, now: number): boolean {
  state.fires.push(now);
  const cutoff = now - BREAKER_WINDOW_MS;
  while (state.fires.length && state.fires[0] < cutoff) state.fires.shift();
  if (state.fires.length < BREAKER_FIRES) return false;
  trip(state);
  return true;
}

function fire(state: RuleState) {
  const { rule } = state;
  const now = Date.now();

  if (rule.cooldownMs && now - state.lastFiredAt < rule.cooldownMs) return;
  state.lastFiredAt = now;
  if (countFire(state, now)) return;

  if (rule.mode === "while") state.started = true;
  void runActions(state, ++state.runId);
}

/**
 * With `releaseMatch`, a matched rule holds until the release is true. The release also blocks
 * matching, so a value both patterns accept can't flip the rule on every update.
 */
function matchesNow(state: RuleState, value: string): boolean {
  const { match, releaseMatch } = state.rule;
  if (!releaseMatch?.trim()) return matches(value, match);
  if (matches(value, releaseMatch)) return false;
  return state.matched === true || matches(value, match);
}

function applyMatch(state: RuleState, matched: boolean) {
  const previous = state.matched;
  state.matched = matched;

  if (!matched) {
    state.toyMuted = false;
    if (state.started) endRun(state);
    return;
  }
  // `undefined` is the first look: a source that's already on doesn't fire when the app starts.
  if (previous === false) fire(state);
}

function flushLive(state: RuleState) {
  const { live, rule } = state;
  if (!live) return;
  live.timer = null;

  const floor = Math.max(RULE_FLOOR_MS, rule.cooldownMs ?? 0);
  const wait = floor - (performance.now() - live.lastSentAt);
  if (wait > 0) {
    live.timer = setTimeout(() => flushLive(state), wait);
    return;
  }
  live.lastSentAt = performance.now();
  sendLiveLevel(state);
}

function applyLive(state: RuleState, value: number) {
  const { live, rule } = state;
  if (!live || !rule.range) return;

  live.active = !isLiveInactive(value, rule.range);
  if (!live.active) state.toyMuted = false;

  if (!live.seeded) {
    live.seeded = true;
    live.input = value;
    return;
  }
  if (live.input === value) return;

  live.input = value;
  live.level = live.active ? mapRange(value, rule.range) : rule.range.outMin;
  if (!live.timer) flushLive(state);
}

function applyValue(state: RuleState, value: string) {
  state.lastValue = value;
  state.lastGoodAt = Date.now();
  state.failing = null;
  statusDirty = true;

  if (state.rule.mode !== "live") {
    applyMatch(state, matchesNow(state, value));
    return;
  }

  const number = toNumber(value);
  if (number === null) state.failing = { kind: "no-data", message: "The source isn't a number right now." };
  else applyLive(state, number);
}

/** Failing keeps the match state: "couldn't tell" must not read as a falling edge. */
function applyFailure(state: RuleState, failure: EvalFailure, runaway = false) {
  state.failing = failure;
  statusDirty = true;
  if (runaway) state.backoffUntil = Date.now() + RUNAWAY_BACKOFF_MS;
}

function expireIfStale(state: RuleState, now: number) {
  if (!state.failing || now - state.lastGoodAt < STALE_AFTER_MS) return;
  if (state.matched === undefined && !state.live?.seeded) return;
  endRun(state);
  forgetSource(state);
  statusDirty = true;
}

// ------------------------------------------------------------------------ evaluation

async function evaluateRule(state: RuleState) {
  const { rule, generation } = state;
  if (rule.source.kind !== "template" || state.evaluating || !isRunnable(state)) return;
  if (Date.now() < state.backoffUntil) return;

  state.evaluating = true;
  state.lastEvalAt = performance.now();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), EVALUATION_TIMEOUT_MS);
    });
    const result = await Promise.race([
      chatbox.evaluate(rule.source.template, {
        purpose: "rule",
        readOnly: !rule.legacySideEffects,
        scope: `Automation;${rule.id}`,
      }),
      timedOut,
    ]);

    // Edited, removed or tripped while it was resolving.
    if (state.generation !== generation || states.get(rule.id) !== state || !isRunnable(state)) return;

    if (result === null) applyFailure(state, { kind: "no-data", message: "The source took too long to read." });
    else if (result.failure) applyFailure(state, result.failure, result.runaway);
    else applyValue(state, result.value);
  } catch (error) {
    console.warn(`Automation ${rule.id} could not be evaluated:`, (error as Error)?.message);
    applyFailure(state, { kind: "error", message: "The source couldn't be read." });
  } finally {
    clearTimeout(timer);
    state.evaluating = false;
    if (dirty.has(state)) scheduleDirty(RULE_FLOOR_MS);
  }
}

function scheduleDirty(delay: number) {
  if (!dirtyTimer) dirtyTimer = setTimeout(runDirty, delay);
}

function runDirty() {
  dirtyTimer = null;
  const now = performance.now();
  let wait = Infinity;

  for (const state of dirty) {
    // Stays dirty, and `evaluateRule` schedules this again when it's done.
    if (state.evaluating) continue;

    const remaining = RULE_FLOOR_MS - (now - state.lastEvalAt);
    if (remaining > 0) {
      wait = Math.min(wait, remaining);
      continue;
    }
    dirty.delete(state);
    void evaluateRule(state);
  }

  if (wait !== Infinity) scheduleDirty(wait);
}

function markDirty(state: RuleState) {
  if (!isRunnable(state)) return;
  dirty.add(state);
  scheduleDirty(COALESCE_MS);
}

function tick() {
  const nowMs = Date.now();
  const now = performance.now();

  for (const state of states.values()) {
    if (!isRunnable(state)) continue;
    const { rule, scan } = state;

    if (rule.mode === "live") renewToyLink(state);

    if (rule.source.kind === "template") {
      expireIfStale(state, nowMs);
      // A failing rule has no change to wait for, so it keeps trying.
      if (scan?.needsTick || state.failing) {
        const interval = rule.mode === "live" ? TICK_MS : SLOW_TICK_MS;
        if (now - state.lastEvalAt >= interval - TICK_SLACK_MS) void evaluateRule(state);
      }
    }
  }

  publishStatus();
}

// ------------------------------------------------------------------- parameter sources

function readParameter(address: string): string | undefined {
  // `allLastParameters` keeps every packet, so a derived value can't be read back from there.
  const heard = address.startsWith(INTERNAL_PREFIX) ? undefined : avatarOSC.allLastParameters[address]?.[0];
  const value = avatarOSC.getParameters()[address] ?? heard;
  if (value === undefined || value === null) return undefined;
  return String(typeof value === "boolean" ? (value ? 1 : 0) : value);
}

/**
 * A first look at a parameter source. One that hasn't been heard from counts as 0, the same
 * as `{{OSCData}}`, so the first press is still a rising edge rather than a silent seed.
 */
function seedParameter(state: RuleState) {
  if (state.rule.source.kind !== "parameter") return;
  const value = readParameter(state.rule.source.address);
  applyValue(state, value ?? "0");
  if (value === undefined) {
    state.lastValue = undefined;
    state.failing = { kind: "no-data", message: "Nothing has been received for this parameter yet." };
  }
}

function handleParameter(address: string, value: number | string | boolean) {
  const rules = parameterRules.get(address);
  if (!rules) return;
  const text = String(typeof value === "boolean" ? (value ? 1 : 0) : value);
  for (const state of rules) {
    if (isRunnable(state)) applyValue(state, text);
  }
}

function lockedTemplateRules(): RuleState[] {
  return [...states.values()].filter((state) => state.rule.source?.kind === "template" && isAvatarLocked(state.rule));
}

/**
 * Everything the old avatar reported is gone, and for a moment after a switch nothing is
 * processed. Waiting that out and looking again keeps a switch from reading as a press.
 */
function handleAvatarChange() {
  for (const rules of parameterRules.values()) {
    for (const state of rules) {
      endRun(state);
      forgetSource(state);
    }
  }
  // Template rules carry on through a switch, unless the avatar decides whether they run.
  for (const state of lockedTemplateRules()) {
    endRun(state);
    forgetSource(state);
  }
  statusDirty = true;

  if (avatarSettleTimer) clearTimeout(avatarSettleTimer);
  avatarSettleTimer = setTimeout(() => {
    avatarSettleTimer = null;
    for (const rules of parameterRules.values()) {
      for (const state of rules) {
        if (isRunnable(state) && state.matched === undefined && !state.live?.seeded) seedParameter(state);
      }
    }
    for (const state of lockedTemplateRules()) markDirty(state);
  }, AVATAR_SETTLE_MS);
}

function handleOsc(message: OSCIncomingMessage) {
  if (message.address === "/avatar/change") handleAvatarChange();
  // Avatar OSC delivers `/avatar/` values already batched, which is what paces those rules.
  // `/advosc/` values are worked out here, so one arriving from the network is a fake.
  else if (!message.address.startsWith("/avatar/") && !message.address.startsWith(INTERNAL_PREFIX)) {
    const value = message.args[0];
    if (value !== null && value !== undefined) handleParameter(message.address, value);
  }

  const dependents = oscDependents.get(message.address);
  if (dependents) for (const state of dependents) markDirty(state);
  for (const state of anyOscDependents) markDirty(state);
}

function handleVariable(name: string) {
  const dependents = varDependents.get(name);
  if (dependents) for (const state of dependents) markDirty(state);
  for (const state of anyVarDependents) markDirty(state);
}

// ---------------------------------------------------------------------------- rules

function rebuildIndexes() {
  parameterRules.clear();
  oscDependents.clear();
  varDependents.clear();
  anyOscDependents.clear();
  anyVarDependents.clear();

  const addTo = (map: Map<string, Set<RuleState>>, key: string, state: RuleState) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(state);
  };

  const shortcutValues = shortcuts();
  for (const state of states.values()) {
    const { source } = state.rule;
    state.scan = null;
    if (state.problem) continue;

    if (source.kind === "parameter") {
      if (!parameterRules.has(source.address)) parameterRules.set(source.address, []);
      parameterRules.get(source.address)!.push(state);
      continue;
    }

    state.scan = scanTemplate(source.template, shortcutValues);
    for (const address of state.scan.osc) addTo(oscDependents, address, state);
    for (const name of state.scan.vars) addTo(varDependents, name, state);
    if (state.scan.anyOsc) anyOscDependents.add(state);
    if (state.scan.anyVar) anyVarDependents.add(state);
  }
}

/** The fields that decide what a rule does. Renaming one doesn't restart it. */
function behaviourOf(rule: Automation): string {
  const { source, match, releaseMatch, mode, range, enabled, avatarIds, actions, legacySideEffects } = rule;
  return JSON.stringify([source, match, releaseMatch, mode, range, enabled, avatarIds, actions, legacySideEffects]);
}

function resetState(state: RuleState) {
  state.generation++;
  endRun(state);
  dirty.delete(state);
  state.matched = undefined;
  state.tripped = false;
  state.failing = null;
  state.actionError = null;
  state.backoffUntil = 0;
  state.lastValue = undefined;
  state.lastGoodAt = Date.now();
  state.fires = [];
  state.toyMuted = false;
  state.live = state.rule.mode === "live" ? newLiveState() : null;
}

/** First look, right away for a parameter and as soon as possible for a template. */
function begin(state: RuleState) {
  if (!isRunnable(state)) return;
  if (state.rule.source.kind === "parameter") seedParameter(state);
  else markDirty(state);
}

function syncRules(rules: Automation[]) {
  const seen = new Set<string>();
  const restarted: RuleState[] = [];

  for (const rule of rules) {
    if (!rule?.id || seen.has(rule.id)) continue;
    seen.add(rule.id);

    const state = states.get(rule.id);
    if (!state) {
      const created = newRuleState(rule);
      created.problem = findProblem(rule);
      states.set(rule.id, created);
      restarted.push(created);
      continue;
    }

    const changed = behaviourOf(state.rule) !== behaviourOf(rule);
    if (changed) {
      // Released under the old rule, since that's the one holding anything.
      resetState(state);
      restarted.push(state);
    }
    state.rule = rule;
    state.problem = findProblem(rule);
    if (changed && rule.mode === "live" && !state.live) state.live = newLiveState();
    if (changed && rule.mode !== "live") state.live = null;
  }

  for (const [id, state] of states) {
    if (seen.has(id)) continue;
    states.delete(id);
    resetState(state);
  }

  rebuildIndexes();
  for (const state of restarted) begin(state);
  statusDirty = true;
}

function pruneRemovedSound(id: string) {
  const rules = get(rulesStore);
  const pruned = rules.map((rule) => ({
    ...rule,
    actions: (rule.actions ?? []).map((action) => {
      if (action.type !== "sound" || !action.soundIds?.includes(id)) return action;
      const keep = action.soundIds.map((soundId) => soundId !== id);
      return {
        ...action,
        soundIds: action.soundIds.filter((_, index) => keep[index]),
        soundNames: (action.soundNames ?? []).filter((_, index) => keep[index]),
      };
    }),
  }));
  if (JSON.stringify(pruned) !== JSON.stringify(rules)) rulesStore.set(pruned);
}

// ------------------------------------------------------------------------------- toys

function handleRearm() {
  for (const state of states.values()) {
    if (state.rule.mode !== "edge" && hasToyAction(state.rule) && isSourceOn(state)) state.toyMuted = true;
  }
}

/** Unlike `isActive`, a `while` rule counts even if its start was blocked by the panic latch. */
function isSourceOn(state: RuleState): boolean {
  return state.rule.mode === "live" ? !!state.live?.active : state.matched === true;
}

let detachSink: (() => void) | null = null;

function attachSink(sink: ToyRuleSink | null) {
  detachSink?.();
  detachSink = sink ? sink.onRearm(handleRearm) : null;
}

// ------------------------------------------------------------------------------- api

async function preview(template: string): Promise<string> {
  const result = await chatbox.evaluate(String(template ?? ""), {
    purpose: "preview",
    readOnly: true,
    scope: "AutomationPreview",
  });
  return result.value;
}

async function test(automationId: string): Promise<void> {
  if (safeMode) throw new Error(SAFE_MODE_MESSAGE);
  const state = states.get(automationId);
  if (!state) throw new Error("That automation no longer exists.");
  const { rule } = state;
  await runActions(state, state.runId, {
    test: true,
    level: rule.mode === "live" ? rule.range?.outMax : undefined,
  });
}

async function reset(automationId: string): Promise<void> {
  const state = states.get(automationId);
  if (!state || !state.tripped) return;
  resetState(state);
  begin(state);
  statusDirty = true;
}

export const automations = { preview, test, reset } satisfies AutomationsApi;

// ------------------------------------------------------------------------------ start

/** Runs after the chatbox and the sound engine, since rules read both. */
export function startAutomations(options: { safeMode: boolean }) {
  safeMode = options.safeMode;
  mirror(MIRROR_AUTOMATIONS, statusStore);
  soundEngine.onSoundRemoved(pruneRemovedSound);

  if (safeMode) {
    rulesStore.subscribe((rules) => {
      statusStore.set(Object.fromEntries(rules.map((rule) => [
        rule.id,
        { id: rule.id, health: "error", active: false, message: SAFE_MODE_MESSAGE } satisfies AutomationStatus,
      ])));
    });
    return;
  }

  const migrated = takeSoundRuleMigration(get(rulesStore), get(soundEngine.sounds), shortcuts());
  if (migrated.length) rulesStore.update((rules) => [...rules, ...migrated]);

  rulesStore.subscribe(syncRules);
  chatbox.modules.get("Shortcut")?.onValuesChange(() => {
    rebuildIndexes();
    for (const state of states.values()) {
      // This may well be the fix for a recursive shortcut, so it doesn't wait out the backoff.
      state.backoffUntil = 0;
      markDirty(state);
    }
  });

  avatarOSC.onParameterChange(handleParameter);
  native.osc.onMessage(handleOsc);
  (chatbox.modules.get("Var") as VarModule).onChange(handleVariable);
  attachSink(getToySink());
  onToySinkChange(attachSink);

  setInterval(tick, TICK_MS);
}
