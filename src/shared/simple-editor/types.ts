/**
 * Applied to a block's value in this order: fallback, max length, style, then prefix/suffix.
 * Prefix and suffix only show when the value isn't empty.
 */
export type BlockOutput = {
  prefix?: string;
  suffix?: string;
  fallback?: string;
  maxLength?: string;
  style?: string;
};

/** Every block has these. All optional, so blocks saved by older builds still load. */
export type BlockCommon = {
  id: string;
  disabled?: boolean;
  /** A name the user gave the block, shown in its header. */
  label?: string;
  collapsed?: boolean;
  output?: BlockOutput;
};

export type TextBlock = BlockCommon & { type: "text"; text: string; format: string };
export type TextTransformBlock = BlockCommon & {
  type: "texttransform";
  source: string;
  mode: string;
  format: string;
  count?: string;
  start?: string;
  end?: string;
};
export type TextReplaceBlock = BlockCommon & {
  type: "textreplace";
  source: string;
  search: string;
  replace: string;
};
export type TextTruncateBlock = BlockCommon & {
  type: "texttruncate";
  source: string;
  length: string;
};
export type TextPadBlock = BlockCommon & {
  type: "textpad";
  source: string;
  side: string;
  length: string;
  padChar: string;
};
export type TextDefaultBlock = BlockCommon & {
  type: "textdefault";
  source: string;
  fallback: string;
};
export type TimeBlock = BlockCommon & {
  type: "time";
  preset: string;
  customFormat: string;
  /** Now (default), Timezone or UTCOffset. */
  mode?: string;
  /** IANA zone like Europe/Istanbul. Empty uses the system zone. */
  timezone?: string;
};
export type MediaBlock = BlockCommon & {
  type: "media";
  field: string;
  ifPlaying: boolean;
  fallback: string;
};
export type MediaProgressBlock = BlockCommon & {
  type: "mediaprog";
  length: string;
  fillChar: string;
  emptyChar: string;
  headChar: string;
};
export type StopwatchBlock = BlockCommon & {
  type: "stopwatch";
  name: string;
  format: string;
  /** ElapsedMs (default), IsRunning or IsPaused. */
  field?: string;
};
export type HeartRateBlock = BlockCommon & {
  type: "heartrate";
  /** Name of a source configured in Modules > Heart Rate. */
  source: string;
  field: string;
  avgSeconds: string;
};
export type OSCBlock = BlockCommon & {
  type: "osc";
  address: string;
  /** Raw (default), Round, Decimals or Percent. */
  display?: string;
  decimals?: string;
};
export type SoundBlock = BlockCommon & {
  type: "sound";
  soundName: string;
  condition: string;
  /** Older blocks only have this. `action` wins when both are set. */
  loop?: boolean;
  /** Play, Loop, Stop, StopAll or Volume. */
  action?: string;
  volume?: string;
};
export type HotkeyBlock = BlockCommon & {
  type: "hotkey";
  name: string;
  state: string;
  timeout: string;
};
export type ProcessBlock = BlockCommon & {
  type: "process";
  process: string;
  field: string;
};
export type ShortcutBlock = BlockCommon & {
  type: "shortcut";
  name: string;
  params: string[];
};
export type NewlineBlock = BlockCommon & { type: "newline" };
export type SeparatorBlock = BlockCommon & { type: "separator"; text: string };
export type ProgBarBlock = BlockCommon & {
  type: "progbar";
  currentSrc: string;
  totalSrc: string;
  length: string;
  fillChar: string;
  emptyChar: string;
  headChar: string;
};
export type HealthBarBlock = BlockCommon & {
  type: "healthbar";
  currentSrc: string;
  totalSrc: string;
  fillChar: string;
  emptyChar: string;
};
export type StarRatingBlock = BlockCommon & {
  type: "starrating";
  valueSrc: string;
  maxStars: string;
  fillChar: string;
  emptyChar: string;
};
export type ToggleBlock = BlockCommon & {
  type: "toggle";
  valueSrc: string;
  trueText: string;
  falseText: string;
};
export type NumberFormatBlock = BlockCommon & {
  type: "numberformat";
  valueSrc: string;
  decimals: string;
  decimalSeparator: string;
  thousandsSeparator: string;
};
export type MarqueeBlock = BlockCommon & {
  type: "marquee";
  text: string;
  direction: string;
  maxLength: string;
  /** Characters moved per step. */
  speed?: string;
  /** Added after the text so the loop doesn't run into itself. */
  gap?: string;
};
export type BounceBlock = BlockCommon & {
  type: "bounce";
  text: string;
  maxLength: string;
};
export type TypewriterBlock = BlockCommon & {
  type: "typewriter";
  text: string;
};
export type BlinkBlock = BlockCommon & {
  type: "blink";
  textA: string;
  textB: string;
};
export type EachOneBlock = BlockCommon & {
  type: "eachone";
  items: string[];
  /** Steps (2.2 s each) per item, parallel to `items`. Only used when `timed` is on. */
  durations?: string[];
  timed?: boolean;
};
export type OVRTrackerBlock = BlockCommon & {
  type: "ovrtracker";
  finder: string;
  field: string;
};
export type WeatherBlock = BlockCommon & {
  type: "weather";
  /** Saved location name, a place name, or "lat,lon". Empty uses the default location. */
  location: string;
  field: string;
  dayOffset: string;
  /** Only used by the sunrise / sunset fields. */
  timeFormat: string;
  showUnit?: boolean;
};
export type NumberCalcBlock = BlockCommon & {
  type: "numbercalc";
  source: string;
  mode: string;
  min: string;
  max: string;
  inMin: string;
  inMax: string;
  outMin: string;
  outMax: string;
};
export type RandomBlock = BlockCommon & {
  type: "random";
  numberType: string;
  min: string;
  max: string;
};
export type ConditionBlock = BlockCommon & {
  type: "condition";
  source: string;
  hotkeyName: string;
  hotkeyTimeout: string;
  oscAddress: string;
  oscOp: string;
  oscValue: string;
  valueSource: string;
  compareAgainst: string;
  trueText: string;
  falseText: string;
  expression?: string;
};
export type SystemBlock = BlockCommon & {
  type: "system";
  field: string;
  /** GPU index or part of its name. Empty picks the one with the most VRAM. */
  gpu: string;
  unit: string;
  decimals: string;
  showUnit: boolean;
};
export type SpeechBlock = BlockCommon & {
  type: "speech";
  field: string;
  separator: string;
};
export type VariableBlock = BlockCommon & {
  type: "variable";
  name: string;
  defaultValue: string;
};
export type RequestBlock = BlockCommon & {
  type: "request";
  /** Name of a source configured in Modules > Request. */
  source: string;
  field: string;
  path: string;
};
export type CountdownBlock = BlockCommon & {
  type: "countdown";
  /** `datetime-local` value, in the machine's own time zone. */
  target: string;
  format: string;
  doneText: string;
};
export type MathBlock = BlockCommon & {
  type: "math";
  expression: string;
  /** Empty shows the result as it comes out. */
  decimals: string;
};

