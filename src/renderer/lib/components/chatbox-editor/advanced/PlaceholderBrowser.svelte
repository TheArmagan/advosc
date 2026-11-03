<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { LOVENSE_MODULE_ID } from "$lib/api/toys";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { livePreview } from "$lib/components/value-picker/live-preview.svelte";
  import { cn } from "$lib/utils";
  import type { ChatboxPlaceholder } from "$shared/template-syntax";
  import { ChevronRightIcon, SearchIcon, XIcon } from "@lucide/svelte";
  import { canPreview, innerSnippet, outerSnippet, plainText } from "./placeholder-snippets";

  let {
    onInsert,
    class: className,
  }: {
    /** `snippet` uses Monaco tabstops, so the arguments can be tabbed through. */
    onInsert: (snippet: string) => void;
    class?: string;
  } = $props();

  const placeholders = chatbox.placeholders;

  let query = $state("");
  let open = $state<Record<string, boolean>>({});
  let selected = $state<ChatboxPlaceholder | null>(null);
  let detail = $state<HTMLDivElement | null>(null);

  function keyOf(placeholder: ChatboxPlaceholder) {
    return placeholder.params.join(";");
  }

  /** Grouped by module, in the order the Modules page lists them. */
  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const byModule = new Map<string, ChatboxPlaceholder[]>();
    for (const placeholder of $placeholders) {
      const id = placeholder.params[0];
      if (id === LOVENSE_MODULE_ID && !toyStatus.enabled) continue;
      if (q) {
        const name = chatbox.modules.get(id)?.options.name ?? id;
        const haystack = `${keyOf(placeholder)} ${placeholder.description} ${name}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      if (!byModule.has(id)) byModule.set(id, []);
      byModule.get(id)!.push(placeholder);
    }
    return [...byModule].map(([id, items]) => ({
      id,
      name: chatbox.modules.get(id)?.options.name ?? id,
      items,
    }));
  });

  const total = $derived(groups.reduce((sum, g) => sum + g.items.length, 0));

  const live = livePreview({
    template: () => (selected && canPreview(selected) ? plainText(outerSnippet(selected)) : ""),
    enabled: () => !!selected && canPreview(selected),
    element: () => detail,
  });
</script>

<div class={cn("flex min-h-0 flex-col rounded-lg border bg-card shadow-sm", className)}>
  <div class="flex flex-col gap-2 border-b p-3">
    <div class="flex items-baseline gap-2">
      <h3 class="text-sm font-semibold">Placeholders</h3>
      <span class="text-xs text-muted-foreground">{total}</span>
    </div>
    <div class="relative">
      <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input class="h-8 pr-8 pl-8" placeholder="Search, like track or cpu" bind:value={query} />
      {#if query}
        <button
          type="button"
          class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          onclick={() => (query = "")}
        >
          <XIcon class="size-3.5" />
        </button>
      {/if}
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
    {#each groups as group (group.id)}
      {@const expanded = !!query.trim() || !!open[group.id]}
      <section>
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[13px] font-medium hover:bg-accent/50"
          aria-expanded={expanded}
          onclick={() => (open[group.id] = !open[group.id])}
        >
          <ChevronRightIcon class={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
          <span class="truncate">{group.name}</span>
          <span class="ml-auto text-[11px] font-normal text-muted-foreground">{group.items.length}</span>
        </button>
        {#if expanded}
          <ul class="mb-1 flex flex-col">
            {#each group.items as placeholder (keyOf(placeholder))}
              {@const isSelected = selected !== null && keyOf(selected) === keyOf(placeholder)}
              <li>
                <button
                  type="button"
                  class={cn(
                    "flex w-full flex-col gap-0.5 rounded py-1 pr-1.5 pl-6 text-left",
                    isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
                  )}
                  onclick={() => (selected = isSelected ? null : placeholder)}
                  ondblclick={() => onInsert(outerSnippet(placeholder))}
                  title="Double click to insert"
                >
                  <span class="truncate font-mono text-xs text-amber-600 dark:text-amber-400">
                    {placeholder.params.slice(1).join(";") || placeholder.params[0]}
                  </span>
                  <span class="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {placeholder.description}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <p class="px-2 py-6 text-center text-sm text-muted-foreground">
        {query ? `Nothing matches "${query}".` : "Loading placeholders..."}
      </p>
    {/each}
  </div>

  {#if selected}
    {@const outer = outerSnippet(selected)}
    {@const inner = innerSnippet(selected)}
    <div bind:this={detail} class="flex flex-col gap-2 border-t p-3">
      <p class="font-mono text-xs break-all">{plainText(outer)}</p>
      <p class="text-xs leading-snug text-muted-foreground">{selected.description}</p>
      <div class="flex items-baseline gap-2 text-xs">
        <span class="shrink-0 text-muted-foreground">{canPreview(selected) ? "Right now" : "Looks like"}</span>
        <span class="min-w-0 truncate font-mono" title={live.text ?? selected.value}>
          {#if canPreview(selected) && live.text !== null}
            {live.text || "(empty)"}
          {:else}
            {selected.value || "(empty)"}
          {/if}
        </span>
      </div>
      <div class="flex gap-1.5">
        <Button size="sm" class="h-8 flex-1 font-mono text-xs" onclick={() => onInsert(outer)}>
          Insert {"{{ }}"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-8 flex-1 font-mono text-xs"
          title="Inner form, for use inside another placeholder"
          onclick={() => onInsert(inner)}
        >
          Insert [[ ]]
        </Button>
      </div>
    </div>
  {/if}
</div>
