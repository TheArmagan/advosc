export function splitParams(text: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === delimiter) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/** A `//` comment starts a line or follows whitespace, so `https://...` stays text. */
export function cleanTemplate(text: string) {
  return cleanRendered(text.replace(/(^|[ \t])\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//gm, ""));
}

/** For rendered output: drops blank lines only, since a song title can contain `//`. */
export function cleanRendered(text: string) {
  return text.split("\n").filter(i => i.trim()).join("\n").trim();
}

export type ChatboxPlaceholder = {
  params: string[];
  value: string;
  description: string;
  fillText?: string;
};

export interface ChatboxSettings {
  template: string;
  autoSend: boolean;
  debugMode: boolean;
}
