<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import { oscForwarder, type ForwardType } from "$lib/api/osc-forwarder";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import {
    PlusIcon,
    Trash2Icon,
    RadioIcon,
    ListIcon,
    ArrowRightIcon,
    InfoIcon,
  } from "@lucide/svelte";

  const entries = oscForwarder.entries;
  const lastValues = oscForwarder.lastValues;

  // Avatar schema for path picker
  const schemaStore = avatarOSC.schema;
  let schemaPickerOpen = $state(false);
  let schemaPickerTargetId = $state<string | null>(null);
  let schemaFilter = $state("");

  $effect(() => {
    if (!schemaPickerOpen) {
      schemaFilter = "";
      schemaPickerTargetId = null;
    }
  });

  function openSchemaPicker(entryId: string) {
    schemaPickerTargetId = entryId;
    schemaPickerOpen = true;
  }

  function pickSchemaPath(address: string) {
    if (!schemaPickerTargetId) return;
    oscForwarder.updateEntry(schemaPickerTargetId, { oscPath: address });
    schemaPickerOpen = false;
  }

  const filteredParams = $derived(
    (() => {
      const schema = $schemaStore;
      if (!schema) return [];
      return schema.parameters.filter(
        (p) =>
          !schemaFilter ||
          p.name.toLowerCase().includes(schemaFilter.toLowerCase()) ||
          (p.input?.address ?? "")
            .toLowerCase()
            .includes(schemaFilter.toLowerCase()),
      );
    })(),
  );

  const forwardTypeOptions: { value: ForwardType; label: string }[] = [
    { value: "Float", label: "Float" },
    { value: "Int", label: "Int" },
    { value: "Bool", label: "Bool" },
    { value: "String", label: "String" },
  ];
</script>

