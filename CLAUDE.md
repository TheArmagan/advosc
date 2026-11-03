# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ADVOSC is a Windows-only Electron + Svelte 5 desktop app for VRChat OSC: a chatbox template engine, app-wide placeholder modules, Automations, toy control, avatar parameter control/profiles, and an OSC forwarder. Package manager is **bun**. Rust native helper binaries provide Windows-only data (media info, OpenVR trackers, process start times) and sound playback.

## Commands

```bash
bun install          # deps
bun run dev          # concurrent: main+preload vite watch, renderer vite (port 5173), electron
bun run build        # clean + copy:natives (xcopy, Windows-only) + build:main + build:renderer
bun run package      # build + electron-forge package (unpacked app in out/)
bun run make         # build + electron-forge make (Squirrel one-click setup + zip in out/make/)
bun run start        # run electron against an existing dist/
```

`clean` deletes `dist/` before every build. Do not skip it: all the Vite configs use `emptyOutDir: false`, so without it `dist/assets` keeps every hashed bundle from every past build and the packaged app balloons.

There is no test suite, linter, or formatter configured. TypeScript is not type-checked as a build step (Vite transpiles only), so run the checks yourself:

```bash
bun run check:engine   # engine code against a tsconfig with no DOM lib, so a stray `window` fails
bun run check:bundle   # fails if dist/engine.cjs requires anything it can't resolve when packaged
bunx tsc --noEmit      # everything except .svelte files
bunx svelte-check      # .svelte files
```

`check:bundle` runs as part of `bun run build`.

Rust natives (only rebuild when their source changes):

```bash
cd src/natives/advosc-utils   && cargo build --release   # -> natives/advosc-utils.exe
cd src/natives/win-media-info && cargo build --release   # -> natives/win-media-info.exe
cd src/natives/advosc-audio   && cargo build --release   # -> natives/advosc-audio.exe
```

Copy the resulting `target/release/*.exe` into the top-level `natives/` folder; `bun run build` copies `natives/` into `dist/natives/`.

`advosc-utils` needs **cmake** and **LLVM/clang** on the machine, because `openvr_sys` builds the OpenVR C++ lib with cmake and generates bindings with bindgen. If cargo cannot find them, put `C:\Program Files\CMake\bin` on `PATH` and set `LIBCLANG_PATH=C:\Program Files\LLVM\bin`. `Cargo.lock` is gitignored, so version pins that matter live in `Cargo.toml`.

`advosc-audio` needs cmake and the MSVC C++ tools, for libopus, and no LLVM. If libopus fails with FTK1011 or "No CMAKE_C_COMPILER could be found", the path is too long, so set `CARGO_TARGET_DIR` to something short. The `test-hooks` feature adds test commands and must never go into the committed exe.

## Build layout

Four separate Vite configs write into a shared `dist/` (each with `emptyOutDir: false`, so order matters: `clean` wipes `dist/` first, then `copy:natives` runs before the build steps):

- `vite.main.config.ts` → `src/main/main.ts` → `dist/main.cjs` (CJS, node18, electron/node builtins external)
- `vite.preload.config.ts` → `src/main/preload.ts` → `dist/preload.cjs`
- `vite.engine.config.ts` → `src/engine/main.ts` → `dist/engine.cjs` (bundles its dependencies, with `electron`, `chokidar`, `bufferutil` and `utf-8-validate` external)
- `vite.config.ts` → `index.html` + `src/renderer` → `dist/` (Svelte 5 **runes mode**, Tailwind v4 via `@tailwindcss/vite`, `$lib` → `src/renderer/lib`, HMR disabled)

`$shared` → `src/shared` in all of them.

Dev vs production is detected via `ELECTRON_DEV=true` / `NODE_ENV=development`. That flag also picks the native exe path: dev reads the repo's `natives/`, production reads `process.resourcesPath/app.asar.unpacked/dist/natives/` (see `src/main/lib/paths.ts`). The forge config unpacks all of `dist/` out of the asar, so new binaries under `natives/` need no config change.

The engine has to be forked from the path inside the asar, not the unpacked one, or it can't resolve the external `chokidar`.

## Packaging

The forge config lives in `config.forge` in `package.json`. Three things there are easy to break:

