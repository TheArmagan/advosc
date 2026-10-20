<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { SearchIcon } from "@lucide/svelte";
  import TypeBadge from "./type-badge.svelte";
  import {
    buildParameterList,
    scoreParameter,
    sortParameters,
    type ParameterListItem,
  } from "./parameter-search";

  let {
    value = $bindable(""),
    placeholder = "Search parameters or type an address",
    exclude = [] as string[],
    onpick,
    class: className = "",
  }: {
    value?: string;
    placeholder?: string;
    exclude?: string[];
    onpick?: (address: string) => void;
    class?: string;
  } = $props();

  const parameters = avatarOSC.parameters;
  const schemaIndex = avatarOSC.schemaIndex;
  const changedAt = avatarOSC.changedAt;

  let open = $state(false);
  let highlighted = $state(0);

  const results = $derived.by(() => {
    const items = buildParameterList(
      $parameters,
      $schemaIndex,
      avatarOSC.getParameterType,
    ).filter((i) => !exclude.includes(i.address));
    // When the field already holds a full address, still list everything so you can switch.
    const query = value.startsWith("/") && items.some((i) => i.address === value) ? "" : value;
    if (!query.trim()) return sortParameters(items, "name", $changedAt).slice(0, 60);
    return items
      .map((item) => ({ item, score: scoreParameter(item, query) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map((r) => r.item);
  });

  $effect(() => {
    results;
    highlighted = 0;
  });

  function pick(item: ParameterListItem) {
    value = item.address;
    open = false;
    onpick?.(item.address);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      highlighted = Math.min(highlighted + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
    } else if (e.key === "Enter" && open && results[highlighted]) {
      e.preventDefault();
      pick(results[highlighted]);
    } else if (e.key === "Escape") {
      open = false;
    }
  }
</script>

<div class="relative {className}">
  <InputGroup.Root>
    <InputGroup.Addon>
      <SearchIcon />
    </InputGroup.Addon>
    <InputGroup.Input
      {placeholder}
      class="font-mono text-xs"
      bind:value
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      onblur={() => setTimeout(() => (open = false), 120)}
      {onkeydown}
    />
  </InputGroup.Root>
  {#if open && results.length}
    <div
      class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
      role="listbox"
    >
      {#each results as item, i (item.address)}
        <button
          type="button"
          role="option"
          aria-selected={i === highlighted}
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm {i ===
          highlighted
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50'}"
          onmousedown={(e) => {
            e.preventDefault();
            pick(item);
          }}
          onmouseenter={() => (highlighted = i)}
        >
          <TypeBadge type={item.type} />
          <span class="truncate">{item.name}</span>
          {#if item.name !== item.short}
            <span class="ml-auto truncate font-mono text-[10px] text-muted-foreground">
              {item.short}
            </span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
