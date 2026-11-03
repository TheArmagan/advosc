<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { livePreview } from "$lib/components/value-picker/live-preview.svelte";
  import { cn } from "$lib/utils";
  import {
    ArrowDownToLineIcon,
    ArrowUpToLineIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CodeIcon,
    CopyIcon,
    EllipsisIcon,
    EyeIcon,
    EyeOffIcon,
    GripVerticalIcon,
    ListPlusIcon,
    Trash2Icon,
  } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { meta } from "../registry";
  import { previewBlock } from "../template";
  import type { Block } from "../types";

  let {
    block,
    index,
    total,
    dropSide = null,
    onMove,
    onMoveTo,
    onRemove,
    onDuplicate,
    onInsertBelow,
    onToggleDisabled,
    onToggleCollapsed,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    children,
  }: {
    block: Block;
    index: number;
    total: number;
    dropSide?: "before" | "after" | null;
    onMove: (direction: -1 | 1) => void;
    onMoveTo: (edge: "top" | "bottom") => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onInsertBelow: () => void;
    onToggleDisabled: () => void;
    onToggleCollapsed: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: () => void;
    children: Snippet;
  } = $props();

  const info = $derived(meta[block.type]);
  const Icon = $derived(info.icon);
  const template = $derived(previewBlock(block));
  const isStructural = $derived(block.type === "newline" || block.type === "separator");

  let root = $state<HTMLDivElement | null>(null);
  let armed = $state(false);
  let showCode = $state(false);

  const live = livePreview({
    template: () => template,
    enabled: () => !block.disabled && !isStructural && template.includes("{{"),
    element: () => root,
  });

  /** What the header shows next to the name. Plain text needs no round trip to the engine. */
  const value = $derived.by(() => {
    if (block.disabled) return "Off";
    if (block.type === "separator") return JSON.stringify(block.text);
    if (block.type === "newline") return "";
    if (!template) return "";
    if (!template.includes("{{")) return template;
    if (live.failed) return "";
    return live.text;
  });

  const badges = $derived(
    [
      block.output?.prefix || block.output?.suffix ? "affix" : "",
      block.output?.fallback ? "fallback" : "",
      block.output?.maxLength ? `max ${block.output.maxLength}` : "",
      block.output?.style ? "style" : "",
    ].filter(Boolean),
  );
</script>

<div
  bind:this={root}
  role="listitem"
  class={cn(
    "relative rounded-lg border bg-card text-card-foreground shadow-xs transition-opacity",
    block.disabled && "opacity-55",
  )}
  draggable={armed}
  ondragstart={(e) => onDragStart(e)}
  ondragover={(e) => onDragOver(e)}
  ondrop={(e) => onDrop(e)}
  ondragend={() => {
    armed = false;
    onDragEnd();
  }}
>
  {#if dropSide}
    <div
      class={cn(
        "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary",
        dropSide === "before" ? "-top-1.5" : "-bottom-1.5",
      )}
    ></div>
  {/if}

  <div class={cn("flex items-center gap-1.5 py-1.5 pr-1 pl-0.5", !block.collapsed && block.type !== "newline" && "border-b")}>
    <button
      type="button"
      class="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      onpointerdown={() => (armed = true)}
      onpointerup={() => (armed = false)}
    >
      <GripVerticalIcon class="size-3.5" />
    </button>

    <span class={cn("flex size-7 shrink-0 items-center justify-center rounded-md", info.color)}>
      <Icon class="size-4" />
    </span>

    <button
      type="button"
      class="flex min-w-0 flex-1 items-baseline gap-2 text-left"
      onclick={() => !isStructural && onToggleCollapsed()}
      aria-expanded={!block.collapsed}
    >
      <span class="shrink-0 text-[13px] font-semibold">{block.label || info.label}</span>
      {#if block.label}
        <span class="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{info.label}</span>
      {/if}
      {#if value}
        <span class="min-w-0 truncate font-mono text-xs text-muted-foreground" title={value}>{value}</span>
      {:else if !block.disabled && !isStructural && !template}
        <span class="truncate text-xs text-amber-600 dark:text-amber-400">Needs setting up</span>
      {/if}
    </button>

    {#each badges as badge}
      <span class="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground lg:inline">
        {badge}
      </span>
    {/each}

    {#if !isStructural}
      <Button
        variant="ghost"
        size="icon"
        class="size-7 text-muted-foreground"
        aria-label={block.collapsed ? "Expand" : "Collapse"}
        onclick={onToggleCollapsed}
      >
        {#if block.collapsed}<ChevronDownIcon class="size-4" />{:else}<ChevronUpIcon class="size-4" />{/if}
      </Button>
    {/if}

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="Block actions">
            <EllipsisIcon class="size-4" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-48">
        <DropdownMenu.Item onclick={onDuplicate}><CopyIcon /> Duplicate</DropdownMenu.Item>
        <DropdownMenu.Item onclick={onInsertBelow}><ListPlusIcon /> Add a block below</DropdownMenu.Item>
        <DropdownMenu.Item onclick={onToggleDisabled}>
          {#if block.disabled}<EyeIcon /> Turn on{:else}<EyeOffIcon /> Turn off{/if}
        </DropdownMenu.Item>
        {#if !isStructural}
          <DropdownMenu.Item onclick={() => (showCode = !showCode)}>
            <CodeIcon />
            {showCode ? "Hide template" : "Show template"}
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Separator />
        <DropdownMenu.Item disabled={index === 0} onclick={() => onMoveTo("top")}>
          <ArrowUpToLineIcon /> Move to top
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={index === 0} onclick={() => onMove(-1)}>
          <ChevronUpIcon /> Move up
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={index === total - 1} onclick={() => onMove(1)}>
          <ChevronDownIcon /> Move down
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={index === total - 1} onclick={() => onMoveTo("bottom")}>
          <ArrowDownToLineIcon /> Move to bottom
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item variant="destructive" onclick={onRemove}><Trash2Icon /> Delete</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  {#if !block.collapsed && !(block.type === "newline")}
    <div class="flex flex-col gap-2.5 px-3 py-2.5">
      {@render children()}
      {#if showCode && !isStructural}
        <pre
          class="overflow-x-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-snug break-all whitespace-pre-wrap text-muted-foreground">{template ||
            "(nothing yet)"}</pre>
      {/if}
    </div>
  {/if}
</div>