- **`dependencies` vs `devDependencies`.** Vite bundles everything the renderer and the engine import, so almost nothing is needed at runtime. `chokidar` is the only real dependency, because `vite.engine.config.ts` lists it as external. Everything else belongs in `devDependencies`, where forge's `prune` drops it from the build. Putting a renderer package (`monaco-editor`, `@lucide/svelte`, …) back in `dependencies` ships ~100 MB of already-bundled code.
- **`ignore`.** It is a whitelist: `^/(?!dist($|/)|node_modules($|/)|package\.json$)` drops every other top-level path. The `node_modules/\.…` rule matters more than it looks, because bun parks stale packages in `node_modules/.ignored` (hundreds of MB) and its Vite cache in `node_modules/.vite`. Without that rule they both end up in the asar.
- **`asar.unpack` globs are matched against absolute paths**, so a bare `dist/**/*` silently matches nothing. It has to be `**/dist/**/*`. `src/main/lib/window.ts` loads the renderer from `app.asar.unpacked/dist/index.html`, so if this stops matching the app opens to a blank window.

`bun run make` produces `out/make/squirrel.windows/x64/ADVOSC-Setup.exe`. Squirrel is one-click: no wizard, it installs to `%LocalAppData%\advosc` and launches.

Squirrel has no installer process of its own. It runs our exe with a flag at each lifecycle step (`--squirrel-install`, `--squirrel-updated`, `--squirrel-obsolete`, `--squirrel-uninstall`) and expects the app to handle it and quit. `src/main/lib/squirrel-startup.ts` does that, and `main.ts` calls it before anything else so `ready` never fires during an install. Without it the app boots a window and binds OSC ports in the middle of setup, and no shortcuts get created.

The `advosc://` protocol is registered on `--squirrel-install` and `--squirrel-updated` and removed on `--squirrel-uninstall`, always against the stub at the install root, because an update deletes the versioned `app-x.y.z` folder. Those calls are synchronous and run before `Update.exe` is spawned, since `main.ts` quits straight after. Every packaged launch registers again, using the stub under Squirrel and `process.execPath` for the zip build. Whichever build ran last owns the links. Dev never registers, and `config.forge` has no `protocols` entry because Windows doesn't use it.

## CI

`.github/workflows/build.yml` builds on pushes to main and on PRs. `.github/workflows/release.yml` runs on a `v*` tag and publishes the installer, the zip, and the Squirrel `RELEASES`/nupkg pair to a GitHub release. Both run on `windows-latest` because the build shells out to xcopy and the Squirrel maker needs Windows.

Releasing means bumping `package.json` and tagging to match:

```bash
git commit -am "0.1.1" && git tag -a v0.1.1 -m v0.1.1 && git push --follow-tags
```

The tag has to be annotated. `--follow-tags` skips lightweight tags, so a plain `git tag` pushes the commit and never starts the release.

The release job fails if the tag and `package.json` disagree, because the Squirrel package version comes from `package.json` and a mismatch would publish a `v0.1.1` release full of `0.1.0` artifacts. The `natives/*.exe` binaries are committed, so CI never needs Rust, cmake, or LLVM.

`electron-winstaller` has to stay in `trustedDependencies`. It ships `7z-x64.exe` and `7z-arm64.exe` and picks one in an `install` lifecycle script, and bun skips lifecycle scripts for anything not listed there. Squirrel shells out to that `vendor/7z.exe` when it builds the package, so without it the make step dies inside .NET with `Squirrel.Utility.CreateZipFromDirectory` and "The system cannot find the file specified", which points nowhere useful. A local machine hides this because the file is already on disk from an earlier install. The release workflow checks for it before running make so the error at least names the cause. Changing `trustedDependencies` also rewrites `bun.lock`, and the lockfile has to be committed with it or CI's `--frozen-lockfile` step fails.

## Auto update

`src/main/lib/auto-updater.ts` uses Electron's built-in `autoUpdater`, which on Windows is Squirrel. Squirrel fetches `<feedURL>/RELEASES` and then the nupkg it names, so the feed URL has to stay constant across versions. A GitHub release URL contains the tag, so it cannot be used directly. `update.electronjs.org` is Electron's redirector that resolves to the repo's newest release, which is why the release workflow publishes `RELEASES` and the nupkg as assets. It requires the repo to be public and the release to be published rather than a draft.

