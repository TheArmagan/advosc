import type { ChatboxPlaceholder } from "$shared/template-syntax";

/** The placeholder's text with Monaco snippet tabstops, without the braces. */
function body(placeholder: ChatboxPlaceholder) {
  return placeholder.fillText ?? placeholder.params.join(";");
}

/** Swaps the `;` between params for `:`, leaving `${1:default}` tabstops alone. */
function toInner(text: string) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "$" && text[i + 1] === "{") depth++;
    else if (ch === "}" && depth > 0) depth--;
    out += ch === ";" && depth === 0 ? ":" : ch;
  }
  return out;
}

export function outerSnippet(placeholder: ChatboxPlaceholder) {
  return `{{${body(placeholder)}}}`;
}

export function innerSnippet(placeholder: ChatboxPlaceholder) {
  return `[[${toInner(body(placeholder))}]]`;
}

/** What it looks like without tabstops, for display. `${1:name}` shows as `name`. */
export function plainText(snippet: string) {
  return snippet.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\{\d+\|([^}|]*)[^}]*\}/g, "$1");
}

/** Placeholders that need no arguments can show a live value. */
export function canPreview(placeholder: ChatboxPlaceholder) {
  return !body(placeholder).includes("${");
}
