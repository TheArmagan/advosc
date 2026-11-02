import type { Automation, AutomationAction } from "$shared/automation";
import type { ToyTarget } from "$shared/toys";

/**
 * Plain words for a rule, for reviewing one that came from somewhere else. Everything here is
 * text from outside the app, so it must only ever be rendered as text.
 */

const PARAMETER_PREFIX = "/avatar/parameters/";

const SPS_METRICS: Record<string, string> = {
  depth: "depth",
  depthSelf: "depth from you",
  depthOthers: "depth from others",
  active: "in use",
  speed: "speed",
};

const OPERATORS: Record<string, string> = {
  "==": "is",
  "=": "is",
  "!=": "isn't",
  ">=": "is at least",
  "<=": "is at most",
  ">": "is above",
  "<": "is below",
};

interface SourceParts {
  label: string;
  /** Other people's avatars can set this off, unless `last` says it only reads your own. */
  contact: boolean;
  last: string;
}

function sourceParts(address: string): SourceParts {
  const parts = address.split("/");
  const last = parts[parts.length - 1] ?? "";

  const sps = /^\/advosc\/sps\/(socket|plug)\/([^/]+)\/([^/]+)$/.exec(address);
  if (sps) {
    const metric = SPS_METRICS[sps[3]] ?? sps[3];
    return { label: `SPS ${sps[1]} "${sps[2]}": ${metric}`, contact: true, last };
  }

  if (address.startsWith(PARAMETER_PREFIX)) {
    const name = address.slice(PARAMETER_PREFIX.length);
    const contact = /^ADVOSC\/([^/]+)$/.exec(name);
    if (contact) return { label: `Contact "${contact[1]}"`, contact: true, last };

    const raw = /^OGB\/(Orf|Pen)\/([^/]+)\/(.+)$/.exec(name);
    if (raw) {
      const kind = raw[1] === "Orf" ? "socket" : "plug";
      return { label: `SPS ${kind} "${raw[2]}": ${raw[3]}`, contact: true, last };
    }

    const touch = /^VFH\/Zone\/Touch\/([^/]+)\/(.+)$/.exec(name);
    if (touch) {
      const who = touch[2] === "Self" ? "you" : touch[2] === "Others" ? "others" : touch[2];
      return { label: `Touch Zone "${touch[1]}": touched by ${who}`, contact: true, last };
    }

    return { label: `Avatar parameter ${name}`, contact: false, last };
  }

  return { label: address, contact: false, last };
}

export function describeSource(rule: Automation): string {
  return rule.source.kind === "parameter" ? sourceParts(rule.source.address).label : rule.source.template;
}

/** True when someone else's avatar can set this rule off just by being near yours. */
export function isContactRule(rule: Automation): boolean {
  if (rule.source.kind !== "parameter") return false;
  const { contact, last } = sourceParts(rule.source.address);
  return contact && !(last.includes("Self") && !last.includes("Others"));
}

/** Nothing in a plain parameter's name says whether a contact sets it, so it might be one. */
export function mayBeContactRule(rule: Automation): boolean {
  if (rule.source.kind !== "parameter" || !rule.source.address.startsWith(PARAMETER_PREFIX)) return false;
  return !sourceParts(rule.source.address).contact;
}

export function hasToyAction(rule: Automation): boolean {
  return rule.actions.some((action) => action.type === "toy");
}

function describeMatch(match: string): string {
  const parsed = /^\s*(==|!=|>=|<=|=|>|<)\s*(.*)$/.exec(match);
  return parsed ? `${OPERATORS[parsed[1]]} ${parsed[2]}` : `is ${match.trim()}`;
}

export function describeTrigger(rule: Automation): string {
  if (rule.mode === "live") {
    const range = rule.range;
    if (!range) return "Follows the value.";
    return `Follows the value, turning ${range.inMin} to ${range.inMax} into ${range.outMin} to ${range.outMax}.`;
  }

  const match = describeMatch(rule.match);
  const release = rule.releaseMatch ? describeMatch(rule.releaseMatch) : null;
  const text =
    rule.mode === "edge"
      ? `Fires once when the value ${match}${release ? `, and not again until it ${release}` : ""}.`
      : `Runs while the value ${match}${release ? `, and keeps running until it ${release}` : ""}.`;

  return rule.cooldownMs ? `${text} Waits ${rule.cooldownMs} ms between runs.` : text;
}

function toyTargetText(target: ToyTarget): string {
  const features = target.features.join(", ");
  return features ? `every connected toy (${features})` : "every connected toy";
}

function shortParameter(address: string): string {
  return address.startsWith(PARAMETER_PREFIX) ? address.slice(PARAMETER_PREFIX.length) : address;
}

export function describeAction(action: AutomationAction): string {
  switch (action.type) {
    case "sound":
      return "Play a sound, which you pick after adding this";
    case "osc":
      return `Send ${action.value} to ${shortParameter(action.address)}`;
    case "setParameter":
      return `Set ${shortParameter(action.address)} to ${action.value}`;
    case "setVariable":
      return `Set the variable ${action.name} to ${action.value}`;
    case "loadProfile":
      return "Load an avatar profile";
    case "moduleInput":
      return `Run a module input on ${action.moduleId}`;
    case "toy": {
      const toy = action.action;
      const target = toyTargetText(toy.target);
      switch (toy.kind) {
        case "link":
          return `Make ${target} follow the value`;
        case "pulse":
          return `Run ${target} at ${Math.round(toy.level * 100)}% for ${toy.seconds} s`;
        case "preset":
          return `Play the ${toy.preset} preset on ${target} for ${toy.seconds} s`;
        case "pattern":
          return `Play a saved pattern on ${target} for ${toy.seconds} s`;
        case "stop":
          return `Stop ${target}`;
      }
    }
  }
}
