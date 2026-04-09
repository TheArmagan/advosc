<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    genericSourceHint,
    mediaFields,
    numberCalcModes,
    randomNumberTypes,
    textFormats,
    textPadSides,
    textTransformModes,
  } from "../../options";
  import SourceInput from "../SourceInput.svelte";
  import type {
    Block,
    HealthBarBlock,
    MediaBlock,
    MediaProgressBlock,
    NumberCalcBlock,
    NumberFormatBlock,
    ProgBarBlock,
    RandomBlock,
    StarRatingBlock,
    TextDefaultBlock,
    TextPadBlock,
    TextReplaceBlock,
    TextTransformBlock,
    TextTruncateBlock,
    ToggleBlock,
    UpdateBlock,
  } from "../../types";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";

  let { block, upd }: { block: Block; upd: UpdateBlock } = $props();

  function renderProgressPreview(
    length: string,
    fillChar: string,
    emptyChar: string,
    headChar: string,
    ratio: number,
  ) {
    const total = Math.max(2, Number(length || 10));
    const filled = Math.max(0, Math.min(total, Math.floor(total * ratio)));
    const empty = total - filled;
    return headChar && filled > 0 && filled < total
      ? fillChar.repeat(filled - 1) + headChar + emptyChar.repeat(empty)
      : fillChar.repeat(filled) + emptyChar.repeat(empty);
  }
</script>

