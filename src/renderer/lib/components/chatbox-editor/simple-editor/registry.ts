import {
  AppWindowIcon,
  ArrowLeftRightIcon,
  AudioLinesIcon,
  CalculatorIcon,
  CaseSensitiveIcon,
  ClockIcon,
  CloudSunIcon,
  CornerDownLeftIcon,
  CpuIcon,
  DicesIcon,
  GaugeIcon,
  GitBranchIcon,
  GlobeIcon,
  HashIcon,
  HeartIcon,
  HeartPulseIcon,
  HourglassIcon,
  KeyboardIcon,
  LifeBuoyIcon,
  LinkIcon,
  MicIcon,
  MoveHorizontalIcon,
  MusicIcon,
  RadarIcon,
  RepeatIcon,
  ReplaceIcon,
  ScissorsIcon,
  SeparatorVerticalIcon,
  SigmaIcon,
  SlidersHorizontalIcon,
  SquareFunctionIcon,
  StarIcon,
  SunMediumIcon,
  TextCursorInputIcon,
  TimerIcon,
  ToggleRightIcon,
  TypeIcon,
  VariableIcon,
  Volume2Icon,
} from "@lucide/svelte";
import type { Block, BlockMeta, BlockType, MenuGroup } from "./types";

let uid = 0;

export function newId() {
  return `b${Date.now()}${uid++}`;
}

export function createBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "text":
      return { id, type: "text", text: "", format: "" };
    case "texttransform":
      return { id, type: "texttransform", source: "[[MediaInfo:Track]]", mode: "Upper", format: "Bold", count: "2", start: "0", end: "" };
    case "textreplace":
      return { id, type: "textreplace", source: "[[MediaInfo:Track]]", search: "-", replace: " " };
    case "texttruncate":
      return { id, type: "texttruncate", source: "[[MediaInfo:Track]]", length: "24" };
    case "textpad":
      return { id, type: "textpad", source: "[[OSCData:/avatar/parameters/HP]]", side: "Left", length: "3", padChar: "0" };
    case "textdefault":
      return { id, type: "textdefault", source: "[[MediaInfo:Track]]", fallback: "Nothing playing" };
    case "time":
      return { id, type: "time", preset: "HH:mm", customFormat: "", mode: "Now", timezone: "" };
    case "media":
      return { id, type: "media", field: "Track", ifPlaying: true, fallback: "" };
    case "mediaprog":
      return { id, type: "mediaprog", length: "10", fillChar: "▰", emptyChar: "▱", headChar: "" };
    case "stopwatch":
      return { id, type: "stopwatch", name: "", format: "ShortSpaced", field: "ElapsedMs" };
    case "heartrate":
      return { id, type: "heartrate", source: "", field: "HeartRate", avgSeconds: "300" };
    case "osc":
      return { id, type: "osc", address: "/avatar/parameters/", display: "Raw", decimals: "1" };
    case "hotkey":
      return { id, type: "hotkey", name: "", state: "toggled", timeout: "3000" };
    case "process":
      return { id, type: "process", process: "VRChat.exe", field: "SessionTime" };
    case "shortcut":
      return { id, type: "shortcut", name: "", params: [] };
    case "newline":
      return { id, type: "newline" };
    case "separator":
      return { id, type: "separator", text: " | " };
    case "progbar":
      return { id, type: "progbar", currentSrc: "/avatar/parameters/", totalSrc: "1", length: "10", fillChar: "█", emptyChar: "░", headChar: "" };
    case "healthbar":
      return { id, type: "healthbar", currentSrc: "3", totalSrc: "5", fillChar: "♥", emptyChar: "♡" };
    case "starrating":
      return { id, type: "starrating", valueSrc: "3", maxStars: "5", fillChar: "★", emptyChar: "☆" };
    case "toggle":
      return { id, type: "toggle", valueSrc: "/avatar/parameters/", trueText: "ON", falseText: "OFF" };
    case "numberformat":
      return { id, type: "numberformat", valueSrc: "1234.56", decimals: "0", decimalSeparator: ".", thousandsSeparator: "," };
    case "marquee":
      return { id, type: "marquee", text: "", direction: "Left", maxLength: "20", speed: "1", gap: "   " };
    case "bounce":
      return { id, type: "bounce", text: "Bouncing text", maxLength: "12" };
    case "typewriter":
      return { id, type: "typewriter", text: "" };
    case "blink":
      return { id, type: "blink", textA: "ON", textB: "OFF" };
    case "eachone":
      return { id, type: "eachone", items: ["Hello", "Say hi"], durations: ["1", "1"], timed: false };
    case "ovrtracker":
      return { id, type: "ovrtracker", finder: "0", field: "BatteryLevel" };
    case "weather":
      return { id, type: "weather", location: "", field: "Temperature", dayOffset: "0", timeFormat: "HH:mm", showUnit: true };
    case "numbercalc":
      return {
        id,
        type: "numbercalc",
        source: "/avatar/parameters/Health",
        mode: "Clamp",
        min: "0",
        max: "100",
        inMin: "0",
        inMax: "1",
        outMin: "0",
        outMax: "100",
      };
    case "random":
      return { id, type: "random", numberType: "Int", min: "1", max: "100" };
    case "sound":
      return { id, type: "sound", soundName: "", condition: "", action: "Play", volume: "50" };
    case "condition":
      return {
        id,
        type: "condition",
        source: "mediaplaying",
        hotkeyName: "",
        hotkeyTimeout: "3000",
        oscAddress: "/avatar/parameters/",
        oscOp: "==",
        oscValue: "1",
        valueSource: "[[MediaInfo:Track]]",
        compareAgainst: "",
        trueText: "Listening to music",
        falseText: "",
        expression: "",
      };
    case "system":
      return { id, type: "system", field: "CPUUsage", gpu: "", unit: "", decimals: "0", showUnit: true };
    case "speech":
      return { id, type: "speech", field: "Text", separator: " | " };
    case "variable":
      return { id, type: "variable", name: "", defaultValue: "" };
    case "request":
      return { id, type: "request", source: "", field: "Value", path: "" };
    case "countdown":
      return { id, type: "countdown", target: "", format: "ShortSpaced", doneText: "Now" };
    case "math":
      return { id, type: "math", expression: "[[OSCData:/avatar/parameters/HP]] * 100", decimals: "0" };
  }
}

