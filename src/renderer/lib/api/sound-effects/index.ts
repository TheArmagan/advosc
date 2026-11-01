import { mirrored } from "../engine";
import { defaultRule, soundEngine, type SoundTriggerRule } from "./engine";

export * from "./engine";

const rulesStore = soundEngine.rules;

/** Last resolved template value per rule id. */
const lastResultsStore = mirrored<Record<string, string>>("SoundEffects;LastResults", {});

function addRule() {
  rulesStore.update((prev) => [...prev, defaultRule()]);
}

/** The engine resets a rule's matching state when it sees what a rule checks change. */
function updateRule(id: string, patch: Partial<SoundTriggerRule>) {
  rulesStore.update((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

function removeRule(id: string) {
  rulesStore.update((prev) => prev.filter((r) => r.id !== id));
}

export const soundEffects = {
  ...soundEngine,
  lastResults: lastResultsStore,
  addRule,
  updateRule,
  removeRule,
};
