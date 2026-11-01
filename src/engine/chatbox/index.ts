import { buildTemplateState } from "$shared/simple-editor/template";
import { ruleUsesToys, type AllValues } from "$shared/chatbox/preset-share";
import { cleanTemplate, splitParams, type ChatboxPlaceholder, type ChatboxSettings } from "$shared/template-syntax";
import { notify } from "../runtime/notify";
import mapReplace from "stuffs/lib/mapReplace";
import type { AppModule } from "$shared/chatbox/module-base";
import { OSCDataModule } from "./modules/chatbox-osc-data-module";
import { MediaInfoModule } from "./modules/chatbox-media-info-module";
import { ExpressionModule } from "./modules/chatbox-expr-module";
import { mirror, synced } from "../sync/hub";
import { get, writable } from "$shared/store";
import { chatboxOSC } from "../vrc-osc";
import { TextModule } from "./modules/chatbox-text-module";
import { TimeModule } from "./modules/chatbox-time-module";
import { ShortcutModule } from "./modules/chatbox-shortcut-module";
import { HeartRateModule } from "./modules/chatbox-heart-rate-module";
import { migratePulsoidTemplates } from "./modules/heart-rate/migrate-pulsoid";
import { NumberModule } from "./modules/chatbox-number-module";
import { ProcessModule } from "./modules/chatbox-process-module";
import { OVRTrackersModule } from "./modules/chatbox-ovr-trackers-module";
import { HotkeyModule } from "./modules/chatbox-hotkey-module";
import { StopwatchModule } from "./modules/chatbox-stopwatch-module";
import { WeatherModule } from "./modules/chatbox-weather-module";
import { SystemModule } from "./modules/chatbox-system-module";
import { RequestModule } from "./modules/chatbox-request-module";
import { SpeechModule } from "./modules/chatbox-speech-module";
import { SoundModule } from "./modules/chatbox-sound-module";
import { LovenseModule } from "../toys/lovense-module";
import { rulesStore } from "../automations/rules-store";
import { VarModule } from "./modules/chatbox-var-module";
import {
  currentFrame,
  isReadOnly,
  newRootFrame,
  reportError,
  reportNoData,
  runInFrame,
  type EvalFailure,
  type EvalFrame,
  type EvalPurpose,
  type EvalRoot,
} from "./eval-context";

const PlaceholderRegex1 = /{{([^}]+)}}/g;
const PlaceholderRegex2 = /\[\[([^\]]+)\]\]/g;

const moduleList = new Map<string, AppModule>();

/**
 * Renamed modules keep answering to their old id so templates written before the rename
 * (or imported from an older export) keep resolving.
 */
const moduleAliases: Record<string, string> = {
  Pulsoid: "HeartRate",
};

/**
 * What one evaluation may spend. A recursive shortcut has no way to end, since branches aren't
 * lazy, so these are what ends it. They count per evaluation rather than per second, so any
 * number of rules can read the same placeholder as often as they like.
 *
 * Each user-visible level of nesting costs about two levels of depth (the shortcut's own
 * template, then the `[[ ]]` pass of whatever it calls), so 64 is far past any real template.
 * The budget is for fan-out: `{{Shortcut;a}}{{Shortcut;a}}` inside `a` doubles per level and
 * would otherwise run for the age of the universe before reaching the depth limit.
 */
const MAX_DEPTH = 64;
const ROOT_BUDGET = 5000;
const RUNAWAY_NOTICE_FLOOR_MS = 5000;

const defaultSettings: ChatboxSettings = {
  template: `// Example placeholders:\n// Normal placehodler: {{ModuleId;Param}}\n// Inner placeholder: [[ModuleId:Param]]\n// To get auto complete type {{ or [[ and then press CTRL + SPACE.\n{{Time;Now;HH:mm}}\n{{Expr;[[MediaInfo:Status]]=='Playing';[[MediaInfo:Track]] ᵇʸ [[MediaInfo:Artist]]}}\n{{Text;Format;SuperScript;[[MediaInfo:Lyric]]}}`,
  autoSend: true,
  eggMode: false,
  debugMode: false,
};

const settings = synced<ChatboxSettings>("Chatbox;Settings", defaultSettings, (stored) => ({
  ...defaultSettings,
  ...stored,
}));

const advancedTemplate = synced<string>("Chatbox;AdvancedTemplate", get(settings).template);

const simpleEditorBlocks = synced<any[]>("SimpleEditor;Blocks", []);

const runawayNotices = new Map<string, number>();

