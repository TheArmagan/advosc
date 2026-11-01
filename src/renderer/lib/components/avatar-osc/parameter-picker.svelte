<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { SearchIcon } from "@lucide/svelte";
  import { untrack } from "svelte";
  import VirtualList from "$lib/components/virtual-list.svelte";
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

  const OPTION_HEIGHT = 32;

  let open = $state(false);
  let highlightedAddress = $state<string | null>(null);
  let list = $state<{ scrollToIndex: (index: number) => void } | null>(null);

  // Values stream in about 30 times a second and the list doesn't show them, so it only
  // rebuilds when an address appears or goes away, and not at all while it's closed.
  const addresses = $derived(open ? Object.keys($parameters).join("\n") : "");

  const results = $derived.by(() => {
    if (!open) return [];
    addresses;
    const items = buildParameterList(
      untrack(() => $parameters),
      $schemaIndex,
      avatarOSC.getParameterType,
    ).filter((i) => !exclude.includes(i.address));
    // When the field already holds a full address, still list everything so you can switch.
    const query = value.startsWith("/") && items.some((i) => i.address === value) ? "" : value;
    if (!query.trim()) return sortParameters(items, "name", {});
    return items
      .map((item) => ({ item, score: scoreParameter(item, query) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  });

  // By address, so a new parameter arriving can't move the highlight onto a different row.
  const highlighted = $derived(Math.max(0, results.findIndex((i) => i.address === highlightedAddress)));

  // Opening shows the current selection rather than the top of the list.
  $effect(() => {
    list?.scrollToIndex(untrack(() => highlighted));
  });

  function pick(item: ParameterListItem) {
    value = item.address;
    open = false;
    onpick?.(item.address);
  }

  function moveHighlight(delta: number) {
    const next = Math.max(0, Math.min(highlighted + delta, results.length - 1));
    highlightedAddress = results[next]?.address ?? null;
    list?.scrollToIndex(next);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
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
      onfocus={() => {
        open = true;
        highlightedAddress = value;
      }}
      oninput={() => {
        open = true;
        highlightedAddress = null;
        list?.scrollToIndex(0);
      }}
      onblur={() => setTimeout(() => (open = false), 120)}
      {onkeydown}
    />
  </InputGroup.Root>
  {#if open && results.length}
    <!-- Keeping focus in the input is what lets the scrollbar be dragged without closing this. -->
    <div
      class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
      role="listbox"
      tabindex="-1"
      onmousedown={(e) => e.preventDefault()}
    >
      <VirtualList bind:this={list} items={results} height={OPTION_HEIGHT} key={(item) => item.address}>
        {#snippet row(item, i)}
          <button
            type="button"
            role="option"
            aria-selected={i === highlighted}
            class="flex h-full w-full items-center gap-2 rounded px-2 text-left text-sm {i ===
            highlighted
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'}"
            onmousedown={(e) => {
              e.preventDefault();
              pick(item);
            }}
            onmousemove={() => (highlightedAddress = item.address)}
          >
            <TypeBadge type={item.type} />
            <span class="truncate">{item.name}</span>
            {#if item.name !== item.short}
              <span class="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                {item.short}
              </span>
            {/if}
          </button>
        {/snippet}
      </VirtualList>
    </div>
  {/if}
</div>