<div class="flex flex-col gap-3 p-2 h-[calc(100vh-8rem)] overflow-auto">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <RadioIcon class="size-4 text-muted-foreground" />
      <span class="text-sm text-muted-foreground">
        Evaluate chatbox template values and forward them to OSC addresses at a
        set interval.
      </span>
    </div>
    <Button variant="outline" size="sm" onclick={oscForwarder.addEntry}>
      <PlusIcon class="size-4" />
      Add Forwarder
    </Button>
  </div>

  {#if $entries.length === 0}
    <div
      class="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground"
    >
      <RadioIcon class="size-10 opacity-30" />
      <p class="text-sm">
        No forwarders yet. Click "Add Forwarder" to get started.
      </p>
    </div>
  {/if}

  {#each $entries as entry (entry.id)}
    <Card.Root class="p-3">
      <div class="flex flex-col gap-3">
        <!-- Header row -->
        <div class="flex items-center gap-2">
          <Checkbox
            checked={entry.enabled}
            onCheckedChange={(v) =>
              oscForwarder.updateEntry(entry.id, { enabled: !!v })}
          />
          <span class="text-xs text-muted-foreground font-mono flex-1 truncate">
            {entry.oscPath || "(no path)"}
          </span>
          {#if $lastValues[entry.id] !== undefined}
            <span
              class="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0 max-w-32 truncate"
              title={$lastValues[entry.id]}
            >
              {$lastValues[entry.id]}
            </span>
          {/if}
          <Button
            variant="ghost"
            size="icon"
            class="size-7 text-destructive hover:text-destructive"
            onclick={() => oscForwarder.removeEntry(entry.id)}
          >
            <Trash2Icon class="size-4" />
          </Button>
        </div>

        <!-- OSC Path row -->
        <div class="flex flex-col gap-1">
          <Label class="text-xs">OSC Path</Label>
          <div class="flex gap-2">
            <Input
              class="font-mono text-xs h-8 flex-1"
              placeholder="/avatar/parameters/MyParam"
              value={entry.oscPath}
              oninput={(e) =>
                oscForwarder.updateEntry(entry.id, {
                  oscPath: (e.target as HTMLInputElement).value,
                })}
            />
            <Button
              variant="outline"
              size="sm"
              class="h-8 shrink-0"
              onclick={() => openSchemaPicker(entry.id)}
            >
              <ListIcon class="size-3" />
              Avatar
            </Button>
          </div>
        </div>

        <!-- Value template row -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1">
            <Label class="text-xs">Value Template</Label>
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger>
                  <InfoIcon class="size-3 text-muted-foreground cursor-help" />
                </Tooltip.Trigger>
                <Tooltip.Content>
                  <p class="text-xs max-w-60">
                    Supports chatbox placeholders like <span class="font-mono"
                      >{"{{Time;Now;HH:mm}}"}</span
                    >
                    or
                    <span class="font-mono"
                      >{"{{OSCData;/avatar/parameters/X}}"}</span
                    >. The resolved string is converted to the selected type.
                  </p>
                </Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
          <Input
            class="font-mono text-xs h-8"
            placeholder={"e.g. {{OSCData;/avatar/parameters/MyParam}} or 42"}
            value={entry.valueTemplate}
            oninput={(e) =>
              oscForwarder.updateEntry(entry.id, {
                valueTemplate: (e.target as HTMLInputElement).value,
              })}
          />
        </div>

        <!-- Type + interval row -->
        <div class="flex gap-3 flex-wrap">
          <div class="flex flex-col gap-1">
            <Label class="text-xs">Forward Type</Label>
            <Select.Root
              type="single"
              value={entry.forwardType}
              onValueChange={(v) => {
                if (v)
                  oscForwarder.updateEntry(entry.id, {
                    forwardType: v as ForwardType,
                  });
              }}
            >
              <Select.Trigger class="h-8 w-28 text-xs">
                {entry.forwardType}
              </Select.Trigger>
              <Select.Content>
                {#each forwardTypeOptions as opt}
                  <Select.Item value={opt.value}>{opt.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <div class="flex flex-col gap-1">
            <Label class="text-xs">Interval (ms)</Label>
            <Input
              type="number"
              class="h-8 w-28 text-xs"
              min={100}
              max={60000}
              step={100}
              value={entry.intervalMs}
              oninput={(e) => {
                const v = parseInt((e.target as HTMLInputElement).value);
                if (!isNaN(v) && v >= 100)
                  oscForwarder.updateEntry(entry.id, { intervalMs: v });
              }}
            />
          </div>
        </div>

        <!-- Mapping section (only for Int/Float) -->
        {#if entry.forwardType === "Int" || entry.forwardType === "Float"}
          <div class="flex flex-col gap-2 border rounded-md p-2">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={entry.enableMapping}
                onCheckedChange={(v) =>
                  oscForwarder.updateEntry(entry.id, { enableMapping: !!v })}
              />
              <span class="text-xs font-medium">Enable Value Mapping</span>
            </label>

            {#if entry.enableMapping}
              <div
                class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
              >
                <!-- Input range -->
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">Input Min</Label>
                  <Input
                    type="number"
                    class="h-7 w-24 text-xs"
                    step="any"
                    value={entry.inputMin}
                    oninput={(e) => {
                      const v = parseFloat(
                        (e.target as HTMLInputElement).value,
                      );
                      if (!isNaN(v))
                        oscForwarder.updateEntry(entry.id, { inputMin: v });
                    }}
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">Input Max</Label>
                  <Input
                    type="number"
                    class="h-7 w-24 text-xs"
                    step="any"
                    value={entry.inputMax}
                    oninput={(e) => {
                      const v = parseFloat(
                        (e.target as HTMLInputElement).value,
                      );
                      if (!isNaN(v))
                        oscForwarder.updateEntry(entry.id, { inputMax: v });
                    }}
                  />
                </div>

                <ArrowRightIcon class="size-4 mt-4 shrink-0" />

                <!-- Output range -->
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">Output Min</Label>
                  <Input
                    type="number"
                    class="h-7 w-24 text-xs"
                    step="any"
                    value={entry.outputMin}
                    oninput={(e) => {
                      const v = parseFloat(
                        (e.target as HTMLInputElement).value,
                      );
                      if (!isNaN(v))
                        oscForwarder.updateEntry(entry.id, { outputMin: v });
                    }}
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">Output Max</Label>
                  <Input
                    type="number"
                    class="h-7 w-24 text-xs"
                    step="any"
                    value={entry.outputMax}
                    oninput={(e) => {
                      const v = parseFloat(
                        (e.target as HTMLInputElement).value,
                      );
                      if (!isNaN(v))
                        oscForwarder.updateEntry(entry.id, { outputMax: v });
                    }}
                  />
                </div>

                <div class="flex items-end pb-1 text-muted-foreground">
                  <span class="text-xs italic">
                    [{entry.inputMin}..{entry.inputMax}] → [{entry.outputMin}..{entry.outputMax}]
                  </span>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </Card.Root>
  {/each}
</div>

<!-- Avatar schema path picker drawer -->
<Drawer.Root bind:open={schemaPickerOpen}>
  <Drawer.Content class="flex flex-col gap-2 p-3 max-h-[70vh]">
    <Drawer.Header>
      <Drawer.Title>Select Avatar Parameter</Drawer.Title>
      <Drawer.Description>
        Choose a parameter from the current avatar's OSC schema.
      </Drawer.Description>
    </Drawer.Header>

    {#if !$schemaStore}
      <p class="text-sm text-muted-foreground text-center py-6">
        No avatar schema loaded. Join a world with an avatar that has OSC
        parameters.
      </p>
    {:else}
      <Input
        class="h-8 text-sm"
        placeholder="Filter parameters..."
        bind:value={schemaFilter}
      />
      <div class="flex flex-col gap-1 overflow-auto flex-1 min-h-0 max-h-80">
        {#each filteredParams as param}
          <Button
            variant="ghost"
            class="justify-start h-auto py-1.5 px-2 font-mono text-xs"
            onclick={() =>
              pickSchemaPath(
                param.input?.address ?? param.output?.address ?? "",
              )}
          >
            <div class="flex flex-col items-start">
              <span class="font-semibold">{param.name}</span>
              <span class="text-muted-foreground">
                {param.input?.address ?? param.output?.address}
                <span class="ml-1 text-xs opacity-70"
                  >({param.input?.type ?? param.output?.type})</span
                >
              </span>
            </div>
          </Button>
        {/each}
        {#if filteredParams.length === 0}
          <p class="text-xs text-muted-foreground text-center py-4">
            No parameters match your filter.
          </p>
        {/if}
      </div>
    {/if}

    <Drawer.Footer>
      <Drawer.Close>Cancel</Drawer.Close>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>
