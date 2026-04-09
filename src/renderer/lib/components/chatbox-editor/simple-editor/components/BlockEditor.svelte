<script lang="ts">
  import { previewBlock } from "../template";
  import type { Block, UpdateBlock } from "../types";
  import CoreBlockEditor from "./editors/CoreBlockEditor.svelte";
  import SourceBlockEditor from "./editors/SourceBlockEditor.svelte";
  import SystemBlockEditor from "./editors/SystemBlockEditor.svelte";

  let {
    block,
    upd,
    getShortcutNames,
    getShortcutParamCount,
  }: {
    block: Block;
    upd: UpdateBlock;
    getShortcutNames: () => string[];
    getShortcutParamCount: (name: string) => number;
  } = $props();

  const sourceTypes = new Set([
    "texttransform",
    "textreplace",
    "texttruncate",
    "textpad",
    "textdefault",
    "media",
    "mediaprog",
    "progbar",
    "healthbar",
    "starrating",
    "toggle",
    "numberformat",
    "numbercalc",
    "random",
  ]);
  const coreTypes = new Set([
    "newline",
    "text",
    "time",
    "marquee",
    "bounce",
    "typewriter",
    "blink",
    "eachone",
  ]);
</script>

{#if coreTypes.has(block.type)}
  <CoreBlockEditor {block} {upd} />
{:else if sourceTypes.has(block.type)}
  <SourceBlockEditor {block} {upd} />
{:else}
  <SystemBlockEditor {block} {upd} {getShortcutNames} {getShortcutParamCount} />
{/if}

<p
  class="text-[11px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-1 rounded break-all leading-tight"
>
  {previewBlock(block) || "(configure this block above)"}
</p>
