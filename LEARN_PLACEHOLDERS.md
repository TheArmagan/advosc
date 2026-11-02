# Learning placeholders

If you have opened the advanced editor and immediately closed it again, this is for you. By the end you will be able to read something like `{{Time;FormatDuration;[[MediaInfo:Position]];Short}}` and know exactly what it does.

Take your time, nothing here is hard once you see the pattern.

---

## What a placeholder is

A placeholder is a hole in your text that ADVOSC fills in for you. Instead of writing:

```
The time is 14:30
```

which is wrong one minute later, you write:

```
The time is {{Time;Now;HH:mm}}
```

and ADVOSC swaps `{{Time;Now;HH:mm}}` for the real time every time it sends. Same for your music, your heart rate, your tracker battery, anything a module can give you.

The shape is always the same: module name, then parameters, separated by semicolons.

```
{{Time  ;  Now  ;  HH:mm}}
   ↑        ↑       ↑
 module   what     how
```

---

## The two kinds

There are two, and the difference matters.

**Outer:** `{{Module;Param;Param}}` with curly braces and semicolons. This is the one that shows up in your chatbox.

**Inner:** `[[Module:Param:Param]]` with square brackets and colons. This one does not show up on its own. It goes *inside* an outer placeholder, as one of its parameters.

Same modules, same parameters, different punctuation. That is genuinely the whole difference.

### Why bother with two

Because sometimes you need the answer from one placeholder to feed the next one. Say you want your song position as `2m5s` instead of `125000` milliseconds. The Time module can format a duration, but you have to hand it a number, and only MediaInfo knows that number.

```
{{Time;FormatDuration;[[MediaInfo:Position]];Short}}
```

What happens, in order:

1. `[[MediaInfo:Position]]` runs first and turns into `125000`
2. now the outer one reads `{{Time;FormatDuration;125000;Short}}`
3. that turns into `2m5s`

Inner first, then outer. Like getting your ingredients out before you start cooking.

---

## Shortcuts

The Shortcut module lets you give a name to a chunk of placeholder and use the name instead. Nothing more to it, but it is what makes big templates survivable, because a shortcut can contain other shortcuts:

```
Shortcut A → Shortcut B → Shortcut C → actual data
```

You can stack them far deeper than you'll ever need. ADVOSC only stops at around 60 levels, so a shortcut that calls itself can't take the app down.

---

## A real setup, taken apart

Here is a working configuration. Do not try to read it yet, we go through it piece by piece right after.

```json
{
  "modules": {
    "Shortcut": {
      "shortcuts": {
        "MediaProgressText": "{{Time;FormatDuration;[[MediaInfo:Position]];Colon}}-{{Time;FormatDuration;[[MediaInfo:Duration]];Colon}}",
        "MediaProgressTextFormatted": "{{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}}",
        "MediaWithLyric": "{{Expr;[[MediaInfo:Status]]=='Playing';[[MediaInfo:Track]] ᵇʸ [[MediaInfo:Artist]] [[Shortcut:MediaProgressTextFormatted]]}}\r\n{{Text;Format;SuperScript;[[MediaInfo:Lyric]]}}",
        "Time": "{{Time;Now;hh:mm a}}",
        "AfkForFormatted": "{{Time;FormatDuration;[[Stopwatch:ElapsedMs:AFKStopwatch]];Short}}",
        "VRChatSessionTimeFormatted": "{{Time;FormatDuration;[[Process:SessionTime:VRChat.exe]];Short}}",
        "BatteryInfo": "{{Expr;[[OVRTrackers:IsExists:0]];[[OVRTrackers:BatteryLevel:0]]%🔋;Desktop⚡}}",
        "PlayStatus": "{{Expr;[[Hotkey:IsToggled:AFKToggle]];I'm AFK for [[Shortcut:AfkForFormatted]];[[Shortcut:BatteryInfo]] (I'm on VR for [[Shortcut:VRChatSessionTimeFormatted]])}}"
      }
    },
    "Hotkey": {
      "hotkeys": {
        "AFKToggle": "Home"
      }
    },
    "Stopwatch": {
      "stopwatches": {
        "AFKStopwatch": {
          "startHotkey": "",
          "pauseHotkey": "",
          "resetHotkey": "",
          "stopHotkey": "",
          "resetStartHotkey": "AFKToggle"
        }
      }
    }
  },
  "settings": {
    "template": "{{Shortcut;Time}}\n{{Shortcut;MediaWithLyric}}\n{{Shortcut;PlayStatus}}",
    "autoSend": true,
    "eggMode": true,
    "debugMode": false
  }
}
```