The updater is off unless all three hold: `app.isPackaged`, Windows, and an `Update.exe` next to the install (which the zip build does not have). It checks on launch and hourly after that. On `update-downloaded` it stops checking and adds "Restart to update" to the tray. The restart goes through the normal `before-quit` path.

Main owns an `UpdateState` (`src/shared/native-types.ts`) and pushes it to windows over plain IPC (`updates:get`, `updates:changed`, `updates:check`, `updates:restart`), registered in `setupUpdateIpc` before the first window opens. The sidebar footer and Settings > Updates draw it, and a toast with "Restart now" replaces the old native dialog. Errors show there, never as a popup. Squirrel reports no byte progress, so on `update-available` main reads the newest full package's size from `<feed>/RELEASES` and polls the growing file in `<install>/packages`. Either number can be missing, and the UI falls back to an indeterminate bar. `ADVOSC_FAKE_UPDATE=1` in dev walks through checking, a download and ready, for working on that UI.

CI builds from a clean checkout, so there is no previous nupkg to diff against and every release ships a full package. Updates are correct, just a full download each time. `remoteReleases` on the Squirrel maker would produce deltas, at the cost of the make step depending on the network.

## Architecture

### Process split

All the app's logic runs in an **engine** process, so the window can be destroyed and everything keeps working. The app lives in the tray.

- **Engine** (`src/engine/`, a `utilityProcess`, `dist/engine.cjs`): OSC, sidecars, the Speech server, the file watcher, modules, Automations, toys and persistence. A runaway template stalls this process, not the tray, the window or the panic hotkey, and main can kill it if it hangs. `services/osc.ts` is a hand-written UDP OSC implementation (no `osc` npm package at runtime). `services/media.ts` spawns `win-media-info.exe` and streams JSON stdout, and `services/advosc-utils.ts` shells out to `advosc-utils.exe` per call. `services/system-monitor.ts` and `services/ble-heart-rate.ts` keep a long-lived `advosc-utils.exe` subcommand running (`system-monitor`, `ble-hr`) and stop it once nothing is asking. `ble-hr` and `advosc-audio.exe` are bidirectional: JSON commands on stdin, JSON events on stdout, and they exit on stdin EOF so they can't outlive the app. `src/engine/audio/` is the client for `advosc-audio.exe`, since playback can't use a browser here. There's no DOM in this process, and `toast` becomes `notify`, which only logs when no window is open. `WebSocket` is the bundled `ws`, set globally in `runtime/globals.ts`.
- **Main** (`src/main/`): deliberately thin. Windows, Tray, globalShortcut, dialogs, the updater, legacy import, panic, and the engine host with its watchdog. The engine can't reach Tray, globalShortcut, dialog or shell, so it calls them through the host RPC (`HostMethods` in `src/shared/engine-protocol.ts`, `lib/host-api.ts`). A two-way heartbeat lets main kill a hung engine, and a crash loop respawns it in safe mode with no render loop, forwarder, automations or toys, so the UI stays reachable. Every quit, including an update restart, goes through the one-shot `before-quit` handler in `main.ts`, which waits for the engine to stop toys and flush.
- **Preload** (`src/main/preload.ts`): exposes `window.ADVOSCNative`. Most of it is a typed wrapper over RPC to the engine, on a `MessageChannelMain` port that main brokers per window. Only what has to work without the engine goes over plain IPC: frame controls, `startup`, `panic`, `deeplink`, and `updates`.
- **Renderer** (`src/renderer/`): Svelte 5 runes (`$state`/`$derived`/`$effect`, never `$:`). No direct node access. `lib/api/` is thin clients over the engine, at the same paths the logic used to live in.
- **Shared** (`src/shared/`): no electron, Svelte, DOM or node imports. Types, contracts, module metadata and the shared config classes. `store.ts` is a small `writable`, because `svelte/store` can't load in the engine.

Adding an engine capability means a `handle(...)` in `src/engine/` (see `rpc.ts`) and a client call under `lib/api/`.

Renderer objects can be runes proxies, which can't cross the bridge, so every frame on the port is a JSON string, encoded in one place.

### State sync

