import { toast } from "svelte-sonner";
import mapReplace from "stuffs/lib/mapReplace";
import { ChatboxModule } from "./chatbox-module";
import { ChatboxOSCDataModule } from "./modules/chatbox-osc-data-module";
import { ChatboxMediaInfoModule } from "./modules/chatbox-media-info-module";
import { ChatboxExpressionModule } from "./modules/chatbox-expr-module";
import { localData } from "../local-data";
import { get, writable } from "svelte/store";
import { chatboxOSC } from "../vrc-osc";
import { ChatboxTextModule } from "./modules/chatbox-text-module";
import { ChatboxTimeModule } from "./modules/chatbox-time-module";
import { ChatboxShortcutModule } from "./modules/chatbox-shortcut-module";
import { register } from "module";
import { ChatboxPulsoidModule } from "./modules/chatbox-pulsoid-module";
import { ChatboxNumberModule } from "./modules/chatbox-number-module";
import { ChatboxProcessModule } from "./modules/chatbox-process-module";
import { ChatboxOVRTrackersModule } from "./modules/chatbox-ovr-trackers-module";
import { ChatboxHotkeyModule } from "./modules/chatbox-hotkey-module";
import { ChatboxStopwatchModule } from "./modules/chatbox-stopwatch-module";

const PlaceholderRegex1 = /{{([^}]+)}}/g;
const PlaceholderRegex2 = /\[\[([^\]]+)\]\]/g;

