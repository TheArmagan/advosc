# 🧠 ADVOSC Placeholder System - Expert Guide

This guide assumes you've read the [Beginner's Guide](./LEARN_PLACEHOLDERS.md) and understand the basics. Here we dive into **advanced techniques** including parameterized shortcuts, complex animations, and building reusable component systems.

---

## 🎯 Quick Recap

| Syntax | Purpose |
|--------|---------|
| `{{Module;Param;...}}` | Outer placeholder (display layer) |
| `[[Module:Param:...]]` | Inner placeholder (nested inside outer) |
| `{{Shortcut;Name}}` | Call a named shortcut |
| `[[Shortcut:Name]]` | Use shortcut result as inner value |

---

## ⚡ Parameterized Shortcuts - The Power Feature

Shortcuts can accept **parameters** using `$0`, `$1`, `$2`, etc. This transforms shortcuts from simple text replacements into **reusable functions**!

### Syntax

```
// Defining a shortcut with parameters:
"MyShortcut": "Hello $0, you are $1 years old!"

// Calling it:
{{Shortcut;MyShortcut;World;25}}
         ↑        ↑     ↑    ↑
      Module   Name   $0   $1

// Result: "Hello World, you are 25 years old!"
```

### Parameter Indexing

- `$0` = First parameter after the shortcut name
- `$1` = Second parameter
- `$2` = Third parameter
- ... and so on

### Parameters Can Be Placeholders!

The real power comes when parameters themselves are placeholders:

```
{{Shortcut;MyShortcut;[[MediaInfo:Track]];[[MediaInfo:Artist]]}}
```

---

## 🔧 Building Reusable Components

### Example: Generic Progress Bar

Let's build a progress bar that works for ANYTHING:

```
"ProgressBar": "{{Text;Repeat;$0;$2}}$3{{Text;Repeat;[[Expr:Math.max($0, $1)-$0]];$4}}"
```

**Parameters:**
| Param | Purpose | Example |
|-------|---------|---------|
| `$0` | Current progress value | `3` |
| `$1` | Maximum value | `10` |
| `$2` | Filled character | `█` |
| `$3` | Current position marker | `🔘` |
| `$4` | Empty character | `░` |

**Usage:**
```
{{Shortcut;ProgressBar;3;10;█;🔘;░}}
```

**Result:** `███🔘░░░░░░░`

### Making It Dynamic: Media Progress Bar

Now wrap this generic progress bar for media:

```
"MediaProgressValue": "{{Expr;Math.round([[MediaInfo:Position]]/[[MediaInfo:Duration]]*$0)||0}}"
"MediaProgressBar": "{{Shortcut;ProgressBar;[[Shortcut:MediaProgressValue:$0]];$0;$1;$2;$3}}"
```

**Breaking down `MediaProgressValue`:**
1. `[[MediaInfo:Position]]` / `[[MediaInfo:Duration]]` = progress ratio (0.0 to 1.0)
2. Multiply by `$0` (the scale/max value)
3. `Math.round()` to get integer
4. `||0` fallback if calculation fails

**Calling `MediaProgressBar`:**
```
{{Shortcut;MediaProgressBar;5;˖⁺‧;🛸;₊˖⁺}}
                          ↑  ↑   ↑   ↑
                       scale filled marker empty
```

**Result at 60% progress:** `˖⁺‧˖⁺‧˖⁺‧🛸₊˖⁺₊˖⁺`

---

## 🎨 Advanced Animation Patterns

### Marquee Text (Scrolling)

```
{{Text;Animate;Marquee;TEXT;Direction;VisibleLength}}
```

| Param | Values | Description |
|-------|--------|-------------|
| Direction | `Left`, `Right` | Scroll direction |
| VisibleLength | Number | How many characters visible at once |

**Example - Scrolling song title:**
```
"MediaTitle": "{{Text;Format;SmallCaps;[[MediaInfo:Track]]}} ᵇʸ {{Text;Format;SmallCaps;[[MediaInfo:Artist]]}}"
"MediaMarquee": "{{Text;Animate;Marquee;[[Shortcut:MediaTitle]];Left;14}}"
```

### Cycling Animations (EachOne)

```
{{Text;Animate;EachOne;Frame1;Frame2;Frame3;...}}
```

Cycles through items over time. Great for:
- Pulsing icons: `{{Text;Animate;EachOne;❤️;💗}}`
- Status rotation
- Frame-by-frame animations

**Complex heartbeat animation:**
```
"ScrollingHeartrate": "{{Text;Animate;Marquee;ﮩ٨ـ;Left;3}}"
"FormattedHR": "{{Text;Animate;EachOne;❤️ ;💗 }}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Format;SuperScript;[[Shortcut:HeartrateComplete]]}}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Animate;EachOne; ❤️; 💗}}"
```

