import { toast } from "svelte-sonner";
import { ChatboxMediaInfoModule } from "./modules/chatbox-media-info-module";
import mapReplace from "stuffs/lib/mapReplace";
import { ChatboxModule } from "./chatbox-module";
import { ChatboxOSCDataModule } from "./modules/chatbox-osc-data-module";
import { localData } from "../local-data";
import { get, writable } from "svelte/store";
import { chatboxOSC } from "../vrc-osc";

const PlaceholderRegex1 = /{{([^}]+)}}/g;
const PlaceholderRegex2 = /\[\[([^\]]+)\]\]/g;

const chatboxList = new Map<string, ChatboxModule>();

let callsMadeMap: Map<string, number> = new Map();
let ignoreSet: Set<string> = new Set();

const settings = writable<{ template: string; autoSend: boolean, eggMode: boolean }>(
  localData.get("Chatbox;Settings", {
    template: "",
    autoSend: false,
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
      const params = match[1].split(type === "{{;}}" ? ";" : ":");
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
      });
    });
    return acc;
  }, [] as { params: string[], value: string, description: string }[]);
}

function cleanComments(text: string) {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//gm, "");
}

registerChatboxModule(new ChatboxMediaInfoModule());
registerChatboxModule(new ChatboxOSCDataModule());

export const chatbox = {
  fillTemplate,
  fillTemplates,
  modules: chatboxList,
  getPlaceholders,
  cleanComments,
};

let sending = false;
setInterval(async () => {
  if (sending) return;
  sending = true;
  const s = get(settings);
  if (s.autoSend) {
    let template = cleanComments(s.template);
    template = await fillTemplate(template, "{{;}}");
    chatboxOSC.send(template, s.eggMode);
  }
  sending = false;
}, 2200);

settings.subscribe((value) => {
  localData.set("Chatbox;Settings", value);
});