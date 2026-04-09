<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { PlusIcon, Trash2Icon } from "@lucide/svelte";
  import { marqueeDirections, textFormats, timePresets } from "../../options";
  import type {
    BlinkBlock,
    BounceBlock,
    Block,
    EachOneBlock,
    MarqueeBlock,
    TextBlock,
    TimeBlock,
    TypewriterBlock,
    UpdateBlock,
  } from "../../types";

  let { block, upd }: { block: Block; upd: UpdateBlock } = $props();
</script>

{#if block.type === "newline"}
  <p class="text-xs text-muted-foreground italic">
    Inserts a line break between the surrounding blocks.
  </p>
{:else if block.type === "text"}
  {@const current = block as TextBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Text</Label>
      <Input
        placeholder="Type something..."
        value={current.text}
        oninput={(e) =>
          upd(current.id, { text: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Style</Label>
      <Select.Root
        type="single"
        value={current.format}
        onValueChange={(v) => upd(current.id, { format: v ?? "" })}
      >
        <Select.Trigger class="w-44"
          >{textFormats.find((f) => f.value === current.format)?.label ??
            "No format"}</Select.Trigger
        >
        <Select.Content>
          {#each textFormats as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
{:else if block.type === "time"}
  {@const current = block as TimeBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Format</Label>
      <Select.Root
        type="single"
        value={current.preset}
        onValueChange={(v) => upd(current.id, { preset: v ?? "HH:mm" })}
      >
        <Select.Trigger class="w-full"
          >{timePresets.find((item) => item.value === current.preset)?.label ??
            current.preset}</Select.Trigger
        >
        <Select.Content>
          {#each timePresets as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if current.preset === "custom"}
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Custom pattern</Label>
        <Input
          class="w-44"
          placeholder="e.g. yyyy-MM-dd"
          value={current.customFormat}
          oninput={(e) =>
            upd(current.id, {
              customFormat: (e.target as HTMLInputElement).value,
            })}
        />
      </div>
    {/if}
  </div>
{:else if block.type === "marquee"}
  {@const current = block as MarqueeBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Text to scroll</Label>
      <Input
        placeholder="Text that will scroll across..."
        value={current.text}
        oninput={(e) =>
          upd(current.id, { text: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Direction</Label>
      <Select.Root
        type="single"
        value={current.direction}
        onValueChange={(v) => upd(current.id, { direction: v ?? "Left" })}
      >
        <Select.Trigger class="w-36"
          >{marqueeDirections.find((item) => item.value === current.direction)
            ?.label ?? current.direction}</Select.Trigger
        >
        <Select.Content>
          {#each marqueeDirections as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Visible chars</Label>
      <Input
        class="w-24"
        type="number"
        min="4"
        max="100"
        value={current.maxLength}
        oninput={(e) =>
          upd(current.id, { maxLength: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
  <p class="text-xs text-muted-foreground">
    Advances by 1 character every ~2.2 s.
  </p>
{:else if block.type === "bounce"}
  {@const current = block as BounceBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Text to bounce</Label>
      <Input
        placeholder="Text that moves back and forth..."
        value={current.text}
        oninput={(e) =>
          upd(current.id, { text: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Visible chars</Label>
      <Input
        class="w-24"
        type="number"
        min="2"
        max="100"
        value={current.maxLength}
        oninput={(e) =>
          upd(current.id, { maxLength: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
  <p class="text-xs text-muted-foreground">
    Ping-pongs text left and right every ~2.2 s.
  </p>
{:else if block.type === "typewriter"}
  {@const current = block as TypewriterBlock}
  <div class="flex flex-col gap-0.5">
    <Label class="text-xs text-muted-foreground">Text</Label>
    <Input
      placeholder="Text that reveals over time..."
      value={current.text}
      oninput={(e) =>
        upd(current.id, { text: (e.target as HTMLInputElement).value })}
    />
  </div>
  <p class="text-xs text-muted-foreground">
    Shows one more character on each chatbox refresh.
  </p>
{:else if block.type === "blink"}
  {@const current = block as BlinkBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Text A</Label>
      <Input
        value={current.textA}
        placeholder="Visible on step A"
        oninput={(e) =>
          upd(current.id, { textA: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Text B</Label>
      <Input
        value={current.textB}
        placeholder="Visible on step B"
        oninput={(e) =>
          upd(current.id, { textB: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
{:else if block.type === "eachone"}
  {@const current = block as EachOneBlock}
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground"
      >Texts to cycle through — one per row, changes every ~2.2 s</Label
    >
    {#each current.items as item, ii}
      <div class="flex gap-1 items-center">
        <span
          class="text-xs text-muted-foreground font-mono w-5 text-right shrink-0"
          >{ii + 1}.</span
        >
        <Input
          class="flex-1"
          placeholder={`Text ${ii + 1}`}
          value={item}
          oninput={(e) => {
            const next = [...current.items];
            next[ii] = (e.target as HTMLInputElement).value;
            upd(current.id, { items: next });
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          class="size-6.5 text-destructive shrink-0"
          onclick={() =>
            upd(current.id, {
              items: current.items.filter((_, index) => index !== ii),
            })}
          disabled={current.items.length <= 1}
        >
          <Trash2Icon class="size-3" />
        </Button>
      </div>
    {/each}
    <Button
      variant="outline"
      size="sm"
      class="w-fit h-8 px-2"
      onclick={() => upd(current.id, { items: [...current.items, ""] })}
    >
      <PlusIcon class="size-3.5" /> Add text
    </Button>
  </div>
{/if}
