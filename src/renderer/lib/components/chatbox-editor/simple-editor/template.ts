import { chatbox } from "$lib/api/chatbox";
import { ChatboxShortcutModule } from "$lib/api/chatbox/modules/chatbox-shortcut-module";
import type { Block, BlockType } from "./types";
import { weatherDailyFields } from "./options";

type BuildState = {
  template: string;
  autoShortcuts: Record<string, string>;
};

function esc(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;");
}

function isInnerPlaceholder(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("[[") && trimmed.endsWith("]]"
  );
}

function isOuterPlaceholder(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("{{") && trimmed.endsWith("}}");
}

function isOscAddress(value: string) {
  return value.trim().startsWith("/");
}

function isBooleanLiteral(value: string) {
  return ["true", "false"].includes(value.trim().toLowerCase());
}

function isNullishLiteral(value: string) {
  return ["null", "undefined"].includes(value.trim().toLowerCase());
}

function isNumericLiteral(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && !Number.isNaN(Number(trimmed));
}

function autoShortcutKey(blockId: string, slot: string) {
  return `__SE_${blockId}_${slot}`.replace(/[^A-Za-z0-9_]/g, "_");
}

function sourceToValueArg(
  source: string,
  blockId: string,
  slot: string,
  autoShortcuts: Record<string, string>,
) {
  const trimmed = source.trim();
  if (!trimmed) return "";
  if (isOscAddress(trimmed)) return `[[OSCData:${trimmed}]]`;
  if (isInnerPlaceholder(trimmed)) return trimmed;
  if (isOuterPlaceholder(trimmed)) {
    const key = autoShortcutKey(blockId, slot);
    autoShortcuts[key] = trimmed;
    return `[[Shortcut:${key}]]`;
  }
  return trimmed;
}

function sourceToExprOperand(
  source: string,
  blockId: string,
  slot: string,
  autoShortcuts: Record<string, string>,
) {
  const trimmed = source.trim();
  if (!trimmed) return '""';
  if (isOscAddress(trimmed)) return `[[OSCData:${trimmed}]]`;
  if (isInnerPlaceholder(trimmed)) return trimmed;
  if (isOuterPlaceholder(trimmed)) {
    const key = autoShortcutKey(blockId, slot);
    autoShortcuts[key] = trimmed;
    return `[[Shortcut:${key}]]`;
  }
  if (isBooleanLiteral(trimmed) || isNullishLiteral(trimmed) || isNumericLiteral(trimmed)) {
    return trimmed;
  }
  return JSON.stringify(trimmed);
}

function renderProgressBar(
  current: string,
  total: string,
  length: string,
  fillChar: string,
  emptyChar: string,
  headChar: string,
) {
  return `{{Text;Build;ProgressBar;${current};${total};${length};${fillChar};${emptyChar}${headChar ? ";" + headChar : ""}}}`;
}