export type Block =
  | TextBlock
  | TextTransformBlock
  | TextReplaceBlock
  | TextTruncateBlock
  | TextPadBlock
  | TextDefaultBlock
  | TimeBlock
  | MediaBlock
  | MediaProgressBlock
  | StopwatchBlock
  | HeartRateBlock
  | OSCBlock
  | HotkeyBlock
  | ProcessBlock
  | ShortcutBlock
  | NewlineBlock
  | SeparatorBlock
  | ProgBarBlock
  | HealthBarBlock
  | StarRatingBlock
  | ToggleBlock
  | NumberFormatBlock
  | MarqueeBlock
  | BounceBlock
  | TypewriterBlock
  | BlinkBlock
  | EachOneBlock
  | OVRTrackerBlock
  | WeatherBlock
  | NumberCalcBlock
  | RandomBlock
  | ConditionBlock
  | SoundBlock
  | SystemBlock
  | SpeechBlock
  | VariableBlock
  | RequestBlock
  | CountdownBlock
  | MathBlock;

export type BlockType = Block["type"];
/** Which editor component renders a block's fields. */
export type BlockEditorKind = "core" | "source" | "system" | "data";
export type MenuGroup = { label: string; keys: BlockType[] };
export type UpdateBlock = (id: string, patch: Partial<Block>) => void;
