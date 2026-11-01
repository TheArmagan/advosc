import { splitParams } from "$shared/template-syntax";

/**
 * Works out what a template reads without running it, so a rule only wakes up when something
 * it depends on changes.
 */

const OUTER_PLACEHOLDER = /{{([^}]+)}}/g;
const INNER_PLACEHOLDER = /\[\[([^\]]+)\]\]/g;
/** An address or name that's only known once the template runs. */
const DYNAMIC_TEXT = /\{\{|\[\[|\$\d/;
const SHORTCUT_PARAM = /\$(\d+)/g;
const MAX_SHORTCUT_DEPTH = 16;

/** Sound placeholders that act, which is what makes a migrated rule keep its side effects. */
const SOUND_ACTIONS = new Set(["Play", "Loop", "Stop", "StopAll", "Volume"]);

export interface TemplateScan {
  /** OSC addresses it reads through `OSCData`. */
  osc: Set<string>;
  /** Variables it reads. */
  vars: Set<string>;
  /** Reads an address only known at run time, so any OSC message could matter. */
  anyOsc: boolean;
  /** Same for a variable name. */
  anyVar: boolean;
  /** Reads something that changes without telling us, like the time, so it has to be polled. */
  needsTick: boolean;
  /** Calls a Sound placeholder that acts. */
  soundAction: boolean;
}

function visit(params: string[], scan: TemplateScan, shortcuts: Record<string, string>, stack: string[]) {
  const moduleId = params.shift();
  const first = params[0] ?? "";

  switch (moduleId) {
    case "OSCData":
      if (DYNAMIC_TEXT.test(first)) scan.anyOsc = true;
      else scan.osc.add(first);
      return;

    case "Var":
      if (DYNAMIC_TEXT.test(first)) scan.anyVar = true;
      else scan.vars.add(first);
      return;

    case "Shortcut": {
      const body = shortcuts[first];
      if (!body) return;
      // A loop can't be followed to the end, and it's going to fail at run time anyway.
      if (stack.includes(first) || stack.length >= MAX_SHORTCUT_DEPTH) {
        scan.needsTick = true;
        return;
      }
      const args = params.slice(1);
      const expanded = body.replace(SHORTCUT_PARAM, (itself, index) => args[Number(index)] || itself);
      walk(expanded, scan, shortcuts, [...stack, first]);
      return;
    }

    case "Text":
      if (first === "Animate") scan.needsTick = true;
      return;

    case "Number":
      if (first === "Random") scan.needsTick = true;
      return;

    case "Expr":
      if (/random/i.test(first)) scan.needsTick = true;
      return;

    case "Sound":
      if (SOUND_ACTIONS.has(first)) scan.soundAction = true;
      scan.needsTick = true;
      return;

    default:
      scan.needsTick = true;
  }
}

function walk(text: string, scan: TemplateScan, shortcuts: Record<string, string>, stack: string[]) {
  for (const match of text.matchAll(OUTER_PLACEHOLDER)) visit(splitParams(match[1], ";"), scan, shortcuts, stack);
  for (const match of text.matchAll(INNER_PLACEHOLDER)) visit(splitParams(match[1], ":"), scan, shortcuts, stack);
}

export function scanTemplate(template: string, shortcuts: Record<string, string>): TemplateScan {
  const scan: TemplateScan = {
    osc: new Set(),
    vars: new Set(),
    anyOsc: false,
    anyVar: false,
    needsTick: false,
    soundAction: false,
  };
  walk(template, scan, shortcuts, []);
  return scan;
}
