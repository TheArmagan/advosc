export { systemFields, weatherDailyFields, weatherUnitKinds } from "$shared/simple-editor/template";

export type Option = { value: string; label: string };

export const timePresets = [
  { value: "HH:mm", label: "14:30" },
  { value: "HH:mm:ss", label: "14:30:00" },
  { value: "h:mm a", label: "2:30 PM" },
  { value: "hh:mm:ss a", label: "02:30:00 PM" },
  { value: "EEE HH:mm", label: "Thu 14:30" },
  { value: "EEEE", label: "Thursday" },
  { value: "dd/MM", label: "09/04" },
  { value: "dd/MM/yyyy", label: "09/04/2026" },
  { value: "MM/dd/yyyy", label: "04/09/2026" },
  { value: "yyyy-MM-dd", label: "2026-04-09" },
  { value: "dd/MM/yyyy HH:mm", label: "09/04/2026 14:30" },
  { value: "EEEE, MMMM do", label: "Thursday, April 9th" },
  { value: "custom", label: "Custom format..." },
] as const;

export const timeModes = [
  { value: "Now", label: "Current time" },
  { value: "Timezone", label: "Time zone name" },
  { value: "UTCOffset", label: "UTC offset" },
] as const;

export const mediaFields = [
  { value: "Track", label: "Track name" },
  { value: "Artist", label: "Artist" },
  { value: "Album", label: "Album" },
  { value: "Lyric", label: "Current lyric (synced)" },
  { value: "Status", label: "Status (Playing / Paused)" },
  { value: "AppName", label: "App name (e.g. Spotify)" },
  { value: "Position", label: "Position (3:25)" },
  { value: "Duration", label: "Duration (3:25)" },
] as const;

export const textFormats = [
  { value: "", label: "No style" },
  { value: "Bold", label: "𝐁𝐨𝐥𝐝" },
  { value: "Italic", label: "𝐼𝑡𝑎𝑙𝑖𝑐" },
  { value: "BoldItalic", label: "𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄" },
  { value: "SmallCaps", label: "ꜱᴍᴀʟʟ ᴄᴀᴘꜱ" },
  { value: "SuperScript", label: "ˢᵘᵖᵉʳˢᶜʳⁱᵖᵗ" },
  { value: "Rounded", label: "ⓇⓄⓊⓃⒹⒺⒹ" },
  { value: "Fullwidth", label: "Ｆｕｌｌｗｉｄｔｈ" },
  { value: "Fraktur", label: "𝔉𝔯𝔞𝔨𝔱𝔲𝔯" },
  { value: "DoubleStruck", label: "𝔻𝕠𝕦𝕓𝕝𝕖" },
  { value: "Strikethrough", label: "S̶t̶r̶i̶k̶e̶" },
] as const;

export const textTransformModes = [
  { value: "Upper", label: "UPPERCASE" },
  { value: "Lower", label: "lowercase" },
  { value: "Title", label: "Title Case" },
  { value: "Capitalize", label: "Capitalize first letter" },
  { value: "Trim", label: "Trim spaces" },
  { value: "Reverse", label: "Reverse" },
  { value: "Repeat", label: "Repeat" },
  { value: "Slice", label: "Cut out a part" },
  { value: "Length", label: "Character count" },
  { value: "WordCount", label: "Word count" },
  { value: "Format", label: "Fancy style" },
] as const;

export const textPadSides = [
  { value: "Left", label: "Left" },
  { value: "Right", label: "Right" },
  { value: "Center", label: "Center" },
] as const;

/** Labels show what the format really renders for 1 h 30 min. */
export const durationFormats = [
  { value: "ShortSpaced", label: "1h 30m" },
  { value: "Short", label: "1h30m" },
  { value: "Long", label: "1 hour, 30 minutes" },
  { value: "Clock", label: "1:30:00" },
  { value: "Colon", label: "01:30:00" },
] as const;

