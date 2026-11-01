/** Translation provider metadata, used by the engine and the settings UI. */

export type TranslationProviderId = "google" | "deepl" | "openrouter" | "gemini";

export interface TranslationProviderInfo {
  id: TranslationProviderId;
  name: string;
  description: string;
  /** False for the key-less Google endpoint. */
  needsApiKey: boolean;
  /** True for the LLM backends, which take a model name. */
  needsModel: boolean;
  defaultModel?: string;
  keyUrl?: string;
}

export const translationProviders: TranslationProviderInfo[] = [
  {
    id: "google",
    name: "Google Translate",
    description:
      "Works with no API key at all. Fast and good enough for chat. Add a Cloud Translation key if you want the official, rate-limit-free endpoint.",
    needsApiKey: false,
    needsModel: false,
    keyUrl: "https://console.cloud.google.com/apis/library/translate.googleapis.com",
  },
  {
    id: "deepl",
    name: "DeepL",
    description:
      "Usually the most natural sounding of the four. The free tier gives 500k characters a month.",
    needsApiKey: true,
    needsModel: false,
    keyUrl: "https://www.deepl.com/pro-api",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description:
      "Runs the translation through an LLM, so it handles slang and context better. Pick any model OpenRouter offers, including the free ones.",
    needsApiKey: true,
    needsModel: true,
    defaultModel: "google/gemini-2.0-flash-001",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description:
      "Same idea as OpenRouter but straight to Google. The free tier is generous enough for chatbox use.",
    needsApiKey: true,
    needsModel: true,
    defaultModel: "gemini-2.0-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
];

export function getProviderInfo(id: TranslationProviderId): TranslationProviderInfo {
  return translationProviders.find((provider) => provider.id === id) ?? translationProviders[0];
}
