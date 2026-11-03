<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { PlusIcon, Trash2Icon } from "@lucide/svelte";
  import {
    marqueeDirections,
    separatorPresets,
    textFormats,
    timeModes,
    timePresets,
  } from "../../options";
  import type { Block, UpdateBlock } from "../../types";
  import CheckField from "../fields/CheckField.svelte";
  import RichTextField from "../fields/RichTextField.svelte";
  import SelectField from "../fields/SelectField.svelte";
  import TextField from "../fields/TextField.svelte";

  let { block, upd }: { block: Block; upd: UpdateBlock } = $props();
</script>

{#if block.type === "newline"}
  <p class="text-xs text-muted-foreground">
    Everything after this goes on the next line. A line that ends up empty is left out.
  </p>
{:else if block.type === "separator"}
  {@const current = block}
  <div class="flex flex-wrap items-end gap-2">
    <TextField
      label="Separator"
      class="w-28"
      inputClass="font-mono"
      value={current.text}
      onChange={(text) => upd(current.id, { text })}
    />
    <div class="flex flex-wrap gap-1 pb-0.5">
      {#each separatorPresets as preset}
        <Button
          variant={current.text === preset ? "secondary" : "outline"}
          size="sm"
          class="h-8 min-w-9 px-2 font-mono"
          onclick={() => upd(current.id, { text: preset })}
        >
          {preset.trim() || "space"}
        </Button>
      {/each}
    </div>
  </div>
  <p class="text-xs text-muted-foreground">
    Shown only when there's something on both sides of it on this line.
  </p>
{:else if block.type === "text"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <RichTextField
      label="Text"
      class="min-w-48 flex-1"
      placeholder={"Type something, or {{ for a placeholder"}
      value={current.text}
      onChange={(text) => upd(current.id, { text })}
    />
    <SelectField
      label="Style"
      class="w-44"
      value={current.format}
      options={textFormats}
      onChange={(format) => upd(current.id, { format })}
    />
  </div>
{:else if block.type === "time"}
  {@const current = block}
  {@const mode = current.mode ?? "Now"}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Show"
      class="w-40"
      value={mode}
      options={timeModes}
      onChange={(value) => upd(current.id, { mode: value || "Now" })}
    />
    {#if mode === "Now"}
      <SelectField
        label="Format"
        class="w-48"
        value={current.preset}
        options={timePresets}
        onChange={(preset) => upd(current.id, { preset: preset || "HH:mm" })}
      />
      {#if current.preset === "custom"}
        <TextField
          label="Pattern"
          class="w-40"
          placeholder="yyyy-MM-dd HH:mm"
          value={current.customFormat}
          onChange={(customFormat) => upd(current.id, { customFormat })}
        />
      {/if}
      <TextField
        label="Time zone (optional)"
        class="min-w-40 flex-1"
        placeholder="e.g. Europe/Istanbul, America/New_York"
        value={current.timezone}
        onChange={(timezone) => upd(current.id, { timezone })}
      />
    {/if}
  </div>
  {#if mode === "Now" && current.preset === "custom"}
    <p class="text-xs text-muted-foreground">
      HH hours, mm minutes, ss seconds, a AM/PM, EEEE weekday, dd day, MM month, yyyy year.
    </p>
  {/if}
{:else if block.type === "marquee"}
  {@const current = block}
  <RichTextField
    label="Text to scroll"
    value={current.text}
    onChange={(text) => upd(current.id, { text })}
  />
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Direction"
      class="w-28"
      value={current.direction}
      options={marqueeDirections}
      onChange={(direction) => upd(current.id, { direction: direction || "Left" })}
    />
    <TextField
      label="Visible characters"
      class="w-32"
      type="number"
      min={4}
      max={144}
      value={current.maxLength}
      onChange={(maxLength) => upd(current.id, { maxLength })}
    />
    <TextField
      label="Characters per step"
      class="w-36"
      type="number"
      min={1}
      max={10}
      value={current.speed ?? "1"}
      onChange={(speed) => upd(current.id, { speed })}
    />
    <TextField
      label="Gap between loops"
      class="w-36"
      inputClass="font-mono"
      value={current.gap ?? ""}
      onChange={(gap) => upd(current.id, { gap })}
    />
  </div>
  <p class="text-xs text-muted-foreground">
    Moves every 2.2 seconds, VRChat's update rate. Text that already fits stays still.
  </p>
{:else if block.type === "bounce"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <RichTextField
      label="Text"
      class="min-w-48 flex-1"
      value={current.text}
      onChange={(text) => upd(current.id, { text })}
    />
    <TextField
      label="Visible characters"
      class="w-32"
      type="number"
      min={2}
      max={144}
      value={current.maxLength}
      onChange={(maxLength) => upd(current.id, { maxLength })}
    />
  </div>
{:else if block.type === "typewriter"}
  {@const current = block}
  <RichTextField label="Text" value={current.text} onChange={(text) => upd(current.id, { text })} />
  <p class="text-xs text-muted-foreground">
    Adds one character every 2.2 seconds, then starts over. Works best with short text.
  </p>
{:else if block.type === "blink"}
  {@const current = block}
  <div class="flex flex-wrap gap-2">
    <RichTextField
      label="First"
      class="min-w-40 flex-1"
      value={current.textA}
      onChange={(textA) => upd(current.id, { textA })}
    />
    <RichTextField
      label="Second"
      class="min-w-40 flex-1"
      value={current.textB}
      onChange={(textB) => upd(current.id, { textB })}
    />
  </div>
{:else if block.type === "eachone"}
  {@const current = block}
  {@const durations = current.durations ?? []}
  <div class="flex flex-col gap-1.5">
    {#each current.items as item, ii}
      <div class="flex items-center gap-1.5">
        <span class="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{ii + 1}</span>
        <RichTextField
          class="min-w-0 flex-1"
          placeholder={`Message ${ii + 1}`}
          value={item}
          onChange={(value) => {
            const next = [...current.items];
            next[ii] = value;
            upd(current.id, { items: next });
          }}
        />
        {#if current.timed}
          <Input
            class="w-16 shrink-0"
            type="number"
            min="1"
            max="30"
            title="Steps to show it for (2.2 s each)"
            aria-label="Steps to show it for"
            value={durations[ii] ?? "1"}
            oninput={(e) => {
              const next = current.items.map((_, i) => durations[i] ?? "1");
              next[ii] = (e.target as HTMLInputElement).value;
              upd(current.id, { durations: next });
            }}
          />
        {/if}
        <Button
          variant="ghost"
          size="icon"
          class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove message"
          onclick={() =>
            upd(current.id, {
              items: current.items.filter((_, index) => index !== ii),
              durations: durations.filter((_, index) => index !== ii),
            })}
          disabled={current.items.length <= 1}
        >
          <Trash2Icon class="size-3.5" />
        </Button>
      </div>
    {/each}
    <div class="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        class="h-8 w-fit px-2"
        onclick={() =>
          upd(current.id, {
            items: [...current.items, ""],
            durations: [...current.items.map((_, i) => durations[i] ?? "1"), "1"],
          })}
      >
        <PlusIcon class="size-3.5" /> Add message
      </Button>
      <CheckField
        label="Set how long each one shows"
        checked={current.timed}
        onChange={(timed) => upd(current.id, { timed })}
      />
    </div>
    <p class="text-xs text-muted-foreground">
      {current.timed
        ? "The number is how many 2.2 second steps each message stays."
        : "Each message shows for 2.2 seconds."}
    </p>
  </div>
{/if}