{#if block.type === "media"}
  {@const current = block as MediaBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Show</Label>
      <Select.Root
        type="single"
        value={current.field}
        onValueChange={(v) => upd(current.id, { field: v ?? "Track" })}
      >
        <Select.Trigger class="w-full"
          >{mediaFields.find((item) => item.value === current.field)?.label ??
            current.field}</Select.Trigger
        >
        <Select.Content>
          {#each mediaFields as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="flex flex-col gap-0.5 justify-end">
      <Label class="text-xs text-muted-foreground">Visibility</Label>
      <div class="flex items-center gap-1.5 h-9">
        <Checkbox
          checked={current.ifPlaying}
          onCheckedChange={(v) => upd(current.id, { ifPlaying: Boolean(v) })}
        />
        <span class="text-sm">Only show when playing</span>
      </div>
    </div>
  </div>
  {#if current.ifPlaying}
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground"
        >Fallback text (shown when nothing plays)</Label
      >
      <Input
        placeholder="Nothing playing..."
        value={current.fallback}
        oninput={(e) =>
          upd(current.id, { fallback: (e.target as HTMLInputElement).value })}
      />
    </div>
  {/if}
{:else if block.type === "texttransform"}
  {@const current = block as TextTransformBlock}
  <SourceInput
    label="Source text"
    value={current.source}
    onChange={(value) => upd(current.id, { source: value })}
    showHint={true}
  />
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Transform</Label>
      <Select.Root
        type="single"
        value={current.mode}
        onValueChange={(v) => upd(current.id, { mode: v ?? "Upper" })}
      >
        <Select.Trigger class="w-52"
          >{textTransformModes.find((item) => item.value === current.mode)
            ?.label ?? current.mode}</Select.Trigger
        >
        <Select.Content>
          {#each textTransformModes as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if current.mode === "Format"}
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Style</Label>
        <Select.Root
          type="single"
          value={current.format}
          onValueChange={(v) => upd(current.id, { format: v ?? "Rounded" })}
        >
          <Select.Trigger class="w-44"
            >{textFormats.find((item) => item.value === current.format)
              ?.label ?? current.format}</Select.Trigger
          >
          <Select.Content>
            {#each textFormats.filter((item) => item.value) as item}
              <Select.Item value={item.value}>{item.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    {/if}
  </div>
{:else if block.type === "textreplace"}
  {@const current = block as TextReplaceBlock}
  <SourceInput
    label="Source text"
    value={current.source}
    onChange={(value) => upd(current.id, { source: value })}
    showHint={true}
  />
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-28">
      <Label class="text-xs text-muted-foreground">Search</Label>
      <Input
        value={current.search}
        oninput={(e) =>
          upd(current.id, { search: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 flex-1 min-w-28">
      <Label class="text-xs text-muted-foreground">Replace with</Label>
      <Input
        value={current.replace}
        oninput={(e) =>
          upd(current.id, { replace: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
{:else if block.type === "texttruncate"}
  {@const current = block as TextTruncateBlock}
  <SourceInput
    label="Source text"
    value={current.source}
    onChange={(value) => upd(current.id, { source: value })}
    showHint={true}
  />
  <div class="flex flex-col gap-0.5 w-24">
    <Label class="text-xs text-muted-foreground">Max length</Label>
    <Input
      type="number"
      min="1"
      max="200"
      value={current.length}
      oninput={(e) =>
        upd(current.id, { length: (e.target as HTMLInputElement).value })}
    />
  </div>
{:else if block.type === "textpad"}
  {@const current = block as TextPadBlock}
  <SourceInput
    label="Source text"
    value={current.source}
    onChange={(value) => upd(current.id, { source: value })}
    showHint={true}
  />
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Pad side</Label>
      <Select.Root
        type="single"
        value={current.side}
        onValueChange={(v) => upd(current.id, { side: v ?? "Left" })}
      >
        <Select.Trigger class="w-32"
          >{textPadSides.find((item) => item.value === current.side)?.label ??
            current.side}</Select.Trigger
        >
        <Select.Content>
          {#each textPadSides as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="flex flex-col gap-0.5 w-24">
      <Label class="text-xs text-muted-foreground">Target length</Label>
      <Input
        type="number"
        min="1"
        max="200"
        value={current.length}
        oninput={(e) =>
          upd(current.id, { length: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 w-24">
      <Label class="text-xs text-muted-foreground">Pad char</Label>
      <Input
        value={current.padChar}
        oninput={(e) =>
          upd(current.id, { padChar: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
{:else if block.type === "textdefault"}
  {@const current = block as TextDefaultBlock}
  <SourceInput
    label="Primary source"
    value={current.source}
    onChange={(value) => upd(current.id, { source: value })}
    showHint={true}
  />
  <div class="flex flex-col gap-0.5">
    <Label class="text-xs text-muted-foreground">Fallback text</Label>
    <Input
      value={current.fallback}
      oninput={(e) =>
        upd(current.id, { fallback: (e.target as HTMLInputElement).value })}
    />
  </div>
{:else if block.type === "mediaprog"}
  {@const current = block as MediaProgressBlock}
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Bar length</Label>
      <Input
        class="w-20"
        type="number"
        min="2"
        max="30"
        value={current.length}
        oninput={(e) =>
          upd(current.id, { length: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Filled char</Label>
      <Input
        class="w-16"
        value={current.fillChar}
        oninput={(e) =>
          upd(current.id, { fillChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Empty char</Label>
      <Input
        class="w-16"
        value={current.emptyChar}
        oninput={(e) =>
          upd(current.id, { emptyChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Head char</Label>
      <Input
        class="w-16"
        value={current.headChar}
        placeholder="▓"
        oninput={(e) =>
          upd(current.id, { headChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 flex-1">
      <Label class="text-xs text-muted-foreground">Preview (~60%)</Label>
      <div
        class="h-9 flex items-center px-1.5 bg-muted/50 rounded font-mono text-sm"
      >
        {renderProgressPreview(
          current.length,
          current.fillChar,
          current.emptyChar,
          current.headChar,
          0.6,
        )}
      </div>
    </div>
  </div>
{:else if block.type === "progbar"}
  {@const current = block as ProgBarBlock}
  <p class="text-xs text-muted-foreground">{genericSourceHint}</p>
  <div class="flex gap-1.5 flex-wrap">
    <SourceInput
      label="Current source"
      value={current.currentSrc}
      widthClass="flex-1 min-w-36"
      onChange={(value) => upd(current.id, { currentSrc: value })}
      showHint={true}
    />
    <SourceInput
      label="Total / max source"
      value={current.totalSrc}
      widthClass="flex-1 min-w-36"
      onChange={(value) => upd(current.id, { totalSrc: value })}
    />
  </div>
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Bar length</Label>
      <Input
        class="w-20"
        type="number"
        min="2"
        max="40"
        value={current.length}
        oninput={(e) =>
          upd(current.id, { length: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Filled</Label>
      <Input
        class="w-14"
        value={current.fillChar}
        oninput={(e) =>
          upd(current.id, { fillChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-1">
      <Label class="text-xs text-muted-foreground">Empty</Label>
      <Input
        class="w-14"
        value={current.emptyChar}
        oninput={(e) =>
          upd(current.id, { emptyChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-1">
      <Label class="text-xs text-muted-foreground">Head</Label>
      <Input
        class="w-14"
        value={current.headChar}
        placeholder="▓"
        oninput={(e) =>
          upd(current.id, { headChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 flex-1">
      <Label class="text-xs text-muted-foreground">Preview (50%)</Label>
      <div
        class="h-9 flex items-center px-1.5 bg-muted/50 rounded font-mono text-sm"
      >
        {renderProgressPreview(
          current.length,
          current.fillChar,
          current.emptyChar,
          current.headChar,
          0.5,
        )}
      </div>
    </div>
  </div>
{:else if block.type === "healthbar"}
  {@const current = block as HealthBarBlock}
  <p class="text-xs text-muted-foreground">{genericSourceHint}</p>
  <div class="flex gap-2 flex-wrap">
    <SourceInput
      label="Current source"
      value={current.currentSrc}
      widthClass="flex-1 min-w-36"
      onChange={(value) => upd(current.id, { currentSrc: value })}
      showHint={true}
    />
    <SourceInput
      label="Max source"
      value={current.totalSrc}
      widthClass="flex-1 min-w-36"
      onChange={(value) => upd(current.id, { totalSrc: value })}
    />
  </div>
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Filled</Label>
      <Input
        class="w-16"
        value={current.fillChar}
        oninput={(e) =>
          upd(current.id, { fillChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Empty</Label>
      <Input
        class="w-16"
        value={current.emptyChar}
        oninput={(e) =>
          upd(current.id, { emptyChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 flex-1">
      <Label class="text-xs text-muted-foreground">Preview</Label>
      <div
        class="h-9 flex items-center px-1.5 bg-muted/50 rounded font-mono text-sm"
      >
        {current.fillChar.repeat(3)}{current.emptyChar.repeat(2)}
      </div>
    </div>
  </div>
{:else if block.type === "starrating"}
  {@const current = block as StarRatingBlock}
  <p class="text-xs text-muted-foreground">
    Value and max both accept generic sources now.
  </p>
  <div class="flex gap-1.5 flex-wrap items-end">
    <SourceInput
      label="Value source"
      value={current.valueSrc}
      widthClass="flex-1 min-w-36"
      onChange={(value) => upd(current.id, { valueSrc: value })}
      showHint={true}
    />
    <SourceInput
      label="Max stars / max source"
      value={current.maxStars}
      widthClass="flex-1 min-w-28"
      onChange={(value) => upd(current.id, { maxStars: value })}
    />
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Filled</Label>
      <Input
        class="w-14"
        value={current.fillChar}
        oninput={(e) =>
          upd(current.id, { fillChar: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Empty</Label>
      <Input
        class="w-14"
        value={current.emptyChar}
        oninput={(e) =>
          upd(current.id, { emptyChar: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
  <div
    class="text-[11px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-1 rounded leading-tight"
  >
    Preview: {current.fillChar.repeat(3)}{current.emptyChar.repeat(2)}
  </div>
{:else if block.type === "toggle"}
  {@const current = block as ToggleBlock}
  <SourceInput
    label="Value source"
    value={current.valueSrc}
    onChange={(value) => upd(current.id, { valueSrc: value })}
    showHint={true}
  />
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-28">
      <Label class="text-xs text-muted-foreground">True text</Label>
      <Input
        value={current.trueText}
        oninput={(e) =>
          upd(current.id, { trueText: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5 flex-1 min-w-28">
      <Label class="text-xs text-muted-foreground">False text</Label>
      <Input
        value={current.falseText}
        oninput={(e) =>
          upd(current.id, { falseText: (e.target as HTMLInputElement).value })}
      />
    </div>
  </div>
{:else if block.type === "numberformat"}
  {@const current = block as NumberFormatBlock}
  <SourceInput
    label="Value source"
    value={current.valueSrc}
    onChange={(value) => upd(current.id, { valueSrc: value })}
    showHint={true}
  />
  <div class="flex gap-2 flex-wrap items-end">
    <div class="flex flex-col gap-1">
      <Label class="text-xs text-muted-foreground">Decimals</Label>
      <Input
        class="w-20"
        type="number"
        min="0"
        max="10"
        value={current.decimals}
        oninput={(e) =>
          upd(current.id, { decimals: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-1">
      <Label class="text-xs text-muted-foreground">Decimal separator</Label>
      <Input
        class="w-20"
        value={current.decimalSeparator}
        oninput={(e) =>
          upd(current.id, {
            decimalSeparator: (e.target as HTMLInputElement).value,
          })}
      />
    </div>
    <div class="flex flex-col gap-1">
      <Label class="text-xs text-muted-foreground">Thousands separator</Label>
      <Input
        class="w-20"
        value={current.thousandsSeparator}
        oninput={(e) =>
          upd(current.id, {
            thousandsSeparator: (e.target as HTMLInputElement).value,
          })}
      />
    </div>
  </div>
{:else if block.type === "numbercalc"}
  {@const current = block as NumberCalcBlock}
  <SourceInput
    label="Value source"
    value={current.source}
    onChange={(value) => upd(current.id, { source: value })}
    showHint={true}
  />
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Operation</Label>
      <Select.Root
        type="single"
        value={current.mode}
        onValueChange={(v) => upd(current.id, { mode: v ?? "Clamp" })}
      >
        <Select.Trigger class="w-56"
          >{numberCalcModes.find((item) => item.value === current.mode)
            ?.label ?? current.mode}</Select.Trigger
        >
        <Select.Content>
          {#each numberCalcModes as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if current.mode === "Clamp"}
      <SourceInput
        label="Min"
        value={current.min}
        widthClass="w-28"
        onChange={(value) => upd(current.id, { min: value })}
      />
      <SourceInput
        label="Max"
        value={current.max}
        widthClass="w-28"
        onChange={(value) => upd(current.id, { max: value })}
      />
    {:else if current.mode === "Map"}
      <SourceInput
        label="Input min"
        value={current.inMin}
        widthClass="w-24"
        onChange={(value) => upd(current.id, { inMin: value })}
      />
      <SourceInput
        label="Input max"
        value={current.inMax}
        widthClass="w-24"
        onChange={(value) => upd(current.id, { inMax: value })}
      />
      <SourceInput
        label="Output min"
        value={current.outMin}
        widthClass="w-24"
        onChange={(value) => upd(current.id, { outMin: value })}
      />
      <SourceInput
        label="Output max"
        value={current.outMax}
        widthClass="w-24"
        onChange={(value) => upd(current.id, { outMax: value })}
      />
    {/if}
  </div>
{:else if block.type === "random"}
  {@const current = block as RandomBlock}
  <div class="flex gap-1.5 flex-wrap items-end">
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Type</Label>
      <Select.Root
        type="single"
        value={current.numberType}
        onValueChange={(v) => upd(current.id, { numberType: v ?? "Int" })}
      >
        <Select.Trigger class="w-32"
          >{randomNumberTypes.find((item) => item.value === current.numberType)
            ?.label ?? current.numberType}</Select.Trigger
        >
        <Select.Content>
          {#each randomNumberTypes as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <SourceInput
      label="Min source"
      value={current.min}
      widthClass="w-28"
      onChange={(value) => upd(current.id, { min: value })}
      showHint={true}
    />
    <SourceInput
      label="Max source"
      value={current.max}
      widthClass="w-28"
      onChange={(value) => upd(current.id, { max: value })}
    />
  </div>
{/if}