`lib/api/engine/index.ts` has three kinds of store, all with the Svelte `subscribe` contract:

- `synced`: persisted stores, hydrated before `mount`. Writes apply locally, then go to the engine, with a sequence number so old echoes don't fight someone typing.
- `mirrored`: read-only engine state, coalesced.
- stream (`parameters`, `changedAt`): 33 ms deltas that only flow while something's subscribed, so nothing is serialized with no window open.

### OSC sources

OSC is multi-source: each source has an optional `local` (listen) and/or `remote` (send) endpoint. Defaults are VRChat (listen 9001 / send 9000) plus a secondary listener on 9002. `sanitizeSources` drops malformed entries rather than failing the whole config, and `reconfigure` hot-swaps sockets without restarting.

### State & persistence

State lives in the engine, in `engine-data/advosc-data.json` under `app.getPath('userData')`, through `localData` and `synced` (`src/engine/persistence/`). Keys keep their original `ADCOSC;` prefix (note the legacy misspelling: do not "fix" it, it would orphan user data). Values stay as JSON strings in memory, so `get` returns a fresh copy and `set` takes a snapshot, like `localStorage` did. Writes are debounced and atomic with a `.bak`, and rolling daily backups keep seven days.

`bootstrap.json` in the same folder is owned by main, for what's needed before the engine exists: start hidden, GPU acceleration, window bounds, the panic latch and hotkey, and the toy failsafe.

Dev uses `engine-data-dev`. Dev and packaged builds share the `userData` folder, so without this a dev run would mark the legacy import as done and real data would never come across.

**Legacy import** (`src/main/lib/legacy-import.ts`) runs in main before the engine starts. A hidden blank page at the old origin dumps `localStorage`, and the whole store is written in one atomic step. `localStorage` is never deleted, so an older build still works.

**GPU acceleration is off by default.** Chromium's GPU process keeps its video memory after the last window is destroyed, so closing to the tray alone frees none (measured: 65.2 MB before and after). With acceleration off it uses none at all. Electron only reads the setting before `ready`, so it lives in `bootstrap.json` and changing it needs a restart.

Some stored strings look like identifiers: `ChatboxModuleValues;<id>`, `ChatboxModule;Speech;Live`, `ChatboxMediaModule;LyricsCache`, `HotkeyModule;`. Leave them alone when renaming code. Module ids appear in user templates, so they can't change either, unless the old one goes in `moduleAliases`.

Avatar OSC state (`src/engine/vrc-osc/avatar-osc.ts`) reads VRChat's own files: OSC schemas from `%APPDATA%/../LocalLow/VRChat/VRChat/OSC` and avatar data from `.../LocalAvatarData`. Locked parameters are held in a map and re-sent whenever an incoming message tries to change them.

### Modules and the placeholder engine

`src/engine/chatbox/index.ts` is the core. Modules are app-wide: anything that takes a value goes through `fillTemplate`. Two placeholder layers:

- `{{Module;Param;...}}`: outer, rendered into the final chatbox text
- `[[Module:Param]]`: inner, evaluated first so its result can be an argument to an outer placeholder

`fillTemplate` regex-matches, splits params with `splitParams` (backslash escapes the delimiter), and resolves every match concurrently. `renderTemplate` runs on a **2200 ms interval** (VRChat chatbox rate limit) and sends via `chatboxOSC`. Each root evaluation has a depth limit and a placeholder budget (`eval-context.ts`, using `AsyncLocalStorage`), which is the guard against user templates that recurse through shortcuts. A failed evaluation means "no data", not "false".

The same context carries **read-only mode**, used by previews and automation sources. Any placeholder with a side effect has to check `isReadOnly()`. `chatbox.fillTemplate` over RPC is not read-only, so previews go through `automations.preview`.

Branches aren't lazy: `Expr` and `Text` resolve both sides first. Changing that would change existing templates. Use a module input from an automation instead.

**Adding a module** touches three places:

1. `src/shared/chatbox/modules/<name>.ts`: the options and, if it has settings, a shared config class of pure getters and setters.
2. `src/engine/chatbox/modules/`: subclass `AppModule` (or the config class), implement `getPlaceholderValue(...params: string[])`, and register it in the `registerModule(...)` block in `src/engine/chatbox/index.ts`.
3. `src/renderer/lib/api/chatbox/index.ts`: register a `ModuleClient` with the shared options, plus a settings component if there is one.

