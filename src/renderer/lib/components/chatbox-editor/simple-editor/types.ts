export type TextBlock = { id: string; type: "text"; text: string; format: string };
export type TextTransformBlock = {
  id: string;
  type: "texttransform";
  source: string;
  mode: string;
  format: string;
};
export type TextReplaceBlock = {
  id: string;
  type: "textreplace";
  source: string;
  search: string;
  replace: string;
};
export type TextTruncateBlock = {
  id: string;
  type: "texttruncate";
  source: string;
  length: string;
};
export type TextPadBlock = {
  id: string;
  type: "textpad";
  source: string;
  side: string;
  length: string;
  padChar: string;
};
export type TextDefaultBlock = {
  id: string;
  type: "textdefault";
  source: string;
  fallback: string;
};
export type TimeBlock = {
  id: string;
  type: "time";
  preset: string;
  customFormat: string;
};
export type MediaBlock = {
  id: string;
  type: "media";
  field: string;
  ifPlaying: boolean;
  fallback: string;
};
export type MediaProgressBlock = {
  id: string;
  type: "mediaprog";
  length: string;
  fillChar: string;
  emptyChar: string;
  headChar: string;
};
export type StopwatchBlock = {
  id: string;
  type: "stopwatch";
  name: string;
  format: string;
};
export type HeartRateBlock = {
  id: string;
  type: "heartrate";
  /** Name of a source configured in Modules → Heart Rate. */
  source: string;
  field: string;
  avgSeconds: string;
};
export type OSCBlock = { id: string; type: "osc"; address: string };
export type HotkeyBlock = {
  id: string;
  type: "hotkey";
  name: string;
  state: string;
  timeout: string;
};
export type ProcessBlock = {
  id: string;
  type: "process";
  process: string;
  field: string;
};
export type ShortcutBlock = {
  id: string;
  type: "shortcut";
  name: string;
  params: string[];
};
export type NewlineBlock = { id: string; type: "newline" };
export type ProgBarBlock = {
  id: string;
  type: "progbar";
  currentSrc: string;
  totalSrc: string;
  length: string;
  fillChar: string;
  emptyChar: string;
  headChar: string;
};
export type HealthBarBlock = {
  id: string;
  type: "healthbar";
  currentSrc: string;
  totalSrc: string;
  fillChar: string;
  emptyChar: string;
};
export type StarRatingBlock = {
  id: string;
  type: "starrating";
  valueSrc: string;
  maxStars: string;
  fillChar: string;
  emptyChar: string;
};
export type ToggleBlock = {
  id: string;
  type: "toggle";
  valueSrc: string;
  trueText: string;
  falseText: string;
};
export type NumberFormatBlock = {
  id: string;
  type: "numberformat";
  valueSrc: string;
  decimals: string;
  decimalSeparator: string;
  thousandsSeparator: string;
};
export type MarqueeBlock = {
  id: string;
  type: "marquee";
  text: string;
  direction: string;
  maxLength: string;
};
export type BounceBlock = {
  id: string;
  type: "bounce";
  text: string;
  maxLength: string;
};
export type TypewriterBlock = {
  id: string;
  type: "typewriter";
  text: string;
};
export type BlinkBlock = {
  id: string;
  type: "blink";
  textA: string;
  textB: string;
};
export type EachOneBlock = { id: string; type: "eachone"; items: string[] };
export type OVRTrackerBlock = {
  id: string;
  type: "ovrtracker";
  finder: string;
  field: string;
};
export type WeatherBlock = {
  id: string;
  type: "weather";
  /** Saved location name, a place name, or "lat,lon". Empty uses the default location. */
  location: string;
  field: string;
  dayOffset: string;
  /** Only used by the sunrise / sunset fields. */
  timeFormat: string;
};
export type NumberCalcBlock = {
  id: string;
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
export type RandomBlock = {
  id: string;
  type: "random";
  numberType: string;
  min: string;
  max: string;
};
export type ConditionBlock = {
  id: string;
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
  | ConditionBlock;

export type BlockType = Block["type"];
export type BlockMeta = { label: string; desc: string; color: string };
export type MenuGroup = { label: string; keys: BlockType[] };
export type UpdateBlock = (id: string, patch: Partial<Block>) => void;
