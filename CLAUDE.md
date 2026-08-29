# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ADVOSC is a Windows-only Electron + Svelte 5 desktop app for VRChat OSC: a chatbox template engine with placeholder modules, avatar parameter control/profiles, and an OSC forwarder. Package manager is **bun**. Rust native helper binaries provide Windows-only data (media info, OpenVR trackers, process start times).

## Commands

```bash
bun install          # deps
bun run dev          # concurrent: main+preload vite watch, renderer vite (port 5173), electron
bun run build        # clean + copy:natives (xcopy, Windows-only) + build:main + build:renderer
bun run package      # build + electron-forge package (unpacked app in out/)
bun run make         # build + electron-forge make (Squirrel one-click setup + zip in out/make/)
bun run start        # run electron against an existing dist/
```

`clean` deletes `dist/` before every build. Do not skip it: all three Vite configs use `emptyOutDir: false`, so without it `dist/assets` keeps every hashed bundle from every past build and the packaged app balloons.

There is no test suite, linter, or formatter configured. TypeScript is not type-checked as a build step (Vite transpiles only), so run `bunx tsc --noEmit` if you want type errors.

Rust natives (only rebuild when their source changes):

```bash
cd src/natives/advosc-utils   && cargo build --release   # -> natives/advosc-utils.exe
cd src/natives/win-media-info && cargo build --release   # -> natives/win-media-info.exe
```

Copy the resulting `target/release/*.exe` into the top-level `natives/` folder; `bun run build` copies `natives/` into `dist/natives/`.

`advosc-utils` needs **cmake** and **LLVM/clang** on the machine, because `openvr_sys` builds the OpenVR C++ lib with cmake and generates bindings with bindgen. If cargo cannot find them, put `C:\Program Files\CMake\bin` on `PATH` and set `LIBCLANG_PATH=C:\Program Files\LLVM\bin`. `Cargo.lock` is gitignored, so version pins that matter live in `Cargo.toml`.

## Build layout

Three separate Vite configs write into a shared `dist/` (each with `emptyOutDir: false`, so order matters: `clean` wipes `dist/` first, then `copy:natives` runs before the two build steps):

- `vite.main.config.ts` → `src/main/main.ts` → `dist/main.cjs` (CJS, node18, electron/node builtins external)
- `vite.preload.config.ts` → `src/main/preload.ts` → `dist/preload.cjs`
- `vite.config.ts` → `index.html` + `src/renderer` → `dist/` (Svelte 5 **runes mode**, Tailwind v4 via `@tailwindcss/vite`, `$lib` → `src/renderer/lib`, HMR disabled)

Dev vs production is detected via `ELECTRON_DEV=true` / `NODE_ENV=development`. That flag also picks the native exe path: dev reads `dist/natives/`, production reads `process.resourcesPath/app.asar.unpacked/dist/natives/` (see `src/main/lib/advosc-utils.ts`). The forge config unpacks all of `dist/` out of the asar, so new binaries under `natives/` need no config change.

## Packaging

The forge config lives in `config.forge` in `package.json`. Three things there are easy to break:

- **`dependencies` vs `devDependencies`.** Vite bundles everything the renderer and the main process import, so almost nothing is needed at runtime. `chokidar` is the only real dependency, because `vite.main.config.ts` lists it as external. Everything else belongs in `devDependencies`, where forge's `prune` drops it from the build. Putting a renderer package (`monaco-editor`, `@lucide/svelte`, …) back in `dependencies` ships ~100 MB of already-bundled code.
- **`ignore`.** It is a whitelist: `^/(?!dist($|/)|node_modules($|/)|package\.json$)` drops every other top-level path. The `node_modules/\.…` rule matters more than it looks, because bun parks stale packages in `node_modules/.ignored` (hundreds of MB) and its Vite cache in `node_modules/.vite`. Without that rule they both end up in the asar.
- **`asar.unpack` globs are matched against absolute paths**, so a bare `dist/**/*` silently matches nothing. It has to be `**/dist/**/*`. `src/main/lib/window.ts` loads the renderer from `app.asar.unpacked/dist/index.html`, so if this stops matching the app opens to a blank window.

