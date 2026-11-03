import {
  CloudSunIcon,
  CpuIcon,
  HeartPulseIcon,
  MicIcon,
  MoonIcon,
  MusicIcon,
  RepeatIcon,
} from "@lucide/svelte";
import type { Component } from "svelte";
import { createBlock } from "./registry";
import type { Block, BlockType } from "./types";

export type Recipe = {
  id: string;
  label: string;
  desc: string;
  icon: Component<any>;
  /** What it looks like in VRChat, for the card. */
  sample: string;
  build: () => Block[];
};

function make<T extends BlockType>(type: T, patch: Partial<Extract<Block, { type: T }>> = {}): Block {
  return { ...createBlock(type), ...patch } as Block;
}

export const recipes: Recipe[] = [
  {
    id: "now-playing",
    label: "Now playing",
    desc: "Song and artist with a progress bar, hidden when nothing plays",
    icon: MusicIcon,
    sample: "🎵 Song by Artist\n▰▰▰▰▱▱▱▱▱▱ 1:12/3:25",
    build: () => [
      make("media", { field: "Track", ifPlaying: true, output: { prefix: "🎵 ", maxLength: "40" } }),
      make("media", { field: "Artist", ifPlaying: true, output: { prefix: " by ", maxLength: "24" } }),
      make("newline"),
      make("condition", {
        source: "mediaplaying",
        trueText: "{{Text;Build;ProgressBar;[[MediaInfo:Position]];[[MediaInfo:Duration]];10;▰;▱}}",
        falseText: "",
      }),
      make("media", { field: "Position", ifPlaying: true, output: { prefix: " " } }),
      make("media", { field: "Duration", ifPlaying: true, output: { prefix: "/" } }),
    ],
  },
  {
    id: "clock-heart",
    label: "Clock and heart rate",
    desc: "The time, then your BPM when a monitor is connected",
    icon: HeartPulseIcon,
    sample: "🕒 14:30 | ❤ 72 BPM",
    build: () => [
      make("time", { preset: "HH:mm", output: { prefix: "🕒 " } }),
      make("separator", { text: " | " }),
      make("heartrate", { field: "HeartRate", output: { prefix: "❤ ", suffix: " BPM" } }),
    ],
  },
  {
    id: "pc-stats",
    label: "PC stats",
    desc: "CPU, GPU and RAM usage on one line",
    icon: CpuIcon,
    sample: "CPU 14% | GPU 42% | RAM 31%",
    build: () => [
      make("system", { field: "CPUUsage", decimals: "0", output: { prefix: "CPU " } }),
      make("separator", { text: " | " }),
      make("system", { field: "GPUUsage", decimals: "0", output: { prefix: "GPU " } }),
      make("separator", { text: " | " }),
      make("system", { field: "MemoryUsage", decimals: "0", output: { prefix: "RAM " } }),
    ],
  },
  {
    id: "afk",
    label: "AFK status",
    desc: "A hotkey switches between AFK and your normal line",
    icon: MoonIcon,
    sample: "💤 AFK, back soon",
    build: () => [
      make("condition", {
        source: "hotkey-toggled",
        hotkeyName: "afk",
        trueText: "💤 AFK, back soon",
        falseText: "{{Time;Now;HH:mm}}",
      }),
    ],
  },
  {
    id: "weather",
    label: "Weather line",
    desc: "Condition, temperature and today's high and low",
    icon: CloudSunIcon,
    sample: "☀️ 21°C (H 24 L 12)",
    build: () => [
      make("weather", { field: "Emoji", output: { suffix: " " } }),
      make("weather", { field: "Temperature", showUnit: true }),
      make("weather", { field: "High", showUnit: false, output: { prefix: " (H " } }),
      make("weather", { field: "Low", showUnit: false, output: { prefix: " L ", suffix: ")" } }),
    ],
  },
  {
    id: "rotating",
    label: "Rotating messages",
    desc: "A few lines that take turns, under the time",
    icon: RepeatIcon,
    sample: "14:30\nSay hi",
    build: () => [
      make("time", { preset: "HH:mm" }),
      make("newline"),
      make("eachone", { items: ["Say hi", "Hope you're having a good night", "Ask me about my avatar"], durations: ["1", "1", "1"] }),
    ],
  },
  {
    id: "captions",
    label: "Speech captions",
    desc: "What you say, cut to fit, when speech to text is running",
    icon: MicIcon,
    sample: "💬 hey, how's it going",
    build: () => [make("speech", { field: "Text", output: { prefix: "💬 ", maxLength: "120" } })],
  },
];
