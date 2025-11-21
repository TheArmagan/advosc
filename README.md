# ADVOSC ✨

Hey there! Welcome to **ADVOSC**, your new best friend for VRChat OSC magic! 🌟

We've built this tool to make your VRChat experience smoother, more expressive, and just plain cooler. Whether you're a chatterbox or an avatar wizard, we've got something for you. It features a sleek, modern UI that's easy on the eyes and a joy to use.

## Features 🚀

### 💬 Advanced Chatbox Editor
Type away with style! Our chatbox editor isn't just a text box; it's a powerhouse designed for expression.

- **Advanced Placeholders:** Use dynamic text support to make your messages come alive with real-time data.

![Chatbox Editor](./screenshots/chatbox-advanced-editor.png)

### 🧩 Chatbox Modules

The Chatbox Editor supports various modules to make your messages dynamic. Here are some examples of what you can do:

#### 🎵 Media Info (`MediaInfo`)
Display information about your currently playing media.
- `{{MediaInfo;Status}}` → `Playing`
- `{{MediaInfo;Track}}` → `Never Gonna Give You Up`
- `{{MediaInfo;Artist}}` → `Rick Astley`
- `{{MediaInfo;Lyric}}` → `Never gonna give you up` (Current synced lyric)

#### 🕒 Time (`Time`)
Show current time or calculate durations.
- `{{Time;Now;HH:mm}}` → `14:30`
- `{{Time;Now;yyyy-MM-dd}}` → `2023-11-14`

#### 🔤 Text (`Text`)
Manipulate text strings.
- `{{Text;Upper;hello}}` → `HELLO`
- `{{Text;Reverse;vrchat}}` → `tahrv`

#### 🔢 Number (`Number`)
Generate random numbers or perform math.
- `{{Number;Random;Int;1;100}}` → `42`
- `{{Number;Round;3.14}}` → `3`

#### ❤️ Pulsoid (`Pulsoid`)
Display your heart rate (requires Pulsoid token).
- `{{Pulsoid;YOUR_TOKEN;HeartRate}}` → `85`

#### 🧪 Expression (`Expr`)
Evaluate logic and conditions.
- `{{Expr;5 > 3;Yes;No}}` → `Yes`
- `{{Expr;[[MediaInfo:Status]]=='Playing';Playing: [[MediaInfo:Track]];Idle}}` → `Playing: Song Name`

#### 📡 OSC Data (`OSCData`)
Read raw OSC parameters from your avatar.
- `{{OSCData;/avatar/parameters/AFK}}` → `true`

### 🎭 Avatar OSC Magic
Take full control of your avatar's parameters like never before. We give you the tools to manage your avatar's state precisely.

- **🔒 Parameter Locking:** Keep those toggles exactly where you want them. No accidental switches!
- **🔗 Link & Redirect:** Connect parameters together! Route one parameter's value to another for complex interactions without touching your avatar package.
- **✨ Animate Parameters:** Bring your avatar to life with automated parameter animations. Create breathing effects, color shifts, or anything you can imagine.

![Avatar OSC Parameters](./screenshots/avatar-osc-parameters.png)
![Parameter Linking](./screenshots/avatar-osc-link-parameter.png)
![Parameter Animation](./screenshots/avatar-osc-animate-parameter.png)

## 🚧 Work in Progress (Coming Soon!)

We are constantly working to make ADVOSC better. Here is what we are cooking up in the kitchen right now:

- **👗 Avatar Profiles:** Save your favorite avatar toggle states (outfits, props, moods) and switch between them instantly.
- **🗣️➡️📝 Speech to Text & Translation:** Speak your mind and let the text flow into your chatbox, automatically translated to your target language.
- **🗣️➡️🗣️ Speech to Speech & Translation:** Break down language barriers completely with real-time voice translation.

## 🛠️ Development

Want to tinker with the code or contribute? We'd love to have you!

This project uses [Bun](https://bun.sh/), [Electron](https://www.electronjs.org/), [Svelte](https://svelte.dev/), and [Rust](https://www.rust-lang.org/).

1.  **Clone the repository**
2.  **Install dependencies:**
    ```bash
    bun install
    ```
3.  **Run the development server:**
    ```bash
    bun run dev
    ```

## License

Distributed under the GPL-3.0 License.

---

*Made with ❤️ for the VRChat Community.*