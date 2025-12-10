# 🎯 ADVOSC Placeholder System - A Baby's Guide

Welcome! This guide will teach you how placeholders work in ADVOSC like you're 5 years old. Let's learn together! 🍼

---

## 📦 What is a Placeholder?

Think of a placeholder like a **magic box** 📦 that gets replaced with real information when you need it.

Instead of writing:
```
The time is 14:30
```

You write:
```
The time is {{Time;Now;HH:mm}}
```

And the magic box `{{Time;Now;HH:mm}}` **transforms** into `14:30` automatically! ✨

---

## 🎨 The Two Types of Magic Boxes

ADVOSC has **TWO** types of placeholder boxes:

### 1. 🟡 Display Placeholders: `{{Module;Param;Param}}`
- Uses **curly braces** `{{ }}`
- Params separated by **semicolons** `;`
- This is the **OUTER** layer - what you see in your final text

### 2. 🔵 Inner Placeholders: `[[Module:Param:Param]]`
- Uses **square brackets** `[[ ]]`
- Params separated by **colons** `:`
- This is the **INNER** layer - used INSIDE other placeholders

---

## 🪆 The Nesting Concept (Like Russian Dolls!)

Imagine Russian nesting dolls 🪆 - a smaller doll fits inside a bigger doll.

**Inner placeholders** `[[...]]` go INSIDE **outer placeholders** `{{...}}`

```
{{OuterModule;SomeParam;[[InnerModule:SomeValue]]}}
        ↑                        ↑
   OUTER BOX              INNER BOX (inside outer!)
```

### Why Two Layers?

Because sometimes you need the **result** of one placeholder as a **parameter** for another!

**Example:**
```
{{Time;FormatDuration;[[MediaInfo:Position]];Short}}
```

**What happens step-by-step:**
1. First, `[[MediaInfo:Position]]` gets the song position (e.g., `125000` milliseconds)
2. Then, `{{Time;FormatDuration;125000;Short}}` formats it to `2m 5s`

It's like a **recipe** - you need ingredients (inner) before cooking (outer)! 🍳

---

## 🚀 The Shortcut Module - Unlimited Nesting Power!

The **Shortcut module** lets you create **named shortcuts** that can contain OTHER placeholders!

This is where it gets REALLY powerful - you can nest as deep as you want!

```
Shortcut A → contains → Shortcut B → contains → Shortcut C → contains → actual values
```

---

## 🎓 Real Example Breakdown

Let's analyze this real configuration step by step:

### The Settings We're Learning:

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

---

## 🔍 Breaking Down Each Shortcut

### 1️⃣ `Time` - The Simple One
```
{{Time;Now;hh:mm a}}
```
**What it does:** Shows current time like `02:30 PM`

**No nesting here!** Just a simple placeholder. 🕐

---

### 2️⃣ `MediaProgressText` - Two-Layer Nesting
```
{{Time;FormatDuration;[[MediaInfo:Position]];Colon}}-{{Time;FormatDuration;[[MediaInfo:Duration]];Colon}}
```

**Visual breakdown:**
```
┌─────────────────────────────────────────────────────┐
│  {{Time;FormatDuration;[[MediaInfo:Position]];Colon}}  │
│         ↑                    ↑              ↑       │
│     Module            Inner Value      Format Style │
└─────────────────────────────────────────────────────┘
```

**Step-by-step:**
1. `[[MediaInfo:Position]]` → Gets current song position (e.g., `65000` ms)
2. `[[MediaInfo:Duration]]` → Gets total song length (e.g., `180000` ms)
3. `{{Time;FormatDuration;65000;Colon}}` → Formats to `1:05`
4. `{{Time;FormatDuration;180000;Colon}}` → Formats to `3:00`

**Final result:** `1:05-3:00` 🎵

---

### 3️⃣ `MediaProgressTextFormatted` - Three-Layer Nesting! 🪆🪆🪆
```
{{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}}
```

**The nesting chain:**
```
MediaProgressTextFormatted
    └── calls → Shortcut:MediaProgressText
                    └── calls → MediaInfo:Position & MediaInfo:Duration
                                    └── gets actual song data!
```

