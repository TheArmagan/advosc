<p align="center">
  <img src="./build/icon.png" alt="ADVOSC Logo" width="150" height="150">
</p>

<h1 align="center">ADVOSC</h1>

<p align="center">
  <strong>Your ultimate VRChat OSC companion</strong>
</p>

<p align="center">
  <a href="https://discord.gg/spfmB7S78n">
    <img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Platform">
  <a href="https://github.com/TheArmagan/advosc/releases/latest">
    <img src="https://img.shields.io/github/downloads/thearmagan/advosc/total.svg?style=for-the-badge&logo=windows&logoColor=white&label=All+Downloads" alt="Downloads">
  </a>
  <img src="https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge" alt="License">
</p>

<p align="center">
  A modern desktop toolkit for VRChat OSC with a block-based chatbox editor for everyone, a full advanced editor for power users, avatar parameter control, and real-time media integration.
</p>

---

## ✨ Features

### 💬 Simple Chatbox Editor

ADVOSC now includes a block-based chatbox editor designed to make the placeholder system approachable for everyone. You can build rich VRChat chatbox layouts visually, without needing to memorize placeholder syntax first.

<p align="center">
  <img src="./screenshots/chatbox-simple-editor.png" alt="Simple Chatbox Editor" width="700">
</p>

| Why it is easy to use | What it gives you |
|-----------------------|-------------------|
| **Visual block workflow** | Build your message by adding blocks instead of writing raw templates by hand |
| **Live preview** | See the resulting chatbox output immediately while editing |
| **Reorderable layout** | Move blocks up or down to shape the final message structure quickly |
| **Safe by default** | The editor generates the correct placeholder template for you |
| **Same real engine underneath** | It still uses ADVOSC's full placeholder system, so you do not lose power by starting simple |

The simple editor currently includes **30 block types** across the most useful chatbox workflows:

| Category | Blocks |
|----------|--------|
| **Basic** | Text, Text Transform, Text Replace, Text Truncate, Text Pad, Text Fallback, Current Time, New Line |
| **Media** | Now Playing, Song Progress, Heart Rate |
| **Display** | Progress Bar, Health Bar, Star Rating, Toggle Text, Number Format |
| **Animate** | Marquee / Scroll, Bounce, Typewriter, Blink, Cycle Texts |
| **Logic** | Condition |
| **VRChat** | Hotkey State, Avatar Param, VR Tracker |
| **Tools** | Stopwatch, Session Time, Shortcut, Number Calc, Random Number |

### 🧠 Smart Sources, Not Just OSC

Most source-driven blocks can read from more than one kind of value. That means you can build complex chatbox outputs without being locked to raw OSC parameters.

Supported source styles include:

- Plain values like `42`, `true`, or custom text
- VRChat OSC addresses like `/avatar/parameters/Health`
- Inner placeholders like `[[MediaInfo:Duration]]`
- Full placeholders like `{{Shortcut;Time}}`

This makes the simple editor good enough for real everyday templates, not just beginner demos. You can mix media data, tracker info, heart rate, stopwatch values, hotkeys, conditions, reusable shortcuts, text cleanup, and numeric utilities in one visual flow.

It also now covers more cleanup and utility workflows directly in the UI, including text transforms, text replacement, truncation, padding, fallback values, numeric clamping, range mapping, rounding, absolute values, and random ranges.

### ⚡ Examples You Can Build Quickly

- A now-playing line with fallback text when nothing is playing
- A song progress bar with a moving head character
- A VRChat status line driven by hotkeys or avatar parameters
- A heart-rate or tracker battery overlay
- Cleaned-up text blocks using uppercase, replace, pad, truncate, or fallback logic
- Numeric HUD values clamped, mapped, rounded, or randomized without hand-writing placeholders
- Animated text sections like marquee, blink, typewriter, or rotating messages
- Conditional templates such as AFK status, stream status, or context-aware HUD text

Some of the newly exposed simple-editor workflows include:

- Turning any source into uppercase, lowercase, title case, reversed text, trimmed text, capitalized text, text length, or word count
- Replacing text fragments inside a live source before displaying it
- Truncating long media titles or other dynamic values to fit tight chatbox layouts
- Padding values like HP, combo counters, or indices for cleaner HUD-style formatting
- Falling back to safe text when a source is empty
- Clamping or mapping numeric values from one range into another directly inside the editor
- Generating random integers or floats from static values or live sources

### ✍️ Advanced Chatbox Editor

When you want direct control, ADVOSC still includes the full advanced editor. It is ideal for users who prefer writing placeholders manually, composing custom expressions, or fine-tuning complex templates line by line.

<p align="center">
  <img src="./screenshots/chatbox-advanced-editor.png" alt="Advanced Chatbox Editor" width="700">
