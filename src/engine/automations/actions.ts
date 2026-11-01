import type { Automation, AutomationAction } from "$shared/automation";
import { isTruthy } from "$shared/sound-effects";
import { chatbox } from "../chatbox";
import type { ChatboxVarModule } from "../chatbox/modules/chatbox-var-module";
import { native } from "../native";
import { soundEngine } from "../sound-effects/engine";
import { avatarOSC, avatarProfiles } from "../vrc-osc";
import { toNumber, type RuleState } from "./rule-state";
import { getToySink } from "./toy-sink";

const HAS_PLACEHOLDER = /\{\{|\[\[/;

type OscAction = Extract<AutomationAction, { type: "osc" }>;
type SoundAction = Extract<AutomationAction, { type: "sound" }>;

function varModule() {
  return chatbox.modules.get("Var") as ChatboxVarModule | undefined;
}

/** Action values resolve read-only like sources do. Null means there's nothing safe to send. */
async function resolveText(rule: Automation, text: string): Promise<string | null> {
  if (!HAS_PLACEHOLDER.test(text)) return text;
  const result = await chatbox.evaluate(text, {
    purpose: "rule",
    readOnly: true,
    scope: `Automation;${rule.id};action`,
  });
  return result.failure ? null : result.value;
}

function sendOsc(action: OscAction, value: string | number): number | string | boolean | null {
  let out: number | string | boolean;
  switch (action.oscType) {
    case "String":
      out = String(value);
      break;
    case "Bool":
      out = typeof value === "number" ? value >= 0.5 : isTruthy(value);
      break;
    default: {
      const number = typeof value === "number" ? value : toNumber(value);
      if (number === null) return null;
      out = action.oscType === "Int" ? Math.round(number) : number;
    }
  }
  native.osc.sendCustom(action.address, [{ value: out, type: action.oscType }]);
  return out;
}

/** Skips a locked parameter. Sending would fight the lock, which resends its value on the echo. */
function sendParameter(address: string, value: number, type?: "Float"): number | null {
  if (avatarOSC.isLocked(address)) return null;
  return avatarOSC.sendParameter(address, value, avatarOSC.getParameterType(address) ?? type);
}

async function playSound(state: RuleState, action: SoundAction, runId: number, test: boolean) {
  const { rule, generation } = state;
  // Ids don't survive an export, so a name stands in for an id this library doesn't know.
  const refs = (action.soundIds ?? []).map((id, index) => (soundEngine.hasSound(id) ? id : action.soundNames?.[index] ?? id));
  const running = rule.mode === "while" && !test;

  // Nothing could ever stop a loop outside of a `while` run.
  const voice = await soundEngine.playRandom(refs, { loop: running && action.loop });
  if (voice === null || !running) return;

  // A looping voice always stops with the rule, whatever `stopOnEnd` says.
  if (!action.loop && !action.stopOnEnd) return;

  // The source may have flipped back while the file was loading.
  if (state.runId !== runId || state.generation !== generation) {
    soundEngine.stopVoice(voice);
    return;
  }
  state.voices.add(voice);
}

export function stopRuleVoices(state: RuleState) {
  for (const voice of state.voices) soundEngine.stopVoice(voice);
  state.voices.clear();
}

async function runAction(state: RuleState, action: AutomationAction, runId: number, test: boolean, level?: number) {
  const { rule } = state;

  switch (action.type) {
    case "sound":
      await playSound(state, action, runId, test);
      return;

    case "osc": {
      const value = level ?? (await resolveText(rule, action.value));
      if (value !== null) sendOsc(action, value);
      return;
    }

    case "setParameter": {
      const text = level ?? (await resolveText(rule, action.value));
      const value = typeof text === "string" ? toNumber(text) : text;
      if (value !== null) sendParameter(action.address, value);
      return;
    }

    case "loadProfile": {
      const profile = avatarProfiles.getProfile(action.profileId);
      if (!profile) throw new Error("That avatar profile no longer exists.");
      // A profile only means something on the avatar it was saved from.
      const avatarId = avatarOSC.lastAvatarId;
      if (avatarId && profile.avatarId !== avatarId) return;
      avatarProfiles.loadProfile(action.profileId);
      return;
    }

    case "moduleInput": {
      const args: Record<string, string> = {};
      for (const [name, text] of Object.entries(action.args ?? {})) {
        const value = await resolveText(rule, text);
        if (value === null) return;
        args[name] = value;
      }
      await chatbox.runModuleInput(action.moduleId, action.inputId, args);
      return;
    }

    case "setVariable": {
      const value = level ?? (await resolveText(rule, action.value));
      if (value !== null) varModule()?.set(action.name, String(value));
      return;
    }

    case "toy": {
      const sink = getToySink();
      if (!sink || !sink.armed || state.toyMuted) return;
      if (action.action.kind !== "link") sink.run(rule.id, action.action);
      else if (level !== undefined) sink.link(rule.id, action.action.target, Math.max(0, Math.min(1, level)));
      return;
    }
  }
}

/**
 * Runs a rule's actions top to bottom, so a later action can read what an earlier one set. A
 * `while` run stops partway if the rule ended in the meantime.
 */
export async function runActions(state: RuleState, runId: number, options: { test?: boolean; level?: number } = {}) {
  const { rule, generation } = state;
  const test = options.test ?? false;
  let failed: string | null = null;

  for (const action of rule.actions) {
    if (state.generation !== generation) return;
    if (!test && rule.mode === "while" && state.runId !== runId) return;
    try {
      await runAction(state, action, runId, test, options.level);
    } catch (error) {
      failed = (error as Error)?.message || "An action failed.";
      console.warn(`Automation ${rule.id}: ${action.type} action failed: ${failed}`);
    }
  }
  state.actionError = failed;
}

/** Sends a `live` rule's current level to everything that takes one, if it changed. */
export function sendLiveLevel(state: RuleState) {
  const { rule, live } = state;
  if (!live || live.level === null) return;
  const level = live.level;

  rule.actions.forEach((action, index) => {
    let sent: number | string | boolean | null;
    switch (action.type) {
      case "osc":
        if (live.sent.get(index) === level) return;
        sent = sendOsc(action, level);
        if (sent !== null) live.sent.set(index, level);
        return;

      case "setParameter":
        if (live.sent.get(index) === level) return;
        // A mapped value is continuous, so a parameter with no known type is a float.
        sent = sendParameter(action.address, level, "Float");
        if (sent !== null) live.sent.set(index, level);
        return;

      case "setVariable":
        if (live.sent.get(index) === level) return;
        varModule()?.set(action.name, String(level));
        live.sent.set(index, level);
        return;

      default:
        return;
    }
  });

  renewToyLink(state);
}

/** Run on every change and on the tick, because a link is a lease that has to be held. */
export function renewToyLink(state: RuleState) {
  const { rule, live } = state;
  if (!live || live.level === null) return;

  const sink = getToySink();
  if (!sink) return;

  const level = Math.max(0, Math.min(1, live.level));
  const allowed = sink.armed && !state.toyMuted;

  for (const action of rule.actions) {
    if (action.type !== "toy" || action.action.kind !== "link") continue;
    if (allowed && level > 0) {
      sink.link(rule.id, action.action.target, level);
      live.linked = true;
    } else if (live.linked) {
      sink.release(rule.id);
      live.linked = false;
    }
  }
}
