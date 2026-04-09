<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { localData } from "$lib/api/local-data";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import AddBlockMenu from "./components/AddBlockMenu.svelte";
  import BlockEditor from "./components/BlockEditor.svelte";
  import BlockShell from "./components/BlockShell.svelte";
  import {
    SIMPLE_EDITOR_STORAGE_KEY,
    createBlock,
    knownTypes,
    meta,
  } from "./registry";
  import {
    buildTemplateState,
    getShortcutParamCount,
    getUserShortcutNames,
    syncAutoShortcuts,
  } from "./template";
  import type { Block, BlockType } from "./types";

  const settings = chatbox.settings;
  const renderedTemplate = chatbox.renderedTemplate;

  let blocks = $state<Block[]>(
    (localData.get(SIMPLE_EDITOR_STORAGE_KEY, []) as Block[]).filter((block) =>
      knownTypes.has(block?.type as BlockType),
    ),
  );

  function addBlock(type: BlockType) {
    blocks = [...blocks, createBlock(type)];
  }

  function removeBlock(id: string) {
    blocks = blocks.filter((block) => block.id !== id);
  }

  function moveBlock(id: string, direction: -1 | 1) {
    const index = blocks.findIndex((block) => block.id === id);
    if (index < 0) return;
    const next = index + direction;
    if (next < 0 || next >= blocks.length) return;
    const updated = [...blocks];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    blocks = updated;
  }

  function upd(id: string, patch: Partial<Block>) {
    blocks = blocks.map((block) =>
      block.id === id ? ({ ...block, ...patch } as Block) : block,
    );
  }

  $effect(() => {
    const state = buildTemplateState(blocks);
    syncAutoShortcuts(state.autoShortcuts);
    $settings.template = state.template;
    localData.set(SIMPLE_EDITOR_STORAGE_KEY, blocks);
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center gap-1.5 sticky top-0 z-10 bg-background py-0.5">
    <AddBlockMenu onAdd={addBlock} />
    <span class="text-xs text-muted-foreground"
      >{blocks.length} block{blocks.length !== 1 ? "s" : ""}</span
    >
  </div>

  {#if blocks.length === 0}
    <Card.Root class="py-6 text-center">
      <p class="text-muted-foreground text-sm">
        No blocks yet — click <strong>Add Block</strong> to start.
      </p>
      <div class="flex gap-1.5 justify-center mt-3 flex-wrap">
        {#each ["text", "time", "media", "progbar", "condition"] as key}
          <Button
            variant="outline"
            size="sm"
            onclick={() => addBlock(key as BlockType)}
          >
            + {meta[key as BlockType].label}
          </Button>
        {/each}
      </div>
    </Card.Root>
  {/if}

  {#each blocks as block, index (block.id)}
    <BlockShell
      {block}
      {index}
      total={blocks.length}
      onMove={(direction) => moveBlock(block.id, direction)}
      onRemove={() => removeBlock(block.id)}
    >
      <BlockEditor
        {block}
        {upd}
        getShortcutNames={getUserShortcutNames}
        {getShortcutParamCount}
      />
    </BlockShell>
  {/each}

  <Card.Root class="overflow-hidden border-primary/20 border-2">
    <div class="px-2.5 py-1.5 bg-muted/40 border-b">
      <span
        class="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >Live Preview</span
      >
    </div>
    <div class="px-2.5 py-1.5">
      <Textarea
        value={$renderedTemplate}
        class="font-mono text-sm bg-secondary text-foreground text-center min-h-12 resize-none"
        placeholder="Your VRChat chatbox message will appear here once you add blocks above."
        readonly
      />
    </div>
  </Card.Root>
</div>