`bun run make` produces `out/make/squirrel.windows/x64/ADVOSC-Setup.exe`. Squirrel is one-click: no wizard, it installs to `%LocalAppData%\advosc` and launches.

Squirrel has no installer process of its own. It runs our exe with a flag at each lifecycle step (`--squirrel-install`, `--squirrel-updated`, `--squirrel-obsolete`, `--squirrel-uninstall`) and expects the app to handle it and quit. `src/main/lib/squirrel-startup.ts` does that, and `main.ts` calls it before anything else so `ready` never fires during an install. Without it the app boots a window and binds OSC ports in the middle of setup, and no shortcuts get created.

## CI

`.github/workflows/build.yml` builds on pushes to main and on PRs. `.github/workflows/release.yml` runs on a `v*` tag and publishes the installer, the zip, and the Squirrel `RELEASES`/nupkg pair to a GitHub release. Both run on `windows-latest` because the build shells out to xcopy and the Squirrel maker needs Windows.

Releasing means bumping `package.json` and tagging to match:

```bash
git commit -am "0.1.1" && git tag v0.1.1 && git push --follow-tags
```

The release job fails if the tag and `package.json` disagree, because the Squirrel package version comes from `package.json` and a mismatch would publish a `v0.1.1` release full of `0.1.0` artifacts. The `natives/*.exe` binaries are committed, so CI never needs Rust, cmake, or LLVM.

`electron-winstaller` has to stay in `trustedDependencies`. It ships `7z-x64.exe` and `7z-arm64.exe` and picks one in an `install` lifecycle script, and bun skips lifecycle scripts for anything not listed there. Squirrel shells out to that `vendor/7z.exe` when it builds the package, so without it the make step dies inside .NET with `Squirrel.Utility.CreateZipFromDirectory` and "The system cannot find the file specified", which points nowhere useful. A local machine hides this because the file is already on disk from an earlier install. The release workflow checks for it before running make so the error at least names the cause. Changing `trustedDependencies` also rewrites `bun.lock`, and the lockfile has to be committed with it or CI's `--frozen-lockfile` step fails.

## Auto update

`src/main/lib/auto-updater.ts` uses Electron's built-in `autoUpdater`, which on Windows is Squirrel. Squirrel fetches `<feedURL>/RELEASES` and then the nupkg it names, so the feed URL has to stay constant across versions. A GitHub release URL contains the tag, so it cannot be used directly. `update.electronjs.org` is Electron's redirector that resolves to the repo's newest release, which is why the release workflow publishes `RELEASES` and the nupkg as assets. It requires the repo to be public and the release to be published rather than a draft.

The updater is off unless all three hold: `app.isPackaged`, Windows, and an `Update.exe` next to the install (which the zip build does not have). It checks on launch and hourly after that, logs errors instead of surfacing them, and shows a restart prompt on `update-downloaded`.

CI builds from a clean checkout, so there is no previous nupkg to diff against and every release ships a full package. Updates are correct, just a full download each time. `remoteReleases` on the Squirrel maker would produce deltas, at the cost of the make step depending on the network.

## Architecture

### Process split

- **Main** (`src/main/`): `main.ts` boots OSC → `setupIpcHandlers` → media monitor → window. `lib/osc.ts` is a hand-written UDP OSC implementation (no `osc` npm package at runtime); `lib/osc-config.ts` persists sources to `osc-sources.json` in `app.getPath('userData')`; `lib/media.ts` spawns `win-media-info.exe` and streams JSON stdout; `lib/advosc-utils.ts` shells out to `advosc-utils.exe` per call. `lib/system-monitor.ts` and `lib/ble-heart-rate.ts` instead keep a long-lived `advosc-utils.exe` subcommand running (`system-monitor`, `ble-hr`) and stop it once nothing is asking. `ble-hr` is the only one that is bidirectional: JSON commands go in on stdin, JSON events come back on stdout, and the events are broadcast to the renderer on `ble:event`.
- **Preload** (`src/main/preload.ts`): the single source of truth for the renderer↔main contract. `PreloadElectronAPI` is exposed as `window.ADVOSCNative` (typed in `src/renderer/global.d.ts`). Adding any main-process capability means editing three places: `preload.ts` (API + type), `lib/ipc-handlers.ts` (handler), and the calling renderer code.
- **Renderer** (`src/renderer/`): Svelte 5 runes (`$state`/`$derived`/`$effect`, never `$:`). No direct node access; everything goes through `window.ADVOSCNative`.