**Step-by-step:**
1. `[[Shortcut:MediaProgressText]]` → Evaluates to `1:05-3:00`
2. `{{Text;Format;SuperScript;1:05-3:00}}` → Makes it tiny: `¹:⁰⁵⁻³:⁰⁰`

**Final result:** `¹:⁰⁵⁻³:⁰⁰` (superscript text!)

---

### 4️⃣ `MediaWithLyric` - Conditional + Multi-Layer
```
{{Expr;[[MediaInfo:Status]]=='Playing';[[MediaInfo:Track]] ᵇʸ [[MediaInfo:Artist]] [[Shortcut:MediaProgressTextFormatted]]}}
{{Text;Format;SuperScript;[[MediaInfo:Lyric]]}}
```

**The `Expr` module is like an IF statement:**
```
{{Expr; CONDITION ; RESULT_IF_TRUE ; RESULT_IF_FALSE}}
```

**Breaking it down:**
- **Condition:** `[[MediaInfo:Status]]=='Playing'` → Is music playing?
- **If TRUE:** Show track info with progress
- **If FALSE:** Show nothing (no third parameter = empty)

**The nesting here:**
```
MediaWithLyric
    ├── MediaInfo:Status (is it playing?)
    ├── MediaInfo:Track (song name)
    ├── MediaInfo:Artist (artist name)
    ├── Shortcut:MediaProgressTextFormatted ←── This is 3 layers deep already!
    │       └── Shortcut:MediaProgressText
    │               └── MediaInfo:Position & Duration
    └── MediaInfo:Lyric (current lyric line)
```

**Example result:**
```
Never Gonna Give You Up ᵇʸ Rick Astley ¹:⁰⁵⁻³:⁰⁰
ⁿᵉᵛᵉʳ ᵍᵒⁿⁿᵃ ˡᵉᵗ ʸᵒᵘ ᵈᵒʷⁿ
```

---

### 5️⃣ `AfkForFormatted` - Stopwatch Integration
```
{{Time;FormatDuration;[[Stopwatch:ElapsedMs:AFKStopwatch]];Short}}
```

**What happens:**
1. `[[Stopwatch:ElapsedMs:AFKStopwatch]]` → Gets milliseconds since AFK started (e.g., `300000`)
2. `{{Time;FormatDuration;300000;Short}}` → Formats to `5m`

---

### 6️⃣ `VRChatSessionTimeFormatted` - Process Time
```
{{Time;FormatDuration;[[Process:SessionTime:VRChat.exe]];Short}}
```

**What happens:**
1. `[[Process:SessionTime:VRChat.exe]]` → How long VRChat has been running (e.g., `3600000` ms)
2. `{{Time;FormatDuration;3600000;Short}}` → Formats to `1h`

---

### 7️⃣ `BatteryInfo` - VR vs Desktop Detection
```
{{Expr;[[OVRTrackers:IsExists:0]];[[OVRTrackers:BatteryLevel:0]]%🔋;Desktop⚡}}
```

**This is an IF statement:**
- **Condition:** `[[OVRTrackers:IsExists:0]]` → Is VR tracker #0 connected?
- **If TRUE (VR mode):** Show battery level like `85%🔋`
- **If FALSE (Desktop):** Show `Desktop⚡`

---

### 8️⃣ `PlayStatus` - The Ultimate Combo! 🏆
```
{{Expr;[[Hotkey:IsToggled:AFKToggle]];I'm AFK for [[Shortcut:AfkForFormatted]];[[Shortcut:BatteryInfo]] (I'm on VR for [[Shortcut:VRChatSessionTimeFormatted]])}}
```

**This is the BOSS of nesting:**
```
PlayStatus
    ├── Hotkey:IsToggled:AFKToggle (did you press Home key?)
    │
    ├── IF AFK (TRUE):
    │       └── "I'm AFK for " + Shortcut:AfkForFormatted
    │                               └── Stopwatch:ElapsedMs:AFKStopwatch
    │
    └── IF NOT AFK (FALSE):
            ├── Shortcut:BatteryInfo
            │       └── OVRTrackers:IsExists:0 → OVRTrackers:BatteryLevel:0 OR "Desktop⚡"
            │
            └── Shortcut:VRChatSessionTimeFormatted
                    └── Process:SessionTime:VRChat.exe
```

