import {
  AUTOMATIONS_KEY,
  MIRROR_AUTOMATIONS,
  mapRange,
  type Automation,
  type AutomationAction,
  type AutomationActionType,
  type AutomationHealth,
  type AutomationMode,
  type AutomationRange,
  type AutomationSource,
  type AutomationStatus,
} from "$shared/automation";
import { makeId, matches } from "$shared/sound-effects";
import { get } from "$shared/store";
import { call, mirrored, synced } from "../engine";

export { mapRange, matches };
export type {
  Automation,
  AutomationAction,
  AutomationActionType,
  AutomationHealth,
  AutomationMode,
  AutomationRange,
  AutomationSource,
  AutomationStatus,
};

const DEFAULT_RANGE: AutomationRange = { inMin: 0, inMax: 1, outMin: 0, outMax: 1 };

const rules = synced<Automation[]>(AUTOMATIONS_KEY, []);

/** Health and last value per rule id. */
const statuses = mirrored<Record<string, AutomationStatus>>(MIRROR_AUTOMATIONS, {});

function defaultAutomation(): Automation {
  return {
    id: makeId(),
    name: "",
    enabled: true,
    source: { kind: "template", template: "" },
    match: "1",
    mode: "edge",
    actions: [],
  };
}

/** The engine watches the rules and keeps its evaluators in step, so editing them is all this does. */
function update(id: string, patch: Partial<Automation>) {
  rules.update((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
}

/** `live` needs a range, so switching to it fills one in. Other modes leave theirs for switching back. */
function setMode(id: string, mode: AutomationMode) {
  const rule = get(rules).find((r) => r.id === id);
  if (!rule) return;
  update(id, { mode, range: mode === "live" ? (rule.range ?? { ...DEFAULT_RANGE }) : rule.range });
}

function add(): Automation {
  const rule = defaultAutomation();
  rules.update((prev) => [...prev, rule]);
  return rule;
}

/** For rules from outside the app. They always arrive off, whatever they were built with. */
function addImported(imported: Automation[]) {
  const off = imported.map((rule) => ({ ...rule, enabled: false }));
  rules.update((prev) => [...prev, ...off]);
}

/** Puts a rule back where it was, for undo. */
function restore(rule: Automation, index: number) {
  rules.update((prev) => [...prev.slice(0, index), rule, ...prev.slice(index)]);
}

function remove(id: string) {
  rules.update((prev) => prev.filter((rule) => rule.id !== id));
}

function updateActions(id: string, change: (actions: AutomationAction[]) => AutomationAction[]) {
  rules.update((prev) =>
    prev.map((rule) => (rule.id === id ? { ...rule, actions: change(rule.actions) } : rule)),
  );
}

export const automations = {
  rules,
  statuses,
  add,
  addImported,
  update,
  setMode,
  remove,
  restore,
  updateActions,
  /** Read-only, so it's safe to run on every keystroke. Nothing in the template fires. */
  preview: (template: string) => call<string>("automations.preview", template),
  /** Runs the rule's actions once, ignoring its source. */
  test: (id: string) => call<void>("automations.test", id),
  reset: (id: string) => call<void>("automations.reset", id),
};
