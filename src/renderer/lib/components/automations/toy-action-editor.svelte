<script lang="ts">
  import type { AutomationAction, AutomationMode } from "$lib/api/automations";
  import { defaultToyAction, toyActionFitsMode } from "$lib/api/automations/actions";
  import { panic, toys } from "$lib/api/toys";
  import NumberField from "$lib/components/number-field.svelte";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import type { ToyAction, ToyFeature, ToyPresetName } from "$shared/toys";

  type ToyAutomationAction = Extract<AutomationAction, { type: "toy" }>;

  let {
    action,
    mode,
    onChange,
  }: {
    action: ToyAutomationAction;
    mode: AutomationMode;
    onChange: (patch: Partial<ToyAutomationAction>) => void;
  } = $props();

  /** The toy service shortens anything longer, so the field stops there too. */
  const MAX_RUN_SECONDS = 600;
  const RUN_LABEL = `Run for (seconds, up to ${MAX_RUN_SECONDS})`;

  const toyState = toys.state;
  const settings = toys.settings;
  const panicState = panic.state;

  const KINDS: { id: ToyAction["kind"]; label: string }[] = [
    { id: "link", label: "Follow the value" },
    { id: "pulse", label: "Pulse" },
    { id: "preset", label: "Preset" },
    { id: "pattern", label: "Pattern" },
    { id: "stop", label: "Stop" },
  ];

  const PRESETS: { id: ToyPresetName; label: string }[] = [
    { id: "pulse", label: "Pulse" },
    { id: "wave", label: "Wave" },
    { id: "fireworks", label: "Fireworks" },
    { id: "earthquake", label: "Earthquake" },
  ];

  const ALL_FEATURES: ToyFeature[] = [
    "Vibrate",
    "Rotate",
    "Pump",
    "Thrusting",
    "Fingering",
    "Suction",
    "Depth",
    "Stroke",
    "Oscillate",
  ];

  const toyAction = $derived(action.action);
  const target = $derived(toyAction.target);
  const availableKinds = $derived(KINDS.filter((kind) => toyActionFitsMode(kind.id, mode)));

  /** Features connected toys report, plus anything the rule already uses. */
  const featureOptions = $derived.by(() => {
    const present = new Set<ToyFeature>(target.features);
    for (const toy of $toyState.toys) for (const feature of toy.features) present.add(feature);
    return present.size ? ALL_FEATURES.filter((feature) => present.has(feature)) : ALL_FEATURES;
  });

  const toyLabel = $derived.by(() => {
    if (!target.toyIds.length) return "All connected toys";
    const names = target.toyIds.map(
      (id) => $toyState.toys.find((toy) => toy.id === id)?.name ?? "Not connected",
    );
    return names.join(", ");
  });

  function patch(next: Partial<ToyAction>) {
    onChange({ action: { ...toyAction, ...next } as ToyAction });
  }

  function setKind(kind: ToyAction["kind"]) {
    onChange({ action: defaultToyAction(kind, target) });
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap items-end gap-2">
    <div class="flex flex-col gap-1">
      <Label class="text-xs">What to do</Label>
      <Select.Root
        type="single"
        value={toyAction.kind}
        onValueChange={(v) => {
          if (v) setKind(v as ToyAction["kind"]);
        }}
      >
        <Select.Trigger class="h-8 w-40 text-xs">
          {KINDS.find((kind) => kind.id === toyAction.kind)?.label}
        </Select.Trigger>
        <Select.Content>
          {#each availableKinds as kind (kind.id)}
            <Select.Item value={kind.id}>{kind.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <div class="flex min-w-40 flex-1 flex-col gap-1">
      <Label class="text-xs">Toys</Label>
      <Select.Root
        type="multiple"
        value={target.toyIds}
        onValueChange={(v) => patch({ target: { ...target, toyIds: v ?? [] } })}
      >
        <Select.Trigger class="h-8 w-full text-xs">
          <span class="truncate">{toyLabel}</span>
        </Select.Trigger>
        <Select.Content>
          {#each $toyState.toys as toy (toy.id)}
            <Select.Item value={toy.id}>{toy.name}</Select.Item>
          {/each}
          {#if $toyState.toys.length === 0}
            <p class="p-2 text-xs text-muted-foreground">
              {$panicState.latched
                ? "Toys disconnect while the panic stop is on."
                : "No toys connected right now."}
            </p>
          {/if}
        </Select.Content>
      </Select.Root>
    </div>

    {#if toyAction.kind !== "stop"}
      <div class="flex min-w-40 flex-1 flex-col gap-1">
        <Label class="text-xs">Features</Label>
        <Select.Root
          type="multiple"
          value={target.features}
          onValueChange={(v) =>
            patch({ target: { ...target, features: (v ?? []) as ToyFeature[] } })}
        >
          <Select.Trigger class="h-8 w-full text-xs">
            <span class="truncate">
              {target.features.length ? target.features.join(", ") : "Pick at least one"}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each featureOptions as feature (feature)}
              <Select.Item value={feature}>{feature}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    {/if}
  </div>

  {#if toyAction.kind === "link"}
    <p class="text-xs text-muted-foreground">
      Uses the mapped value from the range above, where 1 is full strength. Your max strength still
      applies.
    </p>
  {:else if toyAction.kind === "pulse"}
    {@const level = toyAction.level}
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex w-56 flex-col gap-1">
        <Label class="text-xs">Strength: {Math.round(level * 100)}%</Label>
        <Slider
          class="h-8"
          type="single"
          min={0}
          max={100}
          step={1}
          value={Math.round(level * 100)}
          onValueChange={(v: number) => patch({ level: v / 100 })}
        />
      </div>
      <NumberField
        label={RUN_LABEL}
        min={0.1}
        max={MAX_RUN_SECONDS}
        step={0.5}
        inputClass="w-32"
        value={toyAction.seconds}
        onChange={(seconds) => patch({ seconds })}
      />
    </div>
    <p class="text-xs text-muted-foreground">
      Your max strength still applies. A While it matches rule stops this early when it ends.
    </p>
  {:else if toyAction.kind === "preset"}
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <Label class="text-xs">Preset</Label>
        <Select.Root
          type="single"
          value={toyAction.preset}
          onValueChange={(v) => {
            if (v) patch({ preset: v as ToyPresetName });
          }}
        >
          <Select.Trigger class="h-8 w-40 text-xs">
            {PRESETS.find((preset) => preset.id === toyAction.preset)?.label}
          </Select.Trigger>
          <Select.Content>
            {#each PRESETS as preset (preset.id)}
              <Select.Item value={preset.id}>{preset.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <NumberField
        label={RUN_LABEL}
        min={0.1}
        max={MAX_RUN_SECONDS}
        step={0.5}
        inputClass="w-32"
        value={toyAction.seconds}
        onChange={(seconds) => patch({ seconds })}
      />
    </div>
  {:else if toyAction.kind === "pattern"}
    {@const pattern = $settings.patterns.find((p) => p.id === toyAction.patternId)}
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <Label class="text-xs">Pattern</Label>
        <Select.Root
          type="single"
          value={toyAction.patternId}
          onValueChange={(v) => {
            if (v) patch({ patternId: v });
          }}
        >
          <Select.Trigger class="h-8 w-40 text-xs">
            <span class="truncate">
              {pattern
                ? pattern.name || "Untitled pattern"
                : toyAction.patternId
                  ? "Not available any more"
                  : "Pick a pattern"}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each $settings.patterns as option (option.id)}
              <Select.Item value={option.id}>{option.name || "Untitled pattern"}</Select.Item>
            {/each}
            {#if $settings.patterns.length === 0}
              <p class="p-2 text-xs text-muted-foreground">
                Add a pattern on the Lovense page first.
              </p>
            {/if}
          </Select.Content>
        </Select.Root>
      </div>
      <NumberField
        label={RUN_LABEL}
        min={0.1}
        max={MAX_RUN_SECONDS}
        step={0.5}
        inputClass="w-32"
        value={toyAction.seconds}
        onChange={(seconds) => patch({ seconds })}
      />
    </div>
  {:else}
    <p class="text-xs text-muted-foreground">Stops the toys picked above.</p>
  {/if}
</div>
