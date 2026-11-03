<script lang="ts">
  import { meta } from "../registry";
  import type { Block, UpdateBlock } from "../types";
  import CoreBlockEditor from "./editors/CoreBlockEditor.svelte";
  import DataBlockEditor from "./editors/DataBlockEditor.svelte";
  import SourceBlockEditor from "./editors/SourceBlockEditor.svelte";
  import SystemBlockEditor from "./editors/SystemBlockEditor.svelte";
  import OutputOptions from "./OutputOptions.svelte";

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

  const editor = $derived(meta[block.type]?.editor ?? "system");
  const hasOutput = $derived(!["newline", "separator", "sound"].includes(block.type));
</script>

{#if editor === "core"}
  <CoreBlockEditor {block} {upd} />
{:else if editor === "source"}
  <SourceBlockEditor {block} {upd} />
{:else if editor === "data"}
  <DataBlockEditor {block} {upd} />
{:else}
  <SystemBlockEditor {block} {upd} {getShortcutNames} {getShortcutParamCount} />
{/if}

{#if hasOutput}
  <OutputOptions {block} {upd} />
{/if}