**Example results:**
- AFK mode: `I'm AFK for 5m`
- Playing VR: `85%🔋 (I'm on VR for 1h 30m)`
- Playing Desktop: `Desktop⚡ (I'm on VR for 1h 30m)`

---

## 📋 The Main Template

```
{{Shortcut;Time}}
{{Shortcut;MediaWithLyric}}
{{Shortcut;PlayStatus}}
```

This simple 3-line template produces something like:
```
02:30 PM
Never Gonna Give You Up ᵇʸ Rick Astley ¹:⁰⁵⁻³:⁰⁰
ⁿᵉᵛᵉʳ ᵍᵒⁿⁿᵃ ˡᵉᵗ ʸᵒᵘ ᵈᵒʷⁿ
Desktop⚡ (I'm on VR for 1h 30m)
```

---

## ⌨️ Hotkey & Stopwatch Integration

### The `AFKToggle` Hotkey
```json
"Hotkey": {
  "hotkeys": {
    "AFKToggle": "Home"
  }
}
```
- Pressing **Home** key toggles AFK mode ON/OFF
- `[[Hotkey:IsToggled:AFKToggle]]` returns `true` or `false`

### The `AFKStopwatch` Stopwatch
```json
"Stopwatch": {
  "stopwatches": {
    "AFKStopwatch": {
      "resetStartHotkey": "AFKToggle"
    }
  }
}
```
- When `AFKToggle` is pressed, the stopwatch **resets AND starts**
- This tracks how long you've been AFK!

---

## 🗺️ Visual Flow Chart

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN TEMPLATE                            │
│  {{Shortcut;Time}}  {{Shortcut;MediaWithLyric}}  {{Shortcut;PlayStatus}}  │
└────────┬─────────────────────┬────────────────────────┬─────────┘
         │                     │                        │
         ▼                     ▼                        ▼
    ┌─────────┐         ┌─────────────┐          ┌────────────┐
    │  Time   │         │MediaWithLyric│          │ PlayStatus │
    │ shortcut│         │  shortcut   │          │  shortcut  │
    └────┬────┘         └──────┬──────┘          └─────┬──────┘
         │                     │                       │
         ▼                     ▼                       ▼
    ┌─────────┐    ┌───────────────────────┐   ┌──────────────────┐
    │Time;Now │    │ Expr (if playing)     │   │ Expr (if AFK)    │
    │ hh:mm a │    │ + MediaInfo modules   │   │ + nested shortcuts│
    └─────────┘    │ + MediaProgressText   │   └──────────────────┘
                   │   Formatted shortcut  │
                   └───────────────────────┘
                              │
                              ▼
                   ┌───────────────────────┐
                   │ MediaProgressText     │
                   │ (Time;FormatDuration) │
                   │ + MediaInfo:Position  │
                   │ + MediaInfo:Duration  │
                   └───────────────────────┘
```

---

## 📝 Quick Reference

| Syntax | Name | Use For |
|--------|------|---------|
| `{{Module;Param}}` | Outer/Display | Final visible text |
| `[[Module:Param]]` | Inner/Nested | Values inside other placeholders |
| `{{Shortcut;Name}}` | Shortcut call | Reuse complex placeholder combos |
| `{{Expr;cond;true;false}}` | Expression | Conditional text (if/else) |

---

## 🎉 You Did It!

Now you understand:
1. ✅ Two types of placeholders (`{{}}` and `[[]]`)
2. ✅ How nesting works (inner goes inside outer)
3. ✅ How Shortcuts let you create reusable, deeply nested templates
4. ✅ How Hotkeys and Stopwatches integrate with placeholders
5. ✅ How to read and understand complex placeholder chains

**Happy chatboxing!** 🎮✨

---

## 🚀 Ready for More?

Want to learn about **parameterized shortcuts** with `$0`, `$1`, `$2`? Build reusable function-like components? Create complex animated displays?

**→ [Continue to the Expert Guide](./LEARN_PLACEHOLDERS_EXPERT.md)** 🧠
