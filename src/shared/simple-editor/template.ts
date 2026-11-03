import type { Block, BlockOutput } from "./types";

/** Fields that read from the daily forecast, so they take a day offset. */
export const weatherDailyFields = new Set([
  "High",
  "Low",
  "FeelsLikeHigh",
  "FeelsLikeLow",
  "MaxWindSpeed",
  "DailyCondition",
  "DailyEmoji",
  "DailyCode",
  "PrecipitationChance",
  "PrecipitationSum",
  "UVIndex",
  "Sunrise",
  "Sunset",
  "Date",
]);

/** Which `Weather;Unit;<kind>` goes after a field when "show unit" is on. */
export const weatherUnitKinds: Record<string, "Temperature" | "Wind" | "Precipitation"> = {
  Temperature: "Temperature",
  FeelsLike: "Temperature",
  High: "Temperature",
  Low: "Temperature",
  FeelsLikeHigh: "Temperature",
  FeelsLikeLow: "Temperature",
  WindSpeed: "Wind",
  WindGusts: "Wind",
  MaxWindSpeed: "Wind",
  Precipitation: "Precipitation",
  PrecipitationSum: "Precipitation",
  Rain: "Precipitation",
  Snowfall: "Precipitation",
};

/**
 * How each System field takes its params, so the block only shows the inputs that matter
 * and emits them in the right order.
 */
export type SystemParamKind = "none" | "dec" | "core" | "unit" | "gpu" | "gpuDec" | "gpuUnit" | "uptime";

export const systemFields: { value: string; label: string; kind: SystemParamKind; unitText?: string }[] = [
  { value: "CPUUsage", label: "CPU usage", kind: "dec", unitText: "%" },
  { value: "CPUTemperature", label: "CPU temperature", kind: "dec", unitText: "°C" },
  { value: "CPUFrequency", label: "CPU clock (MHz)", kind: "none", unitText: " MHz" },
  { value: "CPUCoreUsage", label: "One core's usage", kind: "core", unitText: "%" },
  { value: "CPUName", label: "CPU name", kind: "none" },
  { value: "CPUCores", label: "CPU cores", kind: "none" },
  { value: "CPUThreads", label: "CPU threads", kind: "none" },
  { value: "MemoryUsage", label: "RAM usage", kind: "dec", unitText: "%" },
  { value: "MemoryUsed", label: "RAM used", kind: "unit" },
  { value: "MemoryAvailable", label: "RAM available", kind: "unit" },
  { value: "MemoryTotal", label: "RAM total", kind: "unit" },
  { value: "GPUUsage", label: "GPU usage", kind: "gpuDec", unitText: "%" },
  { value: "GPUTemperature", label: "GPU temperature", kind: "gpuDec", unitText: "°C" },
  { value: "GPUPower", label: "GPU power (W)", kind: "gpuDec", unitText: " W" },
  { value: "GPUFanSpeed", label: "GPU fan speed", kind: "gpuDec", unitText: "%" },
  { value: "GPUCoreClock", label: "GPU clock (MHz)", kind: "gpu", unitText: " MHz" },
  { value: "VRAMUsage", label: "VRAM usage", kind: "gpuDec", unitText: "%" },
  { value: "VRAMUsed", label: "VRAM used", kind: "gpuUnit" },
  { value: "VRAMTotal", label: "VRAM total", kind: "gpuUnit" },
  { value: "GPUName", label: "GPU name", kind: "gpu" },
  { value: "GPUVendor", label: "GPU vendor", kind: "gpu" },
  { value: "GPUCount", label: "GPU count", kind: "none" },
  { value: "Download", label: "Download speed", kind: "unit" },
  { value: "Upload", label: "Upload speed", kind: "unit" },
  { value: "TotalDownloaded", label: "Downloaded since boot", kind: "unit" },
  { value: "TotalUploaded", label: "Uploaded since boot", kind: "unit" },
  { value: "SwapUsage", label: "Page file usage", kind: "dec", unitText: "%" },
  { value: "SwapUsed", label: "Page file used", kind: "unit" },
  { value: "Uptime", label: "PC uptime", kind: "uptime" },
];

type Shortcuts = Record<string, string>;

type BuildState = {
  template: string;
  autoShortcuts: Shortcuts;
};