export const stopwatchFields = [
  { value: "ElapsedMs", label: "Elapsed time" },
  { value: "IsRunning", label: "Is running (true/false)" },
  { value: "IsPaused", label: "Is paused (true/false)" },
] as const;

export const hrFields = [
  { value: "HeartRate", label: "Heart rate (BPM)" },
  { value: "AverageHR", label: "Average (windowed)" },
  { value: "MaxHR", label: "Session maximum" },
  { value: "MinHR", label: "Session minimum" },
  { value: "IsOnline", label: "Is online (true/false)" },
  { value: "Battery", label: "Device battery % (Bluetooth)" },
  { value: "HasContact", label: "Skin contact (Bluetooth)" },
  { value: "DeviceName", label: "Device name (Bluetooth)" },
  { value: "SensorLocation", label: "Worn on (Bluetooth)" },
] as const;

export const processFields = [
  { value: "SessionTime", label: "Running for (1h 30m)" },
  { value: "IsRunning", label: "Is running (true/false)" },
  { value: "StartedAt", label: "Started at (timestamp ms)" },
] as const;

export const hotkeyStates = [
  { value: "toggled", label: "Toggle (on / off)" },
  { value: "pressed", label: "Recently pressed" },
] as const;

export const oscDisplays = [
  { value: "Raw", label: "As sent" },
  { value: "Round", label: "Rounded" },
  { value: "Decimals", label: "Fixed decimals" },
  { value: "Percent", label: "Percent (0 to 1 as 0 to 100)" },
] as const;

export const ovrTrackerFields = [
  { value: "BatteryLevel", label: "Battery level (0-100)" },
  { value: "IsCharging", label: "Is charging (true/false)" },
  { value: "DeviceClass", label: "Device class" },
  { value: "ModelNumber", label: "Model number" },
  { value: "SerialNumber", label: "Serial number" },
  { value: "DeviceIndex", label: "Device index" },
  { value: "IsExists", label: "Is connected (true/false)" },
] as const;

export const weatherFields = [
  { value: "Temperature", label: "Temperature" },
  { value: "FeelsLike", label: "Feels like" },
  { value: "Emoji", label: "Condition (emoji)" },
  { value: "Condition", label: "Condition (text)" },
  { value: "Humidity", label: "Humidity (%)" },
  { value: "Precipitation", label: "Precipitation (last hour)" },
  { value: "Rain", label: "Rain (last hour)" },
  { value: "Snowfall", label: "Snowfall (last hour)" },
  { value: "WindSpeed", label: "Wind speed" },
  { value: "WindGusts", label: "Wind gusts" },
  { value: "WindCompass", label: "Wind direction (N, NE, ...)" },
  { value: "WindDirection", label: "Wind direction (degrees)" },
  { value: "CloudCover", label: "Cloud cover (%)" },
  { value: "Pressure", label: "Pressure (hPa)" },
  { value: "IsDay", label: "Is daytime (true/false)" },
  { value: "Code", label: "Weather code" },
  { value: "Location", label: "Location name" },
  { value: "UpdatedAt", label: "Last updated" },
  { value: "IsOnline", label: "Is online (true/false)" },
  { value: "High", label: "Daily high" },
  { value: "Low", label: "Daily low" },
  { value: "FeelsLikeHigh", label: "Daily feels like high" },
  { value: "FeelsLikeLow", label: "Daily feels like low" },
  { value: "DailyEmoji", label: "Daily condition (emoji)" },
  { value: "DailyCondition", label: "Daily condition (text)" },
  { value: "DailyCode", label: "Daily weather code" },
  { value: "PrecipitationChance", label: "Chance of precipitation (%)" },
  { value: "PrecipitationSum", label: "Daily precipitation total" },
  { value: "MaxWindSpeed", label: "Daily max wind speed" },
  { value: "UVIndex", label: "Daily max UV index" },
  { value: "Sunrise", label: "Sunrise" },
  { value: "Sunset", label: "Sunset" },
  { value: "Date", label: "Date" },
] as const;

