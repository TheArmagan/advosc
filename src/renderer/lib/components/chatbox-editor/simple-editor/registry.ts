import type { Block, BlockMeta, BlockType, MenuGroup } from "./types";

let uid = 0;

function newId() {
  return `b${Date.now()}${uid++}`;
}

export function createBlock(type: BlockType): Block {
  switch (type) {
    case "text":
      return { id: newId(), type: "text", text: "", format: "" };
    case "texttransform":
      return {
        id: newId(),
        type: "texttransform",
        source: "[[MediaInfo:Track]]",
        mode: "Upper",
        format: "Rounded",
      };
    case "textreplace":
      return {
        id: newId(),
        type: "textreplace",
        source: "[[MediaInfo:Track]]",
        search: "-",
        replace: " ",
      };
    case "texttruncate":
      return {
        id: newId(),
        type: "texttruncate",
        source: "[[MediaInfo:Track]]",
        length: "24",
      };
    case "textpad":
      return {
        id: newId(),
        type: "textpad",
        source: "HP",
        side: "Left",
        length: "4",
        padChar: "0",
      };
    case "textdefault":
      return {
        id: newId(),
        type: "textdefault",
        source: "[[MediaInfo:Track]]",
        fallback: "Nothing playing",
      };
    case "time":
      return { id: newId(), type: "time", preset: "HH:mm", customFormat: "" };
    case "media":
      return { id: newId(), type: "media", field: "Track", ifPlaying: true, fallback: "" };
    case "mediaprog":
      return {
        id: newId(),
        type: "mediaprog",
        length: "10",
        fillChar: "█",
        emptyChar: "░",
        headChar: "",
      };
    case "stopwatch":
      return { id: newId(), type: "stopwatch", name: "", format: "Short" };
    case "heartrate":
      return {
        id: newId(),
        type: "heartrate",
        source: "",
        field: "HeartRate",
        avgSeconds: "300",
      };
    case "osc":
      return { id: newId(), type: "osc", address: "/avatar/parameters/" };
    case "hotkey":
      return {
        id: newId(),
        type: "hotkey",
        name: "",
        state: "toggled",
        timeout: "1000",
      };
    case "process":
      return {
        id: newId(),
        type: "process",
        process: "VRChat.exe",
        field: "SessionTime",
      };
    case "shortcut":
      return { id: newId(), type: "shortcut", name: "", params: [] };
    case "newline":
      return { id: newId(), type: "newline" };
    case "progbar":
      return {
        id: newId(),
        type: "progbar",
        currentSrc: "0",
        totalSrc: "100",
        length: "10",
        fillChar: "█",
        emptyChar: "░",
        headChar: "",
      };
    case "healthbar":
      return {
        id: newId(),
        type: "healthbar",
        currentSrc: "3",
        totalSrc: "5",
        fillChar: "♥",
        emptyChar: "♡",
      };
    case "starrating":
      return {
        id: newId(),
        type: "starrating",
        valueSrc: "3",
        maxStars: "5",
        fillChar: "★",
        emptyChar: "☆",
      };
    case "toggle":
      return {
        id: newId(),
        type: "toggle",
        valueSrc: "1",
        trueText: "ON",
        falseText: "OFF",
      };
    case "numberformat":
      return {
        id: newId(),
        type: "numberformat",
        valueSrc: "1234.56",
        decimals: "0",
        decimalSeparator: ".",
        thousandsSeparator: ",",
      };
    case "marquee":
      return { id: newId(), type: "marquee", text: "", direction: "Left", maxLength: "20" };
    case "bounce":
      return { id: newId(), type: "bounce", text: "Bouncing text", maxLength: "12" };
    case "typewriter":
      return { id: newId(), type: "typewriter", text: "" };
    case "blink":
      return { id: newId(), type: "blink", textA: "ON", textB: "OFF" };
    case "eachone":
      return { id: newId(), type: "eachone", items: ["Hello!", "VRChat"] };
    case "ovrtracker":
      return { id: newId(), type: "ovrtracker", finder: "0", field: "BatteryLevel" };
    case "numbercalc":
      return {
        id: newId(),
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
      return {
        id: newId(),
        type: "random",
        numberType: "Int",
        min: "1",
        max: "100",
      };
    case "condition":
      return {
        id: newId(),
        type: "condition",
        source: "mediaplaying",
        hotkeyName: "",
        hotkeyTimeout: "1000",
        oscAddress: "/avatar/parameters/",
        oscOp: "==",
        oscValue: "1",
        valueSource: "[[MediaInfo:Status]]",
        compareAgainst: "Playing",
        trueText: "✅",
        falseText: "❌",
      };
  }
}

export const meta: Record<BlockType, BlockMeta> = {
  text: { label: "Text", desc: "Static or formatted text", color: "bg-slate-500" },
  texttransform: { label: "Text Transform", desc: "Uppercase, trim, format, count, more", color: "bg-zinc-500" },
  textreplace: { label: "Text Replace", desc: "Search and replace inside any source", color: "bg-neutral-500" },
  texttruncate: { label: "Text Truncate", desc: "Shorten text to a max length", color: "bg-stone-400" },
  textpad: { label: "Text Pad", desc: "Pad text left, right, or center", color: "bg-slate-400" },
  textdefault: { label: "Text Fallback", desc: "Use fallback when a source is empty", color: "bg-gray-500" },
  time: { label: "Current Time", desc: "Clock / date", color: "bg-blue-500" },
  media: { label: "Now Playing", desc: "Music / media info", color: "bg-violet-500" },
  mediaprog: { label: "Song Progress", desc: "Progress bar of media", color: "bg-purple-500" },
  stopwatch: { label: "Stopwatch", desc: "Elapsed time from stopwatch", color: "bg-orange-500" },
  heartrate: { label: "Heart Rate", desc: "Pulsoid / HypeRate / Stromno heart rate", color: "bg-rose-500" },
  osc: { label: "Avatar Param", desc: "VRChat OSC parameter value", color: "bg-emerald-500" },
  hotkey: { label: "Hotkey State", desc: "Hotkey toggled / pressed state", color: "bg-yellow-500" },
  process: { label: "Session Time", desc: "Process session duration / state", color: "bg-cyan-500" },
  shortcut: { label: "Shortcut", desc: "User-defined placeholder", color: "bg-indigo-500" },
  newline: { label: "↵ New Line", desc: "Line break", color: "bg-gray-400" },
  progbar: { label: "Progress Bar", desc: "Any source to progress bar", color: "bg-teal-500" },
  healthbar: { label: "Health Bar", desc: "Hearts / health style meter", color: "bg-red-500" },
  starrating: { label: "Star Rating", desc: "★★★☆☆ style rating display", color: "bg-amber-500" },
  toggle: { label: "Toggle Text", desc: "True / false text from any source", color: "bg-green-500" },
  numberformat: { label: "Number Format", desc: "Format numeric output from any source", color: "bg-stone-500" },
  marquee: { label: "Marquee / Scroll", desc: "Scrolling text animation", color: "bg-pink-500" },
  bounce: { label: "Bounce", desc: "Ping-pong scrolling text", color: "bg-rose-400" },
  typewriter: { label: "Typewriter", desc: "Reveal text over time", color: "bg-sky-600" },
  blink: { label: "Blink", desc: "Alternate between two texts", color: "bg-lime-600" },
  eachone: { label: "Cycle Texts", desc: "Rotate through a list of texts", color: "bg-lime-500" },
  ovrtracker: { label: "VR Tracker", desc: "OpenVR tracker battery / info", color: "bg-sky-500" },
  numbercalc: { label: "Number Calc", desc: "Clamp, map, round, abs, more", color: "bg-orange-500" },
  random: { label: "Random Number", desc: "Random int or float range", color: "bg-orange-400" },
  condition: { label: "Condition", desc: "Show A or B based on a rule", color: "bg-fuchsia-500" },
};

export const menuGroups: MenuGroup[] = [
  { label: "Basic", keys: ["text", "texttransform", "textreplace", "texttruncate", "textpad", "textdefault", "time", "newline"] },
  { label: "Media", keys: ["media", "mediaprog", "heartrate"] },
  { label: "Display", keys: ["progbar", "healthbar", "starrating", "toggle", "numberformat"] },
  { label: "Animate", keys: ["marquee", "bounce", "typewriter", "blink", "eachone"] },
  { label: "Logic", keys: ["condition"] },
  { label: "VRChat", keys: ["hotkey", "osc", "ovrtracker"] },
  { label: "Tools", keys: ["stopwatch", "process", "shortcut", "numbercalc", "random"] },
];

export const knownTypes = new Set<BlockType>([
  "text",
  "texttransform",
  "textreplace",
  "texttruncate",
  "textpad",
  "textdefault",
  "time",
  "media",
  "mediaprog",
  "stopwatch",
  "heartrate",
  "osc",
  "hotkey",
  "process",
  "shortcut",
  "newline",
  "progbar",
  "healthbar",
  "starrating",
  "toggle",
  "numberformat",
  "marquee",
  "bounce",
  "typewriter",
  "blink",
  "eachone",
  "ovrtracker",
  "numbercalc",
  "random",
  "condition",
]);

export const SIMPLE_EDITOR_STORAGE_KEY = "SimpleEditor;Blocks";
