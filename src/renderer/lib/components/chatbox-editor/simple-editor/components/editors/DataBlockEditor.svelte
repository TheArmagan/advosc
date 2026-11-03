<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import type { RequestModule } from "$lib/api/chatbox/modules/chatbox-request-module";
  import type { VarModule } from "$lib/api/chatbox/modules/chatbox-var-module";
  import {
    byteUnits,
    durationFormats,
    requestFields,
    speechFields,
    systemFields,
    uptimeFormats,
  } from "../../options";
  import type { Block, UpdateBlock } from "../../types";
  import CheckField from "../fields/CheckField.svelte";
  import RichTextField from "../fields/RichTextField.svelte";
  import SelectField from "../fields/SelectField.svelte";
  import TextField from "../fields/TextField.svelte";

  let { block, upd }: { block: Block; upd: UpdateBlock } = $props();

  function requestSources(): string[] {
    const module = chatbox.modules.get("Request") as RequestModule | undefined;
    return Object.keys(module?.getSources() ?? {});
  }

  function variableNames(): string[] {
    const module = chatbox.modules.get("Var") as VarModule | undefined;
    return Object.keys(module?.getVariables() ?? {});
  }
</script>

{#if block.type === "system"}
  {@const current = block}
  {@const field = systemFields.find((item) => item.value === current.field) ?? systemFields[0]}
  {@const kind = field.kind}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Show"
      class="w-56"
      value={current.field}
      options={systemFields}
      onChange={(value) => upd(current.id, { field: value || "CPUUsage" })}
    />
    {#if kind === "gpu" || kind === "gpuDec" || kind === "gpuUnit"}
      <TextField
        label="GPU (optional)"
        class="w-36"
        placeholder="0, or NVIDIA"
        value={current.gpu}
        onChange={(gpu) => upd(current.id, { gpu })}
      />
    {:else if kind === "core"}
      <TextField
        label="Core number"
        class="w-28"
        type="number"
        min={0}
        value={current.gpu || "0"}
        onChange={(gpu) => upd(current.id, { gpu })}
      />
    {/if}
    {#if kind === "unit" || kind === "gpuUnit"}
      <SelectField
        label="Unit"
        class="w-28"
        value={current.unit}
        options={byteUnits}
        onChange={(unit) => upd(current.id, { unit })}
      />
    {:else if kind === "uptime"}
      <SelectField
        label="Format"
        class="w-40"
        value={current.unit}
        options={uptimeFormats}
        onChange={(unit) => upd(current.id, { unit })}
      />
    {/if}
    {#if kind === "dec" || kind === "core" || kind === "gpuDec" || kind === "unit" || kind === "gpuUnit"}
      <TextField
        label="Decimals"
        class="w-20"
        type="number"
        min={0}
        max={3}
        placeholder="1"
        value={current.decimals}
        onChange={(decimals) => upd(current.id, { decimals })}
      />
    {/if}
    {#if field.unitText}
      <div class="pt-5">
        <CheckField
          label={`Add "${field.unitText.trim()}"`}
          checked={current.showUnit}
          onChange={(showUnit) => upd(current.id, { showUnit })}
        />
      </div>
    {/if}
  </div>
  {#if current.field.includes("Temperature") || current.field === "GPUPower" || current.field === "GPUFanSpeed"}
    <p class="text-xs text-muted-foreground">
      Some PCs don't report this. GPU temperature, power and fan speed are NVIDIA only.
    </p>
  {/if}
{:else if block.type === "speech"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Show"
      class="w-64"
      value={current.field}
      options={speechFields}
      onChange={(field) => upd(current.id, { field: field || "Text" })}
    />
    {#if current.field === "Both"}
      <TextField
        label="Between them"
        class="w-28"
        inputClass="font-mono"
        value={current.separator}
        onChange={(separator) => upd(current.id, { separator })}
      />
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">Set up speech to text and translation in Modules, Speech.</p>
{:else if block.type === "variable"}
  {@const current = block}
  {@const names = variableNames()}
  <div class="flex flex-wrap items-start gap-2">
    {#if names.length > 0}
      <SelectField
        label="Variable"
        class="w-48"
        value={current.name}
        placeholder="Pick a variable"
        options={names.map((name) => ({ value: name, label: name }))}
        onChange={(name) => upd(current.id, { name })}
      />
    {:else}
      <TextField
        label="Variable name"
        class="w-48"
        placeholder="e.g. mood"
        value={current.name}
        onChange={(name) => upd(current.id, { name })}
      />
    {/if}
    <RichTextField
      label="If it isn't set, show"
      class="min-w-40 flex-1"
      placeholder="nothing"
      value={current.defaultValue}
      onChange={(defaultValue) => upd(current.id, { defaultValue })}
    />
  </div>
  <p class="text-xs text-muted-foreground">Automations and Modules, Variables can change it.</p>
{:else if block.type === "request"}
  {@const current = block}
  {@const sources = requestSources()}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Source"
      class="min-w-44 flex-1"
      value={current.source}
      placeholder={sources.length ? "Pick a source" : "No sources yet"}
      options={sources.map((name) => ({ value: name, label: name }))}
      onChange={(source) => upd(current.id, { source })}
    />
    <SelectField
      label="Show"
      class="w-60"
      value={current.field}
      options={requestFields}
      onChange={(field) => upd(current.id, { field: field || "Value" })}
    />
    {#if current.field === "Value" || current.field === "Has"}
      <TextField
        label="Path in the response"
        class="min-w-40 flex-1"
        inputClass="font-mono"
        placeholder="data.current.temp"
        value={current.path}
        onChange={(path) => upd(current.id, { path })}
      />
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">
    {sources.length === 0
      ? "Add a URL to fetch in Modules, Request first."
      : "Manage sources in Modules, Request. Paths look like data.items[0].name."}
  </p>
{:else if block.type === "countdown"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Until"
      class="w-56"
      type="datetime-local"
      value={current.target}
      onChange={(target) => upd(current.id, { target })}
    />
    <SelectField
      label="Format"
      class="w-48"
      value={current.format}
      options={durationFormats}
      onChange={(format) => upd(current.id, { format: format || "ShortSpaced" })}
    />
    <RichTextField
      label="After it's reached, show"
      class="min-w-40 flex-1"
      placeholder="nothing"
      value={current.doneText}
      onChange={(doneText) => upd(current.id, { doneText })}
    />
  </div>
{:else if block.type === "math"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <RichTextField
      label="Expression"
      class="min-w-56 flex-1"
      placeholder="[[OSCData:/avatar/parameters/HP]] * 100"
      value={current.expression}
      onChange={(expression) => upd(current.id, { expression })}
    />
    <TextField
      label="Decimals"
      class="w-24"
      type="number"
      min={0}
      max={6}
      placeholder="as is"
      value={current.decimals}
      onChange={(decimals) => upd(current.id, { decimals })}
    />
  </div>
  <p class="text-xs text-muted-foreground">
    + - * / and Math functions like Math.max(a, b) or Math.round(x). Type [[ to insert a value.
  </p>
{/if}