</p>

---

### 📡 OSC Forwarder

The **OSC Forwarder** lets you evaluate any chatbox template value and send it to an arbitrary OSC address on a configurable interval.

<p align="center">
  <img src="./screenshots/osc-forwarder.png" alt="OSC Forwarder" width="700">
</p>

| Feature | Description |
|---------|-------------|
| **Template-driven values** | The value field supports any chatbox placeholder, e.g. `{{OSCData;/avatar/parameters/X}}` or `{{Time;Now;HH:mm}}` |
| **OSC path picker** | Type a path manually or pick directly from the current avatar's OSC schema |
| **Type casting** | Forward as `Float`, `Int`, `Bool`, or `String` — value is cast after template resolution |
| **Value mapping** | For `Float` / `Int` types, optionally remap the resolved number from one range to another (e.g. `0..1` → `0..255`) |
| **Per-rule interval** | Each forwarder runs on its own configurable interval (minimum 100 ms) |

---

### 🧩 Chatbox Modules

Both chatbox editors are powered by the same **12 chatbox modules** and the same placeholder engine. Start with the simple editor, switch to the advanced editor whenever you want, and keep using the exact same underlying system.

The simple editor covers the most common combinations visually. The module list below shows the full engine that powers both editing styles.

Click to expand each module for details:

<details>
<summary><strong>🎵 Media Info</strong> — Display currently playing media information</summary>

Display real-time information about your currently playing media with synced lyrics support.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{MediaInfo;Status}}` | `Playing` | Current playback status (Playing, Paused, Stopped) |
| `{{MediaInfo;Track}}` | `Never Gonna Give You Up` | Currently playing track title |
| `{{MediaInfo;Artist}}` | `Rick Astley` | Artist name |
| `{{MediaInfo;Album}}` | `Whenever You Need Somebody` | Album name |
| `{{MediaInfo;Position}}` | `120000` | Current position in milliseconds |
| `{{MediaInfo;Duration}}` | `300000` | Total duration in milliseconds |
| `{{MediaInfo;AppName}}` | `Spotify` | Media player application name |
| `{{MediaInfo;Lyric}}` | `Never gonna give you up` | Current synced lyric line |

</details>

<details>
<summary><strong>🕒 Time</strong> — Date, time, and duration utilities</summary>

Comprehensive time and date formatting with timezone support.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Time;NowMillis}}` | `1700000000000` | Current time in milliseconds (Unix epoch) |
| `{{Time;Now;HH:mm}}` | `14:30` | Current time with custom format |
| `{{Time;Now;yyyy-MM-dd}}` | `2023-11-14` | Current date with custom format |
| `{{Time;Timezone}}` | `America/New_York` | System timezone identifier |
| `{{Time;UTCOffset}}` | `+00:00` | Current UTC offset |
| `{{Time;FormatDuration;3600000;Short}}` | `1h 0m 0s` | Format milliseconds as duration |
| `{{Time;ElapsedMillis;...}}` | `5000` | Elapsed time since timestamp |

</details>

<details>
<summary><strong>🔤 Text</strong> — Text manipulation and animations</summary>

Transform, build, format, and animate text with a large set of utilities.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Text;Upper;hello}}` | `HELLO` | Convert to uppercase |
| `{{Text;Lower;HELLO}}` | `hello` | Convert to lowercase |
| `{{Text;Title;hello world}}` | `Hello World` | Convert to title case |
| `{{Text;Trim;  hello  }}` | `hello` | Remove leading and trailing whitespace |
| `{{Text;Replace;cat;dog;cat nap}}` | `dog nap` | Replace all matching text |
| `{{Text;Length;hello}}` | `5` | Get text length |
| `{{Text;Reverse;hello}}` | `olleh` | Reverse text |
| `{{Text;Repeat;3;Hi }}` | `Hi Hi Hi ` | Repeat text N times |
| `{{Text;Slice;0;5;Hello World}}` | `Hello` | Extract substring |
| `{{Text;Format;Rounded;text}}` | `ⓣⓔⓧⓣ` | Apply special formatting |
| `{{Text;Format;Bold;text}}` | `𝐭𝐞𝐱𝐭` | Apply one of the newer visual styles |
| `{{Text;Truncate;10;Long text...}}` | `Long text...` | Truncate with ellipsis |
| `{{Text;Build;ProgressBar;30;100;10;█;░;▓}}` | `██▓░░░░░░░` | Build a progress bar with an optional head character |
| `{{Text;Build;HealthBar;3;5;♥;♡}}` | `♥♥♥♡♡` | Build a hearts / health style meter |
| `{{Text;Build;StarRating;3;5;★;☆}}` | `★★★☆☆` | Build a rating display |
| `{{Text;Build;Toggle;true;ON;OFF}}` | `ON` | Map truthy / falsy values to text |
| `{{Text;NumberFormat;2;.;,;1234.5}}` | `1,234.50` | Format numeric text for display |
| `{{Text;Animate;Marquee;...}}` | `scrolling` | Animated marquee effect |
| `{{Text;Animate;Typewriter;Hello}}` | `H` → `He` → `Hel` | Reveal text over time |
| `{{Text;Animate;Blink;ON;OFF}}` | `ON` → `OFF` | Alternate between two texts |
| `{{Text;Animate;EachOne;A;B;C}}` | `A` → `B` → `C` | Cycle through items |

</details>

<details>
<summary><strong>🔢 Number</strong> — Math operations and random numbers</summary>

Mathematical operations and random number generation.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Number;Random;Int;1;100}}` | `42` | Random integer between min and max |
| `{{Number;Random;Float;0;1}}` | `0.7531` | Random float between min and max |
| `{{Number;Clamp;150;0;100}}` | `100` | Clamp value between min and max |
| `{{Number;Map;5;0;10;0;100}}` | `50` | Map value from one range to another |
| `{{Number;Floor;3.7}}` | `3` | Round down |
| `{{Number;Ceil;3.2}}` | `4` | Round up |
| `{{Number;Round;3.5}}` | `4` | Round to nearest integer |
| `{{Number;Abs;-5}}` | `5` | Absolute value |

