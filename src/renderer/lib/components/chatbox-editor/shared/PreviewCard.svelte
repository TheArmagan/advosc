<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { cn } from "$lib/utils";
  import { CheckIcon, CodeIcon, CopyIcon, SendIcon, XIcon } from "@lucide/svelte";

  /** VRChat cuts the chatbox here. The engine sends the same limit. */
  const LIMIT = 144;

  let {
    rendered,
    template,
    overwrite,
    overwriteActive,
    onOverwrite,
    onOverwriteReset,
    onOverwriteBlur,
  }: {
    rendered: string;
    /** The generated template, for the "Show template" toggle. Leave out to hide it. */
    template?: string;
    overwrite: string;
    overwriteActive: boolean;
    onOverwrite: (value: string) => void;
    onOverwriteReset: () => void;
    onOverwriteBlur: () => void;
  } = $props();

  let showTemplate = $state(false);
  let copied = $state(false);

  const length = $derived(rendered.length);
  const lines = $derived(rendered ? rendered.split("\n").length : 0);
  const level = $derived(length > LIMIT ? "over" : length > LIMIT - 20 ? "near" : "ok");

  async function copy() {
    try {
      await navigator.clipboard.writeText(template ?? "");
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<div class="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm">
  <div class="flex items-center gap-2">
    <h3 class="text-sm font-semibold">Preview</h3>
    {#if overwriteActive}
      <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
        one-off message
      </span>
    {/if}
    <span
      class={cn(
        "ml-auto font-mono text-xs tabular-nums",
        level === "over" && "font-semibold text-destructive",
        level === "near" && "text-amber-600 dark:text-amber-400",
        level === "ok" && "text-muted-foreground",
      )}
      title="Characters VRChat shows"
    >
      {length} / {LIMIT}
    </span>
  </div>

  <!-- Roughly how VRChat draws it: a dark bubble, centered lines. -->
  <div class="flex min-h-20 items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 shadow-inner">
    {#if rendered}
      <p class="max-w-[28ch] text-center text-[15px] leading-snug break-words whitespace-pre-wrap text-zinc-50">
        {rendered.slice(0, LIMIT)}{#if length > LIMIT}<span class="text-zinc-500">...</span>{/if}
      </p>
    {:else}
      <p class="text-center text-sm text-zinc-400">Nothing to send yet. Add a block, or wait for its data.</p>
    {/if}
  </div>

  {#if level === "over"}
    <p class="text-xs text-destructive">
      That's {length - LIMIT} characters over. VRChat cuts the rest, so shorten it or set a max length on a block.
    </p>
  {:else if lines > 9}
    <p class="text-xs text-amber-600 dark:text-amber-400">VRChat only shows the first 9 lines.</p>
  {/if}

  <div class="flex flex-col gap-1">
    <label for="se-overwrite" class="text-xs text-muted-foreground">
      Send a one-off message instead (goes back after 30 seconds)
    </label>
    <div class="flex gap-1.5">
      <div class="relative min-w-0 flex-1">
        <SendIcon class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="se-overwrite"
          class="pl-8"
          placeholder="brb, getting water"
          value={overwrite}
          oninput={(e) => onOverwrite((e.target as HTMLInputElement).value)}
          onblur={onOverwriteBlur}
        />
      </div>
      {#if overwriteActive}
        <Button variant="outline" size="icon" aria-label="Stop the one-off message" onclick={onOverwriteReset}>
          <XIcon class="size-4" />
        </Button>
      {/if}
    </div>
  </div>

  {#if template !== undefined}
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={() => (showTemplate = !showTemplate)}>
        <CodeIcon class="size-3.5" />
        {showTemplate ? "Hide template" : "Show template"}
      </Button>
      {#if showTemplate}
        <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={copy} disabled={!template}>
          {#if copied}<CheckIcon class="size-3.5" /> Copied{:else}<CopyIcon class="size-3.5" /> Copy{/if}
        </Button>
      {/if}
    </div>
    {#if showTemplate}
      <pre
        class="max-h-56 overflow-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-snug break-all whitespace-pre-wrap text-muted-foreground">{template ||
          "(empty)"}</pre>
      <p class="text-[11px] text-muted-foreground">
        It uses hidden shortcuts named __SE_..., so pasted into the advanced editor it only works
        while these blocks exist.
      </p>
    {/if}
  </div>
  {/if}
</div>