/** A deep copy with new ids, for duplicate and for recipes. */
export function cloneBlock(block: Block): Block {
  return { ...(JSON.parse(JSON.stringify(block)) as Block), id: newId() };
}

const tone = {
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
};

export const meta: Record<BlockType, BlockMeta> = {
  text: { label: "Text", desc: "Your own text, optionally styled", color: tone.slate, icon: TypeIcon, editor: "core" },
  newline: { label: "New line", desc: "Start a new line", color: tone.slate, icon: CornerDownLeftIcon, editor: "core", keywords: "break enter" },
  separator: { label: "Separator", desc: "A | between blocks, hidden next to empty ones", color: tone.slate, icon: SeparatorVerticalIcon, editor: "core", keywords: "divider pipe dot" },
  time: { label: "Current time", desc: "Clock, date or time zone", color: tone.blue, icon: ClockIcon, editor: "core", keywords: "date clock" },
  countdown: { label: "Countdown", desc: "Time left until a date", color: tone.blue, icon: HourglassIcon, editor: "data", keywords: "timer until event" },
  stopwatch: { label: "Stopwatch", desc: "Elapsed time from a stopwatch", color: tone.blue, icon: TimerIcon, editor: "system" },
  process: { label: "Session time", desc: "How long a program has been running", color: tone.blue, icon: AppWindowIcon, editor: "system", keywords: "vrchat playtime" },
  media: { label: "Now playing", desc: "Track, artist, lyrics and more", color: tone.violet, icon: MusicIcon, editor: "source", keywords: "spotify song music" },
  mediaprog: { label: "Song progress", desc: "Progress bar of the current song", color: tone.violet, icon: AudioLinesIcon, editor: "source", keywords: "music bar" },
  heartrate: { label: "Heart rate", desc: "Bluetooth, Pulsoid, HypeRate or Stromno", color: tone.rose, icon: HeartPulseIcon, editor: "system", keywords: "bpm pulse" },
  speech: { label: "Speech to text", desc: "What you're saying, or its translation", color: tone.rose, icon: MicIcon, editor: "data", keywords: "voice stt caption translate" },
  system: { label: "PC stats", desc: "CPU, GPU, RAM, network, uptime", color: tone.teal, icon: CpuIcon, editor: "data", keywords: "system computer performance temperature" },
  osc: { label: "Avatar param", desc: "Value of a VRChat avatar parameter", color: tone.emerald, icon: SlidersHorizontalIcon, editor: "system", keywords: "osc parameter" },
  hotkey: { label: "Hotkey state", desc: "Whether a hotkey is on or was pressed", color: tone.emerald, icon: KeyboardIcon, editor: "system" },
  ovrtracker: { label: "VR tracker", desc: "Tracker or controller battery and info", color: tone.emerald, icon: RadarIcon, editor: "system", keywords: "steamvr battery openvr" },
  sound: { label: "Play sound", desc: "Play, loop or stop a sound on a condition", color: tone.emerald, icon: Volume2Icon, editor: "system", keywords: "audio sfx" },
  weather: { label: "Weather", desc: "Live weather and forecast", color: tone.sky, icon: CloudSunIcon, editor: "system", keywords: "temperature forecast" },
  request: { label: "Web request", desc: "A value from an API or web page", color: tone.sky, icon: GlobeIcon, editor: "data", keywords: "http api json fetch" },
  variable: { label: "Variable", desc: "A value set by an automation or input", color: tone.indigo, icon: VariableIcon, editor: "data", keywords: "var state" },
  shortcut: { label: "Shortcut", desc: "One of your saved shortcuts", color: tone.indigo, icon: LinkIcon, editor: "system" },
  condition: { label: "Condition", desc: "Show one text or another based on a rule", color: tone.fuchsia, icon: GitBranchIcon, editor: "system", keywords: "if else logic" },
  toggle: { label: "Toggle text", desc: "Text for true and for false", color: tone.fuchsia, icon: ToggleRightIcon, editor: "source", keywords: "on off boolean" },
  progbar: { label: "Progress bar", desc: "Any value as a bar", color: tone.amber, icon: GaugeIcon, editor: "source", keywords: "meter" },
  healthbar: { label: "Health bar", desc: "Hearts or symbols for a value", color: tone.amber, icon: HeartIcon, editor: "source", keywords: "hp hearts" },
  starrating: { label: "Star rating", desc: "★★★☆☆ from a value", color: tone.amber, icon: StarIcon, editor: "source" },
  numberformat: { label: "Number format", desc: "Decimals and thousands separators", color: tone.orange, icon: HashIcon, editor: "source" },
  numbercalc: { label: "Number calc", desc: "Clamp, map or round a value", color: tone.orange, icon: CalculatorIcon, editor: "source", keywords: "math clamp map round" },
  math: { label: "Math", desc: "Calculate anything with an expression", color: tone.orange, icon: SigmaIcon, editor: "data", keywords: "expression formula calculate" },
  random: { label: "Random number", desc: "A random number in a range", color: tone.orange, icon: DicesIcon, editor: "source", keywords: "dice" },
  marquee: { label: "Scrolling text", desc: "Text that scrolls in a window", color: tone.pink, icon: ArrowLeftRightIcon, editor: "core", keywords: "marquee scroll ticker" },
  bounce: { label: "Bounce", desc: "Text that slides back and forth", color: tone.pink, icon: MoveHorizontalIcon, editor: "core" },
  typewriter: { label: "Typewriter", desc: "Reveals text one letter at a time", color: tone.pink, icon: TextCursorInputIcon, editor: "core" },
  blink: { label: "Blink", desc: "Switches between two texts", color: tone.pink, icon: SunMediumIcon, editor: "core" },
  eachone: { label: "Rotating texts", desc: "Cycles through a list", color: tone.pink, icon: RepeatIcon, editor: "core", keywords: "cycle each one rotate messages" },
  texttransform: { label: "Text transform", desc: "Uppercase, style, repeat, count", color: tone.slate, icon: CaseSensitiveIcon, editor: "source", keywords: "upper lower case" },
  textreplace: { label: "Text replace", desc: "Find and replace inside a value", color: tone.slate, icon: ReplaceIcon, editor: "source" },
  texttruncate: { label: "Text truncate", desc: "Cut a value to a max length", color: tone.slate, icon: ScissorsIcon, editor: "source", keywords: "shorten limit" },
  textpad: { label: "Text pad", desc: "Pad a value to a fixed width", color: tone.slate, icon: SquareFunctionIcon, editor: "source", keywords: "width align" },
  textdefault: { label: "Text fallback", desc: "Use other text when a value is empty", color: tone.slate, icon: LifeBuoyIcon, editor: "source", keywords: "default empty" },
};

export const menuGroups: MenuGroup[] = [
  { label: "Basics", keys: ["text", "newline", "separator", "time", "countdown"] },
  { label: "Media and you", keys: ["media", "mediaprog", "heartrate", "speech"] },
  { label: "VRChat", keys: ["osc", "hotkey", "ovrtracker", "sound"] },
  { label: "Data", keys: ["system", "weather", "request", "variable", "process", "stopwatch", "shortcut"] },
  { label: "Display", keys: ["progbar", "healthbar", "starrating", "toggle", "condition"] },
  { label: "Animation", keys: ["marquee", "bounce", "typewriter", "blink", "eachone"] },
  { label: "Numbers", keys: ["math", "numberformat", "numbercalc", "random"] },
  { label: "Text tools", keys: ["texttransform", "textreplace", "texttruncate", "textpad", "textdefault"] },
];

export const knownTypes = new Set<BlockType>(Object.keys(meta) as BlockType[]);

export const SIMPLE_EDITOR_STORAGE_KEY = "SimpleEditor;Blocks";
