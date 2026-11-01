import type { AppModule } from "$shared/chatbox/module-base";
import type { AllValues } from "$shared/chatbox/preset-share";
import { exprOptions } from "$shared/chatbox/modules/expr";
import { lovenseOptions } from "$shared/chatbox/modules/lovense";
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
import { ModuleClient } from "./module-client";
import { HeartRateModule } from "./modules/chatbox-heart-rate-module";
import { HotkeyModule } from "./modules/chatbox-hotkey-module";
import { OVRTrackersModule } from "./modules/chatbox-ovr-trackers-module";
import { RequestModule } from "./modules/chatbox-request-module";
import { ShortcutModule } from "./modules/chatbox-shortcut-module";
import { SpeechModule } from "./modules/chatbox-speech-module";
import { StopwatchModule } from "./modules/chatbox-stopwatch-module";
import { VarModule } from "./modules/chatbox-var-module";
import { WeatherModule } from "./modules/chatbox-weather-module";
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

const moduleList = new Map<string, AppModule>();

function registerModule(m: AppModule, Component?: unknown) {
  if (Component) m.options = { ...m.options, Component };
  moduleList.set(m.options.id, m);
}

// Same order as the engine, since this is the order the Modules page lists them in.
registerModule(new ShortcutModule(), ChatboxShortcutSettings);
registerModule(new OVRTrackersModule(), ChatboxOVRTrackerSettings);
registerModule(new HotkeyModule(), ChatboxHotkeySettings);
registerModule(new StopwatchModule(), ChatboxStopwatchSettings);
registerModule(new HeartRateModule(), ChatboxHeartRateSettings);
registerModule(new ModuleClient(mediaInfoOptions));
registerModule(new ModuleClient(timeOptions));
registerModule(new ModuleClient(textOptions));
registerModule(new ModuleClient(exprOptions));
registerModule(new ModuleClient(oscDataOptions));
registerModule(new ModuleClient(numberOptions));
registerModule(new ModuleClient(processOptions));
registerModule(new WeatherModule(), ChatboxWeatherSettings);
registerModule(new ModuleClient(systemOptions));
registerModule(new RequestModule(), ChatboxRequestSettings);
registerModule(new SpeechModule(), ChatboxSpeechSettings);
registerModule(new ModuleClient(soundOptions));
registerModule(new VarModule(), ChatboxVarSettings);
registerModule(new ModuleClient(lovenseOptions));

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
  modules: moduleList,
  /** Every module with something to run. The list is in `options.inputs` on each module. */
  getModulesWithInputs: () => [...moduleList.values()].filter((m) => m.options.inputs?.length),
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
