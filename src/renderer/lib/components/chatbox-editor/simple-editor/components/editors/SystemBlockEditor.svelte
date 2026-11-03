<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import type { HeartRateModule } from "$lib/api/chatbox/modules/chatbox-heart-rate-module";
  import { soundEngine } from "$lib/api/sound-effects/engine";
  import {
    compareOperators,
    conditionSources,
    durationFormats,
    hotkeyStates,
    hrFields,
    oscDisplays,
    ovrTrackerFields,
    processFields,
    soundActions,
    stopwatchFields,
    weatherDailyFields,
    weatherFields,
    weatherUnitKinds,
  } from "../../options";
  import type { Block, UpdateBlock } from "../../types";
  import SourceInput from "../SourceInput.svelte";
  import CheckField from "../fields/CheckField.svelte";
  import RichTextField from "../fields/RichTextField.svelte";
  import SelectField from "../fields/SelectField.svelte";
  import TextField from "../fields/TextField.svelte";

  let {
    block,
    upd,
    getShortcutNames,
    getShortcutParamCount,
  }: {
    block: Block;
    upd: UpdateBlock;
    getShortcutNames: () => string[];
    getShortcutParamCount: (name: string) => number;
  } = $props();

  const librarySounds = soundEngine.sounds;

  function heartRateSources(): string[] {
    const module = chatbox.modules.get("HeartRate") as HeartRateModule | undefined;
    return Object.keys(module?.getSources() ?? {});
  }

  function hotkeyNames(): string[] {
    const module = chatbox.modules.get("Hotkey");
    const hotkeys = module?.getValues()?.hotkeys;
    return hotkeys && typeof hotkeys === "object" ? Object.keys(hotkeys) : [];
  }

  const dayOptions = [
    { value: "0", label: "Today" },
    { value: "1", label: "Tomorrow" },
    ...[2, 3, 4, 5, 6].map((day) => ({ value: String(day), label: `In ${day} days` })),
  ];
</script>

