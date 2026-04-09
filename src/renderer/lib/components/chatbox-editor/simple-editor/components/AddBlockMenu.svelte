<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { PlusIcon } from "@lucide/svelte";
  import { menuGroups, meta } from "../registry";
  import type { BlockType } from "../types";

  let { onAdd }: { onAdd: (type: BlockType) => void } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    <Button size="sm" class="gap-1 px-2.5">
      <PlusIcon class="size-4" />
      Add Block
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="w-60">
    {#each menuGroups as grp, gi}
      {#if gi > 0}<DropdownMenu.Separator />{/if}
      <DropdownMenu.Label>{grp.label}</DropdownMenu.Label>
      {#each grp.keys as key}
        <DropdownMenu.Item
          onclick={() => onAdd(key)}
          class="gap-1.5 cursor-pointer"
        >
          <span class={`size-2 rounded-full shrink-0 ${meta[key].color}`}
          ></span>
          <div>
            <p class="text-[13px] font-medium leading-none">
              {meta[key].label}
            </p>
            <p class="text-[11px] text-muted-foreground leading-tight">
              {meta[key].desc}
            </p>
          </div>
        </DropdownMenu.Item>
      {/each}
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
