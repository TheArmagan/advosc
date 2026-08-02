import { get, writable } from "svelte/store";
import { chatbox } from "..";
import { ChatboxModule, PlaceholdersRecord } from "../chatbox-module";
import { baseLanguage, languageName, recognitionLanguageLabel } from "./speech/languages";
import {
  getProviderInfo,
  translate,
  type TranslationProviderId,
} from "./speech/translate";
import type {
  SpeechPageStatus,
  SpeechServerState,
  SpeechTranscript,
} from "../../../../../main/preload";
// @ts-expect-error
import ChatboxSpeechSettings from "$lib/components/chatbox-editor/modules/chatbox-speech-settings.svelte";

/**
 * Speech to text, plus optional live translation.
 *
 * Electron ships without the Web Speech API, so recognition cannot run inside the app. The
 * main process serves a small page on localhost, the user opens it in Chrome, and every
 * result that page hears is pushed back here over IPC. This module holds the resulting text
 * and exposes it to templates.
 *
 * Translation runs in the background, never inside `getPlaceholderValue`, so a slow or
 * broken API can never stall the 2200 ms chatbox render loop.
 */

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

interface SpeechLiveState {
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

const DEFAULT_PORT = 7274;
/** VRChat's own parameter for your mic. True means muted. */
const MUTE_SELF_ADDRESS = "/avatar/parameters/MuteSelf";
const DEFAULT_CLEAR_SECONDS = 15;
/** How long a placeholder will wait on an in-flight translation before using the old one. */
const TRANSLATION_WAIT_MS = 1500;
const INTERIM_TRANSLATION_INTERVAL = 1200;
const TRANSLATION_CACHE_LIMIT = 200;

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

function emptyLiveState(): SpeechLiveState {
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

export class ChatboxSpeechModule extends ChatboxModule {
  /** Live recognition state. Not persisted: it is meaningless after a restart. */
  live = writable<SpeechLiveState>(emptyLiveState());

  private translationCache = new Map<string, string>();
  private pendingTranslations = new Map<string, Promise<string>>();
  private lastInterimTranslationAt = 0;
  private starting = false;
  private muted = false;
  /** Remembers whether the mic was open before VRChat muted, so unmuting can restore it. */
  private listeningBeforeMute = false;

  constructor() {
    super({
      id: "Speech",
      name: "Speech",
      description: "Speech to text from your browser, with optional live translation.",
      Component: ChatboxSpeechSettings,
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
    });

    this.attachListeners();
    this.pushConfig();

    if (this.getAutoStart()) {
      // The page needs somewhere to connect back to as soon as the app is up.
      this.startServer().catch((error) => {
        console.warn("Speech", "Could not start the speech server", error);
      });
    }

    // Old speech hanging around forever would keep sending a stale chatbox line.
    setInterval(() => this.expireStaleText(), 1000);
  }

  // ------------------------------------------------------------------ wiring

  private attachListeners() {
    const native = window.ADVOSCNative;

    native.speech.onTranscript((transcript) => this.handleTranscript(transcript));
    native.speech.onStatus((status) => this.handleStatus(status));
    native.speech.onState((state) => this.applyServerState(state));
    native.osc.onMessage((message) => this.handleOSCMessage(message));

    native.speech.getState().then((state) => this.applyServerState(state)).catch(() => {
      // Main is not ready yet; the state event will arrive later.
    });
  }

  private applyServerState(state: SpeechServerState) {
    this.live.update((current) => ({
      ...current,
      serverRunning: state.running,
      serverUrl: state.url ?? "",
      pageConnected: state.clients > 0,
      listening: state.pageListening,
    }));
  }

  private handleStatus(status: SpeechPageStatus) {
    this.live.update((current) => ({
      ...current,
      listening: !!status.listening,
      pageError: status.error
        ? status.error
        : status.supported === false
          ? "This browser has no Web Speech API. Use Chrome or Edge."
          : "",
    }));
  }

  /**
   * Follows VRChat's own mute parameter. Muting yourself in game should look the same in
   * the chatbox, otherwise the last thing you said stays up while you are not talking.
   */
  private handleOSCMessage(message: { address: string; args: (number | string | boolean | null | undefined)[] }) {
    if (message.address !== MUTE_SELF_ADDRESS) return;

    const raw = message.args[0];
    const muted = raw === true || raw === 1;
    if (muted === this.muted) return;

    this.muted = muted;
    this.live.update((current) => ({ ...current, muted }));

    if (!this.getClearWhenMuted()) return;

    if (muted) {
      this.listeningBeforeMute = get(this.live).listening;
      this.clearTranscript();
      // Close the mic in the browser too, so nothing is captured or sent off while muted.
      if (this.listeningBeforeMute) void this.setListening(false);
    } else if (this.listeningBeforeMute) {
      this.listeningBeforeMute = false;
      void this.setListening(true);
    }
  }

  private handleTranscript(transcript: SpeechTranscript) {
    if (transcript.cleared) {
      this.clearTranscript();
      return;
    }

    // The browser page takes a moment to actually release the mic, so drop anything that
    // arrives after VRChat says you are muted.
    if (this.muted && this.getClearWhenMuted()) return;

    const text = (transcript.text || "").trim();
    if (!text) return;

    const now = Date.now();

    if (transcript.isFinal) {
      const keep = this.getSentenceCount();
      this.live.update((current) => {
        const finals = [...current.finals, text].slice(-keep);
        return {
          ...current,
          finals,
          interim: "",
          lastFinal: text,
          lastUpdateAt: now,
          lastFinalAt: now,
          confidence: transcript.confidence,
        };
      });
      this.requestTranslation(true);
    } else {
      this.live.update((current) => ({
        ...current,
        interim: text,
        lastUpdateAt: now,
      }));
      if (this.getTranslation().translateInterim) {
        this.requestTranslation(false);
      }
    }
  }

  /**
   * Drops text that has been sitting around longer than the clear delay, so the chatbox
   * does not keep showing a sentence from ten minutes ago.
   */
  private expireStaleText() {
    const seconds = this.getClearAfterSeconds();
    if (seconds <= 0) return;

    const state = get(this.live);
    if (!state.finals.length && !state.interim) return;
    if (Date.now() - state.lastUpdateAt < seconds * 1000) return;

    this.clearTranscript();
  }

  clearTranscript() {
    this.live.update((current) => ({
      ...current,
      finals: [],
      interim: "",
      lastFinal: "",
      translatedText: "",
      translatedFinal: "",
      confidence: null,
    }));
  }

  // ---------------------------------------------------------------- settings

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
    this.pushConfig();
  }

  getInterimResults(): boolean {
    return this.getValues().interimResults !== false;
  }

  setInterimResults(interimResults: boolean) {
    this.values.set({ ...this.getValues(), interimResults });
    this.pushConfig();
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
    // Turning it on while already muted should take effect straight away.
    if (clearWhenMuted && this.muted) {
      this.listeningBeforeMute = get(this.live).listening;
      this.clearTranscript();
      if (this.listeningBeforeMute) void this.setListening(false);
    }
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
    // Old results were produced by whatever settings were in place before.
    this.translationCache.clear();
    this.requestTranslation(true);
  }

  setTranslationKey(provider: TranslationProviderId, key: string) {
    const translation = this.getTranslation();
    this.setTranslation({ keys: { ...translation.keys, [provider]: key } });
  }

  setTranslationModel(provider: TranslationProviderId, model: string) {
    const translation = this.getTranslation();
    this.setTranslation({ models: { ...translation.models, [provider]: model } });
  }

  // ------------------------------------------------------------------ server

  private pushConfig() {
    window.ADVOSCNative.speech
      .setConfig({
        language: this.getLanguage(),
        interimResults: this.getInterimResults(),
        continuous: true,
        maxAlternatives: 1,
      })
      .catch(() => {
        // The server may not be running yet; the config goes out again when it starts.
      });
  }

  async startServer(): Promise<{ success: boolean; url?: string; error?: string }> {
    if (this.starting) return { success: false, error: "Already starting." };
    this.starting = true;
    try {
      const result = await window.ADVOSCNative.speech.start({
        port: this.getPort(),
        config: {
          language: this.getLanguage(),
          interimResults: this.getInterimResults(),
          continuous: true,
          maxAlternatives: 1,
        },
      });
      if (result.success && result.port && result.port !== this.getPort()) {
        // The requested port was taken and the server moved up, so remember where it landed.
        this.setPort(result.port);
      }
      return result;
    } finally {
      this.starting = false;
    }
  }

  async stopServer() {
    await window.ADVOSCNative.speech.stop();
    this.live.update((current) => ({
      ...current,
      serverRunning: false,
      serverUrl: "",
      pageConnected: false,
      listening: false,
    }));
  }

  async openPage() {
    return await window.ADVOSCNative.speech.openPage();
  }

  async setListening(listening: boolean) {
    await window.ADVOSCNative.speech.command(listening ? "start" : "stop");
  }

  // ------------------------------------------------------------- translation

  private resolveSourceLanguage(): string {
    const source = this.getTranslation().sourceLanguage;
    if (source === "auto") return "auto";
    if (source) return source;
    return baseLanguage(this.getLanguage());
  }

  private cacheKey(text: string): string {
    const translation = this.getTranslation();
    return [
      translation.provider,
      translation.targetLanguage,
      this.resolveSourceLanguage(),
      translation.models[translation.provider] || "",
      text,
    ].join("|");
  }

  private rememberTranslation(key: string, value: string) {
    this.translationCache.set(key, value);
    if (this.translationCache.size > TRANSLATION_CACHE_LIMIT) {
      // Map keeps insertion order, so the first key is the oldest one.
      const oldest = this.translationCache.keys().next().value;
      if (oldest !== undefined) this.translationCache.delete(oldest);
    }
  }

  /**
   * Kicks off a translation for whatever is currently in the buffer. Returns nothing on
   * purpose: callers never wait on the network, they read the cached result later.
   */
  private requestTranslation(isFinal: boolean) {
    const translation = this.getTranslation();
    if (!translation.enabled) return;

    if (!isFinal) {
      const now = Date.now();
      if (now - this.lastInterimTranslationAt < INTERIM_TRANSLATION_INTERVAL) return;
      this.lastInterimTranslationAt = now;
    }

    const state = get(this.live);
    // Identical strings share one request through the in-flight map, so asking for both
    // costs nothing extra when there is no interim text.
    void this.translateInto(this.composeText(state, true), "translatedText");
    void this.translateInto(this.composeText(state, false), "translatedFinal");
  }

  private async translateInto(text: string, field: "translatedText" | "translatedFinal") {
    if (!text) {
      this.live.update((current) => ({ ...current, [field]: "" }));
      return;
    }

    try {
      const translated = await this.translateText(text);
      // Only write it back if the text is still what is on screen, otherwise a slow
      // response would overwrite a newer sentence with an older translation.
      const state = get(this.live);
      const stillCurrent =
        field === "translatedText"
          ? this.composeText(state, true) === text
          : this.composeText(state, false) === text;
      if (!stillCurrent) return;

      this.live.update((current) => ({ ...current, [field]: translated }));
    } catch (error) {
      const message = (error as Error)?.message || String(error);
      console.warn("Speech", "Translation failed", message);
      this.live.update((current) => ({ ...current, translationError: message }));
    }
  }

  /** Translates a single string, sharing in-flight requests and caching the results. */
  async translateText(text: string): Promise<string> {
    const trimmed = (text || "").trim();
    if (!trimmed) return "";

    const key = this.cacheKey(trimmed);
    const cached = this.translationCache.get(key);
    if (cached !== undefined) return cached;

    const inFlight = this.pendingTranslations.get(key);
    if (inFlight) return await inFlight;

    const translation = this.getTranslation();
    const provider = translation.provider;

    this.live.update((current) => ({ ...current, translating: true }));

    const pending = (async () => {
      try {
        const result = await translate(provider, {
          text: trimmed,
          sourceLanguage: this.resolveSourceLanguage(),
          targetLanguage: translation.targetLanguage,
          apiKey: translation.keys[provider] || "",
          model: translation.models[provider] || "",
          instructions: translation.instructions,
        });

        this.rememberTranslation(key, result.text);
        this.live.update((current) => ({
          ...current,
          detectedLanguage: result.detectedLanguage || current.detectedLanguage,
          translationError: "",
        }));
        return result.text;
      } finally {
        this.pendingTranslations.delete(key);
        if (this.pendingTranslations.size === 0) {
          this.live.update((current) => ({ ...current, translating: false }));
        }
      }
    })();

    this.pendingTranslations.set(key, pending);
    return await pending;
  }

  /**
   * Waits briefly for a translation that is already on its way, so a sentence that was
   * finalized a moment before the render tick still comes out translated.
   */
  private async awaitPendingTranslation(text: string): Promise<string | null> {
    if (!text) return null;
    const key = this.cacheKey(text.trim());
    const cached = this.translationCache.get(key);
    if (cached !== undefined) return cached;

    const pending = this.pendingTranslations.get(key);
    if (!pending) return null;

    return await Promise.race([
      pending.catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TRANSLATION_WAIT_MS)),
    ]);
  }

  // ---------------------------------------------------------------- assembly

  private composeText(state: SpeechLiveState, includeInterim: boolean): string {
    const parts = [...state.finals];
    if (includeInterim && this.getInterimResults() && state.interim) parts.push(state.interim);
    return this.capLength(parts.join(" ").replace(/\s+/g, " ").trim());
  }

  private capLength(text: string): string {
    const max = this.getMaxLength();
    if (!max || text.length <= max) return text;
    // Keep the newest words: that is the part the person is actually saying right now.
    return text.slice(text.length - max).replace(/^\S*\s/, "");
  }

  // ------------------------------------------------------------ placeholders

  async getPlaceholderValue(key: string, ...params: string[]): Promise<string> {
    [key, ...params] = await chatbox.fillTemplates([key, ...params], "[[:]]", false, chatbox.getInstanceKey());

    const state = get(this.live);
    const translation = this.getTranslation();
    const fullText = this.composeText(state, true);
    const finalText = this.composeText(state, false);

    switch (key) {
      case "Text": return fullText;
      case "Final": return finalText;
      case "Interim": return this.getInterimResults() ? state.interim : "";
      case "Last": return state.lastFinal;

      case "Translated": {
        if (!translation.enabled) return "";
        const pending = await this.awaitPendingTranslation(fullText);
        return pending ?? state.translatedText;
      }
      case "TranslatedFinal": {
        if (!translation.enabled) return "";
        const pending = await this.awaitPendingTranslation(finalText);
        return pending ?? state.translatedFinal;
      }
      case "Both": {
        const separator = params[0] !== undefined && params[0] !== "" ? params[0] : " | ";
        if (!translation.enabled) return fullText;
        const pending = await this.awaitPendingTranslation(fullText);
        const translated = pending ?? state.translatedText;
        if (!fullText) return "";
        if (!translated || translated === fullText) return fullText;
        return `${fullText}${separator}${translated}`;
      }

      case "IsMuted": return state.muted ? "true" : "false";
      case "IsListening": return state.listening ? "true" : "false";
      case "IsSpeaking": return state.interim ? "true" : "false";
      case "HasText": return fullText ? "true" : "false";
      case "IsServerRunning": return state.serverRunning ? "true" : "false";
      case "IsPageConnected": return state.pageConnected ? "true" : "false";
      case "IsTranslating": return state.translating ? "true" : "false";
      case "IsTranslationEnabled": return translation.enabled ? "true" : "false";

      case "Age": return String(state.lastUpdateAt ? Date.now() - state.lastUpdateAt : 0);
      case "LastSpokenAt": return String(state.lastUpdateAt || 0);
      case "Confidence": return state.confidence === null ? "" : String(state.confidence);

      case "Language": return this.getLanguage();
      case "LanguageName": return recognitionLanguageLabel(this.getLanguage());
      case "TargetLanguage": return translation.enabled ? translation.targetLanguage : "";
      case "TargetLanguageName": return translation.enabled ? languageName(translation.targetLanguage) : "";
      case "DetectedLanguage": return state.detectedLanguage;
      case "Provider": return getProviderInfo(translation.provider).name;

      case "ServerUrl": return state.serverUrl;
      case "Error": return state.pageError || state.translationError;

      default: return "";
    }
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

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    const translation = this.getTranslation();
    if (!translation.enabled) return {};

    const target = languageName(translation.targetLanguage);
    return {
      [`Both; | `]: {
        value: `hey how are you doing | hey nasılsın`,
        description: `What you said, then the ${target} translation, separated by ' | '.`,
        fillText: `Speech;Both; | `,
      },
    };
  }
}