`options.examplePlaceholders` feeds the Monaco autocomplete and the value picker. `options.inputs` declares things the rest of the app can tell the module to do, with `runInput` handling them: the UI renders them from their params, so a new input needs no UI work. A module's `values` store auto-persists under `ChatboxModuleValues;<id>`. Override `getCleanValues()` to control what ends up in import/export (`getAllValues`/`setAllValues`), and `mergeImportedValues` if only part of a nested object is exported. Reactions to a settings change belong in `onValuesChange`, so they also run after an import.

### Automations

`src/engine/automations/`, with the schema in `src/shared/automation.ts`. A rule has a source (template or avatar parameter), a match, a mode (`edge`, `while`, `live`) and actions.

- Parameter sources run from `onParameterChange`. Templates depending on `OSCData` or `Var` run when those change, and others tick at 250 ms, or 100 ms for `live`.
- `live` runs only `osc`, `setParameter`, `setVariable` and toy `link`.
- The first look at a source never fires. A breaker turns off a rule firing 30 times in 3 s, which stops ping-pong loops. It only lasts until a reset, an edit or a restart.
- Sound Effects rules were migrated once into `Automations;Rules`. `SoundEffects;Rules` is left as it was for rollback, and nothing reads it at runtime.

### Toys

`src/engine/toys/`, with the contract in `src/shared/toys.ts`. This controls a physical device on someone's body, so a failure that leaves a toy running or passes the cap is the worst outcome in the project. When a feature and a safety behavior conflict, safety wins.

- Off by default. Nothing connects or sends while `enabled` is false.
- One `ToyTransport` over Lovense HTTP(S) and Intiface WS. Levels are 0 to 1, and the cap is applied once, in `service.ts`, to every path including tests.
- **Dead-man:** Lovense commands use `timeSec` 2.5, renewed every second, and never 0. Rules hold a 2 s lease, so a steady source has to keep calling `link`. Certificate checks are never disabled.
- **Intiface** can't run a command for a limited time. Its cover is the socket closing, plus a one-shot `StopAllDevices` from `intiface-stop.ts` on any start after lost output. Whether Intiface stops devices when the socket closes is unverified.
- **Panic** is owned by main (`lib/panic.ts`) and persisted in `bootstrap.json`, so it works with a hung or dead engine. It never goes through engine RPC. If the engine doesn't ack in 300 ms, main kills it. Only an explicit re-arm clears the latch, and an unreadable `bootstrap.json` counts as latched. A latched engine never sends anything except a stop. After a re-arm or a crash, `while` and `live` rules stay muted until their source goes inactive once.
- Automations reach toys only through `ToyRuleSink`.

### Sharing

`src/shared/chatbox/preset-share.ts`. Presets and exports carry automations. `stripToyContent` runs on export and again on import, whatever "include secrets" says, because a share code can be written by hand. It's an allowlist of action types, so a new action type stays out of shares until it's added on purpose. Rules from a share arrive off, presets merge rules by id, and a settings import replaces them with toy rules off, since that file can come from anyone.

`redactSecrets` has to know about any module with a credential in a free-form field.

**Bundles** (`src/shared/automation-bundle.ts`) are the other way rules come in: `advosc://import?d=<payload>`, a pasted `ADVOSCR1:` code or a `.advosc.json` file. They're a separate format with their own strict validator, not a share code. Bundles may hold toy actions behind the review, while presets and exports still strip them, so `SHAREABLE_ACTIONS` is unchanged. Don't let the two meet: a toy rule reaches a user only through the review drawer, which says what it does and that it arrives off. Rules get new ids and `enabled: false`, and `importKey` skips ones already added. The Unity package at https://github.com/TheArmagan/advosc-triggers writes this format, and its `Documentation~/contract.md` has to change along with `automation-bundle.ts`.