/** Only a render tells the user directly. Rules report it as their status instead. */
function reportRunaway(root: EvalRoot, moduleId: string, params: string[]) {
  root.runaway = true;
  root.failure = { kind: "error", message: "This template calls itself, or it's too large to evaluate." };
  if (root.purpose !== "render") return;

  const key = `${moduleId};${params.join(";")}`;
  const now = Date.now();
  if (now - (runawayNotices.get(key) ?? 0) < RUNAWAY_NOTICE_FLOOR_MS) return;
  if (runawayNotices.size > 100) runawayNotices.clear();
  runawayNotices.set(key, now);

  console.warn("Chatbox", `Stopped runaway calls for module ${moduleId} after ${root.calls} placeholders.`);
  notify.warning("Chatbox", {
    description: `Prevented recursive calls for module ${moduleId}, ${params.join(", ")}. This may indicate a user-made bug in the module.`,
    duration: 1000,
  });
}

/**
 * Identity of the placeholder occurrence currently being resolved. Set synchronously
 * right before `getPlaceholderValue` is called, so a module can capture it as its very
 * first statement (before any `await`). Modules use it to key per-occurrence state
 * (animations, counters) so the same placeholder can appear more than once in a
 * template without the occurrences fighting over one shared state entry.
 */
let activeInstanceKey = "";
function getInstanceKey() {
  return activeInstanceKey;
}

/** Starts a new root unless it's already running inside one. */
function fillTemplate(text: string, type: "{{;}}" | "[[:]]" = "{{;}}", stringify = false, scope = ""): Promise<string> {
  const parent = currentFrame() ?? newRootFrame("render", false);
  const frame: EvalFrame = { root: parent.root, depth: parent.depth + 1 };
  return runInFrame(frame, () => fillInFrame(frame, text, type, stringify, scope));
}

async function fillInFrame(frame: EvalFrame, text: string, type: "{{;}}" | "[[:]]", stringify: boolean, scope: string): Promise<string> {
  const { root, depth } = frame;
  const matches = [...text.matchAll(type === "{{;}}" ? PlaceholderRegex1 : PlaceholderRegex2)];
  const results: (string | null)[] = new Array(matches.length).fill(null);
  const occurrences: Map<string, number> = new Map();
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
  const instanceKeys = matches.map((match) => {
    const occurrence = occurrences.get(match[0]) || 0;
    occurrences.set(match[0], occurrence + 1);
    return `${scope}>${match[0]}#${occurrence}`;
  });
  await Promise.all(matches.map(async (match, i) => {
    try {
      const params = splitParams(match[1], type === "{{;}}" ? ";" : ":");
      const moduleId = params.shift()!;

      if (depth > MAX_DEPTH || root.calls >= ROOT_BUDGET) {
        reportRunaway(root, moduleId, params);
        results[i] = processValue(`(Ignored: ${match[0]})`);
        return;
      }
      root.calls++;

      const m = moduleList.get(moduleAliases[moduleId] ?? moduleId);
      if (m) {
        activeInstanceKey = instanceKeys[i];
        const content = await m.getPlaceholderValue(...params);
        if (content !== null) {
          results[i] = processValue(content);
        } else {
          reportNoData("A placeholder had no value.");
          results[i] = processValue(`(No value for ${match[0]})`);
        }
      } else {
        reportError(`There's no module called ${moduleId}.`);
      }
    } catch (e) {
      // Rules re-evaluate many times a second, so a broken one goes to its status instead.
      if (root.purpose !== "render") {
        reportError("A placeholder in this template failed.");
        return;
      }
      // Not the placeholder itself: a template can hold a URL with a token in it, and this
      // goes to a log file.
      console.error("Chatbox", "Failed to replace a placeholder", e);
      notify.error("Chatbox", {
        description: `Failed to replace placeholder ${match[0]}: ${(e as Error).message}`,
        duration: 2000,
      });
    }
  }));

  // Splice results in by position instead of replacing by placeholder text: two identical
  // placeholders are two independent occurrences and may legitimately resolve differently.
  let output = "";
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    output += mapReplace(text.slice(cursor, match.index!), { "\\n": "\n" });
    output += results[i] ?? match[0];
    cursor = match.index! + match[0].length;
  }
  output += mapReplace(text.slice(cursor), { "\\n": "\n" });
  return output;
}

async function fillTemplates(texts: string[], type: "{{;}}" | "[[:]]" = "{{;}}", stringify = false, scope = ""): Promise<string[]> {
  return (await fillTemplate(texts.join("䡁"), type, stringify, scope)).split("䡁");
}