### OSC sources

OSC is multi-source: each source has an optional `local` (listen) and/or `remote` (send) endpoint. Defaults are VRChat (listen 9001 / send 9000) plus a secondary listener on 9002. `sanitizeSources` drops malformed entries rather than failing the whole config, and `reconfigure` hot-swaps sockets without restarting.

### State & persistence

Renderer state is Svelte `writable` stores persisted to `localStorage` through `localData` (`src/renderer/lib/api/local-data/`), which namespaces every key with the `ADCOSC;` prefix (note the legacy misspelling: do not "fix" it, it would orphan user data). Pattern:

```ts
const store = writable<T>(localData.get("Key", defaultValue));
store.subscribe((val) => localData.set("Key", val));
```

Avatar OSC state (`api/vrc-osc/avatar-osc.ts`) reads VRChat's own files via `window.ADVOSCNative.files.watch`: OSC schemas from `%APPDATA%/../LocalLow/VRChat/VRChat/OSC` and avatar data from `.../LocalAvatarData`. Locked parameters are held in a map and re-sent whenever an incoming message tries to change them.

### Chatbox placeholder engine

`src/renderer/lib/api/chatbox/index.ts` is the core. Two placeholder layers:

- `{{Module;Param;...}}`: outer, rendered into the final chatbox text
- `[[Module:Param]]`: inner, evaluated first so its result can be an argument to an outer placeholder

`fillTemplate` regex-matches, splits params with `splitParams` (backslash escapes the delimiter), and resolves every match concurrently. `renderTemplate` runs on a **2200 ms interval** (VRChat chatbox rate limit) and sends via `chatboxOSC`. A per-second call counter (`callsMadeMap`) trips at 500 calls for the same `module;params` key and temporarily ignores it, which is the guard against user templates that recurse through shortcuts.

**Adding a module**: subclass `ChatboxModule` in `api/chatbox/modules/`, implement `getPlaceholderValue(...params: string[])`, and register it in the `registerChatboxModule(...)` block in `api/chatbox/index.ts`. `options.examplePlaceholders` feeds both the Monaco autocomplete and the modules tab. A module's `values` store auto-persists under `ChatboxModuleValues;<id>`; override `getCleanValues()` to control what ends up in import/export (`getAllValues`/`setAllValues`).

### Simple vs advanced editor

Both editors compile down to the same template string. The advanced editor is Monaco (`lib/editor/`) editing `chatbox.advancedTemplate` directly. The simple editor (`components/chatbox-editor/simple-editor/`) keeps a block array in `chatbox.simpleEditorBlocks` and compiles it via `template.ts` into placeholder syntax, and it may also generate auto-shortcuts through `ChatboxShortcutModule`. Adding a block type touches four files: `types.ts` (the block union), `registry.ts` (`createBlock` default + menu metadata), `template.ts` (block → placeholder codegen), and the matching editor component under `components/editors/`.

Whichever editor is active writes `chatbox.settings.template`, which is what actually gets rendered and sent.

### Routing

Hash-based router in `src/renderer/lib/router.ts`. Add a page component to `lib/pages/` and register its path in the `routes` map.

### UI

shadcn-svelte components live in `lib/components/ui/` (config in `components.json`, base color slate). Import as `import * as Card from "$lib/components/ui/card/index.js"`. Tailwind v4 with CSS variables defined in `src/renderer/app.css`.

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

`README.md` documents every module's user-facing placeholders; `LEARN_PLACEHOLDERS.md` and `LEARN_PLACEHOLDERS_EXPERT.md` are the user tutorials for the two-layer syntax. Update them when adding or changing placeholder behavior.