function renderBlock(block: Block, autoShortcuts: Record<string, string>): string {
  switch (block.type) {
    case "text":
      return !block.text
        ? ""
        : block.format
          ? `{{Text;Format;${block.format};${esc(block.text)}}}`
          : block.text;
    case "texttransform": {
      const source = sourceToValueArg(block.source, block.id, "source", autoShortcuts);
      if (!source) return "";
      return block.mode === "Format"
        ? `{{Text;Format;${block.format};${source}}}`
        : `{{Text;${block.mode};${source}}}`;
    }
    case "textreplace": {
      const source = sourceToValueArg(block.source, block.id, "source", autoShortcuts);
      return source
        ? `{{Text;Replace;${esc(block.search)};${esc(block.replace)};${source}}}`
        : "";
    }
    case "texttruncate": {
      const source = sourceToValueArg(block.source, block.id, "source", autoShortcuts);
      return source ? `{{Text;Truncate;${block.length};${source}}}` : "";
    }
    case "textpad": {
      const source = sourceToValueArg(block.source, block.id, "source", autoShortcuts);
      return source
        ? `{{Text;Pad;${block.side};${block.length};${esc(block.padChar)};${source}}}`
        : "";
    }
    case "textdefault": {
      const source = sourceToValueArg(block.source, block.id, "source", autoShortcuts);
      return source ? `{{Text;Default;${esc(block.fallback)};${source}}}` : "";
    }
    case "time": {
      const fmt = block.preset === "custom" ? block.customFormat : block.preset;
      return fmt ? `{{Time;Now;${fmt}}}` : "";
    }
    case "media": {
      const needsDurationFormat = block.field === "Duration" || block.field === "Position";
      const formattedShortcut = autoShortcutKey(block.id, `Media${block.field}`);
      if (needsDurationFormat) {
        autoShortcuts[formattedShortcut] = `{{Time;FormatDuration;[[MediaInfo:${block.field}]];Short}}`;
      }
      if (block.ifPlaying) {
        const inner = needsDurationFormat
          ? `[[Shortcut:${formattedShortcut}]]`
          : `[[MediaInfo:${block.field}]]`;
        return `{{Expr;[[MediaInfo:Status]]=='Playing';${inner};${esc(block.fallback)}}}`;
      }
      return needsDurationFormat
        ? `{{Time;FormatDuration;[[MediaInfo:${block.field}]];Short}}`
        : `{{MediaInfo;${block.field}}}`;
    }
    case "mediaprog":
      return renderProgressBar(
        "[[MediaInfo:Position]]",
        "[[MediaInfo:Duration]]",
        block.length,
        block.fillChar,
        block.emptyChar,
        block.headChar,
      );
    case "stopwatch":
      return !block.name
        ? ""
        : `{{Time;FormatDuration;[[Stopwatch:ElapsedMs:${block.name}]];${block.format}}}`;
    case "heartrate":
      if (!block.source) return "";
      return block.field === "AverageHR"
        ? `{{HeartRate;${block.source};AverageHR;${block.avgSeconds || "300"}}}`
        : `{{HeartRate;${block.source};${block.field}}}`;
    case "osc":
      return !block.address || block.address === "/avatar/parameters/"
        ? ""
        : `{{OSCData;${block.address}}}`;
    case "hotkey":
      if (!block.name) return "";
      return block.state === "pressed"
        ? `{{Hotkey;IsPressed;${block.name};${block.timeout || "1000"}}}`
        : `{{Hotkey;IsToggled;${block.name}}}`;
    case "process":
      if (!block.process) return "";
      return block.field === "SessionTime"
        ? `{{Time;FormatDuration;[[Process:SessionTime:${block.process}]];Short}}`
        : `{{Process;${block.field};${block.process}}}`;
    case "shortcut": {
      if (!block.name) return "";
      const params = block.params.map(esc).join(";");
      return `{{Shortcut;${block.name}${params ? ";" + params : ""}}}`;
    }
    case "newline":
      return "\n";
    case "progbar":
      return renderProgressBar(
        sourceToValueArg(block.currentSrc, block.id, "current", autoShortcuts),
        sourceToValueArg(block.totalSrc, block.id, "total", autoShortcuts),
        block.length,
        block.fillChar,
        block.emptyChar,
        block.headChar,
      );
    case "healthbar":
      return `{{Text;Build;HealthBar;${sourceToValueArg(block.currentSrc, block.id, "current", autoShortcuts)};${sourceToValueArg(block.totalSrc, block.id, "total", autoShortcuts)};${block.fillChar};${block.emptyChar}}}`;
    case "starrating":
      return `{{Text;Build;StarRating;${sourceToValueArg(block.valueSrc, block.id, "value", autoShortcuts)};${sourceToValueArg(block.maxStars, block.id, "max", autoShortcuts)};${block.fillChar};${block.emptyChar}}}`;
    case "toggle":
      return `{{Text;Build;Toggle;${sourceToValueArg(block.valueSrc, block.id, "value", autoShortcuts)};${esc(block.trueText)};${esc(block.falseText)}}}`;
    case "numberformat":
      return `{{Text;NumberFormat;${block.decimals};${esc(block.decimalSeparator)};${esc(block.thousandsSeparator)};${sourceToValueArg(block.valueSrc, block.id, "value", autoShortcuts)}}}`;
    case "marquee":
      return !block.text
        ? ""
        : `{{Text;Animate;Marquee;${esc(block.text)};${block.direction};${block.maxLength}}}`;
    case "bounce":
      return !block.text ? "" : `{{Text;Animate;Bounce;${esc(block.text)};${block.maxLength}}}`;
    case "typewriter":
      return !block.text ? "" : `{{Text;Animate;Typewriter;${esc(block.text)}}}`;
    case "blink":
      return !block.textA && !block.textB
        ? ""
        : `{{Text;Animate;Blink;${esc(block.textA)};${esc(block.textB)}}}`;
    case "eachone": {
      const items = block.items.filter(Boolean);
      return items.length === 0 ? "" : `{{Text;Animate;EachOne;${items.map(esc).join(";")}}}`;
    }
    case "ovrtracker":
      return `{{OVRTrackers;${block.field};${block.finder}}}`;
    case "weather": {
      const location = esc(block.location.trim());
      const day = block.dayOffset || "0";
      if (block.field === "Sunrise" || block.field === "Sunset") {
        // Timestamps only become readable once the Time module formats them.
        return `{{Time;Timestamp;[[Weather:${block.field}:${location}:${day}]];${esc(block.timeFormat || "HH:mm")}}}`;
      }
      return weatherDailyFields.has(block.field)
        ? `{{Weather;${block.field};${location};${day}}}`
        : `{{Weather;${block.field};${location}}}`;
    }
    case "numbercalc": {
      const source = sourceToValueArg(block.source, block.id, "source", autoShortcuts);
      if (!source) return "";
      switch (block.mode) {
        case "Clamp":
          return `{{Number;Clamp;${source};${sourceToValueArg(block.min, block.id, "min", autoShortcuts)};${sourceToValueArg(block.max, block.id, "max", autoShortcuts)}}}`;
        case "Map":
          return `{{Number;Map;${source};${sourceToValueArg(block.inMin, block.id, "inMin", autoShortcuts)};${sourceToValueArg(block.inMax, block.id, "inMax", autoShortcuts)};${sourceToValueArg(block.outMin, block.id, "outMin", autoShortcuts)};${sourceToValueArg(block.outMax, block.id, "outMax", autoShortcuts)}}}`;
        default:
          return `{{Number;${block.mode};${source}}}`;
      }
    }
    case "random":
      return `{{Number;Random;${block.numberType};${sourceToValueArg(block.min, block.id, "min", autoShortcuts)};${sourceToValueArg(block.max, block.id, "max", autoShortcuts)}}}`;
    case "condition": {
      const oscOpMap: Record<string, string> = {
        "osc-eq": "==",
        "osc-ne": "!=",
        "osc-gt": ">",
        "osc-lt": "<",
        "osc-gte": ">=",
        "osc-lte": "<=",
      };
      let expr = "";
      switch (block.source) {
        case "mediaplaying":
          expr = `[[MediaInfo:Status]]=='Playing'`;
          break;
        case "hotkey-toggled":
          if (!block.hotkeyName) return "";
          expr = `[[Hotkey:IsToggled:${block.hotkeyName}]]=='true'`;
          break;
        case "hotkey-pressed":
          if (!block.hotkeyName) return "";
          expr = `[[Hotkey:IsPressed:${block.hotkeyName}:${block.hotkeyTimeout}]]=='true'`;
          break;
        case "source-truthy":
          expr = sourceToExprOperand(block.valueSource, block.id, "truthy", autoShortcuts);
          break;
        case "source-compare":
          expr = `${sourceToExprOperand(block.valueSource, block.id, "left", autoShortcuts)}${block.oscOp}${sourceToExprOperand(block.compareAgainst, block.id, "right", autoShortcuts)}`;
          break;
        default:
          if (block.source.startsWith("osc-")) {
            const op = oscOpMap[block.source] ?? "==";
            expr = `${sourceToExprOperand(block.oscAddress, block.id, "oscAddress", autoShortcuts)}${op}${sourceToExprOperand(block.oscValue, block.id, "oscValue", autoShortcuts)}`;
          }
      }
      return expr
        ? `{{Expr;${expr};${esc(block.trueText)};${esc(block.falseText)}}}`
        : "";
    }
  }
}

