<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { ChevronDownIcon, ChevronUpIcon, Trash2Icon } from "@lucide/svelte";
  import { meta } from "../registry";
  import type { Block } from "../types";

  let {
    block,
    index,
    total,
    onMove,
    onRemove,
    children,
  }: {
    block: Block;
    index: number;
    total: number;
    onMove: (direction: -1 | 1) => void;
    onRemove: () => void;
    children: import("svelte").Snippet;
  } = $props();

  const blockMeta = meta[block.type] ?? {
    label: block.type,
    desc: "",
    color: "bg-gray-400",
  };
</script>

<Card.Root class="overflow-hidden">
  <div class="flex items-center gap-1.5 px-2.5 py-1.5 border-b bg-muted/30">
    <span class={`size-2.5 rounded-full shrink-0 ${blockMeta.color}`}></span>
    <span class="text-[13px] font-semibold flex-1 leading-none"
      >{blockMeta.label}</span
    >
    <div class="flex gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        class="size-6.5"
        onclick={() => onMove(-1)}
        disabled={index === 0}
      >
        <ChevronUpIcon class="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-6.5"
        onclick={() => onMove(1)}
        disabled={index === total - 1}
      >
        <ChevronDownIcon class="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-6.5 text-destructive hover:text-destructive"
        onclick={onRemove}
      >
        <Trash2Icon class="size-3.5" />
      </Button>
    </div>
  </div>
  <div class="px-2.5 py-2 flex flex-col gap-1.5">
    {@render children()}
  </div>
</Card.Root>