### `Time`, the easy one

```
{{Time;Now;hh:mm a}}
```

Shows `02:30 PM`. No nesting at all. Every complicated template is made of pieces this small.

### `MediaProgressText`, two layers

```
{{Time;FormatDuration;[[MediaInfo:Position]];Colon}}-{{Time;FormatDuration;[[MediaInfo:Duration]];Colon}}
```

Two placeholders with a dash between them. The inners resolve first:

1. `[[MediaInfo:Position]]` gives `65000`
2. `[[MediaInfo:Duration]]` gives `180000`
3. `{{Time;FormatDuration;65000;Colon}}` gives `01:05`
4. `{{Time;FormatDuration;180000;Colon}}` gives `03:00`

Result: `01:05-03:00`

### `MediaProgressTextFormatted`, three layers

```
{{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}}
```

```
MediaProgressTextFormatted
  └── Shortcut:MediaProgressText
        └── MediaInfo:Position and MediaInfo:Duration
```

The shortcut resolves to `01:05-03:00`, then SuperScript shrinks it to `⁰¹'⁰⁵⁻⁰³'⁰⁰`. The colon turns into `'` because there's no tiny colon to use. Tiny text takes less room in the chatbox, which is why people do this.

### `MediaWithLyric`, now with a condition

```
{{Expr;[[MediaInfo:Status]]=='Playing';[[MediaInfo:Track]] ᵇʸ [[MediaInfo:Artist]] [[Shortcut:MediaProgressTextFormatted]]}}
{{Text;Format;SuperScript;[[MediaInfo:Lyric]]}}
```

Expr is an if/else:

```
{{Expr; condition ; if true ; if false}}
```

Here the condition is "is something playing", the true branch is the track and artist and progress, and there is no false branch, so it shows nothing when the music is off. Leaving the last parameter out is a perfectly normal way to say "otherwise nothing".

The chain underneath:

```
MediaWithLyric
  ├── MediaInfo:Status      is it playing
  ├── MediaInfo:Track
  ├── MediaInfo:Artist
  ├── Shortcut:MediaProgressTextFormatted    (already 3 layers deep)
  │     └── Shortcut:MediaProgressText
  │           └── MediaInfo:Position and Duration
  └── MediaInfo:Lyric
```

Output:

```
Never Gonna Give You Up ᵇʸ Rick Astley ⁰¹'⁰⁵⁻⁰³'⁰⁰
ⁿᵉᵛᵉʳ ᵍᵒⁿⁿᵃ ˡᵉᵗ ʸᵒᵘ ᵈᵒʷⁿ
```

### `AfkForFormatted` and `VRChatSessionTimeFormatted`

```
{{Time;FormatDuration;[[Stopwatch:ElapsedMs:AFKStopwatch]];Short}}
{{Time;FormatDuration;[[Process:SessionTime:VRChat.exe]];Short}}
```

Exact same shape as before, different source. One asks a stopwatch how long it has been running (`300000`, formatted to `5m`), the other asks how long VRChat has been open (`3600000`, formatted to `1h`).

Once you notice that "get a number, format it" is one pattern you reuse forever, most templates stop looking scary.

### `BatteryInfo`, VR or desktop

```
{{Expr;[[OVRTrackers:IsExists:0]];[[OVRTrackers:BatteryLevel:0]]%🔋;Desktop⚡}}
```

If tracker 0 exists you are in VR, so show its battery like `85%🔋`. Otherwise show `Desktop⚡`. One line, and your chatbox knows which mode you are in.

### `PlayStatus`, everything at once

```
{{Expr;[[Hotkey:IsToggled:AFKToggle]];I'm AFK for [[Shortcut:AfkForFormatted]];[[Shortcut:BatteryInfo]] (I'm on VR for [[Shortcut:VRChatSessionTimeFormatted]])}}
```

```
PlayStatus
  ├── Hotkey:IsToggled:AFKToggle          did you press Home
  │
  ├── if AFK:
  │     └── "I'm AFK for " + Shortcut:AfkForFormatted
  │                            └── Stopwatch:ElapsedMs:AFKStopwatch
  │
  └── if not AFK:
        ├── Shortcut:BatteryInfo
        │     └── OVRTrackers:IsExists:0 → battery, or "Desktop⚡"
        └── Shortcut:VRChatSessionTimeFormatted
              └── Process:SessionTime:VRChat.exe
```