This creates: `❤️ |ﮩ٨ـﮩ٨ـ|⁷⁵|ﮩ٨ـﮩ٨ـ| ❤️` with animations!

---

## 🏗️ Real Expert Configuration Breakdown

Here's a full expert-level configuration created by **x᙭x ᗪᕮᗩᗪ x᙭x** ([Discord: deadelixor](https://discord.com/users/274012297683402753)):

```json
{
  "modules": {
    "Shortcut": {
      "shortcuts": {
        "MediaProgressBar": "{{Shortcut;ProgressBar;[[Shortcut:MediaProgressValue:$0]];$0;$1;$2;$3}}",
        "Time": "{{Time;Now;h:mm a}}",
        "MediaProgressText": "{{Time;FormatDuration;[[MediaInfo:Position]];Colon}}",
        "ScrollingHeartrate": "{{Text;Animate;Marquee;ﮩ٨ـ;Left;3}}",
        "FormattedHR": "{{Text;Animate;EachOne;❤️ ;💗 }}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Format;SuperScript;[[Shortcut:HeartrateComplete]]}}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Animate;EachOne; ❤️; 💗}}",
        "HeartrateComplete": "{{Pulsoid;[[Shortcut:Token]];HeartRate}}",
        "MediaProgressText2": "{{Time;FormatDuration;[[MediaInfo:Duration]];Colon}}",
        "FormattedMP": "{{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}}",
        "FormattedMP2": "{{Text;Format;SuperScript;[[Shortcut:MediaProgressText2]]}}",
        "ProgressBar": "{{Text;Repeat;$0;$2}}$3{{Text;Repeat;[[Expr:Math.max($0, $1)-$0]];$4}}",
        "EditedPB": " {{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}} |{{Shortcut;MediaProgressBar;5;[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]];🛸;[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]]}}| {{Text;Format;SuperScript;[[Shortcut:MediaProgressText2]]}}",
        "MediaTitle": "{{Text;Format;SmallCaps;[[MediaInfo:Track]]}} ᵇʸ {{Shortcut;MediaArtist}} ",
        "MediaArtist": "{{Text;Format;SmallCaps;[[MediaInfo:Artist]]}}",
        "MediaMarquee": "{{Text;Animate;EachOne;♬ ;♫ }}| {{Text;Animate;Marquee;[[Shortcut:MediaTitle]];Left;14}} |{{Text;Animate;EachOne; ♬; ♫}}\r\n",
        "StatusCycle": "{{Text;Animate;EachOne;*.⋆ | Happily Married <3 | *.⋆;*.⋆ | FBT: SomaticVR | *.⋆;*.⋆ | HMD: Quest 2 | *.⋆;*.⋆ | Rest your eyes! | *.⋆;*.⋆ | Take Breaks! | *.⋆;*.⋆ | Get a Snack! | *.⋆;*.⋆ | Drink Water! | *.⋆;*.⋆ | Say Hi! | *.⋆}}",
        "MediaProgressValue": "{{Expr;Math.round([[MediaInfo:Position]]/[[MediaInfo:Duration]]*$0)||0}}",
        "Token": "",
        "EditedStatusCycle": "{{Text;Format;SmallCaps;[[Shortcut:StatusCycle]]}}\r\n",
        "TimeSmall": "{{Text;Format;SuperScript;[[Shortcut:Time]]}}"
      }
    }
  },
  "settings": {
    "template": "╭────────★─╮\n{{Shortcut;EditedStatusCycle}}\n{{Shortcut;EditedPB}}\n{{Shortcut;MediaMarquee}}\n{{Shortcut;FormattedHR}}\n╰─★────────╯",
    "autoSend": true,
    "eggMode": true,
    "debugMode": false
  }
}
```

---

## 🔬 Deep Dive: Each Shortcut Explained

### 1️⃣ Core Utility: `ProgressBar`

```
"ProgressBar": "{{Text;Repeat;$0;$2}}$3{{Text;Repeat;[[Expr:Math.max($0, $1)-$0]];$4}}"
```

**The formula:**
```
[FILLED × current] + [MARKER] + [EMPTY × (max - current)]
```

**Visual:**
```
$0=3, $1=10, $2=█, $3=🔘, $4=░

{{Text;Repeat;3;█}}  →  ███
$3                   →  🔘  
{{Text;Repeat;7;░}}  →  ░░░░░░░

Result: ███🔘░░░░░░░
```

**Why `Math.max($0, $1)-$0`?**
- Prevents negative numbers if `$0 > $1`
- `Math.max(3, 10) - 3 = 7` empty slots

---

### 2️⃣ Dynamic Calculator: `MediaProgressValue`

