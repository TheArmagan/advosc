<script lang="ts">
  import { toys, type ToyFeature, type ToyPattern } from "$lib/api/toys";
  import NumberField from "$lib/components/number-field.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Trash2Icon, TriangleAlertIcon } from "@lucide/svelte";

  const MAX_STEPS = 50;
  /** Lovense requires more than 100 ms per step. */
  const MIN_STEP_MS = 101;

  const FEATURES: ToyFeature[] = [
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

  let { pattern }: { pattern: ToyPattern } = $props();

  const stepsId = `pattern-steps-${pattern.id}`;

  // What's typed stays here until it's valid, so a half-finished list isn't saved or rewritten.
  let stepsText = $state(pattern.steps.map((step) => Math.round(step * 100)).join(", "));
  let stepsError = $state<string | null>(null);

  function setSteps(text: string) {
    stepsText = text;
    const parts = text.split(/[\s,]+/).filter(Boolean);
    const percents = parts.map(Number);

    if (parts.length === 0) {
      stepsError = "Add at least one step.";
    } else if (parts.length > MAX_STEPS) {
      stepsError = `Patterns can have up to ${MAX_STEPS} steps.`;
    } else if (percents.some((value) => Number.isNaN(value) || value < 0 || value > 100)) {
      stepsError = "Steps are percentages from 0 to 100, separated by commas.";
    } else {
      stepsError = null;
      toys.updatePattern(pattern.id, { steps: percents.map((value) => value / 100) });
    }
  }
</script>

<Card.Root class="gap-2 p-3">
  <div class="flex items-center gap-2">
    <Input
      class="h-8 flex-1 text-sm"
      placeholder="Pattern name"
      aria-label="Pattern name"
      value={pattern.name}
      oninput={(e) =>
        toys.updatePattern(pattern.id, { name: (e.target as HTMLInputElement).value })}
    />
    <Button
      variant="ghost"
      size="icon"
      class="size-7 text-destructive hover:text-destructive"
      aria-label="Delete pattern"
      title="Delete pattern"
      onclick={() => toys.removePattern(pattern.id)}
    >
      <Trash2Icon class="size-4" />
    </Button>
  </div>

  <div class="flex flex-wrap items-start gap-2">
    <div class="flex min-w-48 flex-1 flex-col gap-1">
      <Label for={stepsId} class="text-xs">Steps (%)</Label>
      <Input
        id={stepsId}
        class="h-8 font-mono text-xs"
        placeholder="20, 50, 80, 50"
        aria-invalid={!!stepsError}
        value={stepsText}
        oninput={(e) => setSteps((e.target as HTMLInputElement).value)}
      />
    </div>
    <NumberField
      label="Each step (ms)"
      integer
      min={MIN_STEP_MS}
      step={50}
      value={pattern.stepMs}
      onChange={(stepMs) => toys.updatePattern(pattern.id, { stepMs })}
    />
    <div class="flex w-40 flex-col gap-1">
      <Label class="text-xs">Features</Label>
      <Select.Root
        type="multiple"
        value={pattern.features}
        onValueChange={(v) =>
          toys.updatePattern(pattern.id, { features: (v ?? []) as ToyFeature[] })}
      >
        <Select.Trigger class="h-8 w-full text-xs">
          <span class="truncate">
            {pattern.features.length ? pattern.features.join(", ") : "Pick at least one"}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each FEATURES as feature (feature)}
            <Select.Item value={feature}>{feature}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </div>

  {#if stepsError}
    <p role="alert" class="flex items-start gap-1.5 text-xs text-destructive">
      <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      {stepsError}
    </p>
  {/if}

  <div class="flex h-8 items-end gap-px" aria-hidden="true">
    {#each pattern.steps as step}
      <div
        class="min-w-0 flex-1 rounded-t-sm bg-muted-foreground/50"
        style="height: {Math.max(step * 100, 4)}%"
      ></div>
    {/each}
  </div>
</Card.Root>
