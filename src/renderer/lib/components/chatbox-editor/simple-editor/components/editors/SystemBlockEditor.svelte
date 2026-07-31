<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    compareOperators,
    conditionSources,
    durationFormats,
    genericSourceHint,
    hotkeyStates,
    hrFields,
    ovrTrackerFields,
    processFields,
    weatherDailyFields,
    weatherFields,
  } from "../../options";
  import SourceInput from "../SourceInput.svelte";
  import { chatbox } from "$lib/api/chatbox";
  import type { ChatboxHeartRateModule } from "$lib/api/chatbox/modules/chatbox-heart-rate-module";
  import type {
    Block,
    ConditionBlock,
    HeartRateBlock,
    HotkeyBlock,
    OSCBlock,
    OVRTrackerBlock,
    ProcessBlock,
    ShortcutBlock,
    StopwatchBlock,
    UpdateBlock,
    WeatherBlock,
  } from "../../types";

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

  function getHeartRateSourceNames(): string[] {
    const module = chatbox.modules.get("HeartRate") as
      | ChatboxHeartRateModule
      | undefined;
    return Object.keys(module?.getSources() ?? {});
  }
</script>

{#if block.type === "stopwatch"}
  {@const current = block as StopwatchBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">Stopwatch name</Label>
      <Input
        placeholder="e.g. game, stream, workout"
        value={current.name}
        oninput={(e) =>
          upd(current.id, { name: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Display format</Label>
      <Select.Root
        type="single"
        value={current.format}
        onValueChange={(v) => upd(current.id, { format: v ?? "Short" })}
      >
        <Select.Trigger class="w-48"
          >{durationFormats.find((item) => item.value === current.format)
            ?.label ?? current.format}</Select.Trigger
        >
        <Select.Content>
          {#each durationFormats as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
  <p class="text-xs text-muted-foreground">
    Configure the stopwatch hotkeys in Modules → Stopwatch.
  </p>
{:else if block.type === "heartrate"}
  {@const current = block as HeartRateBlock}
  {@const sourceNames = getHeartRateSourceNames()}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-48">
      <Label class="text-xs text-muted-foreground">Heart rate source</Label>
      <Select.Root
        type="single"
        value={current.source}
        onValueChange={(v) => upd(current.id, { source: v ?? "" })}
      >
        <Select.Trigger class="w-full"
          >{current.source || "Select a source"}</Select.Trigger
        >
        <Select.Content>
          {#each sourceNames as name}
            <Select.Item value={name}>{name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">What to show</Label>
      <Select.Root
        type="single"
        value={current.field}
        onValueChange={(v) => upd(current.id, { field: v ?? "HeartRate" })}
      >
        <Select.Trigger class="w-52"
          >{hrFields.find((item) => item.value === current.field)?.label ??
            current.field}</Select.Trigger
        >
        <Select.Content>
          {#each hrFields as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if current.field === "AverageHR"}
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Window (seconds)</Label>
        <Input
          class="w-24"
          type="number"
          min="10"
          max="900"
          value={current.avgSeconds}
          oninput={(e) =>
            upd(current.id, {
              avgSeconds: (e.target as HTMLInputElement).value,
            })}
        />
      </div>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">
    {sourceNames.length === 0
      ? "No heart rate sources yet. Add Pulsoid, HypeRate, Stromno or a custom WebSocket feed in Modules → Heart Rate."
      : "Manage your heart rate sources in Modules → Heart Rate."}
  </p>
{:else if block.type === "osc"}
  {@const current = block as OSCBlock}
  <div class="flex flex-col gap-0.5">
    <Label class="text-xs text-muted-foreground">OSC Parameter Address</Label>
    <Input
      placeholder="/avatar/parameters/MyParameter"
      value={current.address}
      oninput={(e) =>
        upd(current.id, { address: (e.target as HTMLInputElement).value })}
    />
  </div>
{:else if block.type === "hotkey"}
  {@const current = block as HotkeyBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-36">
      <Label class="text-xs text-muted-foreground">Hotkey name</Label>
      <Input
        placeholder="e.g. myHotkey"
        value={current.name}
        oninput={(e) =>
          upd(current.id, { name: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">Behaviour</Label>
      <Select.Root
        type="single"
        value={current.state}
        onValueChange={(v) => upd(current.id, { state: v ?? "toggled" })}
      >
        <Select.Trigger class="w-52"
          >{hotkeyStates.find((item) => item.value === current.state)?.label ??
            current.state}</Select.Trigger
        >
        <Select.Content>
          {#each hotkeyStates as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if current.state === "pressed"}
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Timeout (ms)</Label>
        <Input
          class="w-24"
          type="number"
          min="100"
          step="100"
          value={current.timeout}
          oninput={(e) =>
            upd(current.id, { timeout: (e.target as HTMLInputElement).value })}
        />
      </div>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">
    Register hotkeys in Modules → Hotkey.
  </p>
{:else if block.type === "process"}
  {@const current = block as ProcessBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-36">
      <Label class="text-xs text-muted-foreground">Process name</Label>
      <Input
        placeholder="VRChat.exe"
        value={current.process}
        oninput={(e) =>
          upd(current.id, { process: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">What to show</Label>
      <Select.Root
        type="single"
        value={current.field}
        onValueChange={(v) => upd(current.id, { field: v ?? "SessionTime" })}
      >
        <Select.Trigger class="w-56"
          >{processFields.find((item) => item.value === current.field)?.label ??
            current.field}</Select.Trigger
        >
        <Select.Content>
          {#each processFields as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
{:else if block.type === "shortcut"}
  {@const current = block as ShortcutBlock}
  {@const names = getShortcutNames()}
  {#if names.length === 0}
    <p class="text-xs text-muted-foreground">
      No shortcuts yet. Go to Modules → Shortcut to create some.
    </p>
  {:else}
    <div class="flex gap-1.5 flex-wrap">
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Shortcut</Label>
        <Select.Root
          type="single"
          value={current.name}
          onValueChange={(v) => {
            const name = v ?? "";
            upd(current.id, {
              name,
              params: Array(getShortcutParamCount(name)).fill(""),
            });
          }}
        >
          <Select.Trigger class="w-44"
            >{current.name || "Select a shortcut"}</Select.Trigger
          >
          <Select.Content>
            {#each names as name}
              <Select.Item value={name}>{name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if current.name}
        {#each current.params as param, index}
          <div class="flex flex-col gap-0.5">
            <Label class="text-xs text-muted-foreground"
              >Param {index + 1}</Label
            >
            <Input
              class="w-28"
              placeholder={`param${index + 1}`}
              value={param}
              oninput={(e) => {
                const next = [...current.params];
                next[index] = (e.target as HTMLInputElement).value;
                upd(current.id, { params: next });
              }}
            />
          </div>
        {/each}
      {/if}
    </div>
  {/if}
{:else if block.type === "ovrtracker"}
  {@const current = block as OVRTrackerBlock}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground"
        >Find tracker by index, serial, or model substring</Label
      >
      <Input
        placeholder="e.g. 0 or LHR-12345678 or Tracker 3.0"
        value={current.finder}
        oninput={(e) =>
          upd(current.id, { finder: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">What to show</Label>
      <Select.Root
        type="single"
        value={current.field}
        onValueChange={(v) => upd(current.id, { field: v ?? "BatteryLevel" })}
      >
        <Select.Trigger class="w-52"
          >{ovrTrackerFields.find((item) => item.value === current.field)
            ?.label ?? current.field}</Select.Trigger
        >
        <Select.Content>
          {#each ovrTrackerFields as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>
  <p class="text-xs text-muted-foreground">
    Requires SteamVR. Manage aliases in Modules → OpenVR Trackers.
  </p>
{:else if block.type === "weather"}
  {@const current = block as WeatherBlock}
  {@const isDaily = weatherDailyFields.has(current.field)}
  <div class="flex gap-1.5 flex-wrap">
    <div class="flex flex-col gap-0.5 flex-1 min-w-40">
      <Label class="text-xs text-muted-foreground">
        Location (empty uses your default one)
      </Label>
      <Input
        placeholder="e.g. Home, Tokyo, or 52.52,13.41"
        value={current.location}
        oninput={(e) =>
          upd(current.id, { location: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="flex flex-col gap-0.5">
      <Label class="text-xs text-muted-foreground">What to show</Label>
      <Select.Root
        type="single"
        value={current.field}
        onValueChange={(v) => upd(current.id, { field: v ?? "Temperature" })}
      >
        <Select.Trigger class="w-56"
          >{weatherFields.find((item) => item.value === current.field)?.label ??
            current.field}</Select.Trigger
        >
        <Select.Content>
          {#each weatherFields as item}
            <Select.Item value={item.value}>{item.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#if isDaily}
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Day</Label>
        <Select.Root
          type="single"
          value={current.dayOffset || "0"}
          onValueChange={(v) => upd(current.id, { dayOffset: v ?? "0" })}
        >
          <Select.Trigger class="w-36">
            {current.dayOffset === "1"
              ? "Tomorrow"
              : current.dayOffset && current.dayOffset !== "0"
                ? `In ${current.dayOffset} days`
                : "Today"}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="0">Today</Select.Item>
            <Select.Item value="1">Tomorrow</Select.Item>
            <Select.Item value="2">In 2 days</Select.Item>
            <Select.Item value="3">In 3 days</Select.Item>
            <Select.Item value="4">In 4 days</Select.Item>
            <Select.Item value="5">In 5 days</Select.Item>
            <Select.Item value="6">In 6 days</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    {/if}
    {#if current.field === "Sunrise" || current.field === "Sunset"}
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Time format</Label>
        <Input
          class="w-32"
          placeholder="HH:mm"
          value={current.timeFormat}
          oninput={(e) =>
            upd(current.id, {
              timeFormat: (e.target as HTMLInputElement).value,
            })}
        />
      </div>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">
    Weather data from Open-Meteo. Save locations and pick units in Modules →
    Weather.
  </p>
{:else if block.type === "condition"}
  {@const current = block as ConditionBlock}
  <div class="flex flex-col gap-2">
    <div class="flex gap-1.5 flex-wrap">
      <div class="flex flex-col gap-0.5">
        <Label class="text-xs text-muted-foreground">Condition</Label>
        <Select.Root
          type="single"
          value={current.source}
          onValueChange={(v) =>
            upd(current.id, { source: v ?? "mediaplaying" })}
        >
          <Select.Trigger class="w-56"
            >{conditionSources.find((item) => item.value === current.source)
              ?.label ?? current.source}</Select.Trigger
          >
          <Select.Content>
            {#each conditionSources as item}
              <Select.Item value={item.value}>{item.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if current.source === "hotkey-toggled" || current.source === "hotkey-pressed"}
        <div class="flex flex-col gap-0.5">
          <Label class="text-xs text-muted-foreground">Hotkey name</Label>
          <Input
            class="w-36"
            value={current.hotkeyName}
            oninput={(e) =>
              upd(current.id, {
                hotkeyName: (e.target as HTMLInputElement).value,
              })}
          />
        </div>
        {#if current.source === "hotkey-pressed"}
          <div class="flex flex-col gap-0.5">
            <Label class="text-xs text-muted-foreground">Timeout (ms)</Label>
            <Input
              class="w-24"
              type="number"
              min="100"
              step="100"
              value={current.hotkeyTimeout}
              oninput={(e) =>
                upd(current.id, {
                  hotkeyTimeout: (e.target as HTMLInputElement).value,
                })}
            />
          </div>
        {/if}
      {:else if current.source.startsWith("osc-")}
        <SourceInput
          label="Left source"
          value={current.oscAddress}
          widthClass="flex-1 min-w-40"
          onChange={(value) => upd(current.id, { oscAddress: value })}
          showHint={true}
        />
        <SourceInput
          label="Right value / source"
          value={current.oscValue}
          widthClass="flex-1 min-w-32"
          onChange={(value) => upd(current.id, { oscValue: value })}
        />
      {:else if current.source === "source-truthy"}
        <SourceInput
          label="Source"
          value={current.valueSource}
          widthClass="flex-1 min-w-40"
          onChange={(value) => upd(current.id, { valueSource: value })}
          showHint={true}
        />
      {:else if current.source === "source-compare"}
        <SourceInput
          label="Left source"
          value={current.valueSource}
          widthClass="flex-1 min-w-40"
          onChange={(value) => upd(current.id, { valueSource: value })}
          showHint={true}
        />
        <div class="flex flex-col gap-0.5">
          <Label class="text-xs text-muted-foreground">Operator</Label>
          <Select.Root
            type="single"
            value={current.oscOp}
            onValueChange={(v) => upd(current.id, { oscOp: v ?? "==" })}
          >
            <Select.Trigger class="w-24">{current.oscOp}</Select.Trigger>
            <Select.Content>
              {#each compareOperators as item}
                <Select.Item value={item.value}>{item.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <SourceInput
          label="Right value / source"
          value={current.compareAgainst}
          widthClass="flex-1 min-w-32"
          onChange={(value) => upd(current.id, { compareAgainst: value })}
        />
      {/if}
    </div>
    <p class="text-xs text-muted-foreground">{genericSourceHint}</p>
    <div class="flex gap-1.5 flex-wrap">
      <div class="flex flex-col gap-0.5 flex-1 min-w-28">
        <Label class="text-xs text-muted-foreground">Show when TRUE</Label>
        <Input
          value={current.trueText}
          oninput={(e) =>
            upd(current.id, { trueText: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="flex flex-col gap-0.5 flex-1 min-w-28">
        <Label class="text-xs text-muted-foreground">Show when FALSE</Label>
        <Input
          value={current.falseText}
          oninput={(e) =>
            upd(current.id, {
              falseText: (e.target as HTMLInputElement).value,
            })}
        />
      </div>
    </div>
  </div>
{/if}