```
"MediaProgressValue": "{{Expr;Math.round([[MediaInfo:Position]]/[[MediaInfo:Duration]]*$0)||0}}"
```

**This is a FUNCTION that takes a scale parameter!**

| Song Position | Song Duration | Scale ($0) | Result |
|---------------|---------------|------------|--------|
| 30000 | 180000 | 10 | 2 |
| 90000 | 180000 | 10 | 5 |
| 150000 | 180000 | 5 | 4 |

**Usage:**
```
[[Shortcut:MediaProgressValue:10]]  → Progress out of 10
[[Shortcut:MediaProgressValue:5]]   → Progress out of 5
```

---

### 3️⃣ Composed Component: `MediaProgressBar`

```
"MediaProgressBar": "{{Shortcut;ProgressBar;[[Shortcut:MediaProgressValue:$0]];$0;$1;$2;$3}}"
```

**This wraps `ProgressBar` specifically for media!**

**Parameter mapping:**
```
{{Shortcut;MediaProgressBar; 5  ;  ˖⁺‧  ;  🛸  ;  ₊˖⁺ }}
                            ↓      ↓       ↓      ↓
                           $0     $1      $2     $3
                            ↓      ↓       ↓      ↓
Calls ProgressBar with:  [calc]   $0      $1     $2     $3
                           ↓      ↓       ↓      ↓
                         value   max   filled marker empty
```

**The magic:** `[[Shortcut:MediaProgressValue:$0]]` passes the scale DOWN to calculate the current value.

---

### 4️⃣ Fancy Progress Display: `EditedPB`

```
"EditedPB": " {{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}} |{{Shortcut;MediaProgressBar;5;[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]];🛸;[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]]}}| {{Text;Format;SuperScript;[[Shortcut:MediaProgressText2]]}}"
```

**Deconstructed:**
```
 ¹:²³ |˖⁺‧₊˖⁺‧🛸₊˖⁺‧₊| ³:⁴⁵
  ↑         ↑           ↑
 time    progress     total
(super)   (animated)  (super)
```

**Note the nested inner placeholders as parameters:**
```
[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]]
```
This creates ANIMATED fill characters! 🤯

---

### 5️⃣ Scrolling Media Title: `MediaMarquee`

```
"MediaTitle": "{{Text;Format;SmallCaps;[[MediaInfo:Track]]}} ᵇʸ {{Shortcut;MediaArtist}} "
"MediaArtist": "{{Text;Format;SmallCaps;[[MediaInfo:Artist]]}}"
"MediaMarquee": "{{Text;Animate;EachOne;♬ ;♫ }}| {{Text;Animate;Marquee;[[Shortcut:MediaTitle]];Left;14}} |{{Text;Animate;EachOne; ♬; ♫}}\r\n"
```

**Result:**
```
♬ | ɴᴇᴠᴇʀ ɢᴏɴɴᴀ ɢɪ | ♬
♫ | ᴇᴠᴇʀ ɢᴏɴɴᴀ ɢɪᴠ | ♫
♬ | ᴠᴇʀ ɢᴏɴɴᴀ ɢɪᴠᴇ | ♬
... (scrolling)
```

**Composition chain:**
```
MediaMarquee
├── Text;Animate;EachOne (♬/♫ icons)
├── Text;Animate;Marquee
│   └── MediaTitle
│       ├── Text;Format;SmallCaps + MediaInfo:Track
│       └── MediaArtist
│           └── Text;Format;SmallCaps + MediaInfo:Artist
└── Text;Animate;EachOne (♬/♫ icons)
```

---

### 6️⃣ Heartrate Display: `FormattedHR`

```
"ScrollingHeartrate": "{{Text;Animate;Marquee;ﮩ٨ـ;Left;3}}"
"HeartrateComplete": "{{Pulsoid;[[Shortcut:Token]];HeartRate}}"
"FormattedHR": "{{Text;Animate;EachOne;❤️ ;💗 }}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Format;SuperScript;[[Shortcut:HeartrateComplete]]}}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Animate;EachOne; ❤️; 💗}}"
```

**Result:**
```
❤️ |ﮩ٨ـﮩ٨ـ|⁷⁵|ﮩ٨ـﮩ٨ـ| ❤️
💗 |٨ـﮩ٨ـﮩ|⁷⁵|٨ـﮩ٨ـﮩ| 💗
```

**Secret Token Pattern:**
```
"Token": ""
"HeartrateComplete": "{{Pulsoid;[[Shortcut:Token]];HeartRate}}"
```
The `Token` shortcut stores your Pulsoid API token - keeping it in one place and potentially in a "secrets" list!

---

### 7️⃣ Status Rotation: `StatusCycle`

