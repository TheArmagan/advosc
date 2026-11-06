/**
 * Finds a `{{Shortcut;Name;...}}` or `[[Shortcut:Name:...]]` call under the cursor and
 * rewrites one of its params. Params are kept raw (escapes and all), so editing one never
 * touches how the others are written.
 */

export type CallForm = "outer" | "inner";

export type ShortcutCall = {
  line: number;
  /** 1-based Monaco columns of the whole call, end exclusive. */
  startColumn: number;
  endColumn: number;
  form: CallForm;
  key: string;
  /** The params after the name, as written. */
  rawArgs: string[];
};

const PATTERNS: [CallForm, RegExp][] = [
  // Inner first: a [[ ]] inside a {{ }} is the more specific match.
  ["inner", /\[\[([^\]]*)\]\]/g],
  ["outer", /{{([^}]*)}}/g],
];

function delimiter(form: CallForm) {
  return form === "outer" ? ";" : ":";
}

/** Splits on unescaped delimiters, keeping the backslashes. */
function splitRaw(text: string, delim: string) {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      current += ch + text[++i];
    } else if (ch === delim) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

export function unescapeArg(raw: string) {
  return raw.replace(/\\(.)/g, "$1");
}

export function escapeArg(value: string, form: CallForm) {
  const delim = delimiter(form);
  return value.replace(/\\/g, "\\\\").split(delim).join(`\\${delim}`);
}

export function findCallAt(lineText: string, line: number, column: number): ShortcutCall | null {
  for (const [form, pattern] of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lineText)) !== null) {
      const startColumn = match.index + 1;
      const endColumn = startColumn + match[0].length;
      if (column < startColumn || column > endColumn) continue;
      const [module, key, ...rawArgs] = splitRaw(match[1], delimiter(form));
      if (module !== "Shortcut" || !key) continue;
      return { line, startColumn, endColumn, form, key, rawArgs };
    }
  }
  return null;
}

export function buildCall(form: CallForm, key: string, rawArgs: string[]) {
  const body = ["Shortcut", key, ...rawArgs].join(delimiter(form));
  return form === "outer" ? `{{${body}}}` : `[[${body}]]`;
}

/** The same call as a `{{ }}`, for previewing an inner one. */
export function asOuter(call: ShortcutCall) {
  if (call.form === "outer") return buildCall("outer", call.key, call.rawArgs);
  return buildCall(
    "outer",
    call.key,
    call.rawArgs.map((raw) => escapeArg(unescapeArg(raw), "outer")),
  );
}

/** True when `textBefore` leaves a `{{` open, so a call put here has to be the `[[ ]]` form. */
export function insideOuter(textBefore: string) {
  const opens = textBefore.split("{{").length - 1;
  const closes = textBefore.split("}}").length - 1;
  return opens > closes;
}