</details>

<details>
<summary><strong>🧪 Expression</strong> — Logic and math expressions</summary>

Evaluate conditions and mathematical expressions.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Expr;5 > 3;Yes;No}}` | `Yes` | Conditional evaluation |
| `{{Expr;Math.sqrt(16)}}` | `4` | Math expressions |
| `{{Expr;Math.sin(Math.PI/2)}}` | `1` | Trigonometric functions |
| `{{Expr;[[MediaInfo:Status]]=='Playing';🎵;⏸️}}` | `🎵` | Dynamic conditions |

</details>

<details>
<summary><strong>❤️ Heart Rate</strong> — Pulsoid, HypeRate, Stromno & custom feeds</summary>

Display real-time heart rate data. Add your feeds under **Modules → Heart Rate** — each one gets a name you use in placeholders, so tokens never end up inside your template.

Supported platforms:

| Platform | What you need |
|----------|---------------|
| Pulsoid | Access token |
| HypeRate | API key + session id |
| Stromno | Widget id |
| Custom WebSocket | WebSocket URL + optional JSON path (e.g. `data.heartRate`) |

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{HeartRate;SOURCE;HeartRate}}` | `75` | Current heart rate |
| `{{HeartRate;SOURCE;IsOnline}}` | `true` | Connection status |
| `{{HeartRate;SOURCE;AverageHR;300}}` | `72` | Average HR over N seconds (max 900) |
| `{{HeartRate;SOURCE;MaxHR}}` | `120` | Session maximum heart rate |
| `{{HeartRate;SOURCE;MinHR}}` | `55` | Session minimum heart rate |

> Older templates using `{{Pulsoid;TOKEN;…}}` are migrated automatically: the token becomes a named source and the template is rewritten. `Pulsoid` also still resolves as an alias for `HeartRate`.

</details>

<details>
<summary><strong>📡 OSC Data</strong> — Read avatar OSC parameters</summary>

Access raw OSC parameter values from your avatar.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{OSCData;/avatar/parameters/AFK}}` | `true` | Read any OSC parameter value |
| `{{OSCData;/avatar/parameters/VelocityX}}` | `0.5` | Read float parameters |

</details>

<details>
<summary><strong>🎮 OpenVR Trackers</strong> — VR tracker information</summary>

Monitor your VR trackers' battery and status.

<p align="center">
  <img src="./screenshots/chatbox-modules-ovr.png" alt="OVR Trackers Module" width="500">
</p>

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{OVRTrackers;BatteryLevel;finder}}` | `85` | Battery level (0-100) |
| `{{OVRTrackers;IsCharging;finder}}` | `true` | Charging status |
| `{{OVRTrackers;ModelNumber;finder}}` | `Vive Tracker 3.0` | Tracker model |
| `{{OVRTrackers;SerialNumber;finder}}` | `LHR-12345678` | Serial number |
| `{{OVRTrackers;IsExists;finder}}` | `true` | Check if tracker exists |

*Finder can be device index, serial number, device class, or model number.*

</details>

<details>
<summary><strong>⚙️ Process</strong> — Monitor running processes</summary>

