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

const settings = writable<{ template: string; autoSend: boolean, eggMode: boolean }>(
  localData.get("Chatbox;Settings", {
    template: `// Example placeholders:\n// Normal placehodler: {{ModuleId;Param}}\n// Inner placeholder: [[ModuleId:Param]]\n// To get auto complete type {{ or [[ and then press CTRL + SPACE.\n{{Time;Format;[[Time:Now]];HH:mm}}\n{{Expr;'[[MediaInfo:Status]]'=='Playing';[[MediaInfo:Track]] ᵇʸ [[MediaInfo:Artist]]}}\n{{Text;Format;SuperScript;[[MediaInfo:Lyric]]}}`,
    autoSend: true,
    eggMode: false,
  })
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

async function fillTemplate(text: string, type: "{{;}}" | "[[:]]" = "{{;}}", ignored: { moduleId: string, param0: string, return?: string }[] = []): Promise<string> {
  const matches = [...text.matchAll(type === "{{;}}" ? PlaceholderRegex1 : PlaceholderRegex2)];
  const results: Record<string, string> = {};
  results["\\n"] = "\n";
  await Promise.all(matches.map(async (match) => {
    if (results[match[0]]) return;
    try {
      const params = splitParams(match[1], type === "{{;}}" ? ";" : ":");
      const moduleId = params.shift()!;
      const ignoredMatch = ignored.find(i => i.moduleId === moduleId && i.param0 === params[0]);
      if (ignoredMatch) {
        results[match[0]] = ignoredMatch.return ?? match[0];
        return;
      }

      if (ignoreSet.has(params[0])) {
        results[match[0]] = `(Ignored: ${match[0]})`;
        return;
      }
      await incrementCallCount(moduleId, ...params);
      if (ignoreSet.has(params[0])) {
        results[match[0]] = `(Ignored: ${match[0]})`;
        return;
      }

      const m = chatboxList.get(moduleId);
      if (m) {
        const content = await m.getPlaceholderValue(...params);
        if (content !== null) {
          results[match[0]] = content;
        } else {
          results[match[0]] = `(Missing: ${match[0]})`;
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

async function fillTemplates(texts: string[], type: "{{;}}" | "[[:]]" = "{{;}}", ignored: { moduleId: string, param0: string, return?: string }[] = []): Promise<string[]> {
  return (await fillTemplate(texts.join("䡁"), type, ignored)).split("䡁");
}

function registerChatboxModule(m: ChatboxModule) {
  chatboxList.set(m.options.id, m);
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
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//gm, "").trim();
}

registerChatboxModule(new ChatboxMediaInfoModule());
registerChatboxModule(new ChatboxOSCDataModule());
registerChatboxModule(new ChatboxExpressionModule());
registerChatboxModule(new ChatboxTextModule());
registerChatboxModule(new ChatboxTimeModule());

let renderedTempalteText = writable<string>("");

export const chatbox = {
  fillTemplate,
  fillTemplates,
  modules: chatboxList,
  settings,
  getPlaceholders,
  cleanTempalte,
  renderedTempalteText,
  splitParams,
};

let sentClear = false;
let renderingTemplate = false;
async function renderTemplate() {
  if (renderingTemplate) return;
  renderingTemplate = true;
  const s = get(settings);

  let template = cleanTempalte(s.template);
  template = await fillTemplate(template, "{{;}}");
  template = template.trim();
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