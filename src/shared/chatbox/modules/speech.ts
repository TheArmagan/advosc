import { AppModule, type ModuleOptions } from "../module-base";
import type { Writable } from "../../store";
import type { TranslationProviderId } from "../translate-providers";

export interface SpeechTranslationSettings {
  enabled: boolean;
  provider: TranslationProviderId;
  targetLanguage: string;
  /** "" follows the recognition language, "auto" lets the provider detect it. */
  sourceLanguage: string;
  /** Translating every interim result burns through API quota fast, so it is off by default. */
  translateInterim: boolean;
  keys: Record<string, string>;
  models: Record<string, string>;
  /** Appended to the system prompt of the LLM providers. */
  instructions: string;
}

export interface SpeechLiveState {
  /** Recent finalized sentences, oldest first. */
  finals: string[];
  interim: string;
  lastFinal: string;
  lastUpdateAt: number;
  lastFinalAt: number;
  confidence: number | null;
  detectedLanguage: string;
  translatedText: string;
  translatedFinal: string;
  translating: boolean;
  translationError: string;
  serverRunning: boolean;
  serverUrl: string;
  pageConnected: boolean;
  listening: boolean;
  pageError: string;
  /** True while VRChat reports your own mic as muted. */
  muted: boolean;
}

export function emptyLiveState(): SpeechLiveState {
  return {
    finals: [],
    interim: "",
    lastFinal: "",
    lastUpdateAt: 0,
    lastFinalAt: 0,
    confidence: null,
    detectedLanguage: "",
    translatedText: "",
    translatedFinal: "",
    translating: false,
    translationError: "",
    serverRunning: false,
    serverUrl: "",
    pageConnected: false,
    listening: false,
    pageError: "",
    muted: false,
  };
}

const DEFAULT_PORT = 7274;
const DEFAULT_CLEAR_SECONDS = 15;

const defaultTranslation: SpeechTranslationSettings = {
  enabled: false,
  provider: "google",
  targetLanguage: "en",
  sourceLanguage: "",
  translateInterim: false,
  keys: {},
  models: {},
  instructions: "",
};

