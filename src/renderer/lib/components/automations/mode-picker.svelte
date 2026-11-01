<script lang="ts" module>
  let nextId = 0;
</script>

<script lang="ts">
  import { MODE_LABELS } from "$lib/api/automations/actions";
  import type { AutomationMode } from "$lib/api/automations";
  import { cn } from "$lib/utils";

  let {
    value,
    onChange,
  }: { value: AutomationMode; onChange: (mode: AutomationMode) => void } = $props();

  const name = `automation-mode-${nextId++}`;

  const modes: { id: AutomationMode; description: string }[] = [
    { id: "edge", description: "Runs the actions once, each time the value starts matching." },
    {
      id: "while",
      description: "Starts the actions when the value starts matching, and ends them when it stops.",
    },
    {
      id: "live",
      description: "Keeps following the value, turned into a number by the range below.",
    },
  ];
</script>

<div role="radiogroup" aria-label="How it runs" class="grid gap-2 sm:grid-cols-3">
  {#each modes as mode (mode.id)}
    <label
      class={cn(
        "flex cursor-pointer flex-col gap-0.5 rounded-md border p-2 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        value === mode.id ? "border-ring bg-accent/50" : "hover:bg-accent/30",
      )}
    >
      <input
        type="radio"
        class="sr-only"
        {name}
        value={mode.id}
        checked={value === mode.id}
        onchange={() => onChange(mode.id)}
      />
      <span class="text-xs font-medium">{MODE_LABELS[mode.id]}</span>
      <span class="text-xs text-muted-foreground">{mode.description}</span>
    </label>
  {/each}
</div>
