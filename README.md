<p align="center">
  <img src="./build/icon.png" alt="ADVOSC Logo" width="150" height="150">
</p>

<h1 align="center">ADVOSC</h1>

<p align="center">
  <a href="https://discord.gg/spfmB7S78n">
    <img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord">
  </a>
  <a href="https://github.com/TheArmagan/advosc/releases/latest">
    <img src="https://img.shields.io/github/downloads/thearmagan/advosc/total.svg?style=for-the-badge&logo=windows&logoColor=white&label=All+Downloads" alt="Downloads">
  </a>
</p>

ADVOSC is a desktop app for VRChat OSC. It started because I wanted a nicer chatbox than the ones I could find, and it grew from there.

Windows only, since a few parts (media info, trackers, hardware sensors) talk to Windows APIs directly.

<p align="center">
  <img src="./screenshots/chatbox-simple-editor.png" alt="Simple Chatbox Editor" width="700">
</p>

## Install

Grab `ADVOSC-Setup.exe` from [Releases](https://github.com/TheArmagan/advosc/releases/latest) and run it. It installs and opens itself, there is no wizard to click through. After that it checks for updates on its own and downloads them in the background, then asks whether you want to restart.

If you would rather not have that, use the zip instead: it is the same app, it just never updates itself.

Come say hi on [Discord](https://discord.gg/spfmB7S78n) if something breaks.

## What it does

- **[Chatbox](./docs/CHATBOX.md):** build a live chatbox out of blocks, or write the template by hand. Save whole setups and share them.
- **[Modules](./docs/MODULES.md):** live data for the whole app, like media, heart rate, weather, PC stats, speech and any HTTP endpoint. This is the full placeholder list.
- **[Automations](./docs/AUTOMATIONS.md):** when a value does something, play a sound, send OSC, set a parameter, or run a toy.
- **[Toy control](./docs/TOYS.md):** Lovense and Intiface toys driven by automations. Off by default, with a panic stop and a max strength.
- **[Avatars](./docs/AVATARS.md):** lock, link and animate parameters, save profiles, and resize yourself in game.
- **[OSC Forwarder](./docs/OSC_FORWARDER.md):** send any placeholder value to an OSC address on a timer.
- **[Sound Effects](./docs/SOUND_EFFECTS.md):** a soundboard that can react to your avatar.
- **[Tray and backups](./docs/TRAY_AND_BACKUPS.md):** closing the window keeps ADVOSC running in the tray, and it keeps a daily backup of your settings.

New to placeholders like `{{MediaInfo;Track}}`? The [Placeholder Learning Guide](./LEARN_PLACEHOLDERS.md) starts from scratch, and [the expert one](./LEARN_PLACEHOLDERS_EXPERT.md) goes further once that clicks.

To add contacts and SPS to an avatar along with the rules that react to them, see [ADVOSC Triggers](https://github.com/TheArmagan/advosc-triggers).

## Coming soon

Local speech recognition with Whisper, as an offline alternative to the browser recognizer in the Speech module.

## Development

Bun, Electron, Svelte 5, and a bit of Rust for the Windows-only bits and audio.

```bash
bun install     # deps
bun run dev     # main + preload + engine + renderer + electron, all watching
bun run build   # production build into dist/
bun run package # distributable
```

## License

GPL-3.0. Made for the VRChat community, mostly at hours I should have been asleep.