const OUTER = /{{([^}]+)}}/g;

/** For a value inside `{{ }}` params. */
function esc(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;");
}

/** For a value inside `[[ ]]` params, which split on `:`. */
function escInner(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/** Drops trailing empty params, so optional ones fall back to the module's defaults. */
function params(...list: string[]) {
  while (list.length && list[list.length - 1] === "") list.pop();
  return list.join(";");
}

function isInnerPlaceholder(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("[[") && trimmed.endsWith("]]");
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

/** Compiles one block. Each helper registers the auto shortcuts it needs. */
class Ctx {
  constructor(
    readonly id: string,
    readonly shortcuts: Shortcuts,
  ) {}

  /** Turns a template into a shortcut reference, usable anywhere a `[[ ]]` value is. */
  ref(slot: string, template: string) {
    const key = autoShortcutKey(this.id, slot);
    this.shortcuts[key] = template;
    return `[[Shortcut:${key}]]`;
  }

  /**
   * Free text that can hold placeholders, as a param of another placeholder. Outer
   * placeholders can't nest, so each one becomes its own auto shortcut. `[[ ]]` stays,
   * since every module fills its params with the inner pass.
   */
  rich(value: string | undefined, slot: string) {
    if (!value) return "";
    let out = "";
    let cursor = 0;
    let n = 0;
    for (const match of value.matchAll(OUTER)) {
      out += esc(value.slice(cursor, match.index));
      out += this.ref(`${slot}_${n++}`, match[0]);
      cursor = match.index! + match[0].length;
    }
    return out + esc(value.slice(cursor));
  }

  /** A source field: a literal, an OSC address, or a placeholder of either kind. */
  source(source: string | undefined, slot: string) {
    const trimmed = (source ?? "").trim();
    if (!trimmed) return "";
    if (isOscAddress(trimmed)) return `[[OSCData:${escInner(trimmed)}]]`;
    if (isInnerPlaceholder(trimmed)) return trimmed;
    if (isOuterPlaceholder(trimmed)) return this.ref(slot, trimmed);
    return this.rich(trimmed, slot);
  }

  /** Like `source`, for one side of an Expr expression, where text needs quoting. */
  operand(source: string | undefined, slot: string) {
    const trimmed = (source ?? "").trim();
    if (!trimmed) return '""';
    if (isOscAddress(trimmed)) return `[[OSCData:${escInner(trimmed)}]]`;
    if (isInnerPlaceholder(trimmed)) return trimmed;
    if (isOuterPlaceholder(trimmed)) return this.ref(slot, trimmed);
    if (isBooleanLiteral(trimmed) || isNullishLiteral(trimmed) || isNumericLiteral(trimmed)) {
      return trimmed;
    }
    return esc(JSON.stringify(trimmed));
  }
}

/** Format values the duration pickers store, mapped to `FormatDuration` params. */
export function durationParams(format: string | undefined) {
  switch (format) {
    case "ShortSpaced":
      return "Short; ";
    case "Long":
    case "Colon":
    case "Clock":
      return format;
    default:
      return "Short";
  }
}

function progressBar(current: string, total: string, length: string, fill: string, empty: string, head: string) {
  return `{{Text;Build;ProgressBar;${params(current, total, length, esc(fill), esc(empty), esc(head))}}}`;
}

function ifEquals(left: string, right: string, yes: string, no: string) {
  return `{{Text;If;Equals;${left};${right};${yes};${no}}}`;
}

function renderBody(block: Block, c: Ctx): string {
  switch (block.type) {
    case "text": {
      if (!block.text) return "";
      if (block.format) return `{{Text;Format;${block.format};${c.rich(block.text, "text")}}}`;
      // The chatbox only runs the outer pass on the template itself, so a bare `[[ ]]` would
      // show as written. Repeat once is the identity, and it fills its params.
      return block.text.includes("[[") ? `{{Text;Repeat;1;${c.rich(block.text, "text")}}}` : block.text;
    }
    case "texttransform": {
      const source = c.source(block.source, "source");
      if (!source) return "";
      switch (block.mode) {
        case "Format":
          return block.format ? `{{Text;Format;${block.format};${source}}}` : source;
        case "Repeat":
          return `{{Text;Repeat;${esc(block.count || "2")};${source}}}`;
        case "Slice":
          return `{{Text;Slice;${esc(block.start || "0")};${esc(block.end ?? "")};${source}}}`;
        default:
          return `{{Text;${block.mode};${source}}}`;
      }
    }
    case "textreplace": {
      const source = c.source(block.source, "source");
      return source ? `{{Text;Replace;${esc(block.search)};${c.rich(block.replace, "replace")};${source}}}` : "";
    }
    case "texttruncate": {
      const source = c.source(block.source, "source");
      return source ? `{{Text;Truncate;${esc(block.length)};${source}}}` : "";
    }
    case "textpad": {
      const source = c.source(block.source, "source");
      return source ? `{{Text;Pad;${block.side};${esc(block.length)};${esc(block.padChar)};${source}}}` : "";
    }
    case "textdefault": {
      const source = c.source(block.source, "source");
      return source ? `{{Text;Default;${c.rich(block.fallback, "fallback")};${source}}}` : "";
    }
    case "time": {
      if (block.mode === "Timezone") return "{{Time;Timezone}}";
      if (block.mode === "UTCOffset") return "{{Time;UTCOffset}}";
      const fmt = block.preset === "custom" ? block.customFormat : block.preset;
      return fmt ? `{{Time;Now;${params(esc(fmt), esc(block.timezone?.trim() ?? ""))}}}` : "";
    }
    case "media": {
      const isDuration = block.field === "Duration" || block.field === "Position";
      const value = isDuration
        ? c.ref(`Media${block.field}`, `{{Time;FormatDuration;[[MediaInfo:${block.field}]];Clock}}`)
        : `[[MediaInfo:${block.field}]]`;
      if (block.ifPlaying) {
        return ifEquals("[[MediaInfo:Status]]", "Playing", value, c.rich(block.fallback, "fallback"));
      }
      return isDuration
        ? `{{Time;FormatDuration;[[MediaInfo:${block.field}]];Clock}}`
        : `{{MediaInfo;${block.field}}}`;
    }
    case "mediaprog":
      return progressBar(
        "[[MediaInfo:Position]]",
        "[[MediaInfo:Duration]]",
        block.length,
        block.fillChar,
        block.emptyChar,
        block.headChar,
      );
    case "stopwatch": {
      if (!block.name) return "";
      const field = block.field ?? "ElapsedMs";
      if (field !== "ElapsedMs") return `{{Stopwatch;${field};${esc(block.name)}}}`;
      return `{{Time;FormatDuration;[[Stopwatch:ElapsedMs:${escInner(block.name)}]];${durationParams(block.format)}}}`;
    }
    case "heartrate":
      if (!block.source) return "";
      return block.field === "AverageHR"
        ? `{{HeartRate;${esc(block.source)};AverageHR;${esc(block.avgSeconds || "300")}}}`
        : `{{HeartRate;${esc(block.source)};${block.field}}}`;
    case "osc": {
      const address = block.address.trim();
      if (!address || address === "/avatar/parameters/") return "";
      const inner = `[[OSCData:${escInner(address)}]]`;
      switch (block.display) {
        case "Round":
          return `{{Number;Round;${inner}}}`;
        case "Decimals":
          return `{{Text;NumberFormat;${esc(block.decimals || "1")};.;;${inner}}}`;
        case "Percent":
          return `{{Expr;Math.round(${inner}*100)}}`;
        default:
          return `{{OSCData;${esc(address)}}}`;
      }
    }
    case "hotkey":
      if (!block.name) return "";
      return block.state === "pressed"
        ? `{{Hotkey;IsPressed;${esc(block.name)};${esc(block.timeout || "3000")}}}`
        : `{{Hotkey;IsToggled;${esc(block.name)}}}`;
    case "process":
      if (!block.process) return "";
      return block.field === "SessionTime"
        ? `{{Time;FormatDuration;[[Process:SessionTime:${escInner(block.process)}]];Short; }}`
        : `{{Process;${block.field};${esc(block.process)}}}`;
    case "shortcut": {
      if (!block.name) return "";
      const list = block.params.map((param, i) => c.rich(param, `param${i}`)).join(";");
      return `{{Shortcut;${esc(block.name)}${list ? ";" + list : ""}}}`;
    }
    case "newline":
      return "\n";
    case "separator":
      // Lines with separators are joined in `renderLine`, this is the fallback.
      return block.text;
    case "progbar":
      return progressBar(
        c.source(block.currentSrc, "current"),
        c.source(block.totalSrc, "total"),
        block.length,
        block.fillChar,
        block.emptyChar,
        block.headChar,
      );
    case "healthbar":
      return `{{Text;Build;HealthBar;${c.source(block.currentSrc, "current")};${c.source(block.totalSrc, "total")};${esc(block.fillChar)};${esc(block.emptyChar)}}}`;
    case "starrating":
      return `{{Text;Build;StarRating;${c.source(block.valueSrc, "value")};${c.source(block.maxStars, "max")};${esc(block.fillChar)};${esc(block.emptyChar)}}}`;
    case "toggle":
      return `{{Text;Build;Toggle;${c.source(block.valueSrc, "value")};${c.rich(block.trueText, "true")};${c.rich(block.falseText, "false")}}}`;
    case "numberformat":
      return `{{Text;NumberFormat;${esc(block.decimals)};${esc(block.decimalSeparator)};${esc(block.thousandsSeparator)};${c.source(block.valueSrc, "value")}}}`;
    case "marquee": {
      if (!block.text) return "";
      const text = c.rich(block.text, "text") + esc(block.gap ?? "");
      return `{{Text;Animate;MarqueeCustom;${text};${block.direction || "Left"};${esc(block.maxLength)};${esc(block.speed || "1")}}}`;
    }
    case "bounce":
      return !block.text ? "" : `{{Text;Animate;Bounce;${c.rich(block.text, "text")};${esc(block.maxLength)}}}`;
    case "typewriter":
      return !block.text ? "" : `{{Text;Animate;Typewriter;${c.rich(block.text, "text")}}}`;
    case "blink":
      return !block.textA && !block.textB
        ? ""
        : `{{Text;Animate;Blink;${c.rich(block.textA, "a")};${c.rich(block.textB, "b")}}}`;
    case "eachone": {
      const items = block.items
        .map((item, i) => ({ item, steps: block.durations?.[i] }))
        .filter(({ item }) => item);
      if (items.length === 0) return "";
      if (block.timed) {
        const parts = items.map(({ item, steps }, i) => {
          const count = Math.max(1, parseInt(steps ?? "1", 10) || 1);
          return `${count}:${c.rich(item, `item${i}`)}`;
        });
        return `{{Text;Animate;EachOneCustom;${parts.join(";")}}}`;
      }
      return `{{Text;Animate;EachOne;${items.map(({ item }, i) => c.rich(item, `item${i}`)).join(";")}}}`;
    }
    case "ovrtracker":
      return block.finder.trim() ? `{{OVRTrackers;${block.field};${esc(block.finder)}}}` : "";
    case "weather": {
      const location = block.location.trim();
      const day = block.dayOffset || "0";
      if (block.field === "Sunrise" || block.field === "Sunset") {
        // Timestamps only become readable once the Time module formats them.
        return `{{Time;Timestamp;[[Weather:${block.field}:${escInner(location)}:${escInner(day)}]];${esc(block.timeFormat || "HH:mm")}}}`;
      }
      const daily = weatherDailyFields.has(block.field);
      const unitKind = block.showUnit ? weatherUnitKinds[block.field] : undefined;
      if (unitKind) {
        const value = daily
          ? `[[Weather:${block.field}:${escInner(location)}:${escInner(day)}]]`
          : `[[Weather:${block.field}:${escInner(location)}]]`;
        const unit = `${unitKind === "Temperature" ? "" : " "}[[Weather:Unit:${unitKind}]]`;
        return `{{Text;Wrap;;${unit};${value}}}`;
      }
      return daily
        ? `{{Weather;${block.field};${esc(location)};${esc(day)}}}`
        : `{{Weather;${block.field};${esc(location)}}}`;
    }
    case "numbercalc": {
      const source = c.source(block.source, "source");
      if (!source) return "";
      switch (block.mode) {
        case "Clamp":
          return `{{Number;Clamp;${source};${c.source(block.min, "min")};${c.source(block.max, "max")}}}`;
        case "Map":
          return `{{Number;Map;${source};${c.source(block.inMin, "inMin")};${c.source(block.inMax, "inMax")};${c.source(block.outMin, "outMin")};${c.source(block.outMax, "outMax")}}}`;
        default:
          return `{{Number;${block.mode};${source}}}`;
      }
    }
    case "random":
      return `{{Number;Random;${block.numberType};${c.source(block.min, "min")};${c.source(block.max, "max")}}}`;
    case "sound": {
      const action = block.action ?? (block.loop ? "Loop" : "Play");
      const condition = c.source(block.condition, "condition");
      if (action === "StopAll") return `{{Sound;StopAll${condition ? ";" + condition : ""}}}`;
      if (action === "Volume") {
        return `{{Sound;Volume;${esc(block.volume || "50")}${condition ? ";" + condition : ""}}}`;
      }
      if (!block.soundName.trim()) return "";
      return `{{Sound;${action};${esc(block.soundName)}${condition ? ";" + condition : ""}}}`;
    }
    case "condition": {
      const yes = c.rich(block.trueText, "true");
      const no = c.rich(block.falseText, "false");
      const oscOpMap: Record<string, string> = {
        "osc-eq": "==",
        "osc-ne": "!=",
        "osc-gt": ">",
        "osc-lt": "<",
        "osc-gte": ">=",
        "osc-lte": "<=",
      };
      // Text comparisons go through Text;If. Expr stringifies inner values, so a module's
      // "true" turns into a bare true there and never equals the string 'true'.
      switch (block.source) {
        case "mediaplaying":
          return ifEquals("[[MediaInfo:Status]]", "Playing", yes, no);
        case "hotkey-toggled":
          if (!block.hotkeyName) return "";
          return ifEquals(`[[Hotkey:IsToggled:${escInner(block.hotkeyName)}]]`, "true", yes, no);
        case "hotkey-pressed":
          if (!block.hotkeyName) return "";
          return ifEquals(
            `[[Hotkey:IsPressed:${escInner(block.hotkeyName)}:${escInner(block.hotkeyTimeout || "3000")}]]`,
            "true",
            yes,
            no,
          );
        case "text-empty":
          return `{{Text;If;Empty;${c.source(block.valueSource, "check")};${yes};${no}}}`;
        case "text-notempty":
          return `{{Text;If;NotEmpty;${c.source(block.valueSource, "check")};${yes};${no}}}`;
        case "text-equals":
          return ifEquals(c.source(block.valueSource, "left"), c.source(block.compareAgainst, "right"), yes, no);
      }
      let expr = "";
      if (block.source === "source-truthy") {
        expr = c.operand(block.valueSource, "truthy");
      } else if (block.source === "source-compare") {
        expr = `${c.operand(block.valueSource, "left")}${block.oscOp}${c.operand(block.compareAgainst, "right")}`;
      } else if (block.source === "expression") {
        expr = c.rich(block.expression?.trim(), "expr");
      } else if (block.source.startsWith("osc-")) {
        const op = oscOpMap[block.source] ?? "==";
        expr = `${c.operand(block.oscAddress, "oscAddress")}${op}${c.operand(block.oscValue, "oscValue")}`;
      }
      return expr ? `{{Expr;${expr};${yes};${no}}}` : "";
    }
    case "system": {
      const field = systemFields.find((item) => item.value === block.field);
      if (!field) return "";
      const gpu = esc(block.gpu.trim());
      const unit = esc(block.unit.trim());
      const dec = esc(block.decimals.trim());
      let args = "";
      switch (field.kind) {
        case "dec":
          args = params(dec);
          break;
        case "core":
          args = params(gpu || "0", dec);
          break;
        case "unit":
          args = params(unit, dec);
          break;
        case "gpu":
          args = params(gpu);
          break;
        case "gpuDec":
          args = params(gpu, dec);
          break;
        case "gpuUnit":
          args = params(gpu, unit, dec);
          break;
        case "uptime":
          args = params(unit);
          break;
      }
      const value = `System;${field.value}${args ? ";" + args : ""}`;
      if (block.showUnit && field.unitText) {
        return `{{Text;Wrap;;${esc(field.unitText)};[[${value.replace(/;/g, ":")}]]}}`;
      }
      return `{{${value}}}`;
    }
    case "speech":
      if (block.field === "Both") return `{{Speech;Both;${esc(block.separator || " | ")}}}`;
      return `{{Speech;${block.field}}}`;
    case "variable":
      if (!block.name.trim()) return "";
      return `{{Var;${params(esc(block.name.trim()), c.rich(block.defaultValue, "default"))}}}`;
    case "request": {
      if (!block.source.trim()) return "";
      const source = esc(block.source.trim());
      if (block.field === "Value" || block.field === "Has") {
        return block.path.trim() ? `{{Request;${block.field};${source};${esc(block.path.trim())}}}` : "";
      }
      return `{{Request;${block.field};${source}}}`;
    }
    case "countdown": {
      const target = new Date(block.target).getTime();
      if (!block.target || Number.isNaN(target)) return "";
      const left = `[[Time:FromNowMilis:${target}]]`;
      const remaining = c.ref("remaining", `{{Time;FormatDuration;${left};${durationParams(block.format)}}}`);
      return `{{Expr;${left}>0;${remaining};${c.rich(block.doneText, "done")}}}`;
    }
    case "math": {
      const expression = c.rich(block.expression?.trim(), "expr");
      if (!expression) return "";
      const value = `{{Expr;${expression}}}`;
      if (block.decimals.trim() === "") return value;
      return `{{Text;NumberFormat;${esc(block.decimals.trim())};.;;${c.ref("value", value)}}}`;
    }
  }
}

function hasOutput(output: BlockOutput | undefined): output is BlockOutput {
  return !!(output && (output.prefix || output.suffix || output.fallback || output.maxLength || output.style));
}

/** Fallback, max length, style, then prefix/suffix, each wrapping the stage before it. */
function applyOutput(block: Block, body: string, c: Ctx) {
  const output = block.output;
  if (!body || block.type === "newline" || block.type === "separator" || block.type === "sound") return body;
  if (!hasOutput(output)) return body;

  let current = body;
  if (output.fallback) {
    current = `{{Text;Default;${c.rich(output.fallback, "out_fallback")};${c.rich(current, "out_fb")}}}`;
  }
  const maxLength = parseInt(output.maxLength ?? "", 10);
  if (maxLength > 0) current = `{{Text;Truncate;${maxLength};${c.rich(current, "out_ml")}}}`;
  if (output.style) current = `{{Text;Format;${output.style};${c.rich(current, "out_st")}}}`;
  if (output.prefix || output.suffix) {
    current = `{{Text;Wrap;${c.rich(output.prefix, "out_pre")};${c.rich(output.suffix, "out_suf")};${c.rich(current, "out_wrap")}}}`;
  }
  return current;
}

function renderBlock(block: Block, shortcuts: Shortcuts) {
  const c = new Ctx(block.id, shortcuts);
  return applyOutput(block, renderBody(block, c), c);
}

/**
 * A line with separators becomes one `Text;Join`, which drops empty segments and the
 * separator in front of them, so a label never dangles next to nothing.
 */
function renderLine(line: Block[], shortcuts: Shortcuts) {
  const separators = line.filter((block) => block.type === "separator");
  if (separators.length === 0) return line.map((block) => renderBlock(block, shortcuts)).join("");

  const owner = new Ctx(`${separators[0].id}_join`, shortcuts);
  const parts: string[] = [];
  let segment = "";
  let index = 0;
  for (const block of line) {
    if (block.type === "separator") {
      parts.push(owner.rich(segment, `seg${index++}`), esc(block.text));
      segment = "";
    } else {
      segment += renderBlock(block, shortcuts);
    }
  }
  parts.push(owner.rich(segment, `seg${index}`));
  return `{{Text;Join;${parts.join(";")}}}`;
}

export function buildTemplateState(blocks: Block[]): BuildState {
  const autoShortcuts: Shortcuts = {};
  const active = blocks.filter((block) => block && !block.disabled);
  const lines: Block[][] = [[]];
  for (const block of active) {
    if (block.type === "newline") lines.push([]);
    else lines[lines.length - 1].push(block);
  }
  const template = lines.map((line) => renderLine(line, autoShortcuts)).join("\n");
  return { template, autoShortcuts };
}

/** One block on its own, for its live value. A separator previews as its text. */
export function previewBlock(block: Block) {
  if (block.disabled) return "";
  const shortcuts: Shortcuts = {};
  return renderBlock(block, shortcuts);
}