```
"StatusCycle": "{{Text;Animate;EachOne;*.⋆ | Happily Married <3 | *.⋆;*.⋆ | FBT: SomaticVR | *.⋆;*.⋆ | HMD: Quest 2 | *.⋆;...}}"
"EditedStatusCycle": "{{Text;Format;SmallCaps;[[Shortcut:StatusCycle]]}}"
```

**Cycles through messages:**
```
*.⋆ | ʜᴀᴘᴘɪʟʏ ᴍᴀʀʀɪᴇᴅ <3 | *.⋆
*.⋆ | ғʙᴛ: sᴏᴍᴀᴛɪᴄᴠʀ | *.⋆
*.⋆ | ʜᴍᴅ: Qᴜᴇsᴛ 2 | *.⋆
*.⋆ | ʀᴇsᴛ ʏᴏᴜʀ ᴇʏᴇs! | *.⋆
...
```

---

## 📐 The Complete Template

```
╭────────★─╮
{{Shortcut;EditedStatusCycle}}
{{Shortcut;EditedPB}}
{{Shortcut;MediaMarquee}}
{{Shortcut;FormattedHR}}
╰─★────────╯
```

**Final output example:**
```
╭────────★─╮
*.⋆ | ᴅʀɪɴᴋ ᴡᴀᴛᴇʀ! | *.⋆
 ¹:²³ |˖⁺‧₊˖⁺‧🛸₊˖⁺‧₊| ³:⁴⁵
♬ | ɴᴇᴠᴇʀ ɢᴏɴɴᴀ ɢɪᴠᴇ | ♬
❤️ |ﮩ٨ـﮩ٨ـ|⁷⁵|ﮩ٨ـﮩ٨ـ| ❤️
╰─★────────╯
```

---

## 🧩 Design Patterns

### Pattern 1: Function Shortcuts

Create generic utilities that accept parameters:

```
"Pad": "{{Text;Repeat;$1;[[Expr:Math.max(0, $0 - [[Text:Length:$2]])]]}}$2"
// Usage: {{Shortcut;Pad;5;0;42}} → "00042"
```

### Pattern 2: Secret Storage

Keep sensitive data in one place:

```
"Token": "your-secret-token-here"
"ApiCall": "{{SomeModule;[[Shortcut:Token]];Data}}"
```

Mark it as secret in the module settings to exclude from exports!

### Pattern 3: Composition Layers

Build complex displays from simple parts:

```
Level 1 (Data):      MediaInfo:Track, MediaInfo:Position
Level 2 (Format):    MediaTitle, MediaProgressText  
Level 3 (Compose):   MediaMarquee, EditedPB
Level 4 (Template):  Final chatbox output
```

### Pattern 4: Animated Fills

Use inner placeholders as parameters for animated elements:

```
{{Shortcut;Something;[[Text:Animate:Marquee:★·.·:Left:2]]}}
```

---

## ⚠️ Expert Tips & Gotchas

### 1. Parameter Count Matters
If a shortcut expects 3 parameters but you only provide 2, it will show an error. Check your `$N` references!

### 2. Escaping Semicolons
Use `\;` if you need a literal semicolon in a parameter:
```
{{Shortcut;MyShortcut;Hello\; World}}
```

### 3. Recursion Protection
ADVOSC prevents infinite loops (500 calls/second limit). But be careful with shortcuts calling themselves!

### 4. Debug Mode
Enable `debugMode: true` in settings to see placeholder resolution in the console.

### 5. Inner Placeholder Syntax in Parameters
When passing animated text as a parameter, use inner syntax:
```
[[Text:Animate:Marquee:content:Left:5]]
```
NOT outer syntax `{{...}}` as a parameter.

---

## 📚 Quick Reference

| Pattern | Syntax | Example |
|---------|--------|---------|
| Parameter | `$N` | `$0`, `$1`, `$2` |
| Shortcut call | `{{Shortcut;Name;p0;p1}}` | `{{Shortcut;ProgressBar;5;10;█;🔘;░}}` |
| Shortcut as inner | `[[Shortcut:Name:p0:p1]]` | `[[Shortcut:MediaProgressValue:10]]` |
| Animated parameter | `[[Text:Animate:...]]` | `[[Text:Animate:Marquee:★:Left:3]]` |
| Math expression | `[[Expr:formula]]` | `[[Expr:Math.round($0/100*$1)]]` |

---

## 🎓 You're Now an Expert!

You've mastered:
- ✅ Parameterized shortcuts with `$0`, `$1`, `$2`...
- ✅ Building reusable function-like shortcuts
- ✅ Complex animation compositions
- ✅ Multi-layer abstraction patterns
- ✅ Secret token management
- ✅ Animated parameters inside shortcuts

Now go create something amazing! 🚀✨

---

*← Back to [Beginner's Guide](./LEARN_PLACEHOLDERS.md)*
