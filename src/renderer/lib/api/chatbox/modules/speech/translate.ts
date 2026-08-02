import { baseLanguage, languageName, toDeepLSource, toDeepLTarget } from "./languages";

/**
 * Translation backends for the Speech module.
 *
 * Every request goes through `window.ADVOSCNative.http.request` so it runs on Chromium's
 * network stack in the main process, which keeps CORS out of the way and keeps API keys
 * out of page-visible requests.
 */

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

export interface TranslationRequest {
  text: string;
  /** Empty or "auto" lets the provider detect it. */
  sourceLanguage: string;
  targetLanguage: string;
  apiKey?: string;
  model?: string;
  /** Extra guidance appended to the system prompt of the LLM providers. */
  instructions?: string;
}

export interface TranslationResult {
  text: string;
  detectedLanguage: string;
  provider: TranslationProviderId;
}

class TranslationError extends Error { }

async function request(options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}) {
  const result = await window.ADVOSCNative.http.request({
    method: "GET",
    timeoutMs: 15000,
    ...options,
  });

  if (result.error) throw new TranslationError(result.error);
  if (!result.ok) {
    // Providers put the useful part of the failure in the body, so surface a slice of it.
    const detail = (result.body || "").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new TranslationError(`HTTP ${result.status} ${result.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function parseJson(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    throw new TranslationError("The provider did not return JSON.");
  }
}

/** The Cloud Translation v2 endpoint returns HTML entities even in text mode. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// ------------------------------------------------------------------- google

async function translateWithGoogle(input: TranslationRequest): Promise<TranslationResult> {
  const target = input.targetLanguage;
  const source = input.sourceLanguage && input.sourceLanguage !== "auto" ? baseLanguage(input.sourceLanguage) : "auto";

  if (input.apiKey) {
    const result = await request({
      url: `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(input.apiKey)}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: input.text,
        target: baseLanguage(target) || target,
        source: source === "auto" ? undefined : source,
        format: "text",
      }),
    });

    const json = parseJson(result.body);
    const translation = json?.data?.translations?.[0];
    if (!translation) throw new TranslationError("No translation came back.");
    return {
      text: decodeEntities(String(translation.translatedText ?? "")),
      detectedLanguage: String(translation.detectedSourceLanguage ?? source ?? ""),
      provider: "google",
    };
  }

  // The key-less endpoint the Google Translate web page itself uses.
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
    `&sl=${encodeURIComponent(source)}` +
    `&tl=${encodeURIComponent(target)}` +
    `&q=${encodeURIComponent(input.text)}`;

  const result = await request({ url });
  const json = parseJson(result.body);
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new TranslationError("Unexpected response from Google.");
  }

  // json[0] is a list of [translated, original, ...] segments that have to be joined back.
  const text = json[0].map((segment: any[]) => (segment && segment[0]) || "").join("");
  return {
    text,
    detectedLanguage: typeof json[2] === "string" ? json[2] : source,
    provider: "google",
  };
}

// -------------------------------------------------------------------- deepl

async function translateWithDeepL(input: TranslationRequest): Promise<TranslationResult> {
  if (!input.apiKey) throw new TranslationError("DeepL needs an API key.");

  // Free keys end in ":fx" and live on a different host than paid ones.
  const host = input.apiKey.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const source = input.sourceLanguage && input.sourceLanguage !== "auto" ? toDeepLSource(input.sourceLanguage) : "";

  const result = await request({
    url: `${host}/v2/translate`,
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${input.apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [input.text],
      target_lang: toDeepLTarget(input.targetLanguage),
      ...(source ? { source_lang: source } : {}),
    }),
  });

  const json = parseJson(result.body);
  const translation = json?.translations?.[0];
  if (!translation) throw new TranslationError("No translation came back.");
  return {
    text: String(translation.text ?? ""),
    detectedLanguage: String(translation.detected_source_language ?? "").toLowerCase(),
    provider: "deepl",
  };
}