export const conditionSources = [
  { value: "mediaplaying", label: "Media is playing" },
  { value: "hotkey-toggled", label: "Hotkey is toggled on" },
  { value: "hotkey-pressed", label: "Hotkey was just pressed" },
  { value: "text-notempty", label: "A value is not empty" },
  { value: "text-empty", label: "A value is empty" },
  { value: "text-equals", label: "A value equals some text" },
  { value: "source-truthy", label: "A value is truthy" },
  { value: "source-compare", label: "Compare two values" },
  { value: "osc-eq", label: "Avatar param == value" },
  { value: "osc-ne", label: "Avatar param != value" },
  { value: "osc-gt", label: "Avatar param > value" },
  { value: "osc-lt", label: "Avatar param < value" },
  { value: "osc-gte", label: "Avatar param >= value" },
  { value: "osc-lte", label: "Avatar param <= value" },
  { value: "expression", label: "Custom expression" },
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
  { value: "Round", label: "Round" },
  { value: "Floor", label: "Round down" },
  { value: "Ceil", label: "Round up" },
  { value: "Abs", label: "Absolute value" },
] as const;

export const randomNumberTypes = [
  { value: "Int", label: "Whole number" },
  { value: "Float", label: "Decimal" },
] as const;

export const marqueeDirections = [
  { value: "Left", label: "Left" },
  { value: "Right", label: "Right" },
] as const;

export const soundActions = [
  { value: "Play", label: "Play once" },
  { value: "Loop", label: "Loop while true" },
  { value: "Stop", label: "Stop this sound" },
  { value: "StopAll", label: "Stop all sounds" },
  { value: "Volume", label: "Set volume" },
] as const;

export const byteUnits = [
  { value: "", label: "Auto" },
  { value: "MB", label: "MB" },
  { value: "GB", label: "GB" },
  { value: "KB", label: "KB" },
  { value: "B", label: "Bytes" },
] as const;

export const uptimeFormats = [
  { value: "", label: "Auto (22h 41m)" },
  { value: "clock", label: "Clock" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "minutes", label: "Minutes" },
] as const;

export const speechFields = [
  { value: "Text", label: "What you're saying" },
  { value: "Final", label: "Last finished sentence" },
  { value: "Interim", label: "Words still being recognized" },
  { value: "Last", label: "Last thing said (stays)" },
  { value: "Translated", label: "Translation" },
  { value: "TranslatedFinal", label: "Translation of the last sentence" },
  { value: "Both", label: "Original and translation" },
  { value: "IsListening", label: "Is listening (true/false)" },
  { value: "IsSpeaking", label: "Is speaking (true/false)" },
  { value: "IsMuted", label: "Is muted (true/false)" },
  { value: "HasText", label: "Has text (true/false)" },
  { value: "LanguageName", label: "Spoken language" },
  { value: "TargetLanguageName", label: "Translation language" },
  { value: "DetectedLanguage", label: "Detected language" },
  { value: "Confidence", label: "Confidence (0 to 1)" },
  { value: "Error", label: "Error message" },
] as const;

export const requestFields = [
  { value: "Value", label: "A value from the response" },
  { value: "Text", label: "Whole response text" },
  { value: "Has", label: "Response has a value (true/false)" },
  { value: "Status", label: "HTTP status code" },
  { value: "Ok", label: "Request worked (true/false)" },
  { value: "IsOnline", label: "Is online (true/false)" },
  { value: "Age", label: "Seconds since update" },
  { value: "Count", label: "Times fetched" },
  { value: "Error", label: "Error message" },
] as const;

export const separatorPresets = [" | ", " · ", " • ", " / ", " ~ ", "  "] as const;

export const genericSourceHint =
  "A number or text, an /avatar/parameters/... address, or any placeholder. Click the list icon to browse.";
