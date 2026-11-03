<script lang="ts">
  import { ChevronRightIcon } from "@lucide/svelte";
  import { textFormats } from "../options";
  import type { Block, BlockOutput, UpdateBlock } from "../types";
  import RichTextField from "./fields/RichTextField.svelte";
  import SelectField from "./fields/SelectField.svelte";
  import TextField from "./fields/TextField.svelte";

  let { block, upd }: { block: Block; upd: UpdateBlock } = $props();

  let open = $state(false);

  const output = $derived(block.output ?? {});
  const summary = $derived(
    [
      output.prefix || output.suffix ? "prefix/suffix" : "",
      output.fallback ? "fallback" : "",
      output.maxLength ? `max ${output.maxLength}` : "",
      output.style ? (textFormats.find((f) => f.value === output.style)?.label ?? output.style) : "",
    ].filter(Boolean),
  );

  function set(patch: Partial<BlockOutput>) {
    upd(block.id, { output: { ...output, ...patch } });
  }
</script>

<div class="rounded-md border border-dashed">
  <button
    type="button"
    class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <ChevronRightIcon class="size-3.5 transition-transform {open ? 'rotate-90' : ''}" />
    <span class="font-medium">Output</span>
    {#if summary.length && !open}
      <span class="truncate">{summary.join(", ")}</span>
    {:else if !open}
      <span class="truncate opacity-70">prefix, suffix, fallback, length, style</span>
    {/if}
  </button>
  {#if open}
    <div class="flex flex-col gap-2 px-2 pb-2">
      <div class="flex flex-wrap gap-2">
        <RichTextField
          label="Before it"
          class="min-w-32 flex-1"
          placeholder="e.g. 🎵 or CPU "
          value={output.prefix}
          onChange={(prefix) => set({ prefix })}
        />
        <RichTextField
          label="After it"
          class="min-w-32 flex-1"
          placeholder="e.g.  BPM"
          value={output.suffix}
          onChange={(suffix) => set({ suffix })}
        />
      </div>
      <div class="flex flex-wrap items-start gap-2">
        <RichTextField
          label="When it's empty, show"
          class="min-w-40 flex-1"
          placeholder="nothing"
          value={output.fallback}
          onChange={(fallback) => set({ fallback })}
        />
        <TextField
          label="Max length"
          class="w-24"
          type="number"
          min={1}
          max={144}
          placeholder="none"
          value={output.maxLength}
          onChange={(maxLength) => set({ maxLength })}
        />
        <SelectField
          label="Style"
          class="w-44"
          value={output.style ?? ""}
          options={textFormats}
          onChange={(style) => set({ style })}
        />
      </div>
      <div class="flex flex-wrap items-start gap-2">
        <TextField
          label="Block name (only shown here)"
          class="min-w-40 flex-1"
          placeholder="e.g. Song title"
          value={block.label}
          onChange={(label) => upd(block.id, { label })}
        />
      </div>
      <p class="text-[11px] text-muted-foreground">
        Before and after only show when the block has a value, so labels never hang around on
        their own.
      </p>
    </div>
  {/if}
</div>