function splitParams(text: string, delimiter: string): string[] {
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

const chatboxList = new Map<string, ChatboxModule>();

let callsMadeMap: Map<string, number> = new Map();
let ignoreSet: Set<string> = new Set();

const settings = writable<{ template: string; autoSend: boolean, eggMode: boolean, debugMode: boolean }>(
  {
    template: `// Example placeholders:\n// Normal placehodler: {{ModuleId;Param}}\n// Inner placeholder: [[ModuleId:Param]]\n// To get auto complete type {{ or [[ and then press CTRL + SPACE.\n{{Time;Now;HH:mm}}\n{{Expr;[[MediaInfo:Status]]=='Playing';[[MediaInfo:Track]] ᵇʸ [[MediaInfo:Artist]]}}\n{{Text;Format;SuperScript;[[MediaInfo:Lyric]]}}`,
    autoSend: true,
    eggMode: false,
    debugMode: false,
    ...localData.get("Chatbox;Settings", {})
  }
);

setInterval(() => {
  callsMadeMap.clear();
}, 1000);

async function incrementCallCount(moduleId: string, ...params: string[]) {
  const fullKey = `${moduleId};${params.join(";")}`;
  const currentCount = callsMadeMap.get(fullKey) || 0;
  callsMadeMap.set(fullKey, currentCount + 1);
  if (currentCount >= 500) {
    if (!ignoreSet.has(fullKey)) {
      console.warn("Chatbox", `Preventing recursive calls for module ${moduleId}, ${params.join(", ")} due to excessive calls (${currentCount + 1})`);
      toast.warning("Chatbox", {
        description: `Prevented recursive calls for module ${moduleId}, ${params.join(", ")} due to excessive calls (${currentCount + 1}). This may indicate a user-made bug in the module.`,
        duration: 1000,
      });
      setTimeout(() => {
        ignoreSet.delete(fullKey);
      }, 1000);
    }
    ignoreSet.add(fullKey);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent further calls for 1 second
  }
}

async function fillTemplate(text: string, type: "{{;}}" | "[[:]]" = "{{;}}", stringify = false): Promise<string> {
  const matches = [...text.matchAll(type === "{{;}}" ? PlaceholderRegex1 : PlaceholderRegex2)];
  const results: Record<string, string> = {};
  const processValue = (val: string) => {
    if (stringify) {
      switch (val) {
        case "null": return "null";
        case "undefined": return "undefined";
        case "true": return "true";
        case "false": return "false";
        case "": return '""';
        default:
          if (!isNaN(Number(val))) {
            return val;
          } else {
            return JSON.stringify(val);
          }
      }
    } else {
      return val;
    }
  };
  results["\\n"] = "\n";
  await Promise.all(matches.map(async (match) => {
    if (results[match[0]]) return;
    try {
      const params = splitParams(match[1], type === "{{;}}" ? ";" : ":");
      const moduleId = params.shift()!;

      if (ignoreSet.has(params[0])) {
        results[match[0]] = processValue(`(Ignored: ${match[0]})`);
        return;
      }
      await incrementCallCount(moduleId, ...params);
      if (ignoreSet.has(params[0])) {
        results[match[0]] = processValue(`(Ignored: ${match[0]})`);
        return;
      }

      const m = chatboxList.get(moduleId);
      if (m) {
        const content = await m.getPlaceholderValue(...params);
        if (content !== null) {
          results[match[0]] = processValue(content);
        } else {
          results[match[0]] = processValue(`(No value for ${match[0]})`);
        }
      }
    } catch (e) {
      console.error("Chatbox", "Failed to replace placeholder", match[0], e);
      toast.error("Chatbox", {
        description: `Failed to replace placeholder ${match[0]}: ${(e as Error).message}`,
        duration: 2000,
      });
    }
  }));
  return mapReplace(text, results);
}

async function fillTemplates(texts: string[], type: "{{;}}" | "[[:]]" = "{{;}}", stringify = false): Promise<string[]> {
  return (await fillTemplate(texts.join("䡁"), type, stringify)).split("䡁");
}

function registerChatboxModule(m: ChatboxModule) {
  chatboxList.set(m.options.id, m);
  m.onValuesChanged = () => {
    updatePlaceholders();
  };
}

function getPlaceholders() {
  return [...chatboxList.values()].reduce((acc, m) => {
    Object.entries({
      ...m.options.examplePlaceholders,
      ...m.getPreCalculatedPlaceholders()
    }).forEach(([key, val]) => {
      acc.push({
        params: [m.options.id, ...key.split(";")],
        value: val.value,
        description: val.description,
        fillText: val.fillText
      });
    });
    return acc;
  }, [] as { params: string[], value: string, description: string, fillText?: string }[]);
}

function cleanTempalte(text: string) {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//gm, "").split("\n").filter(i => i.trim()).join("\n").trim();
}

let renderedTempalteText = writable<string>("");
let placeholders = writable<{ params: string[], value: string, description: string, fillText?: string }[]>([]);

function updatePlaceholders() {
  placeholders.set(getPlaceholders());
}

registerChatboxModule(new ChatboxShortcutModule());
registerChatboxModule(new ChatboxOVRTrackersModule());
registerChatboxModule(new ChatboxHotkeyModule());
registerChatboxModule(new ChatboxStopwatchModule());
registerChatboxModule(new ChatboxStopwatchModule());
registerChatboxModule(new ChatboxPulsoidModule());
registerChatboxModule(new ChatboxMediaInfoModule());
registerChatboxModule(new ChatboxTimeModule());
registerChatboxModule(new ChatboxTextModule());
registerChatboxModule(new ChatboxExpressionModule());
registerChatboxModule(new ChatboxOSCDataModule());
registerChatboxModule(new ChatboxNumberModule());
registerChatboxModule(new ChatboxProcessModule());
updatePlaceholders();

export type AllValues = {
  modules: Record<string, any>;
  settings: { template: string; autoSend: boolean, eggMode: boolean, debugMode: boolean };
};

function getAllValues() {
  const moduleValues: Record<string, any> = {};
  chatboxList.forEach((module, moduleId) => {
    const values = module.getCleanValues();
    if (Object.keys(values).length > 0) {
      moduleValues[moduleId] = values;
    }
  });
  return {
    modules: moduleValues,
    settings: get(settings),
  };
}

function setAllValues(values: AllValues) {
  chatboxList.forEach((module, moduleId) => {
    if (values.modules[moduleId]) {
      module.values.set(values.modules[moduleId]);
    }
  });
  settings.set(values.settings);
}

function getSettings() {
  return get(settings);
}

export const chatbox = {
  fillTemplate,
  fillTemplates,
  modules: chatboxList,
  settings,
  getPlaceholders,
  cleanTempalte,
  renderedTempalteText,
  splitParams,
  placeholders,
  updatePlaceholders,
  getAllValues,
  setAllValues,
  getSettings,
};

let sentClear = false;
let renderingTemplate = false;
async function renderTemplate() {
  if (renderingTemplate) return;
  renderingTemplate = true;
  const s = get(settings);

  let template = cleanTempalte(s.template);
  template = await fillTemplate(template, "{{;}}");
  template = cleanTempalte(template);
  renderedTempalteText.set(template);

  if (s.autoSend && template) {
    sentClear = false
    chatboxOSC.send(template, s.eggMode);
  } else {
    if (!sentClear) {
      chatboxOSC.send("", false);
      sentClear = true;
    }
  }
  renderingTemplate = false;
}
setInterval(renderTemplate, 2200);
renderTemplate();

settings.subscribe((value) => {
  localData.set("Chatbox;Settings", value);
});