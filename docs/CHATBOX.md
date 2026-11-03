[Back to the README](../README.md)

# The chatbox

Everything in the chatbox is a template. You write text, and anywhere you want live data you drop in a placeholder like `{{MediaInfo;Track}}`. ADVOSC re-renders it every 2.2 seconds (VRChat's rate limit) and sends the result.

There are two ways to write one, and they both end up as the same template underneath, so you can start in one and finish in the other.

## Simple editor

<p align="center">
  <img src="../screenshots/chatbox-simple-editor.png" alt="Simple Chatbox Editor" width="700">
</p>

You stack blocks, drag them into order, and watch a preview of the chatbox as you go. No syntax to memorize. If you don't know where to start, pick a recipe (now playing, clock and heart rate, PC stats, AFK status, weather, rotating messages, speech captions) and change it from there.

Blocks go left to right, and a **New line** block starts the next line. A line that ends up empty is left out, so a now playing line just disappears when nothing plays.

| Category | Blocks |
|----------|--------|
| **Basics** | Text, New line, Separator, Current time, Countdown |
| **Media and you** | Now playing, Song progress, Heart rate, Speech to text |
| **VRChat** | Avatar param, Hotkey state, VR tracker, Play sound |
| **Data** | PC stats, Weather, Web request, Variable, Session time, Stopwatch, Shortcut |
| **Display** | Progress bar, Health bar, Star rating, Toggle text, Condition |
| **Animation** | Scrolling text, Bounce, Typewriter, Blink, Rotating texts |
| **Numbers** | Math, Number format, Number calc, Random number |
| **Text tools** | Text transform, Text replace, Text truncate, Text pad, Text fallback |

Every block has an **Output** section: text before and after it, what to show when it's empty, a max length, and a fancy style. Before and after only show when the block has a value, so `❤ ` and ` BPM` don't hang around when the heart rate monitor is off. A **Separator** works the same way: it only shows when there's something on both sides of it.

Text fields take placeholders too. Type `{{` or `[[` for autocomplete, or click the list icon to browse modules and your avatar's parameters. Source fields also take a plain number or an OSC address like `/avatar/parameters/Health`.

The header of each block shows its live value. From its menu you can duplicate it, turn it off without deleting it, or see the template it makes. Deleting a block or clearing everything can be undone from the message that pops up.

The box under the preview sends a one-off message for 30 seconds, and shows VRChat's typing bubble while you type in it.

## Advanced editor

<p align="center">
  <img src="../screenshots/chatbox-advanced-editor.png" alt="Advanced Chatbox Editor" width="700">
</p>

If you would rather just write the template, this is a real editor with autocomplete for every module and placeholder. Nothing is hidden from you here, and anything the simple editor can produce you can also write by hand.

Type `{{` or `[[` and suggestions come up. The placeholder list on the right is searchable, groups everything by module, and shows what a placeholder returns right now when it needs no arguments. Inserting one puts in its arguments as stops you can Tab through. The toolbar can style selected text, comment lines out (`Ctrl+/`), and copy the template. The preview and the one-off message box work the same as in the simple editor.

Whichever editor you have open is the one that gets sent.

## My Templates

A saved template holds the whole setup: the template text, both editors' state, and every module's settings. So switching templates swaps your entire chatbox in one click instead of you rebuilding it.

| Action | What it does |
|--------|--------------|
| **Save Current As Template** | Snapshots your current setup under a name |
| **Use** | Switches to a saved template, and can save your current one first so you can come back |
| **Overwrite With Current Setup** | Updates a saved template in place after you tweak something |
| **Share** | Gives you a compact share code, the raw JSON, or a `.advosc.json` file |
| **Rename**, **Duplicate** | What they say |
| **Import From Code Or JSON**, **Import From File** | Take a share code, template JSON, template file, or an "Export All Settings" file |

Sharing strips your credentials. Heart rate tokens, API keys, widget ids, custom WebSocket URLs and shortcuts you marked hidden never leave your machine, and the share window tells you exactly what it removed. There is a checkbox to include them on purpose if you are exporting a backup for yourself.

Imported templates just land in your list. Nothing switches until you say so.

## Chatbox settings

The Settings tab has **Enable auto send**, which is what actually sends your chatbox to VRChat every 2.2 seconds. **Enable Debug Mode** writes placeholder problems to the log, which helps when a template isn't doing what you expected. **Export All Settings** and its import live here too.