`src/main/lib/deeplink.ts` takes links from `process.argv` and from `second-instance`, drops anything that isn't the prefix plus a base64url payload under the cap, and queues the rest. Main only imports constants from `automation-bundle.ts`. Calling one of its decode functions there adds a `require('fflate')` to `dist/main.cjs`, because `vite.main.config.ts` leaves fflate external and forge prunes it, so the packaged app would crash. `check:bundle` only looks at `dist/engine.cjs` and won't catch that. The renderer asks for a link with `deeplink.ready()` when the review drawer mounts and again when it's done with one, which is what makes a tray-only start and several links in a row work. The drawer is mounted in `main.svelte`, since pages unmount, and `lib/api/automations/bundle-review.svelte.ts` holds its state. Dev skips the single instance lock, so `second-instance` never fires there.

### Simple vs advanced editor

Both editors compile down to the same template string. The advanced editor is Monaco (`lib/editor/`) editing `chatbox.advancedTemplate` directly. The simple editor (`components/chatbox-editor/simple-editor/`) keeps a block array in `chatbox.simpleEditorBlocks` and compiles it via `template.ts` into placeholder syntax, and the engine derives auto-shortcuts (`__SE_*`) from those blocks. Adding a block type touches four files: `src/shared/simple-editor/types.ts` (the block union), `registry.ts` (`createBlock` default, plus `meta` with its icon, its `editor` and its `menuGroups` entry), `src/shared/simple-editor/template.ts` (block → placeholder codegen, in `renderBody`), and the editor component that `meta.editor` names under `components/editors/`. New fields have to be optional, or have a default in the codegen, because blocks saved by older builds don't have them.

Outer placeholders can't nest, so the codegen never puts `{{ }}` inside another one. Free text goes through `Ctx.rich` and sources through `Ctx.source`, which turn each outer placeholder into an `__SE_*` auto shortcut referenced as `[[Shortcut:...]]`. Every block's output options (prefix, suffix, fallback, max length, style) are applied in `applyOutput`, and a line with Separator blocks compiles to one `Text;Join`.

Whichever editor is active writes `chatbox.settings.template`, which is what actually gets rendered and sent.

### Routing

Hash-based router in `src/renderer/lib/router.ts`, derived from `lib/nav.ts`, which is the one list of label, icon, path, page, group and `visible()`. Add a page component to `lib/pages/` and an entry to `nav.ts`, and the sidebar and the route both follow. `visible()` has to read runes state for the sidebar to react.

Module settings components mount only on the Modules page, so nothing the engine does can depend on them.

### UI

shadcn-svelte components live in `lib/components/ui/` (config in `components.json`, base color slate). Import as `import * as Card from "$lib/components/ui/card/index.js"`. Tailwind v4 with CSS variables defined in `src/renderer/app.css`. The window is resizable from 900x600, so a page has to work from there up to maximized. Pages scroll in the shell's content area, so don't give one a fixed height.

## Writing style

Applies to everything a person reads: UI labels, buttons, tooltips, empty states, error and toast messages, module descriptions, and all markdown docs.

**Never use em dashes (`—`) or en dashes (`–`) in prose.** Use a comma, a colon, parentheses, or two sentences. This is the single most common thing that makes text read as machine-written, and it is not how this project sounds.

Write the way the docs do:

- Plain and conversational, like explaining it to someone in Discord. Contractions are fine.
- Say what the thing does, not how great it is. No "powerful", "seamless", "ultimate", "comprehensive", "perfect for", "unlock", "elevate".
- Short sentences over stacked clauses. Cut any sentence that only restates the previous one.
- Address the user as "you". First person ("I built this") is fine in docs and release notes.
- No exclamation marks in UI text, and at most one per doc section.
- Emoji are decoration for headings and module icons, not punctuation inside sentences.
- Do not pad with tables of "Feature | Description" when a sentence covers it. Tables are for real reference data like placeholder lists.
- Do not restate the same capability in three different lists.
- Match the casing of the labels already around you rather than introducing a second convention on the same screen.

Reference tables (placeholders, parameters, outputs) stay as they are. This is about prose.

## Docs

`README.md` is the short overview: what ADVOSC is, how to install it, and links out. Detail lives in `docs/`, one file per topic, so add it there and keep the README short.

`docs/MODULES.md` documents every module's user-facing placeholders; `LEARN_PLACEHOLDERS.md` and `LEARN_PLACEHOLDERS_EXPERT.md` are the user tutorials for the two-layer syntax. Update them when adding or changing placeholder behavior.