{#snippet hotkeyField(value: string, onChange: (value: string) => void)}
  {@const names = hotkeyNames()}
  {#if names.length > 0}
    <SelectField
      label="Hotkey"
      class="w-44"
      {value}
      placeholder="Pick a hotkey"
      options={names.map((name) => ({ value: name, label: name }))}
      {onChange}
    />
  {:else}
    <TextField label="Hotkey name" class="w-44" placeholder="e.g. afk" {value} {onChange} />
  {/if}
{/snippet}

{#if block.type === "stopwatch"}
  {@const current = block}
  {@const field = current.field ?? "ElapsedMs"}
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Stopwatch name"
      class="min-w-40 flex-1"
      placeholder="e.g. stream, workout"
      value={current.name}
      onChange={(name) => upd(current.id, { name })}
    />
    <SelectField
      label="Show"
      class="w-48"
      value={field}
      options={stopwatchFields}
      onChange={(value) => upd(current.id, { field: value || "ElapsedMs" })}
    />
    {#if field === "ElapsedMs"}
      <SelectField
        label="Format"
        class="w-48"
        value={current.format}
        options={durationFormats}
        onChange={(format) => upd(current.id, { format: format || "ShortSpaced" })}
      />
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">Start, pause and reset it from hotkeys in Modules, Stopwatch.</p>
{:else if block.type === "heartrate"}
  {@const current = block}
  {@const sources = heartRateSources()}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Source"
      class="min-w-44 flex-1"
      value={current.source}
      placeholder="Pick a source"
      options={sources.map((name) => ({ value: name, label: name }))}
      onChange={(source) => upd(current.id, { source })}
    />
    <SelectField
      label="Show"
      class="w-56"
      value={current.field}
      options={hrFields}
      onChange={(field) => upd(current.id, { field: field || "HeartRate" })}
    />
    {#if current.field === "AverageHR"}
      <TextField
        label="Over (seconds)"
        class="w-28"
        type="number"
        min={10}
        max={900}
        value={current.avgSeconds}
        onChange={(avgSeconds) => upd(current.id, { avgSeconds })}
      />
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">
    {sources.length === 0
      ? "No heart rate sources yet. Add one in Modules, Heart Rate."
      : "Manage sources in Modules, Heart Rate."}
  </p>
{:else if block.type === "osc"}
  {@const current = block}
  {@const display = current.display ?? "Raw"}
  <div class="flex flex-wrap items-start gap-2">
    <SourceInput
      label="Parameter"
      widthClass="min-w-56 flex-1"
      placeholder="/avatar/parameters/MyParameter"
      value={current.address}
      onChange={(address) => upd(current.id, { address })}
    />
    <SelectField
      label="Show it"
      class="w-56"
      value={display}
      options={oscDisplays}
      onChange={(value) => upd(current.id, { display: value || "Raw" })}
    />
    {#if display === "Decimals"}
      <TextField
        label="Decimals"
        class="w-20"
        type="number"
        min={0}
        max={6}
        value={current.decimals ?? "1"}
        onChange={(decimals) => upd(current.id, { decimals })}
      />
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">Click the list icon to pick from your current avatar's parameters.</p>
{:else if block.type === "hotkey"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    {@render hotkeyField(current.name, (name) => upd(current.id, { name }))}
    <SelectField
      label="Check"
      class="w-48"
      value={current.state}
      options={hotkeyStates}
      onChange={(state) => upd(current.id, { state: state || "toggled" })}
    />
    {#if current.state === "pressed"}
      <TextField
        label="Counts for (ms)"
        class="w-32"
        type="number"
        min={500}
        step={500}
        value={current.timeout}
        onChange={(timeout) => upd(current.id, { timeout })}
      />
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">Shows true or false. Wrap it in a Condition block for your own text.</p>
{:else if block.type === "process"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Program"
      class="min-w-40 flex-1"
      placeholder="VRChat.exe"
      value={current.process}
      onChange={(process) => upd(current.id, { process })}
    />
    <SelectField
      label="Show"
      class="w-56"
      value={current.field}
      options={processFields}
      onChange={(field) => upd(current.id, { field: field || "SessionTime" })}
    />
  </div>
{:else if block.type === "shortcut"}
  {@const current = block}
  {@const names = getShortcutNames()}
  {#if names.length === 0}
    <p class="text-xs text-muted-foreground">No shortcuts yet. Make some in Modules, Shortcut.</p>
  {:else}
    <div class="flex flex-wrap items-start gap-2">
      <SelectField
        label="Shortcut"
        class="w-48"
        value={current.name}
        placeholder="Pick a shortcut"
        options={names.map((name) => ({ value: name, label: name }))}
        onChange={(name) =>
          upd(current.id, { name, params: Array(getShortcutParamCount(name)).fill("") })}
      />
      {#each current.params as param, index}
        <RichTextField
          label={`$${index}`}
          class="w-36"
          placeholder={`value ${index + 1}`}
          value={param}
          onChange={(value) => {
            const next = [...current.params];
            next[index] = value;
            upd(current.id, { params: next });
          }}
        />
      {/each}
    </div>
  {/if}
{:else if block.type === "ovrtracker"}
  {@const current = block}
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Device"
      class="min-w-48 flex-1"
      placeholder="Index, serial, or part of the model name"
      value={current.finder}
      onChange={(finder) => upd(current.id, { finder })}
    />
    <SelectField
      label="Show"
      class="w-52"
      value={current.field}
      options={ovrTrackerFields}
      onChange={(field) => upd(current.id, { field: field || "BatteryLevel" })}
    />
  </div>
  <p class="text-xs text-muted-foreground">Needs SteamVR. Name your trackers in Modules, OpenVR Trackers.</p>
{:else if block.type === "weather"}
  {@const current = block}
  {@const isDaily = weatherDailyFields.has(current.field)}
  {@const isSun = current.field === "Sunrise" || current.field === "Sunset"}
  <div class="flex flex-wrap items-start gap-2">
    <TextField
      label="Location (empty uses your default)"
      class="min-w-48 flex-1"
      placeholder="Home, Tokyo, or 52.52,13.41"
      value={current.location}
      onChange={(location) => upd(current.id, { location })}
    />
    <SelectField
      label="Show"
      class="w-56"
      value={current.field}
      options={weatherFields}
      onChange={(field) => upd(current.id, { field: field || "Temperature" })}
    />
    {#if isDaily}
      <SelectField
        label="Day"
        class="w-32"
        value={current.dayOffset || "0"}
        options={dayOptions}
        onChange={(dayOffset) => upd(current.id, { dayOffset: dayOffset || "0" })}
      />
    {/if}
    {#if isSun}
      <TextField
        label="Time format"
        class="w-28"
        placeholder="HH:mm"
        value={current.timeFormat}
        onChange={(timeFormat) => upd(current.id, { timeFormat })}
      />
    {/if}
    {#if weatherUnitKinds[current.field]}
      <div class="pt-5">
        <CheckField
          label="Add the unit"
          checked={current.showUnit}
          onChange={(showUnit) => upd(current.id, { showUnit })}
        />
      </div>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">From Open-Meteo. Save locations and pick units in Modules, Weather.</p>
{:else if block.type === "condition"}
  {@const current = block}
  {@const source = current.source}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="When"
      class="w-56"
      value={source}
      options={conditionSources}
      onChange={(value) => upd(current.id, { source: value || "mediaplaying" })}
    />
    {#if source === "hotkey-toggled" || source === "hotkey-pressed"}
      {@render hotkeyField(current.hotkeyName, (hotkeyName) => upd(current.id, { hotkeyName }))}
      {#if source === "hotkey-pressed"}
        <TextField
          label="Counts for (ms)"
          class="w-32"
          type="number"
          min={500}
          step={500}
          value={current.hotkeyTimeout}
          onChange={(hotkeyTimeout) => upd(current.id, { hotkeyTimeout })}
        />
      {/if}
    {:else if source.startsWith("osc-")}
      <SourceInput
        label="Parameter"
        widthClass="min-w-44 flex-1"
        value={current.oscAddress}
        onChange={(oscAddress) => upd(current.id, { oscAddress })}
      />
      <SourceInput
        label="Value"
        widthClass="w-28"
        value={current.oscValue}
        onChange={(oscValue) => upd(current.id, { oscValue })}
      />
    {:else if source === "source-truthy" || source === "text-empty" || source === "text-notempty"}
      <SourceInput
        label="Value"
        widthClass="min-w-44 flex-1"
        value={current.valueSource}
        onChange={(valueSource) => upd(current.id, { valueSource })}
        showHint
      />
    {:else if source === "source-compare" || source === "text-equals"}
      <SourceInput
        label="Value"
        widthClass="min-w-40 flex-1"
        value={current.valueSource}
        onChange={(valueSource) => upd(current.id, { valueSource })}
      />
      {#if source === "source-compare"}
        <SelectField
          label="Is"
          class="w-20"
          value={current.oscOp}
          options={compareOperators}
          onChange={(oscOp) => upd(current.id, { oscOp: oscOp || "==" })}
        />
      {/if}
      <SourceInput
        label={source === "text-equals" ? "Equals" : "Than"}
        widthClass="min-w-32 flex-1"
        value={current.compareAgainst}
        onChange={(compareAgainst) => upd(current.id, { compareAgainst })}
      />
    {:else if source === "expression"}
      <RichTextField
        label="Expression"
        class="min-w-56 flex-1"
        placeholder="[[OSCData:/avatar/parameters/HP]] < 0.25"
        value={current.expression}
        onChange={(expression) => upd(current.id, { expression })}
      />
    {/if}
  </div>
  {#if source === "expression"}
    <p class="text-xs text-muted-foreground">
      JavaScript style: ==, !=, &lt;, &gt;, &amp;&amp;, ||. Text values are quoted for you.
    </p>
  {/if}
  <div class="flex flex-wrap gap-2">
    <RichTextField
      label="Then show"
      class="min-w-40 flex-1"
      value={current.trueText}
      onChange={(trueText) => upd(current.id, { trueText })}
    />
    <RichTextField
      label="Otherwise show"
      class="min-w-40 flex-1"
      placeholder="nothing"
      value={current.falseText}
      onChange={(falseText) => upd(current.id, { falseText })}
    />
  </div>
{:else if block.type === "sound"}
  {@const current = block}
  {@const action = current.action ?? (current.loop ? "Loop" : "Play")}
  <div class="flex flex-wrap items-start gap-2">
    <SelectField
      label="Do"
      class="w-44"
      value={action}
      options={soundActions}
      onChange={(value) => upd(current.id, { action: value || "Play", loop: value === "Loop" })}
    />
    {#if action === "Volume"}
      <TextField
        label="Volume (0 to 100)"
        class="w-36"
        type="number"
        min={0}
        max={100}
        value={current.volume ?? "50"}
        onChange={(volume) => upd(current.id, { volume })}
      />
    {:else if action !== "StopAll"}
      <SelectField
        label="Sound"
        class="w-52"
        value={current.soundName}
        placeholder={$librarySounds.length ? "Pick a sound" : "Add sounds first"}
        options={$librarySounds.map((sound) => ({ value: sound.name, label: sound.name }))}
        onChange={(soundName) => upd(current.id, { soundName })}
      />
    {/if}
  </div>
  <SourceInput
    label={action === "Loop"
      ? "Loop while this is true (empty loops all the time)"
      : "Run when this turns true (empty runs once)"}
    placeholder="/avatar/parameters/Booped or [[Hotkey:IsPressed:boop]]"
    value={current.condition}
    onChange={(condition) => upd(current.id, { condition })}
  />
  {#if $librarySounds.length === 0}
    <p class="text-xs text-muted-foreground">Add sounds on the Sound Effects page first.</p>
  {/if}
{/if}
