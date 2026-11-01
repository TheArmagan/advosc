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

export function cleanTemplate(text: string) {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//gm, "").split("\n").filter(i => i.trim()).join("\n").trim();
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
  eggMode: boolean;
  debugMode: boolean;
}
