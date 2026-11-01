import { get, writable } from "$shared/store";
import { chatbox } from "../chatbox";
import { native } from "../native";
import { mirror } from "../sync/hub";
import { matches, soundEngine, startSoundEngine, type SoundTriggerRule } from "./engine";

export * from "./engine";

const rulesStore = soundEngine.rules;
/** Last resolved template value per rule id. */
const lastResultsStore = writable<Record<string, string>>({});

// ---------------------------------------------------------------------------
// Trigger rules
// ---------------------------------------------------------------------------

const lastMatched = new Map<string, boolean>();
const evaluating = new Set<string>();
/** Playbacks a rule started that should end when it stops matching (loop or stop-on-unmatch). */
const ruleVoices = new Map<string, Set<number>>();

function stopRuleVoices(id: string) {
  const set = ruleVoices.get(id);
  if (!set) return;
  ruleVoices.delete(id);
  for (const voice of set) soundEngine.stopVoice(voice);
}

function fireRule(rule: SoundTriggerRule) {
  soundEngine.playRandom(rule.soundIds, { loop: rule.loop }).then((voice) => {
    if (voice === null) return;
    const current = get(rulesStore).find((r) => r.id === rule.id);
    if (!current) {
      soundEngine.stopVoice(voice);
      return;
    }
    if (!current.loop && !current.stopOnUnmatch) return;
    // The value may have flipped back while the file was loading.
    if (lastMatched.get(rule.id) !== true) {
      soundEngine.stopVoice(voice);
      return;
    }
    if (!ruleVoices.has(rule.id)) ruleVoices.set(rule.id, new Set());
    ruleVoices.get(rule.id)!.add(voice);
  });
}

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
    if (matched && previous === false) fireRule(current);
    else if (!matched) stopRuleVoices(rule.id);
  } catch (e) {
    console.error("SoundEffects", "Trigger rule failed", rule.id, e);
  } finally {
    evaluating.delete(rule.id);
  }
}

function runRules() {
  for (const rule of get(rulesStore)) void evaluateRule(rule);
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

/**
 * Editing what a rule checks starts it fresh, so typing a match value doesn't fire sounds.
 * This watches the store rather than wrapping an update function, because rules also change
 * through imports and the window writes them directly.
 */
function watchRuleEdits() {
  let previous = new Map(get(rulesStore).map((rule) => [rule.id, rule]));

  rulesStore.subscribe((rules) => {
    const next = new Map(rules.map((rule) => [rule.id, rule]));

    for (const [id, before] of previous) {
      const after = next.get(id);
      if (!after) {
        lastMatched.delete(id);
        stopRuleVoices(id);
        lastResultsStore.update((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      } else if (
        before.template !== after.template ||
        before.match !== after.match ||
        before.enabled !== after.enabled ||
        before.loop !== after.loop
      ) {
        lastMatched.delete(id);
        stopRuleVoices(id);
      }
    }

    previous = next;
  });
}

export function startSoundEffects(options: { safeMode: boolean }) {
  mirror("SoundEffects;LastResults", lastResultsStore);
  startSoundEngine();
  watchRuleEdits();

  if (options.safeMode) return;

  // Fallback for templates that don't depend on OSC (time, media, hotkeys...).
  setInterval(runRules, 250);
  native.osc.onMessage(() => scheduleRules());
}
