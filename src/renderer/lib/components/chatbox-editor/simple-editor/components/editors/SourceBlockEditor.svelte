<script lang="ts">
  import {
    mediaFields,
    numberCalcModes,
    randomNumberTypes,
    textFormats,
    textPadSides,
    textTransformModes,
  } from "../../options";
  import type { Block, UpdateBlock } from "../../types";
  import SourceInput from "../SourceInput.svelte";
  import CheckField from "../fields/CheckField.svelte";
  import Field from "../fields/Field.svelte";
  import RichTextField from "../fields/RichTextField.svelte";
  import SelectField from "../fields/SelectField.svelte";
  import TextField from "../fields/TextField.svelte";

  let { block, upd }: { block: Block; upd: UpdateBlock } = $props();

  function bar(length: string, fill: string, empty: string, head: string, ratio: number) {
    const total = Math.min(40, Math.max(1, Number(length) || 10));
    const filled = Math.round(total * ratio);
    return head && filled > 0 && filled < total
      ? fill.repeat(filled - 1) + head + empty.repeat(total - filled)
      : fill.repeat(filled) + empty.repeat(total - filled);
  }
</script>

{#snippet barChars(current: { fillChar: string; emptyChar: string; headChar?: string; id: string }, withHead: boolean)}
  <TextField
    label="Filled"
    class="w-16"
    inputClass="text-center"
    value={current.fillChar}
    onChange={(fillChar) => upd(current.id, { fillChar })}
  />
  <TextField
    label="Empty"
    class="w-16"
    inputClass="text-center"
    value={current.emptyChar}
    onChange={(emptyChar) => upd(current.id, { emptyChar })}
  />
  {#if withHead}
    <TextField
      label="Tip"
      class="w-16"
      inputClass="text-center"
      placeholder="none"
      value={current.headChar}
      onChange={(headChar) => upd(current.id, { headChar })}
    />
  {/if}
{/snippet}

{#snippet sample(text: string)}
  <Field label="Looks like" class="min-w-32 flex-1">
    <div class="flex h-9 items-center overflow-hidden rounded-md bg-muted/60 px-2 font-mono text-sm whitespace-pre">
      {text}
    </div>
  </Field>
{/snippet}

{#if block.type === "media"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Show"
      class="w-56"
      value={current.field}
      options={mediaFields}
      onChange={(field) => upd(current.id, { field: field || "Track" })}
    />
    <div class="pt-5">
      <CheckField
        label="Only while something plays"
        checked={current.ifPlaying}
        onChange={(ifPlaying) => upd(current.id, { ifPlaying })}
      />
    </div>
  </div>
  {#if current.ifPlaying}
    <RichTextField
      label="Otherwise show (leave empty to show nothing)"
      placeholder="Nothing playing"
      value={current.fallback}
      onChange={(fallback) => upd(current.id, { fallback })}
    />
  {/if}
{:else if block.type === "mediaprog"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Length"
      class="w-20"
      type="number"
      min={2}
      max={40}
      value={current.length}
      onChange={(length) => upd(current.id, { length })}
    />
    {@render barChars(current, true)}
    {@render sample(bar(current.length, current.fillChar, current.emptyChar, current.headChar, 0.6))}
  </div>
{:else if block.type === "texttransform"}
  {@const current = block}
  <SourceInput
    label="Value"
    value={current.source}
    onChange={(source) => upd(current.id, { source })}
    showHint
  />
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Transform"
      class="w-52"
      value={current.mode}
      options={textTransformModes}
      onChange={(mode) => upd(current.id, { mode: mode || "Upper" })}
    />
    {#if current.mode === "Format"}
      <SelectField
        label="Style"
        class="w-44"
        value={current.format}
        options={textFormats.filter((item) => item.value)}
        onChange={(format) => upd(current.id, { format })}
      />
    {:else if current.mode === "Repeat"}
      <TextField
        label="Times"
        class="w-20"
        type="number"
        min={1}
        max={50}
        value={current.count ?? "2"}
        onChange={(count) => upd(current.id, { count })}
      />
    {:else if current.mode === "Slice"}
      <TextField
        label="From character"
        class="w-32"
        type="number"
        value={current.start ?? "0"}
        onChange={(start) => upd(current.id, { start })}
      />
      <TextField
        label="To character (optional)"
        class="w-40"
        type="number"
        placeholder="end"
        value={current.end ?? ""}
        onChange={(end) => upd(current.id, { end })}
      />
    {/if}
  </div>
  {#if current.mode === "Slice"}
    <p class="text-xs text-muted-foreground">Counting starts at 0. A negative number counts from the end.</p>
  {/if}
{:else if block.type === "textreplace"}
  {@const current = block}
  <SourceInput label="Value" value={current.source} onChange={(source) => upd(current.id, { source })} showHint />
  <div class="flex flex-wrap gap-2">
    <TextField
      label="Find"
      class="min-w-32 flex-1"
      value={current.search}
      onChange={(search) => upd(current.id, { search })}
    />
    <RichTextField
      label="Replace with"
      class="min-w-32 flex-1"
      placeholder="nothing"
      value={current.replace}
      onChange={(replace) => upd(current.id, { replace })}
    />
  </div>
{:else if block.type === "texttruncate"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <SourceInput
      label="Value"
      widthClass="min-w-48 flex-1"
      value={current.source}
      onChange={(source) => upd(current.id, { source })}
      showHint
    />
    <TextField
      label="Max length"
      class="w-24"
      type="number"
      min={1}
      max={144}
      value={current.length}
      onChange={(length) => upd(current.id, { length })}
    />
  </div>
  <p class="text-xs text-muted-foreground">Longer text is cut and gets "..." at the end.</p>
{:else if block.type === "textpad"}
  {@const current = block}
  <SourceInput label="Value" value={current.source} onChange={(source) => upd(current.id, { source })} showHint />
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Pad on"
      class="w-28"
      value={current.side}
      options={textPadSides}
      onChange={(side) => upd(current.id, { side: side || "Left" })}
    />
    <TextField
      label="Width"
      class="w-20"
      type="number"
      min={1}
      max={144}
      value={current.length}
      onChange={(length) => upd(current.id, { length })}
    />
    <TextField
      label="With"
      class="w-16"
      inputClass="text-center font-mono"
      placeholder="space"
      value={current.padChar}
      onChange={(padChar) => upd(current.id, { padChar })}
    />
  </div>
  <p class="text-xs text-muted-foreground">Keeps a changing number from making the line jump around.</p>
{:else if block.type === "textdefault"}
  {@const current = block}
  <SourceInput label="Value" value={current.source} onChange={(source) => upd(current.id, { source })} showHint />
  <RichTextField
    label="When it's empty, show"
    value={current.fallback}
    onChange={(fallback) => upd(current.id, { fallback })}
  />
{:else if block.type === "progbar"}
  {@const current = block}
  <div class="flex flex-wrap gap-2">
    <SourceInput
      label="Value"
      widthClass="min-w-40 flex-1"
      value={current.currentSrc}
      onChange={(currentSrc) => upd(current.id, { currentSrc })}
      showHint
    />
    <SourceInput
      label="Full at"
      widthClass="w-36"
      value={current.totalSrc}
      onChange={(totalSrc) => upd(current.id, { totalSrc })}
    />
  </div>
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Length"
      class="w-20"
      type="number"
      min={2}
      max={40}
      value={current.length}
      onChange={(length) => upd(current.id, { length })}
    />
    {@render barChars(current, true)}
    {@render sample(bar(current.length, current.fillChar, current.emptyChar, current.headChar, 0.5))}
  </div>
  <p class="text-xs text-muted-foreground">Avatar floats go from 0 to 1, so "Full at" is 1 for them.</p>
{:else if block.type === "healthbar"}
  {@const current = block}
  <div class="flex flex-wrap gap-2">
    <SourceInput
      label="Value"
      widthClass="min-w-40 flex-1"
      value={current.currentSrc}
      onChange={(currentSrc) => upd(current.id, { currentSrc })}
      showHint
    />
    <SourceInput
      label="Max"
      widthClass="w-36"
      value={current.totalSrc}
      onChange={(totalSrc) => upd(current.id, { totalSrc })}
    />
  </div>
  <div class="flex flex-wrap items-start gap-2">
    {@render barChars(current, false)}
    {@render sample(current.fillChar.repeat(3) + current.emptyChar.repeat(2))}
  </div>
  <p class="text-xs text-muted-foreground">One symbol per point of max, up to 20 symbols.</p>
{:else if block.type === "starrating"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <SourceInput
      label="Value"
      widthClass="min-w-40 flex-1"
      value={current.valueSrc}
      onChange={(valueSrc) => upd(current.id, { valueSrc })}
      showHint
    />
    <SourceInput
      label="Stars"
      widthClass="w-24"
      value={current.maxStars}
      onChange={(maxStars) => upd(current.id, { maxStars })}
    />
  </div>
  <div class="flex flex-wrap items-start gap-2">
    {@render barChars(current, false)}
    {@render sample(current.fillChar.repeat(3) + current.emptyChar.repeat(2))}
  </div>
{:else if block.type === "toggle"}
  {@const current = block}
  <SourceInput label="Value" value={current.valueSrc} onChange={(valueSrc) => upd(current.id, { valueSrc })} showHint />
  <div class="flex flex-wrap gap-2">
    <RichTextField
      label="When true"
      class="min-w-32 flex-1"
      value={current.trueText}
      onChange={(trueText) => upd(current.id, { trueText })}
    />
    <RichTextField
      label="When false"
      class="min-w-32 flex-1"
      placeholder="nothing"
      value={current.falseText}
      onChange={(falseText) => upd(current.id, { falseText })}
    />
  </div>
  <p class="text-xs text-muted-foreground">False is empty, 0 or false. Anything else counts as true.</p>
{:else if block.type === "numberformat"}
  {@const current = block}
  <SourceInput label="Value" value={current.valueSrc} onChange={(valueSrc) => upd(current.id, { valueSrc })} showHint />
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Decimals"
      class="w-20"
      type="number"
      min={0}
      max={10}
      value={current.decimals}
      onChange={(decimals) => upd(current.id, { decimals })}
    />
    <TextField
      label="Decimal mark"
      class="w-28"
      inputClass="text-center"
      value={current.decimalSeparator}
      onChange={(decimalSeparator) => upd(current.id, { decimalSeparator })}
    />
    <TextField
      label="Thousands mark"
      class="w-28"
      inputClass="text-center"
      placeholder="none"
      value={current.thousandsSeparator}
      onChange={(thousandsSeparator) => upd(current.id, { thousandsSeparator })}
    />
  </div>
{:else if block.type === "numbercalc"}
  {@const current = block}
  <SourceInput label="Value" value={current.source} onChange={(source) => upd(current.id, { source })} showHint />
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Operation"
      class="w-52"
      value={current.mode}
      options={numberCalcModes}
      onChange={(mode) => upd(current.id, { mode: mode || "Clamp" })}
    />
    {#if current.mode === "Clamp"}
      <SourceInput label="Min" widthClass="w-28" value={current.min} onChange={(min) => upd(current.id, { min })} />
      <SourceInput label="Max" widthClass="w-28" value={current.max} onChange={(max) => upd(current.id, { max })} />
    {:else if current.mode === "Map"}
      <SourceInput label="From min" widthClass="w-24" value={current.inMin} onChange={(inMin) => upd(current.id, { inMin })} />
      <SourceInput label="From max" widthClass="w-24" value={current.inMax} onChange={(inMax) => upd(current.id, { inMax })} />
      <SourceInput label="To min" widthClass="w-24" value={current.outMin} onChange={(outMin) => upd(current.id, { outMin })} />
      <SourceInput label="To max" widthClass="w-24" value={current.outMax} onChange={(outMax) => upd(current.id, { outMax })} />
    {/if}
  </div>
{:else if block.type === "random"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Type"
      class="w-40"
      value={current.numberType}
      options={randomNumberTypes}
      onChange={(numberType) => upd(current.id, { numberType: numberType || "Int" })}
    />
    <SourceInput label="From" widthClass="w-28" value={current.min} onChange={(min) => upd(current.id, { min })} />
    <SourceInput label="To" widthClass="w-28" value={current.max} onChange={(max) => upd(current.id, { max })} />
  </div>
  <p class="text-xs text-muted-foreground">Picks a new number on every update.</p>
{/if}