Which gives you one of:

- `I'm AFK for 5m`
- `85%🔋 (I'm on VR for 1h30m)`
- `Desktop⚡ (I'm on VR for 1h30m)`

---

## The template itself

After all that, the actual template is three lines:

```
{{Shortcut;Time}}
{{Shortcut;MediaWithLyric}}
{{Shortcut;PlayStatus}}
```

```
02:30 PM
Never Gonna Give You Up ᵇʸ Rick Astley ⁰¹'⁰⁵⁻⁰³'⁰⁰
ⁿᵉᵛᵉʳ ᵍᵒⁿⁿᵃ ˡᵉᵗ ʸᵒᵘ ᵈᵒʷⁿ
Desktop⚡ (I'm on VR for 1h30m)
```

That is the point of shortcuts. All the mess lives in named pieces you wrote once, and the template you actually look at stays readable.

---

## How the hotkey and stopwatch tie in

```json
"Hotkey": { "hotkeys": { "AFKToggle": "Home" } }
```

Pressing Home flips `[[Hotkey:IsToggled:AFKToggle]]` between `true` and `false`.

```json
"Stopwatch": {
  "stopwatches": {
    "AFKStopwatch": { "resetStartHotkey": "AFKToggle" }
  }
}
```

The same key press resets the stopwatch to zero and starts it. So one tap of Home says "I am AFK now" and starts counting, and your chatbox handles the rest.

---

## Placeholders that do things

Most placeholders turn into text. The Sound module's are different: they play a sound and turn into nothing.

```
{{Sound;Play;boop;[[OSCData:/avatar/parameters/Booped]]}}
```

The last part is a condition, and it's an inner placeholder like any other. The sound plays once when the condition turns true, and then waits for it to go false before it can play again. So holding a boop doesn't replay the sound every time the chatbox renders.

Any inner placeholder works as the condition. This one plays an airhorn when you tap a hotkey from the Hotkey module. The timeout is longer than the 2.2 second render so the press is never missed:

```
{{Sound;Play;airhorn;[[Hotkey:IsPressed:Horn:2500]]}}
```

Swap `Play` for `Loop` and the sound repeats for as long as the condition is true, then stops when it turns false. Keep in mind the chatbox only renders every 2.2 seconds, so a loop can run up to that long after the condition flips. An automation reacts right away if you need it tighter.

Leave the condition off and it plays once when the placeholder first shows up, which is handy inside a shortcut that only outputs something some of the time.

---

## Placeholders outside the chatbox

Placeholders aren't only for chatbox text. Anywhere the app asks for a value, you can use one: automations, the OSC Forwarder, and most Simple Editor blocks. Those fields suggest placeholders as you type and show a live preview.

An automation watches a value and does something when it matches. Set the value to:

```
{{HeartRate;MyBand;HeartRate}}
```

`MyBand` is whatever you named your source in the Heart Rate module. Set the match to `> 120` and add a sound action, and that's a sound that plays when your heart rate goes over 120.

Automation values and previews are read only, so a placeholder that normally does something, like `{{Sound;Play;boop}}`, won't play anything there. Use an action instead.

One catch: if you compare text with Expr in one of these fields, put quotes around the inner placeholder, like `{{Expr;'[[MediaInfo:Status]]'=='Playing';1;0}}`. In the chatbox you don't need them.

To keep a value for later, use a variable. An automation's **Set a variable** action stores it, and this reads it back anywhere, even after a restart:

```
{{Var;mood;fine}}
```

The last part is what you get if `mood` hasn't been set yet.

---

## Cheat sheet

| Syntax | Called | For |
|--------|--------|-----|
| `{{Module;Param}}` | outer | text that shows up in the chatbox |
| `[[Module:Param]]` | inner | values you pass into another placeholder |
| `{{Shortcut;Name}}` | shortcut call | reusing a chunk you named |
| `{{Expr;cond;yes;no}}` | expression | if/else |
| `{{Var;name;default}}` | variable | a value you saved for later |

---

## That's the whole idea

Two kinds of placeholder, inner runs first, shortcuts let you name things and stack them. Everything else is just picking from the [module list](./docs/MODULES.md) and trying stuff.

When you want parameterized shortcuts (`$0`, `$1`, shortcuts that work like functions), animation that stays in sync, and the patterns people use to build the really fancy chatboxes, the [expert guide](./LEARN_PLACEHOLDERS_EXPERT.md) picks up from here.