Track process information and session times.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Process;IsRunning;VRChat.exe}}` | `true` | Check if process is running |
| `{{Process;StartedAt;VRChat.exe}}` | `1700000000000` | Process start timestamp |
| `{{Process;SessionTime;VRChat.exe}}` | `3600000` | Time since process started |

</details>

<details>
<summary><strong>⌨️ Hotkey</strong> — Keyboard shortcuts</summary>

Create interactive hotkey-triggered content.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Hotkey;IsPressed;MyHotkey;1000}}` | `true` | Check if pressed within timeout |
| `{{Hotkey;IsToggled;MyHotkey}}` | `false` | Toggle state (press to switch) |

</details>

<details>
<summary><strong>⏱️ Stopwatch</strong> — Hotkey-controlled timers</summary>

Create stopwatches controlled by hotkeys from the Hotkey module. Perfect for afk detection, session tracking, or any timed activities.

| Placeholder | Output | Description |
|-------------|--------|-------------|
| `{{Stopwatch;ElapsedMs;MyTimer}}` | `125000` | Elapsed time in milliseconds |
| `{{Stopwatch;IsRunning;MyTimer}}` | `true` | Whether stopwatch is actively running |
| `{{Stopwatch;IsPaused;MyTimer}}` | `false` | Whether stopwatch is paused |

**Hotkey Actions:**
- **Start/Toggle** — Start or pause the stopwatch
- **Pause** — Pause without resetting
- **Reset** — Reset to zero (keeps running if active)
- **Stop** — Reset and pause completely
- **Reset + Start** — Reset to zero and immediately start (perfect for afk detection!)

</details>

<details>
<summary><strong>📝 Shortcut</strong> — Custom placeholder shortcuts</summary>

Define your own reusable placeholder shortcuts.

Create custom shortcuts that expand to complex placeholder combinations. Perfect for frequently used patterns!

</details>

> 📚 **Want to master placeholders?** Check out our [Placeholder Learning Guide](./LEARN_PLACEHOLDERS.md) for a beginner-friendly, in-depth tutorial on the two-layer placeholder system with real examples!

---

### 🎭 Beyond Chatbox: Avatar OSC Control

Once your chatbox is set up, ADVOSC also gives you direct control over avatar parameters with tools built for real VRChat use.

<p align="center">
  <img src="./screenshots/avatar-osc-parameters.png" alt="Avatar OSC Parameters" width="700">
</p>

| Feature | Description |
|---------|-------------|
| **🔒 Parameter Locking** | Lock toggles to prevent accidental changes |
| **🔗 Link & Redirect** | Route one parameter's value to another |
| **✨ Animate Parameters** | Create breathing effects, color shifts, and more |

<p align="center">
  <img src="./screenshots/avatar-osc-link-parameter.png" alt="Parameter Linking" width="400">
  <img src="./screenshots/avatar-osc-animate-parameter.png" alt="Parameter Animation" width="400">
</p>

---

### 👗 Beyond Chatbox: Avatar Profiles

Save, reuse, and restore complete avatar parameter states in a few clicks.

<p align="center">
  <img src="./screenshots/avatar-profiles.png" alt="Avatar Profiles" width="700">
</p>

| Feature | Description |
|---------|-------------|
| **💾 Save Profiles** | Capture outfits, toggles, props, and moods |
| **⚡ Quick Load** | Restore any profile with a single click |
| **📤 Export & Import** | Share profiles or back them up as JSON |
| **🔍 Search & Filter** | Find profiles by name or filter by avatar |

---

### 📏 Beyond Chatbox: Avatar Scale

Resize your avatar in-game by sending an eye height (`/avatar/eyeheight`) to VRChat, anywhere from `0.01` to `10.0` meters.

| Feature | Description |
|---------|-------------|
| **🎚️ Slider & Direct Input** | Drag for quick changes or type an exact height in meters |
| **⭐ Custom Presets** | Save your own named sizes and apply them with one click |
| **💾 Per-Avatar Memory** | Optionally remember a height per avatar and restore it on avatar change or instance join |
| **🔀 Parameter Forwarding** | Drive your size from inside your avatar — forward `/avatar/parameters/advosc_eyeheight` to `/avatar/eyeheight`, either normalized `0..1` onto a custom range or as a direct meter value |

---

## 🚧 Coming Soon

- **🗣️ Speech to Text & Translation** — Speak and let your words flow into the chatbox, automatically translated

---

## 🛠️ Development

This project uses [Bun](https://bun.sh/), [Electron](https://www.electronjs.org/), [Svelte 5](https://svelte.dev/), and [Rust](https://www.rust-lang.org/).

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Create distributable
bun run package
```

---

## 📄 License

Distributed under the **GPL-3.0 License**.

---

<p align="center">
  Made with ❤️ for the VRChat Community
</p>