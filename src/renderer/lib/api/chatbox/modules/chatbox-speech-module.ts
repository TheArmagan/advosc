import { emptyLiveState, SpeechConfig, type SpeechLiveState } from "$shared/chatbox/modules/speech";
import { callModule, fire, mirrored } from "../../engine";
import { moduleValues } from "../module-client";

export type { SpeechTranslationSettings } from "$shared/chatbox/modules/speech";

export class SpeechModule extends SpeechConfig {
  /** Live recognition state. Not persisted: it is meaningless after a restart. */
  live = mirrored<SpeechLiveState>("ChatboxModule;Speech;Live", emptyLiveState());

  constructor() {
    super(moduleValues("Speech"));
  }

  startServer(): Promise<{ success: boolean; url?: string; error?: string }> {
    return callModule("Speech", "startServer");
  }

  stopServer(): Promise<void> {
    return callModule("Speech", "stopServer");
  }

  openPage(): Promise<{ success: boolean; error?: string }> {
    return callModule("Speech", "openPage");
  }

  setListening(listening: boolean): Promise<void> {
    return callModule("Speech", "setListening", listening);
  }

  clearTranscript() {
    fire("module.call", "Speech", "clearTranscript", []);
  }

  translateText(text: string): Promise<string> {
    return callModule("Speech", "translateText", text);
  }
}
