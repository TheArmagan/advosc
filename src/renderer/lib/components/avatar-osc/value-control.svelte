<script lang="ts">
  import type { AvatarParameterType } from "$lib/api/vrc-osc";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { MinusIcon, PlusIcon } from "@lucide/svelte";

  // Shows the live value until you start editing, then keeps your draft
  // until you send it or click away.
  let {
    type,
    value,
    disabled = false,
    onsend,
  }: {
    type: AvatarParameterType;
    value: number | undefined;
    disabled?: boolean;
    onsend: (value: number) => void;
  } = $props();

  const SLIDER_SEND_INTERVAL_MS = 40;

  let editing = $state(false);
  let dragging = $state(false);
  let draft = $state("");
  let sliderValue = $state(0);
  let lastSliderSend = 0;

  $effect(() => {
    const live = value ?? 0;
    if (!editing) draft = type === "Float" ? String(Number(live.toFixed(4))) : String(Math.round(live));
    if (!dragging) sliderValue = live;
  });

  // Floats are usually 0..1, but puppets and some menus use -1..1.
  const sliderMin = $derived((value ?? 0) < 0 ? -1 : 0);

  let cancelled = false;

  function commitDraft() {
    const parsed = Number(draft);
    editing = false;
    if (cancelled) {
      cancelled = false;
      return;
    }
    if (draft.trim() === "" || !Number.isFinite(parsed)) return;
    onsend(parsed);
  }

  function onDraftKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      cancelled = true;
      input.blur();
    }
  }

  function step(delta: number) {
    onsend(Math.round(value ?? 0) + delta);
  }
</script>

{#if type === "Bool"}
  <div class="inline-flex rounded-md border p-0.5">
    <Button
      size="sm"
      variant={value ? "ghost" : "secondary"}
      class="h-7 px-3"
      {disabled}
      onclick={() => onsend(0)}>Off</Button
    >
    <Button
      size="sm"
      variant={value ? "default" : "ghost"}
      class="h-7 px-3"
      {disabled}
      onclick={() => onsend(1)}>On</Button
    >
  </div>
{:else if type === "Int"}
  <InputGroup.Root class="w-36">
    <InputGroup.Addon align="inline-start">
      <InputGroup.Button size="icon-xs" {disabled} onclick={() => step(-1)} aria-label="Decrease">
        <MinusIcon />
      </InputGroup.Button>
    </InputGroup.Addon>
    <InputGroup.Input
      type="number"
      step="1"
      class="text-center font-mono text-xs"
      {disabled}
      bind:value={draft}
      onfocus={() => (editing = true)}
      onblur={commitDraft}
      onkeydown={onDraftKeydown}
    />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button size="icon-xs" {disabled} onclick={() => step(1)} aria-label="Increase">
        <PlusIcon />
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>
{:else}
  <div class="flex items-center gap-2">
    <div
      class="w-32"
      onpointerdown={() => (dragging = true)}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      role="presentation"
    >
      <Slider
        type="single"
        min={sliderMin}
        max={1}
        step={0.01}
        {disabled}
        value={sliderValue}
        onValueChange={(v) => {
          sliderValue = v as number;
          const now = performance.now();
          if (now - lastSliderSend < SLIDER_SEND_INTERVAL_MS) return;
          lastSliderSend = now;
          onsend(sliderValue);
        }}
        onValueCommit={(v) => {
          dragging = false;
          onsend(v as number);
        }}
      />
    </div>
    <InputGroup.Root class="w-20">
      <InputGroup.Input
        type="number"
        step="0.01"
        class="text-center font-mono text-xs"
        {disabled}
        bind:value={draft}
        onfocus={() => (editing = true)}
        onblur={commitDraft}
        onkeydown={onDraftKeydown}
      />
    </InputGroup.Root>
  </div>
{/if}
