import { writable, get } from "svelte/store";
import { chatbox } from "../chatbox";
import { defaultRule, matches, soundEngine, type SoundTriggerRule } from "./engine";

export * from "./engine";

const rulesStore = soundEngine.rules;
/** Last resolved template value per rule id. */
const lastResultsStore = writable<Record<string, string>>({});

// ---------------------------------------------------------------------------
// Trigger rules
// ---------------------------------------------------------------------------

const lastMatched = new Map<string, boolean>();
const evaluating = new Set<string>();

async function evaluateRule(rule: SoundTriggerRule) {
  if (!rule.enabled || !rule.template.trim() || evaluating.has(rule.id)) return;
  evaluating.add(rule.id);
  try {
    const scope = `SoundTrigger;${rule.id}`;
    let result = await chatbox.fillTemplate(rule.template, "[[:]]", false, scope);
    result = await chatbox.fillTemplate(result, "{{;}}", false, scope);

    // The rule may have been edited or removed while the template was resolving.
    const current = get(rulesStore).find((r) => r.id === rule.id);
    if (!current || current.template !== rule.template || current.match !== rule.match || !current.enabled) return;

    const matched = matches(result, rule.match);
    const previous = lastMatched.get(rule.id);
    lastMatched.set(rule.id, matched);
    lastResultsStore.update((prev) => (prev[rule.id] === result ? prev : { ...prev, [rule.id]: result }));

    // `previous === undefined` is the first look at this rule: seed it without firing,
    // so a param that is already on doesn't play a sound when the app starts.
    if (matched && previous === false) soundEngine.playRandom(current.soundIds);
  } catch (e) {
    console.error("SoundEffects", "Trigger rule failed", rule.template, e);
  } finally {
    evaluating.delete(rule.id);
  }
}

function runRules() {
  for (const rule of get(rulesStore)) evaluateRule(rule);
}

let rulePassPending = false;
function scheduleRules() {
  if (rulePassPending) return;
  rulePassPending = true;
  // A short delay coalesces OSC bursts and lets avatar-osc record the new value first.
  setTimeout(() => {
    rulePassPending = false;
    runRules();
  }, 16);
}

// Fallback for templates that don't depend on OSC (time, media, hotkeys...).
setInterval(runRules, 250);

function addRule() {
  rulesStore.update((prev) => [...prev, defaultRule()]);
}

function updateRule(id: string, patch: Partial<SoundTriggerRule>) {
  // Editing what a rule checks starts it fresh, so typing a match value doesn't fire sounds.
  if ("template" in patch || "match" in patch || "enabled" in patch) lastMatched.delete(id);
  rulesStore.update((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

function removeRule(id: string) {
  lastMatched.delete(id);
  rulesStore.update((prev) => prev.filter((r) => r.id !== id));
  lastResultsStore.update((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

window.ADVOSCNative.osc.onMessage(() => scheduleRules());

export const soundEffects = {
  ...soundEngine,
  lastResults: lastResultsStore,
  addRule,
  updateRule,
  removeRule,
};
