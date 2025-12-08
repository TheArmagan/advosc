# ADVOSC - AI Coding Agent Instructions

## Project Overview

ADVOSC is an Electron + Svelte 5 desktop application for VRChat OSC tools. It features a chatbox editor with dynamic placeholders, avatar parameter control, and real-time media info integration via a Rust native binary.

## Architecture

### Process Separation (Electron Pattern)

- **Main Process** (`src/main/`): Node.js context with system access
  - `main.ts` - Window management, IPC handlers, OSC communication
  - `lib/osc.ts` - UDP-based OSC protocol implementation (ports 9000/9001)
  - `preload.ts` - Secure bridge exposing `window.ADVOSCNative` API
- **Renderer Process** (`src/renderer/`): Browser context with Svelte 5
  - Access system features only through `window.ADVOSCNative.*` (defined in `global.d.ts`)

### Key Data Flows

1. **VRChat OSC**: Main process listens on port 9001, sends on 9000 → `window.ADVOSCNative.osc.onMessage/send`
2. **Media Info**: Rust binary (`natives/win-media-info.exe`) spawned by main → IPC → renderer
3. **Avatar Data**: Main watches VRChat OSC files → parses JSON schema → renderer stores

## Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server (concurrent Vite + Electron)
bun run build        # Production build (copies natives, builds main + renderer)
bun run package      # Create distributable with electron-forge
```

## Code Conventions

### Svelte 5 with Runes

This project uses **Svelte 5 runes mode** (`compilerOptions.runes: true` in vite.config.ts):

```svelte
<script lang="ts">
  // Use $state, $derived, $effect - NOT reactive statements ($:)
  const count = $state(0);
  const doubled = $derived(count * 2);
</script>
```

### State Management Pattern

- Use Svelte stores (`writable`) for shared state across components
- Stores in `src/renderer/lib/api/` directories persist via `localData` (localStorage wrapper)

```typescript
// Pattern from avatar-osc.ts, chatbox/index.ts
const store = writable<Type>(localData.get("Key", defaultValue));
store.subscribe((val) => localData.set("Key", val));
```

### UI Components (shadcn-svelte)

Components in `src/renderer/lib/components/ui/` follow shadcn-svelte patterns:

```svelte
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
```

- Path alias `$lib` → `src/renderer/lib`
- Styling: Tailwind CSS with CSS variables for theming (see `tailwind.config.js`)

### Chatbox Module System

To add a new chatbox placeholder module:

1. Create class extending `ChatboxModule` in `src/renderer/lib/api/chatbox/modules/`
2. Implement `getPlaceholderValue(...params)` returning string/Promise<string>
3. Register in `src/renderer/lib/api/chatbox/index.ts`

Example pattern from `chatbox-time-module.ts`:

```typescript
export class ChatboxTimeModule extends ChatboxModule {
  constructor() {
    super({
      id: "Time",
      name: "Time",
      examplePlaceholders: {
        "Now;HH:mm": { value: "14:30", description: "..." },
      },
    });
  }
  getPlaceholderValue(...params: string[]): string {
    // params[0] = "Now", params[1] = "HH:mm"
  }
}
```

### Router

Simple hash-based router in `src/renderer/lib/router.ts`. Add pages:

1. Create component in `src/renderer/lib/pages/`
2. Register route in `router.ts` initial state

### IPC Communication

Main ↔ Renderer communication via typed preload API:

```typescript
// Renderer: Use window.ADVOSCNative (see PreloadElectronAPI in preload.ts)
window.ADVOSCNative.osc.send("/chatbox/input", message, true);
window.ADVOSCNative.media.onMediaInfo((info) => {
  /* ... */
});

// Main: Handle in main.ts with ipcMain.handle/on
ipcMain.handle("osc:send", (_, address, args) => port.send(address, args));
```

## Native Binary (Rust)

`src/natives/win-media-info/` - Windows-only media info monitor:

- Build: `cargo build --release` in that directory
- Output: `target/release/win-media-info.exe` → copied to `natives/` folder
- Main process spawns and reads JSON stdout for media updates

## File Structure Highlights

```
src/
├── main/           # Electron main process
├── renderer/
│   ├── lib/
│   │   ├── api/
│   │   │   ├── chatbox/      # Chatbox logic + modules
│   │   │   ├── vrc-osc/      # VRChat OSC helpers
│   │   │   └── local-data/   # localStorage wrapper
│   │   ├── components/
│   │   │   └── ui/           # shadcn-svelte components
│   │   ├── pages/            # Route page components
│   │   └── editor/           # Monaco editor setup
│   └── app.css               # Tailwind + CSS variables
└── natives/                  # Rust binaries source
```

## Important Patterns

- **OSC addresses** follow VRChat format: `/avatar/parameters/*`, `/chatbox/input`, `/chatbox/typing`
- **Placeholder syntax**: `{{Module;Param;...}}` for display, `[[Module:Param]]` for nested evaluation
- **Parameter locking**: Store locked values in `lockedParameters` map, re-send on incoming changes