export function buildTemplateState(blocks: Block[]): BuildState {
  const autoShortcuts: Record<string, string> = {};
  const template = blocks.map((block) => renderBlock(block, autoShortcuts)).join("");
  return { template, autoShortcuts };
}

export function previewBlock(block: Block) {
  return buildTemplateState([block]).template;
}

export function syncAutoShortcuts(autoShortcuts: Record<string, string>) {
  const module = chatbox.modules.get("Shortcut") as ChatboxShortcutModule | undefined;
  if (!module) return;

  module.values.update((value) => {
    const userShortcuts = Object.fromEntries(
      Object.entries(value.shortcuts ?? {}).filter(([key]) => !key.startsWith("__SE_")),
    );
    return {
      ...value,
      shortcuts: {
        ...userShortcuts,
        ...autoShortcuts,
      },
    };
  });
}

export function getUserShortcutNames() {
  const module = chatbox.modules.get("Shortcut") as ChatboxShortcutModule | undefined;
  return module
    ? Object.keys(module.getValues().shortcuts ?? {}).filter((key) => !key.startsWith("__SE_"))
    : [];
}

export function getShortcutParamCount(name: string) {
  const module = chatbox.modules.get("Shortcut") as ChatboxShortcutModule | undefined;
  return module ? module.getMaxParamCount(name) : 0;
}

export function supportsSourceInput(type: BlockType) {
  return ["texttransform", "textreplace", "texttruncate", "textpad", "textdefault", "progbar", "healthbar", "starrating", "toggle", "numberformat", "numbercalc", "random", "condition"].includes(type);
}
