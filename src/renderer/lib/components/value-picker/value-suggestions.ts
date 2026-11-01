import type { AvatarParameterType } from "$lib/api/vrc-osc";
import { scoreParameter, type ParameterListItem } from "$lib/components/avatar-osc/parameter-search";
import { splitParams, type ChatboxPlaceholder } from "$shared/template-syntax";

export const MAX_SUGGESTIONS = 40;
export const MAX_BROWSE_SUGGESTIONS = 200;
/** Below this, a bare word is just someone typing a value. */
const MIN_WORD_LENGTH = 2;

export type ValueToken = {
  kind: "outer" | "inner" | "address" | "word";
  /** Where the text this completion replaces begins. */
  start: number;
  query: string;
  /** Whether the caret is inside a `{{...}}`, which is where only `[[...]]` can go. */
  nested: boolean;
};

export type ValueInsertion = {
  text: string;
  /** Range to select after inserting, relative to `text`, so the first argument can be typed over. */
  select?: [number, number];
};

export type ValueSuggestion = {
  id: string;
  group: "Modules" | "Avatar parameters";
  label: string;
  detail: string;
  type?: AvatarParameterType | null;
  build: (inner: boolean) => ValueInsertion;
};

function isOpen(before: string, open: string, close: string) {
  const start = before.lastIndexOf(open);
  return start !== -1 && start > before.lastIndexOf(close) ? start : -1;
}

/** What's being typed at the caret, or null when it's only a plain value. */
export function findToken(text: string, caret: number): ValueToken | null {
  const before = text.slice(0, caret);
  const outerStart = isOpen(before, "{{", "}}");
  const nested = outerStart !== -1;

  const innerStart = isOpen(before, "[[", "]]");
  if (innerStart !== -1) {
    return { kind: "inner", start: innerStart, query: before.slice(innerStart + 2), nested };
  }
  if (nested) {
    return { kind: "outer", start: outerStart, query: before.slice(outerStart + 2), nested };
  }

  const address = /(?:^|\s)(\/\S*)$/.exec(before);
  if (address) {
    return { kind: "address", start: caret - address[1].length, query: address[1], nested };
  }

  const word = /[A-Za-z_][\w]*$/.exec(before);
  if (word && word[0].length >= MIN_WORD_LENGTH) {
    return { kind: "word", start: caret - word[0].length, query: word[0], nested };
  }
  return null;
}

/** Monaco snippet syntax to plain text, dropping optional arguments and selecting the first stop. */
function expandFillText(fillText: string): ValueInsertion {
  const withoutOptional = fillText.replace(/;\$\{\d+:optional[^}]*\}/g, "");
  let select: [number, number] | undefined;
  let text = "";
  let cursor = 0;

  for (const match of withoutOptional.matchAll(/\$\{(\d+):([^}]*)\}/g)) {
    text += withoutOptional.slice(cursor, match.index);
    const start = text.length;
    text += match[2];
    if (!select) select = [start, text.length];
    cursor = match.index + match[0].length;
  }
  return { text: text + withoutOptional.slice(cursor), select };
}

function wrap(body: ValueInsertion, inner: boolean): ValueInsertion {
  if (!inner) {
    return {
      text: `{{${body.text}}}`,
      select: body.select && [body.select[0] + 2, body.select[1] + 2],
    };
  }

  // `;` and `:` are both one character, so the selection stays put.
  const text = splitParams(body.text, ";").join(":");
  return {
    text: `[[${text}]]`,
    select: body.select && [body.select[0] + 2, body.select[1] + 2],
  };
}

export function placeholderSuggestions(placeholders: ChatboxPlaceholder[]): ValueSuggestion[] {
  const seen = new Set<string>();
  const result: ValueSuggestion[] = [];

  for (const placeholder of placeholders) {
    const label = placeholder.params.join(";");
    if (seen.has(label)) continue;
    seen.add(label);

    const body = placeholder.fillText
      ? expandFillText(placeholder.fillText)
      : { text: label };

    result.push({
      id: `module:${label}`,
      group: "Modules",
      label,
      detail: placeholder.description,
      build: (inner) => wrap(body, inner),
    });
  }
  return result;
}

export function parameterSuggestions(items: ParameterListItem[], rawAddress: boolean): ValueSuggestion[] {
  return items.map((item) => ({
    id: `parameter:${item.address}`,
    group: "Avatar parameters",
    label: item.name,
    detail: item.short === item.name ? "" : item.short,
    type: item.type,
    build: (inner) =>
      inner
        ? { text: `[[OSCData:${item.address}]]` }
        : rawAddress
          ? { text: item.address }
          : { text: `{{OSCData;${item.address}}}` },
  }));
}

function matchesPlaceholder(suggestion: ValueSuggestion, query: string) {
  const label = suggestion.label.toLowerCase();
  const typed = query.toLowerCase();
  // Past the first separator someone is on a specific placeholder's arguments, or typing their own.
  if (/[;:]/.test(typed)) return label.startsWith(typed.replaceAll(":", ";"));
  return !typed || label.includes(typed);
}

export function filterSuggestions(
  token: ValueToken | null,
  modules: ValueSuggestion[],
  parameters: ValueSuggestion[],
  parameterItems: ParameterListItem[],
): ValueSuggestion[] {
  // Browsing, with nothing typed to narrow it down.
  if (!token) return [...modules, ...parameters].slice(0, MAX_BROWSE_SUGGESTIONS);

  const scored = parameters
    .map((suggestion, index) => ({
      suggestion,
      score: token.query ? scoreParameter(parameterItems[index], token.query) : 0,
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.suggestion);

  if (token.kind === "address") {
    const query = token.query.toLowerCase();
    return parameterItems
      .map((item, index) => ({ item, suggestion: parameters[index] }))
      .filter(({ item }) => item.address.toLowerCase().includes(query))
      .map(({ suggestion }) => suggestion)
      .slice(0, MAX_SUGGESTIONS);
  }

  const placeholders = modules.filter((suggestion) => matchesPlaceholder(suggestion, token.query));
  return [...placeholders, ...(/[;:]/.test(token.query) ? [] : scored)].slice(0, MAX_SUGGESTIONS);
}

/** Replaces the token, or inserts at the caret when browsing. Won't double a closing bracket. */
export function applySuggestion(
  value: string,
  caret: number,
  token: ValueToken | null,
  suggestion: ValueSuggestion,
): { value: string; selectStart: number; selectEnd: number } {
  const start = token?.start ?? caret;
  const inner = token?.kind === "inner" || !!token?.nested;
  const insertion = suggestion.build(inner);

  let end = caret;
  const close = inner ? "]]" : "}}";
  if (token && (token.kind === "inner" || token.kind === "outer") && value.startsWith(close, caret)) {
    end += close.length;
  }

  const next = value.slice(0, start) + insertion.text + value.slice(end);
  const selection = insertion.select ?? [insertion.text.length, insertion.text.length];
  return { value: next, selectStart: start + selection[0], selectEnd: start + selection[1] };
}

/** Plain text doesn't need the engine to tell us what it says. */
export function hasPlaceholders(value: string) {
  return value.includes("{{") || value.includes("[[");
}
