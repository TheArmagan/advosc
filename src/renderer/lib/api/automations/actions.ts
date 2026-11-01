import type { AutomationAction, AutomationActionType, AutomationMode } from "$shared/automation";
import type { ToyAction, ToyTarget } from "$shared/toys";
import { chatbox } from "../chatbox";
import { LOVENSE_MODULE_ID } from "../toys";
import { toyStatus } from "../toys/status.svelte";

/** Which modes each action makes sense in, and how to word that. Only the UI reads this. */

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  sound: "Play a sound",
  osc: "Send OSC",
  setParameter: "Set avatar parameter",
  loadProfile: "Load avatar profile",
  moduleInput: "Run a module input",
  setVariable: "Set a variable",
  toy: "Control toys",
};

export const ACTION_ORDER: AutomationActionType[] = [
  "sound",
  "setParameter",
  "osc",
  "loadProfile",
  "moduleInput",
  "setVariable",
  "toy",
];

export const MODE_LABELS: Record<AutomationMode, string> = {
  edge: "Once",
  while: "While it matches",
  live: "Live",
};

const NOT_LIVE = "Only runs in Once and While it matches, since Live would repeat it constantly.";

const ACTION_MODES: Record<AutomationActionType, { modes: AutomationMode[]; why?: string }> = {
  sound: { modes: ["edge", "while"], why: NOT_LIVE },
  osc: { modes: ["edge", "while", "live"] },
  setParameter: { modes: ["edge", "while", "live"] },
  loadProfile: { modes: ["edge", "while"], why: NOT_LIVE },
  moduleInput: { modes: ["edge", "while"], why: NOT_LIVE },
  setVariable: { modes: ["edge", "while", "live"] },
  toy: { modes: ["edge", "while", "live"] },
};

export function actionFitsMode(type: AutomationActionType, mode: AutomationMode) {
  return ACTION_MODES[type].modes.includes(mode);
}

export function actionModeHint(type: AutomationActionType) {
  return ACTION_MODES[type].why;
}

/** Toy actions split further: `link` needs `live`, and everything else can't run in it. */
export function toyActionFitsMode(kind: ToyAction["kind"], mode: AutomationMode) {
  return kind === "link" ? mode === "live" : mode !== "live";
}

/** Why an action on this rule won't run, or null when it will. */
export function actionProblem(action: AutomationAction, mode: AutomationMode): string | null {
  if (!actionFitsMode(action.type, mode)) {
    return `Won't run in ${MODE_LABELS[mode]} mode. ${actionModeHint(action.type) ?? ""}`.trim();
  }
  if (action.type === "toy" && !toyActionFitsMode(action.action.kind, mode)) {
    return action.action.kind === "link"
      ? "Follow the value only runs in Live mode."
      : "This only runs in Once and While it matches. In Live mode, use Follow the value.";
  }
  return null;
}

/** Empty `toyIds` means every connected toy. The contract doesn't say that for `features`. */
const defaultTarget = (): ToyTarget => ({ toyIds: [], features: ["Vibrate"] });

export function defaultToyAction(kind: ToyAction["kind"], target: ToyTarget = defaultTarget()): ToyAction {
  switch (kind) {
    case "link":
      return { kind, target };
    case "pulse":
      return { kind, target, level: 0.5, seconds: 2 };
    case "preset":
      return { kind, target, preset: "pulse", seconds: 5 };
    case "pattern":
      return { kind, target, patternId: "", seconds: 5 };
    case "stop":
      return { kind, target };
  }
}

export function defaultAction(type: AutomationActionType, mode: AutomationMode): AutomationAction {
  switch (type) {
    case "sound":
      return { type, soundIds: [], soundNames: [], loop: false, stopOnEnd: mode === "while" };
    case "osc":
      return { type, address: "", oscType: "Float", value: "" };
    case "setParameter":
      return { type, address: "", value: "" };
    case "loadProfile":
      return { type, profileId: "" };
    case "moduleInput":
      return { type, moduleId: "", inputId: "", args: {} };
    case "setVariable":
      return { type, name: "", value: "" };
    case "toy":
      return { type, action: defaultToyAction(mode === "live" ? "link" : "pulse") };
  }
}

/** Every module that declares inputs. New inputs show up here with no UI work. */
export function modulesWithInputs() {
  return [...chatbox.modules.values()]
    .filter((m) => m.options.inputs?.length)
    .filter((m) => toyStatus.enabled || m.options.id !== LOVENSE_MODULE_ID)
    .map((m) => ({ id: m.options.id, name: m.options.name, inputs: m.options.inputs! }));
}
