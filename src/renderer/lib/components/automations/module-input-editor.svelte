<script lang="ts">
  import type { AutomationAction } from "$lib/api/automations";
  import { modulesWithInputs } from "$lib/api/automations/actions";
  import ValuePicker from "$lib/components/value-picker/value-picker.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";

  type ModuleInputAction = Extract<AutomationAction, { type: "moduleInput" }>;

  let {
    action,
    onChange,
  }: { action: ModuleInputAction; onChange: (patch: Partial<ModuleInputAction>) => void } =
    $props();

  const modules = modulesWithInputs();

  const SEPARATOR = "\n";
  const selected = $derived(
    action.moduleId ? `${action.moduleId}${SEPARATOR}${action.inputId}` : "",
  );
  const selectedModule = $derived(modules.find((m) => m.id === action.moduleId));
  const selectedInput = $derived(selectedModule?.inputs.find((i) => i.id === action.inputId));

  const triggerLabel = $derived(
    selectedInput
      ? `${selectedModule!.name}: ${selectedInput.label}`
      : action.moduleId
        ? "Not available any more"
        : "Pick an input",
  );

  function choose(next: string) {
    const [moduleId, inputId] = next.split(SEPARATOR);
    onChange({ moduleId, inputId, args: {} });
  }

  function setArg(id: string, value: string) {
    onChange({ args: { ...action.args, [id]: value } });
  }
</script>

{#if modules.length === 0}
  <p class="text-xs text-muted-foreground">No module has inputs right now.</p>
{:else}
  <div class="flex flex-col gap-2">
    <div class="flex flex-col gap-1">
      <Label class="text-xs">Input</Label>
      <Select.Root
        type="single"
        value={selected}
        onValueChange={(v) => {
          if (v) choose(v);
        }}
      >
        <Select.Trigger class="h-8 w-full max-w-sm text-xs">
          <span class="truncate">{triggerLabel}</span>
        </Select.Trigger>
        <Select.Content>
          {#each modules as module (module.id)}
            <Select.Group>
              <Select.GroupHeading>{module.name}</Select.GroupHeading>
              {#each module.inputs as input (input.id)}
                <Select.Item value={`${module.id}${SEPARATOR}${input.id}`}>
                  {input.label}
                </Select.Item>
              {/each}
            </Select.Group>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if selectedInput}
      <p class="text-xs text-muted-foreground">{selectedInput.description}</p>

      {#each selectedInput.params as param (param.id)}
        {@const label = param.optional ? `${param.label} (optional)` : param.label}
        {#if param.type === "boolean"}
          <label class="flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={action.args[param.id] === "true"}
              onCheckedChange={(v) => setArg(param.id, v ? "true" : "false")}
            />
            <span class="text-xs">{label}</span>
          </label>
        {:else if param.type === "select"}
          <div class="flex flex-col gap-1">
            <Label class="text-xs">{label}</Label>
            <Select.Root
              type="single"
              value={action.args[param.id] ?? ""}
              onValueChange={(v) => setArg(param.id, v)}
            >
              <Select.Trigger class="h-8 w-full max-w-sm text-xs">
                <span class="truncate">
                  {param.options?.find((o) => o.value === action.args[param.id])?.label ??
                    param.placeholder ??
                    "Pick one"}
                </span>
              </Select.Trigger>
              <Select.Content>
                {#each param.options ?? [] as option (option.value)}
                  <Select.Item value={option.value}>{option.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        {:else}
          <ValuePicker
            {label}
            inputClass="h-8 font-mono text-xs"
            placeholder={param.placeholder ?? (param.type === "number" ? "0" : "")}
            value={action.args[param.id] ?? ""}
            onChange={(value) => setArg(param.id, value)}
          />
        {/if}
      {/each}
    {/if}
  </div>
{/if}
