# Placeholders, the deep end

This one assumes you have been through the [beginner guide](./LEARN_PLACEHOLDERS.md) and that nesting no longer surprises you. Here we get into shortcuts that take parameters, animations that compose, and the patterns behind the chatboxes that make people ask how you did that.

Refresher, in case you need it:

| Syntax | What it is |
|--------|------------|
| `{{Module;Param;...}}` | outer placeholder, the display layer |
| `[[Module:Param:...]]` | inner placeholder, goes inside an outer one |
| `{{Shortcut;Name}}` | call a shortcut |
| `[[Shortcut:Name]]` | use a shortcut's result as an inner value |

---

## Shortcuts that take parameters

This is the feature that changes everything. A shortcut can reference `$0`, `$1`, `$2` and so on, and you fill those in when you call it. Shortcuts stop being copy-paste and start being functions.

```
Define:  "MyShortcut": "Hello $0, you are $1 years old!"

Call:    {{Shortcut;MyShortcut;World;25}}
                      ↑         ↑     ↑
                     name      $0    $1

Get:     Hello World, you are 25 years old!
```

`$0` is the first parameter after the name, `$1` the second, and it keeps going as far as you need.

And since parameters are just text that gets substituted in, they can be placeholders themselves:

```
{{Shortcut;MyShortcut;[[MediaInfo:Track]];[[MediaInfo:Artist]]}}
```

That is where it gets fun.

---

## Building components

### A progress bar that works for anything

```
"ProgressBar": "{{Text;Repeat;$0;$2}}$3{{Text;Repeat;[[Expr:Math.max($0, $1)-$0]];$4}}"
```

| Param | Is | Example |
|-------|-----|---------|
| `$0` | current value | `3` |
| `$1` | maximum | `10` |
| `$2` | filled character | `█` |
| `$3` | the marker that rides along | `🔘` |
| `$4` | empty character | `░` |

```
{{Shortcut;ProgressBar;3;10;█;🔘;░}}   →   ███🔘░░░░░░░
```

Nothing in there knows or cares what it is measuring. Health, song position, a countdown, whatever you feed it.

### Now point it at your music

```
"MediaProgressValue": "{{Expr;Math.round([[MediaInfo:Position]]/[[MediaInfo:Duration]]*$0)||0}}"
"MediaProgressBar": "{{Shortcut;ProgressBar;[[Shortcut:MediaProgressValue:$0]];$0;$1;$2;$3}}"
```

`MediaProgressValue` takes position over duration (a ratio from 0 to 1), multiplies by whatever scale you ask for, rounds it, and falls back to `0` with `||0` when there is no music and the division goes to `NaN`.

`MediaProgressBar` is a thin wrapper: it passes your scale down to the calculator to get the current value, then hands everything to the generic bar.

```
{{Shortcut;MediaProgressBar;5;˖⁺‧;🛸;₊˖⁺}}
                            ↑   ↑    ↑   ↑
                          scale fill marker empty
```

At 60% through the song: `˖⁺‧˖⁺‧˖⁺‧🛸₊˖⁺₊˖⁺`

Three shortcuts, and none of them knows more than it has to. That layering is the whole trick.

---

## Animation

### Marquee

```
{{Text;Animate;Marquee;TEXT;Direction;VisibleLength}}
```

Direction is `Left` or `Right`, visible length is how many characters fit in the window.

```
"MediaTitle": "{{Text;Format;SmallCaps;[[MediaInfo:Track]]}} ᵇʸ {{Text;Format;SmallCaps;[[MediaInfo:Artist]]}}"
"MediaMarquee": "{{Text;Animate;Marquee;[[Shortcut:MediaTitle]];Left;14}}"
```

### EachOne

```
{{Text;Animate;EachOne;Frame1;Frame2;Frame3}}
```

Steps through the items over time. Good for a pulsing icon (`{{Text;Animate;EachOne;❤️;💗}}`), a rotating status line, or hand-drawn frame animation.

Stack the two and you get things like:

```
"ScrollingHeartrate": "{{Text;Animate;Marquee;ﮩ٨ـ;Left;3}}"
"FormattedHR": "{{Text;Animate;EachOne;❤️ ;💗 }}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Format;SuperScript;[[Shortcut:HeartrateComplete]]}}|{{Shortcut;ScrollingHeartrate}}{{Shortcut;ScrollingHeartrate}}|{{Text;Animate;EachOne; ❤️; 💗}}"
```

which beats away as `❤️ |ﮩ٨ـﮩ٨ـ|⁷⁵|ﮩ٨ـﮩ٨ـ| ❤️`.

### Using the same animation twice

You can drop the exact same animated placeholder (or the same shortcut wrapping one) into a template as many times as you want, like the doubled `{{Shortcut;ScrollingHeartrate}}` above. Every occurrence keeps its own animation state, so copies no longer fight over one timeline and cycling animations no longer skip frames when duplicated.

