/**
 * Language tables for the Speech module.
 *
 * Two different lists are needed. Recognition wants a full BCP-47 tag with a region, since
 * Chrome uses the region to pick an acoustic model ("en-US" and "en-GB" are not the same
 * recognizer). Translation targets only want the base language, and every provider spells
 * them slightly differently, so the mapping lives here too.
 */

export interface RecognitionLanguage {
  /** BCP-47 tag passed straight to the recognizer. */
  tag: string;
  label: string;
}

/** The languages Chrome's recognizer handles well. Anything else can be typed by hand. */
export const recognitionLanguages: RecognitionLanguage[] = [
  { tag: "en-US", label: "English (United States)" },
  { tag: "en-GB", label: "English (United Kingdom)" },
  { tag: "en-AU", label: "English (Australia)" },
  { tag: "en-CA", label: "English (Canada)" },
  { tag: "tr-TR", label: "Turkish" },
  { tag: "de-DE", label: "German" },
  { tag: "fr-FR", label: "French" },
  { tag: "es-ES", label: "Spanish (Spain)" },
  { tag: "es-MX", label: "Spanish (Mexico)" },
  { tag: "it-IT", label: "Italian" },
  { tag: "pt-BR", label: "Portuguese (Brazil)" },
  { tag: "pt-PT", label: "Portuguese (Portugal)" },
  { tag: "nl-NL", label: "Dutch" },
  { tag: "pl-PL", label: "Polish" },
  { tag: "sv-SE", label: "Swedish" },
  { tag: "da-DK", label: "Danish" },
  { tag: "nb-NO", label: "Norwegian" },
  { tag: "fi-FI", label: "Finnish" },
  { tag: "cs-CZ", label: "Czech" },
  { tag: "el-GR", label: "Greek" },
  { tag: "hu-HU", label: "Hungarian" },
  { tag: "ro-RO", label: "Romanian" },
  { tag: "uk-UA", label: "Ukrainian" },
  { tag: "ru-RU", label: "Russian" },
  { tag: "bg-BG", label: "Bulgarian" },
  { tag: "ar-SA", label: "Arabic" },
  { tag: "he-IL", label: "Hebrew" },
  { tag: "hi-IN", label: "Hindi" },
  { tag: "id-ID", label: "Indonesian" },
  { tag: "ja-JP", label: "Japanese" },
  { tag: "ko-KR", label: "Korean" },
  { tag: "th-TH", label: "Thai" },
  { tag: "vi-VN", label: "Vietnamese" },
  { tag: "zh-CN", label: "Chinese (Mandarin, Simplified)" },
  { tag: "zh-TW", label: "Chinese (Mandarin, Traditional)" },
  { tag: "zh-HK", label: "Chinese (Cantonese)" },
];

/** Common translation targets. Any ISO code a provider knows can still be typed in. */
export const translationLanguages: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "tr", label: "Turkish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "nb", label: "Norwegian" },
  { code: "fi", label: "Finnish" },
  { code: "cs", label: "Czech" },
  { code: "el", label: "Greek" },
  { code: "hu", label: "Hungarian" },
  { code: "ro", label: "Romanian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ru", label: "Russian" },
  { code: "bg", label: "Bulgarian" },
  { code: "ar", label: "Arabic" },
  { code: "he", label: "Hebrew" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "zh", label: "Chinese (Simplified)" },
  { code: "zh-TW", label: "Chinese (Traditional)" },
];

const languageNames = new Map(translationLanguages.map((entry) => [entry.code.toLowerCase(), entry.label]));

/** Turns a tag like "pt-BR" into just "pt", which is what most translation APIs want. */
export function baseLanguage(tag: string): string {
  return (tag || "").trim().split(/[-_]/)[0].toLowerCase();
}

/** Human readable name, used in the prompts sent to the LLM providers. */
export function languageName(code: string): string {
  const cleaned = (code || "").trim().toLowerCase();
  if (!cleaned) return "English";
  return (
    languageNames.get(cleaned) ??
    languageNames.get(baseLanguage(cleaned)) ??
    cleaned
  );
}

/**
 * DeepL wants uppercase codes, and rejects a plain "EN" or "PT" as a target because it
 * cannot tell which variant you mean.
 */
export function toDeepLTarget(code: string): string {
  const cleaned = (code || "").trim().toLowerCase();
  switch (cleaned) {
    case "en": return "EN-US";
    case "pt": return "PT-PT";
    case "zh": return "ZH";
    case "zh-tw": return "ZH-HANT";
    case "nb":
    case "no": return "NB";
    default: return cleaned.toUpperCase().replace("_", "-");
  }
}

export function toDeepLSource(code: string): string {
  const base = baseLanguage(code);
  if (!base) return "";
  if (base === "nb" || base === "no") return "NB";
  return base.toUpperCase();
}

export function recognitionLanguageLabel(tag: string): string {
  return recognitionLanguages.find((entry) => entry.tag === tag)?.label ?? tag;
}