export interface EvaluationResult {
  value: string;
  /** Set when `value` can't be trusted. That's "no data", which isn't the same as "false". */
  failure: EvalFailure | null;
  /** The budget or depth limit stopped it, so running it again right away won't help. */
  runaway: boolean;
}

/**
 * Evaluates the way rules always have: `[[ ]]` first so its results can feed `{{ }}`. Both
 * passes share one root, so a read-only evaluation stays read-only all the way down.
 */
async function evaluate(
  template: string,
  options: { purpose: Exclude<EvalPurpose, "render">; readOnly: boolean; scope: string },
): Promise<EvaluationResult> {
  const frame = newRootFrame(options.purpose, options.readOnly);
  const value = await runInFrame(frame, async () => {
    const inner = await fillTemplate(template, "[[:]]", false, options.scope);
    return await fillTemplate(inner, "{{;}}", false, options.scope);
  });
  return { value, failure: frame.root.failure, runaway: frame.root.runaway };
}

/** Runs a declared module input. A read-only evaluation can't reach one by any route. */
async function runModuleInput(moduleId: string, inputId: string, args: Record<string, string> = {}): Promise<void> {
  if (isReadOnly()) return;
  const module = moduleList.get(moduleId);
  if (!module) throw new Error(`Unknown module: ${moduleId}`);
  if (!module.options.inputs?.some((input) => input.id === inputId)) {
    throw new Error(`Module ${moduleId} has no input ${inputId}`);
  }
  await module.runInput(inputId, args);
}

function registerModule(m: AppModule) {
  moduleList.set(m.options.id, m);
  m.onValuesChange(() => updatePlaceholders());
}

function getPlaceholders() {
  return [...moduleList.values()].reduce((acc, m) => {
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
  }, [] as ChatboxPlaceholder[]);
}

const renderedTemplate = writable<string>("");
const placeholders = writable<ChatboxPlaceholder[]>([]);

function updatePlaceholders() {
  placeholders.set(getPlaceholders());
}

let heartRateModule: HeartRateModule;

function runPulsoidMigration() {
  migratePulsoidTemplates({
    heartRate: heartRateModule,
    modules: moduleList,
    settings,
    advancedTemplate,
    simpleEditorBlocks,
  });
}

/**
 * Simple-editor blocks compile to `__SE_*` auto-shortcuts, which never travel inside a
 * snapshot (they're derived, and excluded from clean values). Deriving them here means they
 * stay right however the blocks changed, including imports and restored presets, and whether
 * or not the simple editor is open.
 */
function rebuildAutoShortcuts() {
  const module = moduleList.get("Shortcut");
  if (!module) return;

  let autoShortcuts: Record<string, string>;
  try {
    const blocks = get(simpleEditorBlocks);
    autoShortcuts = Array.isArray(blocks) ? buildTemplateState(blocks as any).autoShortcuts : {};
  } catch (error) {
    console.error("Chatbox", "Could not build simple editor shortcuts", error);
    return;
  }

  const values = module.getValues();
  const current: Record<string, string> = values.shortcuts ?? {};
  const userShortcuts = Object.fromEntries(
    Object.entries(current).filter(([key]) => !key.startsWith("__SE_")),
  );
  const next = { ...userShortcuts, ...autoShortcuts };
  if (JSON.stringify(next) === JSON.stringify(current)) return;

  module.values.set({ ...values, shortcuts: next });
}

function getAllValues(): AllValues {
  const moduleValues: Record<string, any> = {};
  moduleList.forEach((module, moduleId) => {
    const values = module.getCleanValues();
    if (Object.keys(values).length > 0) {
      moduleValues[moduleId] = values;
    }
  });
  return {
    modules: moduleValues,
    settings: get(settings),
    editorState: {
      advancedTemplate: get(advancedTemplate),
      simpleBlocks: get(simpleEditorBlocks),
    },
    automations: get(rulesStore),
  };
}

/**
 * `merge` is for presets: rules in the preset win by id, and the user's other rules stay.
 * `replace` is for a settings import. That file can come from anyone, so rules that use toys
 * arrive off, which costs one click on your own backup and keeps a stranger's file harmless.
 */