// ---------------------------------------------------------------- llm shared

function buildSystemPrompt(input: TranslationRequest): string {
  const target = languageName(input.targetLanguage);
  const from =
    input.sourceLanguage && input.sourceLanguage !== "auto"
      ? ` The text is in ${languageName(input.sourceLanguage)}.`
      : "";

  return [
    `You are a translation engine. Translate the user message into ${target}.${from}`,
    "Reply with the translation and nothing else. No quotes, no notes, no explanations, no language labels.",
    "Keep emoji, punctuation and casing style. Keep names and usernames as they are.",
    "This is live speech from a voice chat, so keep it natural and conversational.",
    "If the text is already in the target language, repeat it unchanged.",
    input.instructions?.trim() ? input.instructions.trim() : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", "«": "»", "“": "”" };

/**
 * LLMs like to wrap the answer in quotes or add a "Translation:" prefix no matter what the
 * prompt says, and they mix the two in either order. Peeling repeatedly handles both
 * `Translation: "hi"` and `"Translation: hi"`.
 */
function cleanLLMOutput(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();

  for (let pass = 0; pass < 3; pass++) {
    const before = cleaned;

    if (cleaned.length > 1 && QUOTE_PAIRS[cleaned[0]] === cleaned[cleaned.length - 1]) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    cleaned = cleaned.replace(/^(translation|translated text|output)\s*:\s*/i, "").trim();

    if (cleaned === before) break;
  }

  return cleaned;
}

async function translateWithOpenRouter(input: TranslationRequest): Promise<TranslationResult> {
  if (!input.apiKey) throw new TranslationError("OpenRouter needs an API key.");

  const result = await request({
    url: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey.trim()}`,
      "Content-Type": "application/json",
      // OpenRouter uses these for its own attribution listing.
      "HTTP-Referer": "https://github.com/TheArmagan/advosc",
      "X-Title": "ADVOSC",
    },
    body: JSON.stringify({
      model: input.model || getProviderInfo("openrouter").defaultModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildSystemPrompt(input) },
        { role: "user", content: input.text },
      ],
    }),
    timeoutMs: 20000,
  });

  const json = parseJson(result.body);
  if (json?.error) throw new TranslationError(String(json.error.message || json.error));
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new TranslationError("No translation came back.");
  return {
    text: cleanLLMOutput(content),
    detectedLanguage: baseLanguage(input.sourceLanguage),
    provider: "openrouter",
  };
}

async function translateWithGemini(input: TranslationRequest): Promise<TranslationResult> {
  if (!input.apiKey) throw new TranslationError("Gemini needs an API key.");

  const model = input.model || getProviderInfo("gemini").defaultModel!;
  const result = await request({
    url:
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
      `?key=${encodeURIComponent(input.apiKey.trim())}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemPrompt(input) }] },
      contents: [{ role: "user", parts: [{ text: input.text }] }],
      generationConfig: { temperature: 0.2 },
    }),
    timeoutMs: 20000,
  });

  const json = parseJson(result.body);
  if (json?.error) throw new TranslationError(String(json.error.message || json.error));
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new TranslationError("No translation came back.");
  const text = parts.map((part: any) => part?.text ?? "").join("");
  return {
    text: cleanLLMOutput(text),
    detectedLanguage: baseLanguage(input.sourceLanguage),
    provider: "gemini",
  };
}

export async function translate(
  provider: TranslationProviderId,
  input: TranslationRequest,
): Promise<TranslationResult> {
  const text = (input.text || "").trim();
  if (!text) return { text: "", detectedLanguage: "", provider };
  if (!input.targetLanguage) throw new TranslationError("No target language is set.");

  const normalized = { ...input, text };
  switch (provider) {
    case "deepl": return await translateWithDeepL(normalized);
    case "openrouter": return await translateWithOpenRouter(normalized);
    case "gemini": return await translateWithGemini(normalized);
    case "google":
    default: return await translateWithGoogle(normalized);
  }
}
