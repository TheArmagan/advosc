<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { Button } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils";
  import { ChevronsDownUpIcon, ChevronsUpDownIcon, PlusIcon, Trash2Icon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import BlockEditor from "./components/BlockEditor.svelte";
  import BlockLibrary from "./components/BlockLibrary.svelte";
  import BlockShell from "./components/BlockShell.svelte";
  import PreviewCard from "../shared/PreviewCard.svelte";
  import { oneOffMessage } from "../shared/one-off-message.svelte";
  import type { Recipe } from "./recipes";
  import { cloneBlock, createBlock, knownTypes, meta } from "./registry";
  import { buildTemplateState, getShortcutParamCount, getUserShortcutNames } from "./template";
  import type { Block, BlockType } from "./types";

  let { isActive = false }: { isActive?: boolean } = $props();

  const settings = chatbox.settings;
  const renderedTemplate = chatbox.renderedTemplate;
  const simpleEditorBlocks = chatbox.simpleEditorBlocks;

  function sanitizeBlocks(input: unknown[]): Block[] {
    return (input as Block[]).filter((block) => knownTypes.has(block?.type as BlockType));
  }

  const blocks = $derived(sanitizeBlocks($simpleEditorBlocks as unknown[]));

  $effect(() => {
    if (($simpleEditorBlocks as unknown[]).length !== blocks.length) {
      $simpleEditorBlocks = blocks;
    }
  });

  function commit(next: Block[]) {
    $simpleEditorBlocks = next;
  }

  /** For changes that throw work away: one click brings it back. */
  function commitWithUndo(next: Block[], message: string) {
    const previous = blocks;
    commit(next);
    toast(message, {
      duration: 6000,
      action: { label: "Undo", onClick: () => commit(previous) },
    });
  }

  // ------------------------------------------------------------------ block actions

  /** Where the library inserts. Null means the end. */
  let insertAt = $state<number | null>(null);
  let libraryOpen = $state(false);
  let libraryTab = $state<"blocks" | "recipes">("blocks");

  function openLibrary(index: number | null = null, tab: "blocks" | "recipes" = "blocks") {
    insertAt = index;
    libraryTab = tab;
    libraryOpen = true;
  }

  function closeLibrary() {
    libraryOpen = false;
    insertAt = null;
  }

  function insert(newBlocks: Block[]) {
    const at = insertAt ?? blocks.length;
    commit([...blocks.slice(0, at), ...newBlocks, ...blocks.slice(at)]);
    closeLibrary();
  }

  function addBlock(type: BlockType) {
    insert([createBlock(type)]);
  }

  function addRecipe(recipe: Recipe) {
    const at = insertAt ?? blocks.length;
    const previous = blocks;
    const added = recipe.build();
    // A recipe on a line that already has content starts its own line.
    const needsBreak = at > 0 && blocks[at - 1]?.type !== "newline";
    insert(needsBreak ? [createBlock("newline"), ...added] : added);
    toast(`Added ${recipe.label}`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => commit(previous) },
    });
  }

  function removeBlock(id: string) {
    const block = blocks.find((b) => b.id === id);
    commitWithUndo(
      blocks.filter((b) => b.id !== id),
      `Deleted ${block?.label || (block ? meta[block.type].label : "block")}`,
    );
  }

  function duplicateBlock(id: string) {
    const index = blocks.findIndex((b) => b.id === id);
    if (index < 0) return;
    const copy = cloneBlock(blocks[index]);
    commit([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
  }

  function moveTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= blocks.length) return;
    const updated = [...blocks];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    commit(updated);
  }

  function upd(id: string, patch: Partial<Block>) {
    commit(blocks.map((block) => (block.id === id ? ({ ...block, ...patch } as Block) : block)));
  }

  function clearAll() {
    commitWithUndo([], "Cleared all blocks");
  }

  const allCollapsed = $derived(blocks.length > 0 && blocks.every((b) => b.collapsed || b.type === "newline"));

  function setAllCollapsed(collapsed: boolean) {
    commit(blocks.map((block) => ({ ...block, collapsed }) as Block));
  }

  // ------------------------------------------------------------------ drag and drop

  let dragId = $state<string | null>(null);
  let drop = $state<{ id: string; side: "before" | "after" } | null>(null);

  function onDragStart(e: DragEvent, id: string) {
    dragId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  function onDragOver(e: DragEvent, id: string) {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side = e.clientY < box.top + box.height / 2 ? "before" : "after";
    if (drop?.id !== id || drop.side !== side) drop = { id, side };
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (dragId && drop) {
      const from = blocks.findIndex((b) => b.id === dragId);
      let to = blocks.findIndex((b) => b.id === drop!.id);
      if (drop.side === "after") to += 1;
      if (from < to) to -= 1;
      moveTo(from, to);
    }
    onDragEnd();
  }

  function onDragEnd() {
    dragId = null;
    drop = null;
  }

  // ------------------------------------------------------------------ template and one-off message

  const generated = $derived(buildTemplateState(blocks).template);
  const oneOff = oneOffMessage(() => generated);

  $effect(() => {
    if (isActive && !oneOff.active) $settings.template = generated;
  });
</script>

{#snippet insertGap(index: number)}
  <div class="group relative -my-1 flex h-3 items-center justify-center">
    <button
      type="button"
      class="z-10 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground opacity-0 shadow-xs transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
      aria-label="Add a block here"
      title="Add a block here"
      onclick={() => openLibrary(index)}
    >
      <PlusIcon class="size-3" />
    </button>
  </div>
{/snippet}

{#snippet library(index: number | null)}
  {#if libraryOpen && insertAt === index}
    <BlockLibrary
      title={index === null ? "Add a block" : "Add a block here"}
      initialTab={libraryTab}
      onAdd={addBlock}
      onRecipe={addRecipe}
      onClose={closeLibrary}
    />
  {/if}
{/snippet}

<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <div class="flex min-w-0 flex-col gap-2">
    <div class="sticky top-0 z-20 flex items-center gap-1.5 bg-background/95 py-1 backdrop-blur-sm">
      <Button size="sm" class="gap-1 px-2.5" onclick={() => (libraryOpen && insertAt === null ? closeLibrary() : openLibrary())}>
        <PlusIcon class="size-4" />
        Add block
      </Button>
      <Button size="sm" variant="outline" onclick={() => openLibrary(null, "recipes")}>Recipes</Button>
      <span class="ml-1 text-xs text-muted-foreground">
        {blocks.length} block{blocks.length !== 1 ? "s" : ""}
      </span>
      {#if blocks.length > 0}
        <div class="ml-auto flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            class="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onclick={() => setAllCollapsed(!allCollapsed)}
          >
            {#if allCollapsed}<ChevronsUpDownIcon class="size-3.5" /> Expand all{:else}<ChevronsDownUpIcon class="size-3.5" /> Collapse all{/if}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
            onclick={clearAll}
          >
            <Trash2Icon class="size-3.5" /> Clear
          </Button>
        </div>
      {/if}
    </div>

    {@render library(null)}

    {#if blocks.length === 0 && !libraryOpen}
      <div class="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <div>
          <p class="text-sm font-medium">Start from a recipe, or build your own</p>
          <p class="text-xs text-muted-foreground">
            Blocks stack left to right, and a New line block starts the next line.
          </p>
        </div>
        <BlockLibrary title="Recipes" initialTab="recipes" onAdd={addBlock} onRecipe={addRecipe} />
      </div>
    {/if}

    <div role="list" class="flex flex-col gap-2">
      {#each blocks as block, index (block.id)}
        {#if index > 0}
          {@render insertGap(index)}
          {@render library(index)}
        {/if}
        <div class={cn(dragId === block.id && "opacity-40")}>
          <BlockShell
            {block}
            {index}
            total={blocks.length}
            dropSide={drop?.id === block.id && dragId !== block.id ? drop.side : null}
            onMove={(direction) => moveTo(index, index + direction)}
            onMoveTo={(edge) => moveTo(index, edge === "top" ? 0 : blocks.length - 1)}
            onRemove={() => removeBlock(block.id)}
            onDuplicate={() => duplicateBlock(block.id)}
            onInsertBelow={() => openLibrary(index + 1)}
            onToggleDisabled={() => upd(block.id, { disabled: !block.disabled })}
            onToggleCollapsed={() => upd(block.id, { collapsed: !block.collapsed })}
            onDragStart={(e) => onDragStart(e, block.id)}
            onDragOver={(e) => onDragOver(e, block.id)}
            {onDrop}
            {onDragEnd}
          >
            <BlockEditor {block} {upd} getShortcutNames={getUserShortcutNames} {getShortcutParamCount} />
          </BlockShell>
        </div>
      {/each}
      {#if blocks.length > 0}
        {@render library(blocks.length)}
      {/if}
    </div>
  </div>

  <div class="order-first min-w-0 xl:sticky xl:top-0 xl:order-none xl:self-start">
    <PreviewCard
      rendered={$renderedTemplate}
      template={generated}
      overwrite={oneOff.text}
      overwriteActive={oneOff.active}
      onOverwrite={oneOff.input}
      onOverwriteReset={oneOff.reset}
      onOverwriteBlur={oneOff.blur}
    />
  </div>
</div>