function importAutomations(values: AllValues, mode: "merge" | "replace") {
  if (!Array.isArray(values.automations)) return;
  const incoming = values.automations.filter((rule) => typeof rule?.id === "string" && rule.id);

  if (mode === "replace") {
    rulesStore.set(incoming.map((rule) => (ruleUsesToys(rule) ? { ...rule, enabled: false } : rule)));
    return;
  }

  rulesStore.update((current) => {
    const byId = new Map(incoming.map((rule) => [rule.id, rule]));
    const known = new Set(current.map((rule) => rule.id));
    return [
      ...current.map((rule) => byId.get(rule.id) ?? rule),
      ...incoming.filter((rule) => !known.has(rule.id)),
    ];
  });
}

function setAllValues(values: AllValues, options: { automations?: "merge" | "replace" } = {}) {
  importAutomations(values, options.automations ?? "merge");

  moduleList.forEach((module, moduleId) => {
    if (values.modules?.[moduleId]) {
      // Merge instead of replace: a bundle only carries the keys `getCleanValues()` exports,
      // so replacing would wipe bookkeeping the module keeps outside of it.
      module.values.update((current) => module.mergeImportedValues(current, values.modules[moduleId]));
    }
  });
  settings.set(values.settings);

  if (values.editorState?.advancedTemplate !== undefined) {
    advancedTemplate.set(values.editorState.advancedTemplate);
  } else {
    advancedTemplate.set(values.settings.template);
  }

  if (values.editorState?.simpleBlocks !== undefined) {
    simpleEditorBlocks.set(values.editorState.simpleBlocks);
  }

  // An imported bundle can still be Pulsoid-era, so re-run the upgrade on the new data.
  heartRateModule.values.update((current) => ({ ...current, migratedFromPulsoid: false }));
  runPulsoidMigration();
}

function getSettings() {
  return get(settings);
}

export const chatbox = {
  fillTemplate,
  fillTemplates,
  evaluate,
  runModuleInput,
  getInstanceKey,
  modules: moduleList,
  settings,
  getPlaceholders,
  cleanTempalte: cleanTemplate,
  renderedTemplate,
  advancedTemplate,
  simpleEditorBlocks,
  splitParams,
  placeholders,
  updatePlaceholders,
  getAllValues,
  setAllValues,
  getSettings,
};

let sentClear = false;
let renderingTemplate = false;
let renderTicks = 0;

/** About every minute, so the log shows the loop is alive without growing by much. */
const TICKS_PER_LOG_LINE = 30;

async function renderTemplate() {
  if (renderingTemplate) return;
  renderingTemplate = true;
  try {
    const s = get(settings);

    let template = cleanTemplate(s.template);
    template = await fillTemplate(template, "{{;}}", false, "Chatbox");
    template = cleanTemplate(template);
    renderedTemplate.set(template);

    if (s.autoSend && template) {
      sentClear = false
      chatboxOSC.send(template, s.eggMode);
    } else {
      if (!sentClear) {
        chatboxOSC.send("", false);
        sentClear = true;
      }
    }

    if (renderTicks++ % TICKS_PER_LOG_LINE === 0) {
      console.log(`Chatbox render tick ${renderTicks}: ${template.length} chars, autoSend ${s.autoSend}`);
    }
  } finally {
    renderingTemplate = false;
  }
}

/**
 * Registers every module, then starts the render loop. Safe mode keeps the modules, so the
 * settings stay reachable, but doesn't render or send anything.
 */
export function startChatbox(options: { safeMode: boolean }) {
  mirror("Chatbox;RenderedTemplate", renderedTemplate, 50);
  mirror("Chatbox;Placeholders", placeholders);

  registerModule(new ShortcutModule());
  registerModule(new OVRTrackersModule());
  registerModule(new HotkeyModule());
  registerModule(new StopwatchModule());
  heartRateModule = new HeartRateModule();
  registerModule(heartRateModule);
  registerModule(new MediaInfoModule());
  registerModule(new TimeModule());
  registerModule(new TextModule());
  registerModule(new ExpressionModule());
  registerModule(new OSCDataModule());
  registerModule(new NumberModule());
  registerModule(new ProcessModule());
  registerModule(new WeatherModule());
  registerModule(new SystemModule());
  registerModule(new RequestModule());
  registerModule(new SpeechModule());
  registerModule(new SoundModule());
  registerModule(new LovenseModule());
  registerModule(new VarModule());

  runPulsoidMigration();
  updatePlaceholders();

  simpleEditorBlocks.subscribe(() => rebuildAutoShortcuts());
  moduleList.get("Shortcut")!.onValuesChange(() => rebuildAutoShortcuts());

  if (options.safeMode) return;

  setInterval(renderTemplate, 2200);
  void renderTemplate();
}
