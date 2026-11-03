<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { cn } from "$lib/utils";
  import { SearchIcon, XIcon } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { menuGroups, meta } from "../registry";
  import { recipes, type Recipe } from "../recipes";
  import type { BlockType } from "../types";

  let {
    onAdd,
    onRecipe,
    onClose,
    title = "Add a block",
    initialTab = "blocks",
  }: {
    onAdd: (type: BlockType) => void;
    onRecipe: (recipe: Recipe) => void;
    onClose?: () => void;
    title?: string;
    initialTab?: "blocks" | "recipes";
  } = $props();

  let tab = $state<"blocks" | "recipes">(initialTab);
  let query = $state("");
  let group = $state<string | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);

  onMount(() => searchInput?.focus());

  function matches(type: BlockType, q: string) {
    const info = meta[type];
    return `${info.label} ${info.desc} ${info.keywords ?? ""} ${type}`.toLowerCase().includes(q);
  }

  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return menuGroups
      .filter((g) => q || !group || g.label === group)
      .map((g) => ({ ...g, keys: q ? g.keys.filter((key) => matches(key, q)) : g.keys }))
      .filter((g) => g.keys.length > 0);
  });

  const shownRecipes = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? recipes.filter((r) => `${r.label} ${r.desc}`.toLowerCase().includes(q)) : recipes;
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && onClose) {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      if (tab === "blocks" && groups[0]?.keys[0]) onAdd(groups[0].keys[0]);
      else if (tab === "recipes" && shownRecipes[0]) onRecipe(shownRecipes[0]);
    }
  }
</script>

<div class="flex flex-col gap-2.5 rounded-lg border bg-card p-3 shadow-sm">
  <div class="flex items-center gap-2">
    <h3 class="text-sm font-semibold">{title}</h3>
    <div class="ml-1 flex rounded-md bg-muted p-0.5 text-xs">
      {#each [["blocks", "Blocks"], ["recipes", "Recipes"]] as [key, label]}
        <button
          type="button"
          class={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            tab === key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
          onclick={() => (tab = key as "blocks" | "recipes")}
        >
          {label}
        </button>
      {/each}
    </div>
    <div class="relative ml-auto w-56 max-w-full">
      <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        bind:ref={searchInput}
        class="h-8 pl-8"
        placeholder={tab === "blocks" ? "Search blocks" : "Search recipes"}
        bind:value={query}
        {onkeydown}
      />
    </div>
    {#if onClose}
      <Button variant="ghost" size="icon" class="size-8 shrink-0" aria-label="Close" onclick={onClose}>
        <XIcon class="size-4" />
      </Button>
    {/if}
  </div>

  {#if tab === "blocks"}
    {#if !query.trim()}
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class={cn(
            "rounded-full border px-2.5 py-0.5 text-xs",
            group === null ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onclick={() => (group = null)}>All</button
        >
        {#each menuGroups as g}
          <button
            type="button"
            class={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              group === g.label
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onclick={() => (group = group === g.label ? null : g.label)}>{g.label}</button
          >
        {/each}
      </div>
    {/if}

    <div class="flex max-h-[min(60vh,28rem)] flex-col gap-3 overflow-y-auto pr-1">
      {#each groups as g (g.label)}
        <section class="flex flex-col gap-1.5">
          <h4 class="text-xs font-medium text-muted-foreground">{g.label}</h4>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-1.5">
            {#each g.keys as key (key)}
              {@const info = meta[key]}
              {@const Icon = info.icon}
              <button
                type="button"
                class="flex items-start gap-2 rounded-md border bg-background p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                onclick={() => onAdd(key)}
              >
                <span class={cn("flex size-7 shrink-0 items-center justify-center rounded-md", info.color)}>
                  <Icon class="size-4" />
                </span>
                <span class="min-w-0">
                  <span class="block text-[13px] leading-tight font-medium">{info.label}</span>
                  <span class="block text-[11px] leading-snug text-muted-foreground">{info.desc}</span>
                </span>
              </button>
            {/each}
          </div>
        </section>
      {:else}
        <p class="py-6 text-center text-sm text-muted-foreground">No block matches "{query}".</p>
      {/each}
    </div>
  {:else}
    <div class="grid max-h-[min(60vh,28rem)] grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 overflow-y-auto pr-1">
      {#each shownRecipes as recipe (recipe.id)}
        {@const Icon = recipe.icon}
        <button
          type="button"
          class="flex flex-col gap-2 rounded-md border bg-background p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          onclick={() => onRecipe(recipe)}
        >
          <span class="flex items-center gap-2">
            <Icon class="size-4 text-muted-foreground" />
            <span class="text-[13px] font-medium">{recipe.label}</span>
          </span>
          <span class="rounded-md bg-zinc-900 px-2 py-1.5 text-center font-mono text-[11px] leading-snug whitespace-pre-wrap text-zinc-100">{recipe.sample}</span>
          <span class="text-[11px] leading-snug text-muted-foreground">{recipe.desc}</span>
        </button>
      {:else}
        <p class="py-6 text-center text-sm text-muted-foreground">No recipe matches "{query}".</p>
      {/each}
    </div>
    <p class="text-[11px] text-muted-foreground">A recipe adds normal blocks, so you can change them however you like.</p>
  {/if}
</div>
