import {
  AVATAR_PARAMETER_PREFIX,
  isBuiltinParameter,
  type AvatarParameterType,
  type SchemaEntry,
} from "$lib/api/vrc-osc";

export type ParameterListItem = {
  address: string;
  /** Address without the `/avatar/parameters/` prefix. */
  short: string;
  name: string;
  type: AvatarParameterType | null;
  value: number | undefined;
  inSchema: boolean;
  writable: boolean;
  builtin: boolean;
};

export type ParameterSort = "name" | "address" | "recent" | "type";

/** Values ADVOSC works out itself. They exist only here, so VRChat can't be sent one. */
const DERIVED_PREFIX = "/advosc/";

export function isDerivedParameter(address: string) {
  return address.startsWith(DERIVED_PREFIX);
}

const DERIVED_SPS = /^\/advosc\/sps\/(socket|plug)\/([^/]+)\/([^/]+)$/;

function derivedName(address: string) {
  const sps = DERIVED_SPS.exec(address);
  return sps ? `SPS ${sps[1]} ${sps[2]}: ${sps[3]}` : address;
}

export function shortAddress(address: string) {
  return address.startsWith(AVATAR_PARAMETER_PREFIX)
    ? address.slice(AVATAR_PARAMETER_PREFIX.length)
    : address;
}

/** A bare name like `Hat_On` becomes `/avatar/parameters/Hat_On`; anything starting with `/` is left alone. */
export function normalizeAddress(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : AVATAR_PARAMETER_PREFIX + trimmed;
}

/** Lowercase and drop separators so "hat toggle" finds `Hat_Toggle` and `HatToggle`. */
function fold(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Builds the full list: everything VRChat has reported plus every schema
 * parameter that hasn't reported yet, so you can set a parameter before
 * it ever changes.
 */
export function buildParameterList(
  parameters: Record<string, number>,
  schemaIndex: Record<string, SchemaEntry>,
  getType: (address: string) => AvatarParameterType | null,
): ParameterListItem[] {
  const addresses = new Set([...Object.keys(parameters), ...Object.keys(schemaIndex)]);
  const items: ParameterListItem[] = [];
  for (const address of addresses) {
    const entry = schemaIndex[address];
    const short = shortAddress(address);
    const derived = isDerivedParameter(address);
    items.push({
      address,
      short,
      name: entry?.name ?? (derived ? derivedName(address) : short),
      type: getType(address) ?? (derived ? (address.endsWith("/active") ? "Bool" : "Float") : null),
      value: parameters[address],
      inSchema: !!entry,
      writable: derived ? false : entry ? entry.writable : true,
      builtin: isBuiltinParameter(address),
    });
  }
  return items;
}

/**
 * Scores an item against a search query. Every word has to match the name
 * or address somewhere. Returns -1 for no match; higher is better.
 */
export function scoreParameter(item: ParameterListItem, query: string) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;

  const name = fold(item.name);
  const short = fold(item.short);
  const whole = fold(query);
  let score = 0;

  for (const word of words) {
    const w = fold(word);
    if (!w) continue;
    if (name.includes(w)) score += name.startsWith(w) ? 3 : 2;
    else if (short.includes(w)) score += 1;
    else return -1;
  }

  if (name === whole || short === whole) score += 10;
  else if (name.startsWith(whole)) score += 4;
  return score;
}

const TYPE_ORDER: Record<string, number> = { Bool: 0, Int: 1, Float: 2 };

// localeCompare with options builds a collator on every call, which is slow over a couple of thousand rows.
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const addressCollator = new Intl.Collator(undefined, { numeric: true });

export function sortParameters(items: ParameterListItem[], sort: ParameterSort, changedAt: Record<string, number>) {
  const byName = (a: ParameterListItem, b: ParameterListItem) => nameCollator.compare(a.name, b.name);

  switch (sort) {
    case "address":
      return items.sort((a, b) => addressCollator.compare(a.address, b.address));
    case "recent":
      return items.sort((a, b) => (changedAt[b.address] ?? 0) - (changedAt[a.address] ?? 0) || byName(a, b));
    case "type":
      return items.sort((a, b) => (TYPE_ORDER[a.type ?? ""] ?? 3) - (TYPE_ORDER[b.type ?? ""] ?? 3) || byName(a, b));
    default:
      return items.sort(byName);
  }
}

export function formatValue(value: number | undefined, type: AvatarParameterType | null) {
  if (value === undefined) return "-";
  if (type === "Bool") return value ? "true" : "false";
  if (type === "Int") return String(Math.round(value));
  return Number.isInteger(value) ? value.toFixed(1) : String(Number(value.toFixed(4)));
}

/** 0..100 for the little value bar. Floats can be -1..1, so they're mapped from that range when negative. */
export function valuePercent(value: number | undefined, type: AvatarParameterType | null) {
  if (value === undefined) return 0;
  if (type === "Int") return Math.min(100, Math.max(0, (value / 255) * 100));
  if (type === "Bool") return value ? 100 : 0;
  return Math.min(100, Math.max(0, Math.abs(value) * 100));
}
