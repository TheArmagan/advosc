import { AUTOMATIONS_MIGRATED_KEY, type Automation } from "$shared/automation";
import type { SoundEntry, SoundTriggerRule } from "$shared/sound-effects";
import { localData } from "../persistence/local-data";
import { scanTemplate } from "./dependencies";

/** The old key. It's only ever read, so a rollback finds it exactly as it was. */
const SOUND_RULES_KEY = "SoundEffects;Rules";

function soundName(id: string, sounds: SoundEntry[]): string {
  return sounds.find((sound) => sound.id === id)?.name ?? "";
}

/**
 * - `while` when the rule looped or stopped on unmatch, otherwise `edge`.
 * - `stopOnEnd` is set for loops too, because a looping voice has always stopped on unmatch
 *   whatever `stopOnUnmatch` said.
 * - `legacySideEffects` only when the template calls a Sound action. Those rules relied on the
 *   template itself playing something, which a read-only evaluation would silently stop.
 */
export function convertSoundRule(
  rule: SoundTriggerRule,
  sounds: SoundEntry[],
  shortcuts: Record<string, string>,
): Automation {
  const loop = !!rule.loop;
  const stopOnUnmatch = !!rule.stopOnUnmatch;
  const soundIds = Array.isArray(rule.soundIds) ? rule.soundIds : [];
  const soundNames = soundIds.map((id) => soundName(id, sounds));
  const template = rule.template ?? "";

  const automation: Automation = {
    id: rule.id,
    name: soundNames.filter(Boolean).join(", ") || "Sound rule",
    enabled: rule.enabled !== false,
    source: { kind: "template", template },
    match: rule.match ?? "1",
    mode: loop || stopOnUnmatch ? "while" : "edge",
    actions: [{ type: "sound", soundIds, soundNames, loop, stopOnEnd: loop || stopOnUnmatch }],
  };
  if (scanTemplate(template, shortcuts).soundAction) automation.legacySideEffects = true;
  return automation;
}

/** One-shot. Returns what to add, or nothing if it already ran. */
export function takeSoundRuleMigration(
  existing: Automation[],
  sounds: SoundEntry[],
  shortcuts: Record<string, string>,
): Automation[] {
  if (localData.get(AUTOMATIONS_MIGRATED_KEY, false)) return [];

  const stored = localData.get(SOUND_RULES_KEY, []);
  const rules: SoundTriggerRule[] = Array.isArray(stored) ? stored : [];
  const taken = new Set(existing.map((rule) => rule.id));

  const migrated = rules
    .filter((rule) => rule && typeof rule === "object" && typeof rule.id === "string" && !taken.has(rule.id))
    .map((rule) => convertSoundRule(rule, sounds, shortcuts));

  // Saved with the rules in the same store write, so a crash can't apply it twice or lose it.
  localData.set(AUTOMATIONS_MIGRATED_KEY, true);
  console.log(`Moved ${migrated.length} sound rule(s) into Automations.`);
  return migrated;
}