Occurrences that start at the same moment with the same parameters stay in sync, since they are running the same animation from the same start time. A copy that shows up later, say one that only appears when a condition flips true, animates on its own phase.

---

## A full expert setup

This one is by **x᙭x ᗪᕮᗩᗪ x᙭x** ([Discord: deadelixor](https://discord.com/users/274012297683402753)), and it is a good example of how far this goes.

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
        "HeartrateComplete": "{{HeartRate;[[Shortcut:Source]];HeartRate}}",
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
        "Source": "MyPulsoid",
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

### `ProgressBar`

```
"ProgressBar": "{{Text;Repeat;$0;$2}}$3{{Text;Repeat;[[Expr:Math.max($0, $1)-$0]];$4}}"
```

The formula is `filled × current`, then the marker, then `empty × (max - current)`.

```
$0=3, $1=10, $2=█, $3=🔘, $4=░

{{Text;Repeat;3;█}}   →  ███
$3                    →  🔘
{{Text;Repeat;7;░}}   →  ░░░░░░░

                         ███🔘░░░░░░░
```

The `Math.max($0, $1)-$0` guards against a negative repeat count when the current value somehow overshoots the max. `Math.max(3, 10) - 3` gives 7 empty slots, and if current ever exceeds max you get 0 instead of a crash.

### `MediaProgressValue`

```
"MediaProgressValue": "{{Expr;Math.round([[MediaInfo:Position]]/[[MediaInfo:Duration]]*$0)||0}}"
```

A function with a scale parameter:

| Position | Duration | Scale (`$0`) | Result |
|----------|----------|--------------|--------|
| 30000 | 180000 | 10 | 2 |
| 90000 | 180000 | 10 | 5 |
| 150000 | 180000 | 5 | 4 |

```
[[Shortcut:MediaProgressValue:10]]   progress out of 10
[[Shortcut:MediaProgressValue:5]]    progress out of 5
```

### `MediaProgressBar`

```
"MediaProgressBar": "{{Shortcut;ProgressBar;[[Shortcut:MediaProgressValue:$0]];$0;$1;$2;$3}}"
```

```
{{Shortcut;MediaProgressBar; 5 ; ˖⁺‧ ; 🛸 ; ₊˖⁺ }}
                             $0    $1    $2    $3
                             ↓     ↓     ↓     ↓
ProgressBar gets:   [computed]  $0    $1    $2    $3
                       value    max  filled marker empty
```

The interesting bit is `[[Shortcut:MediaProgressValue:$0]]`, which passes the scale down a level so the calculation matches the bar width you asked for.

### `EditedPB`

```
"EditedPB": " {{Text;Format;SuperScript;[[Shortcut:MediaProgressText]]}} |{{Shortcut;MediaProgressBar;5;[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]];🛸;[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]]}}| {{Text;Format;SuperScript;[[Shortcut:MediaProgressText2]]}}"
```

```
 ¹:²³ |˖⁺‧₊˖⁺‧🛸₊˖⁺‧₊| ³:⁴⁵
  ↑          ↑          ↑
elapsed   the bar     total
```

Look at what got passed in as the fill and empty characters:

```
[[Text:Animate:Marquee:˖⁺‧₊˖⁺‧₊˖⁺‧₊:Left:4]]
```

The bar's own characters are animated. The bar has no idea, it just repeats whatever string it was handed, and that string happens to be different on every frame.

### `MediaMarquee`

```
"MediaTitle": "{{Text;Format;SmallCaps;[[MediaInfo:Track]]}} ᵇʸ {{Shortcut;MediaArtist}} "
"MediaArtist": "{{Text;Format;SmallCaps;[[MediaInfo:Artist]]}}"
"MediaMarquee": "{{Text;Animate;EachOne;♬ ;♫ }}| {{Text;Animate;Marquee;[[Shortcut:MediaTitle]];Left;14}} |{{Text;Animate;EachOne; ♬; ♫}}\r\n"
```

```
♬ | ɴᴇᴠᴇʀ ɢᴏɴɴᴀ ɢɪ | ♬
♫ | ᴇᴠᴇʀ ɢᴏɴɴᴀ ɢɪᴠ | ♫
♬ | ᴠᴇʀ ɢᴏɴɴᴀ ɢɪᴠᴇ | ♬
```

```
MediaMarquee
├── EachOne  ♬ / ♫
├── Marquee
│   └── MediaTitle
│       ├── SmallCaps + MediaInfo:Track
│       └── MediaArtist
│           └── SmallCaps + MediaInfo:Artist
└── EachOne  ♬ / ♫
```

### `FormattedHR` and the named source

```
"Source": "MyPulsoid"
"HeartrateComplete": "{{HeartRate;[[Shortcut:Source]];HeartRate}}"
```

`Source` holds the name of a feed configured in **Modules → Heart Rate**, and everything else reads it through the shortcut. Swap platforms later and you edit one line instead of hunting through the template.

```
❤️ |ﮩ٨ـﮩ٨ـ|⁷⁵|ﮩ٨ـﮩ٨ـ| ❤️
💗 |٨ـﮩ٨ـﮩ|⁷⁵|٨ـﮩ٨ـﮩ| 💗
```

### `StatusCycle`

```
"StatusCycle": "{{Text;Animate;EachOne;*.⋆ | Happily Married <3 | *.⋆;*.⋆ | FBT: SomaticVR | *.⋆;...}}"
"EditedStatusCycle": "{{Text;Format;SmallCaps;[[Shortcut:StatusCycle]]}}"
```

```
*.⋆ | ʜᴀᴘᴘɪʟʏ ᴍᴀʀʀɪᴇᴅ <3 | *.⋆
*.⋆ | ғʙᴛ: sᴏᴍᴀᴛɪᴄᴠʀ | *.⋆
*.⋆ | ʜᴍᴅ: Qᴜᴇsᴛ 2 | *.⋆
*.⋆ | ʀᴇsᴛ ʏᴏᴜʀ ᴇʏᴇs! | *.⋆
```

### And the template on top of all that

```
╭────────★─╮
{{Shortcut;EditedStatusCycle}}
{{Shortcut;EditedPB}}
{{Shortcut;MediaMarquee}}
{{Shortcut;FormattedHR}}
╰─★────────╯
```

```
╭────────★─╮
*.⋆ | ᴅʀɪɴᴋ ᴡᴀᴛᴇʀ! | *.⋆
 ¹:²³ |˖⁺‧₊˖⁺‧🛸₊˖⁺‧₊| ³:⁴⁵
♬ | ɴᴇᴠᴇʀ ɢᴏɴɴᴀ ɢɪᴠᴇ | ♬
❤️ |ﮩ٨ـﮩ٨ـ|⁷⁵|ﮩ٨ـﮩ٨ـ| ❤️
╰─★────────╯
```

---

## Patterns worth stealing

**Function shortcuts.** Write the generic version, use it everywhere.

```
"Pad": "{{Text;Repeat;$1;[[Expr:Math.max(0, $0 - [[Text:Length:$2]])]]}}$2"
{{Shortcut;Pad;5;0;42}}   →   00042
```

**One place for secrets.** Keep a token or a source name in its own shortcut and reference it. Mark it hidden in the module settings and it gets stripped when you share.

```
"Token": "your-secret-token-here"
"ApiCall": "{{SomeModule;[[Shortcut:Token]];Data}}"
```

**Layers.** The setup above is really four floors stacked up, and each floor only talks to the one below it.

```
data      MediaInfo:Track, MediaInfo:Position
format    MediaTitle, MediaProgressText
compose   MediaMarquee, EditedPB
template  the thing you actually see
```

**Animated parameters.** Anywhere a placeholder takes text, an animated inner placeholder fits.

```
{{Shortcut;Something;[[Text:Animate:Marquee:★·.·:Left:2]]}}
```

---

## Things that will bite you

**Parameter count.** A shortcut that references `$2` and only gets two parameters will show an error rather than guess. Count your `$N`s.

**Literal semicolons.** Escape them with `\;` or they split your parameters.

```
{{Shortcut;MyShortcut;Hello\; World}}
```

**Recursion.** ADVOSC caps the same call at 500 per second and temporarily ignores whatever tripped it, so a shortcut that calls itself will not take the app down. It will still ruin your chatbox, so watch out for accidental loops.

**Debug mode.** Turn on `debugMode` in settings to watch placeholders resolve in the console. This is usually faster than staring at the template.

**Inner syntax in parameters.** When you pass a placeholder as a parameter, use the inner form:

```
[[Text:Animate:Marquee:content:Left:5]]      yes
{{Text;Animate;Marquee;content;Left;5}}      not as a parameter
```

---

## Cheat sheet

| Pattern | Syntax | Example |
|---------|--------|---------|
| Parameter | `$N` | `$0`, `$1`, `$2` |
| Shortcut call | `{{Shortcut;Name;p0;p1}}` | `{{Shortcut;ProgressBar;5;10;█;🔘;░}}` |
| Shortcut as inner | `[[Shortcut:Name:p0:p1]]` | `[[Shortcut:MediaProgressValue:10]]` |
| Animated parameter | `[[Text:Animate:...]]` | `[[Text:Animate:Marquee:★:Left:3]]` |
| Math | `[[Expr:formula]]` | `[[Expr:Math.round($0/100*$1)]]` |

---

That is everything the engine can do. Go make something absurd, and show it off in the [Discord](https://discord.gg/spfmB7S78n).

*Back to the [beginner guide](./LEARN_PLACEHOLDERS.md)*