export const speechOptions: ModuleOptions = {
  id: "Speech",
  name: "Speech",
  description: "Speech to text from your browser, with optional live translation.",
  examplePlaceholders: {
    "Text": {
      value: "hey how are you doing",
      description:
        "Everything heard right now: the finalized sentences plus whatever is still being spoken.",
      fillText: "Speech;Text",
    },
    "Final": {
      value: "hey how are you doing",
      description: "Only the finalized sentences, without the part still being spoken.",
      fillText: "Speech;Final",
    },
    "Interim": {
      value: "and then i said",
      description: "Only the part still being spoken, which changes as you talk.",
      fillText: "Speech;Interim",
    },
    "Last": {
      value: "how are you doing",
      description: "The most recent finished sentence on its own.",
      fillText: "Speech;Last",
    },
    "Translated": {
      value: "hey nasılsın",
      description:
        "Translation of what is currently heard. Needs translation turned on in the module settings.",
      fillText: "Speech;Translated",
    },
    "TranslatedFinal": {
      value: "hey nasılsın",
      description: "Translation of the finalized sentences only.",
      fillText: "Speech;TranslatedFinal",
    },
    "Both": {
      value: "hey how are you doing | hey nasılsın",
      description:
        "Original and translation together. The parameter is the separator, and defaults to ' | '.",
      fillText: "Speech;Both;${1: | }",
    },
    "IsListening": {
      value: "true",
      description: "Returns 'true' while the browser page has the microphone open.",
      fillText: "Speech;IsListening",
    },
    "IsSpeaking": {
      value: "true",
      description: "Returns 'true' while words are actively coming in.",
      fillText: "Speech;IsSpeaking",
    },
    "IsMuted": {
      value: "false",
      description: "Returns 'true' while VRChat reports your own microphone as muted.",
      fillText: "Speech;IsMuted",
    },
    "HasText": {
      value: "true",
      description: "Returns 'true' when there is any speech text to show.",
      fillText: "Speech;HasText",
    },
    "IsServerRunning": {
      value: "true",
      description: "Returns 'true' when the local speech server is up.",
      fillText: "Speech;IsServerRunning",
    },
    "IsPageConnected": {
      value: "true",
      description: "Returns 'true' when the browser page is open and connected.",
      fillText: "Speech;IsPageConnected",
    },
    "Age": {
      value: "3200",
      description: "Milliseconds since the last thing you said was heard.",
      fillText: "Speech;Age",
    },
    "Language": {
      value: "en-US",
      description: "The recognition language currently set.",
      fillText: "Speech;Language",
    },
    "LanguageName": {
      value: "English (United States)",
      description: "Readable name of the recognition language.",
      fillText: "Speech;LanguageName",
    },
    "TargetLanguage": {
      value: "tr",
      description: "The language speech is being translated into.",
      fillText: "Speech;TargetLanguage",
    },
    "DetectedLanguage": {
      value: "en",
      description: "Language the translation provider detected in the last translation.",
      fillText: "Speech;DetectedLanguage",
    },
    "Confidence": {
      value: "0.92",
      description: "Recognizer confidence for the last finished sentence, from 0 to 1.",
      fillText: "Speech;Confidence",
    },
    "Provider": {
      value: "Google Translate",
      description: "Name of the translation provider in use.",
      fillText: "Speech;Provider",
    },
    "ServerUrl": {
      value: "http://127.0.0.1:7274/?t=...",
      description: "The address of the recognition page, in case you want to open it yourself.",
      fillText: "Speech;ServerUrl",
    },
    "Error": {
      value: "",
      description: "The last recognition or translation error, empty when everything is fine.",
      fillText: "Speech;Error",
    },
  },
  inputs: [
    { id: "clear", label: "Clear text", description: "Clears what's been heard so far.", params: [] },
    { id: "listen", label: "Start listening", description: "Opens the mic on the recognition page.", params: [] },
    { id: "stopListening", label: "Stop listening", description: "Closes the mic on the recognition page.", params: [] },
  ],
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class SpeechConfig extends AppModule {
  constructor(values: Writable<Record<string, any>>) {
    super(speechOptions, values);
  }

  getPort(): number {
    const raw = Number(this.getValues().port);
    if (!isFinite(raw) || raw < 1024 || raw > 65535) return DEFAULT_PORT;
    return Math.floor(raw);
  }

  setPort(port: number) {
    this.values.set({ ...this.getValues(), port });
  }

  getAutoStart(): boolean {
    return this.getValues().autoStart !== false;
  }

  setAutoStart(autoStart: boolean) {
    this.values.set({ ...this.getValues(), autoStart });
  }

  getLanguage(): string {
    return this.getValues().language || "en-US";
  }

  setLanguage(language: string) {
    this.values.set({ ...this.getValues(), language });
  }

  getInterimResults(): boolean {
    return this.getValues().interimResults !== false;
  }

  setInterimResults(interimResults: boolean) {
    this.values.set({ ...this.getValues(), interimResults });
  }

  getClearAfterSeconds(): number {
    const raw = Number(this.getValues().clearAfterSeconds);
    if (!isFinite(raw) || raw < 0) return DEFAULT_CLEAR_SECONDS;
    return Math.min(600, Math.round(raw));
  }

  setClearAfterSeconds(seconds: number) {
    this.values.set({ ...this.getValues(), clearAfterSeconds: seconds });
  }

  /** Whether muting yourself in VRChat also wipes and pauses the speech text. */
  getClearWhenMuted(): boolean {
    return this.getValues().clearWhenMuted === true;
  }

  setClearWhenMuted(clearWhenMuted: boolean) {
    this.values.set({ ...this.getValues(), clearWhenMuted });
  }

  /** How many finished sentences stay in the buffer at once. */
  getSentenceCount(): number {
    const raw = Number(this.getValues().sentenceCount);
    if (!isFinite(raw) || raw < 1) return 1;
    return Math.min(10, Math.round(raw));
  }

  setSentenceCount(count: number) {
    this.values.set({ ...this.getValues(), sentenceCount: count });
  }

  /** Hard character cap so a long ramble cannot eat the whole 144 character chatbox. */
  getMaxLength(): number {
    const raw = Number(this.getValues().maxLength);
    if (!isFinite(raw) || raw < 0) return 0;
    return Math.min(4096, Math.round(raw));
  }

  setMaxLength(maxLength: number) {
    this.values.set({ ...this.getValues(), maxLength });
  }

  getTranslation(): SpeechTranslationSettings {
    const stored = this.getValues().translation || {};
    return {
      ...defaultTranslation,
      ...stored,
      keys: { ...(stored.keys || {}) },
      models: { ...(stored.models || {}) },
    };
  }

  setTranslation(next: Partial<SpeechTranslationSettings>) {
    const merged = { ...this.getTranslation(), ...next };
    this.values.set({ ...this.getValues(), translation: merged });
  }

  setTranslationKey(provider: TranslationProviderId, key: string) {
    const translation = this.getTranslation();
    this.setTranslation({ keys: { ...translation.keys, [provider]: key } });
  }

  setTranslationModel(provider: TranslationProviderId, model: string) {
    const translation = this.getTranslation();
    this.setTranslation({ models: { ...translation.models, [provider]: model } });
  }

  /**
   * Exports carry no API keys, so a plain merge would replace `translation` and wipe the ones
   * already saved here.
   */
  mergeImportedValues(current: Record<string, any>, incoming: Record<string, any>) {
    const merged = { ...current, ...incoming };
    if (incoming.translation) {
      merged.translation = {
        ...current.translation,
        ...incoming.translation,
        keys: { ...(current.translation?.keys || {}), ...(incoming.translation.keys || {}) },
      };
    }
    return merged;
  }

  getCleanValues(): Record<string, any> {
    const translation = this.getTranslation();
    return {
      port: this.getPort(),
      autoStart: this.getAutoStart(),
      language: this.getLanguage(),
      interimResults: this.getInterimResults(),
      clearAfterSeconds: this.getClearAfterSeconds(),
      clearWhenMuted: this.getClearWhenMuted(),
      sentenceCount: this.getSentenceCount(),
      maxLength: this.getMaxLength(),
      translation: {
        ...translation,
        // API keys are personal, so they never leave the machine in an export.
        keys: {},
      },
    };
  }
}
