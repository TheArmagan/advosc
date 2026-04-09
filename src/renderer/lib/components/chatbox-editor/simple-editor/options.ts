export const timePresets = [
  { value: "HH:mm", label: "14:30" },
  { value: "HH:mm:ss", label: "14:30:00" },
  { value: "hh:mm a", label: "02:30 PM" },
  { value: "dd/MM", label: "09/04" },
  { value: "dd/MM/yyyy", label: "09/04/2026" },
  { value: "dd/MM/yyyy HH:mm", label: "09/04/2026 14:30" },
  { value: "EEEE, MMMM do", label: "Thursday, April 9th" },
  { value: "custom", label: "Custom format..." },
] as const;

export const mediaFields = [
  { value: "Track", label: "Track Name" },
  { value: "Artist", label: "Artist" },
  { value: "Album", label: "Album" },
  { value: "Lyric", label: "Current Lyric (synced)" },
  { value: "Status", label: "Status (Playing / Paused)" },
  { value: "AppName", label: "App Name (e.g. Spotify)" },
  { value: "Duration", label: "Duration (formatted)" },
  { value: "Position", label: "Position (formatted)" },
] as const;

export const textFormats = [
  { value: "", label: "No format" },
  { value: "SuperScript", label: "ˢᵘᵖᵉʳˢᶜʳⁱᵖᵗ" },
  { value: "SmallCaps", label: "Sᴍᴀʟʟ Cᴀᴘs" },
  { value: "Bold", label: "𝗕𝗼𝗹𝗱" },
  { value: "Italic", label: "𝘐𝘵𝘢𝘭𝘪𝘤" },
  { value: "BoldItalic", label: "𝙱𝚘𝚕𝚍𝙸𝚝𝚊𝚕𝚒𝚌" },
  { value: "Rounded", label: "ⓡⓞⓤⓝⓓⓔⓓ" },
  { value: "Fullwidth", label: "Ｆｕｌｌｗｉｄｔｈ" },
  { value: "Strikethrough", label: "S̶t̶r̶i̶k̶e̶t̶h̶r̶o̶u̶g̶h̶" },
] as const;

export const textTransformModes = [
  { value: "Upper", label: "UPPERCASE" },
  { value: "Lower", label: "lowercase" },
  { value: "Title", label: "Title Case" },
  { value: "Reverse", label: "Reverse" },
  { value: "Trim", label: "Trim" },
  { value: "Capitalize", label: "Capitalize" },
  { value: "Length", label: "Length" },
  { value: "WordCount", label: "Word Count" },
  { value: "Format", label: "Fancy Format" },
] as const;

export const textPadSides = [
  { value: "Left", label: "Left" },
  { value: "Right", label: "Right" },
  { value: "Center", label: "Center" },
] as const;

export const durationFormats = [
  { value: "Short", label: "1h 30m 0s" },
  { value: "Long", label: "1 hour 30 minutes 0 seconds" },
  { value: "Colon", label: "1:30:00" },
] as const;

export const hrFields = [
  { value: "HeartRate", label: "Heart Rate (BPM)" },
  { value: "IsOnline", label: "Is Online (true/false)" },
  { value: "AverageHR", label: "Average HR (windowed)" },
  { value: "MaxHR", label: "Session Maximum HR" },
  { value: "MinHR", label: "Session Minimum HR" },
] as const;

export const processFields = [
  { value: "SessionTime", label: "Session duration (formatted)" },
  { value: "IsRunning", label: "Is running (true/false)" },
  { value: "StartedAt", label: "Started at (timestamp ms)" },
] as const;

export const hotkeyStates = [
  { value: "toggled", label: "Toggle (on / off)" },
  { value: "pressed", label: "Recently pressed" },
] as const;

export const ovrTrackerFields = [
  { value: "BatteryLevel", label: "Battery Level (0-100)" },
  { value: "IsCharging", label: "Is Charging (true/false)" },
  { value: "DeviceClass", label: "Device Class" },
  { value: "ModelNumber", label: "Model Number" },
  { value: "SerialNumber", label: "Serial Number" },
  { value: "DeviceIndex", label: "Device Index" },
  { value: "IsExists", label: "Is Exists (true/false)" },
] as const;

export const conditionSources = [
  { value: "mediaplaying", label: "Media is Playing" },
  { value: "hotkey-toggled", label: "Hotkey toggled ON" },
  { value: "hotkey-pressed", label: "Hotkey recently pressed" },
  { value: "source-truthy", label: "Any source is truthy" },
  { value: "source-compare", label: "Compare two sources / values" },
  { value: "osc-eq", label: "OSC param == value" },
  { value: "osc-ne", label: "OSC param != value" },
  { value: "osc-gt", label: "OSC param > value" },
  { value: "osc-lt", label: "OSC param < value" },
  { value: "osc-gte", label: "OSC param >= value" },
  { value: "osc-lte", label: "OSC param <= value" },
] as const;

export const compareOperators = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
] as const;

export const numberCalcModes = [
  { value: "Clamp", label: "Clamp to min/max" },
  { value: "Map", label: "Map one range to another" },
  { value: "Floor", label: "Floor" },
  { value: "Ceil", label: "Ceil" },
  { value: "Round", label: "Round" },
  { value: "Abs", label: "Absolute value" },
] as const;

export const randomNumberTypes = [
  { value: "Int", label: "Integer" },
  { value: "Float", label: "Float" },
] as const;

export const marqueeDirections = [
  { value: "Left", label: "← Left (standard)" },
  { value: "Right", label: "→ Right" },
] as const;

export const genericSourceHint =
  "You can use a plain number/text, a /avatar/... OSC address, [[Module:Param]], or {{Module;Param}} as a source.";
