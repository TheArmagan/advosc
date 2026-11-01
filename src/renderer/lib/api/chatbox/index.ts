import type { ChatboxModule } from "$shared/chatbox/module-base";
import type { AllValues } from "$shared/chatbox/preset-share";
import { exprOptions } from "$shared/chatbox/modules/expr";
import { mediaInfoOptions } from "$shared/chatbox/modules/media-info";
import { numberOptions } from "$shared/chatbox/modules/number";
import { oscDataOptions } from "$shared/chatbox/modules/osc-data";
import { processOptions } from "$shared/chatbox/modules/process";
import { soundOptions } from "$shared/chatbox/modules/sound";
import { systemOptions } from "$shared/chatbox/modules/system";
import { textOptions } from "$shared/chatbox/modules/text";
import { timeOptions } from "$shared/chatbox/modules/time";
import { get } from "$shared/store";
import {
  cleanTemplate,
  splitParams,
  type ChatboxPlaceholder,
  type ChatboxSettings,
} from "$shared/template-syntax";
import { call, mirrored, synced } from "../engine";
import { ChatboxModuleClient } from "./module-client";
import { ChatboxHeartRateModule } from "./modules/chatbox-heart-rate-module";
import { ChatboxHotkeyModule } from "./modules/chatbox-hotkey-module";
import { ChatboxOVRTrackersModule } from "./modules/chatbox-ovr-trackers-module";
import { ChatboxRequestModule } from "./modules/chatbox-request-module";
import { ChatboxShortcutModule } from "./modules/chatbox-shortcut-module";
import { ChatboxSpeechModule } from "./modules/chatbox-speech-module";
import { ChatboxStopwatchModule } from "./modules/chatbox-stopwatch-module";
import { ChatboxVarModule } from "./modules/chatbox-var-module";
import { ChatboxWeatherModule } from "./modules/chatbox-weather-module";
import ChatboxHeartRateSettings from "$lib/components/chatbox-editor/modules/chatbox-heart-rate-settings.svelte";
import ChatboxHotkeySettings from "$lib/components/chatbox-editor/modules/chatbox-hotkey-settings.svelte";
import ChatboxOVRTrackerSettings from "$lib/components/chatbox-editor/modules/chatbox-ovr-tracker-settings.svelte";
import ChatboxRequestSettings from "$lib/components/chatbox-editor/modules/chatbox-request-settings.svelte";
import ChatboxShortcutSettings from "$lib/components/chatbox-editor/modules/chatbox-shortcut-settings.svelte";
import ChatboxSpeechSettings from "$lib/components/chatbox-editor/modules/chatbox-speech-settings.svelte";
import ChatboxStopwatchSettings from "$lib/components/chatbox-editor/modules/chatbox-stopwatch-settings.svelte";
import ChatboxVarSettings from "$lib/components/chatbox-editor/modules/chatbox-var-settings.svelte";
import ChatboxWeatherSettings from "$lib/components/chatbox-editor/modules/chatbox-weather-settings.svelte";

export type { AllValues };

/** Thin client over the engine's chatbox. The store keys match the engine's exactly. */

const chatboxList = new Map<string, ChatboxModule>();

function registerChatboxModule(m: ChatboxModule, Component?: unknown) {
  if (Component) m.options = { ...m.options, Component };
  chatboxList.set(m.options.id, m);
}

// Same order as the engine, since this is the order the Modules page lists them in.
registerChatboxModule(new ChatboxShortcutModule(), ChatboxShortcutSettings);
registerChatboxModule(new ChatboxOVRTrackersModule(), ChatboxOVRTrackerSettings);
registerChatboxModule(new ChatboxHotkeyModule(), ChatboxHotkeySettings);
registerChatboxModule(new ChatboxStopwatchModule(), ChatboxStopwatchSettings);
registerChatboxModule(new ChatboxHeartRateModule(), ChatboxHeartRateSettings);
registerChatboxModule(new ChatboxModuleClient(mediaInfoOptions));
registerChatboxModule(new ChatboxModuleClient(timeOptions));
registerChatboxModule(new ChatboxModuleClient(textOptions));
registerChatboxModule(new ChatboxModuleClient(exprOptions));
registerChatboxModule(new ChatboxModuleClient(oscDataOptions));
registerChatboxModule(new ChatboxModuleClient(numberOptions));
registerChatboxModule(new ChatboxModuleClient(processOptions));
registerChatboxModule(new ChatboxWeatherModule(), ChatboxWeatherSettings);
registerChatboxModule(new ChatboxModuleClient(systemOptions));
registerChatboxModule(new ChatboxRequestModule(), ChatboxRequestSettings);
registerChatboxModule(new ChatboxSpeechModule(), ChatboxSpeechSettings);
registerChatboxModule(new ChatboxModuleClient(soundOptions));
registerChatboxModule(new ChatboxVarModule(), ChatboxVarSettings);

const settings = synced<ChatboxSettings>("Chatbox;Settings", {
  template: "",
  autoSend: true,
  eggMode: false,
  debugMode: false,
});
const advancedTemplate = synced<string>("Chatbox;AdvancedTemplate", "");
const simpleEditorBlocks = synced<any[]>("SimpleEditor;Blocks", []);

const renderedTemplate = mirrored<string>("Chatbox;RenderedTemplate", "");
const placeholders = mirrored<ChatboxPlaceholder[]>("Chatbox;Placeholders", []);

export const chatbox = {
  fillTemplate(
    text: string,
    type: "{{;}}" | "[[:]]" = "{{;}}",
    stringify = false,
    scope = "",
  ): Promise<string> {
    return call("chatbox.fillTemplate", text, type, stringify, scope);
  },
  modules: chatboxList,
  /** Every module with something to run. The list is in `options.inputs` on each module. */
  getModulesWithInputs: () => [...chatboxList.values()].filter((m) => m.options.inputs?.length),
  /** Param values are strings. Placeholders in them need resolving before this. */
  runModuleInput(moduleId: string, inputId: string, args: Record<string, string> = {}): Promise<void> {
    return call("module.input", moduleId, inputId, args);
  },
  settings,
  getPlaceholders: () => get(placeholders),
  cleanTempalte: cleanTemplate,
  renderedTemplate,
  advancedTemplate,
  simpleEditorBlocks,
  splitParams,
  placeholders,
  getAllValues: (): Promise<AllValues> => call("chatbox.getAllValues"),
  setAllValues: (values: AllValues): Promise<void> => call("chatbox.setAllValues", values),
  getSettings: () => get(settings),
};
