<script lang="ts">
  import { automations, type Automation, type AutomationStatus } from "$lib/api/automations";
  import { MODE_LABELS } from "$lib/api/automations/actions";
  import { shortAddress } from "$lib/components/avatar-osc/parameter-search";
  import StatusPill, { type PillTone } from "$lib/components/status-pill.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { ChevronDownIcon, RotateCcwIcon, TriangleAlertIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import AutomationEditor from "./automation-editor.svelte";

  let {
    rule,
    status,
    expanded,
    onToggle,
    onDelete,
  }: {
    rule: Automation;
    status?: AutomationStatus;
    expanded: boolean;
    onToggle: () => void;
    onDelete: () => void;
  } = $props();

  const tripped = $derived(status?.health === "tripped");
  const broken = $derived(tripped || status?.health === "error");

  /** Rules from a bundle carry an empty sound and arrive off, where the engine reports nothing. */
  const needsSound = $derived(
    rule.actions.some((action) => action.type === "sound" && action.soundIds.length === 0),
  );

  const health = $derived.by((): { label: string; tone: PillTone; title?: string } => {
    if (status?.health === "tripped") return { label: "Stopped itself", tone: "error" };
    if (status?.health === "error") return { label: "Error", tone: "error" };
    if (needsSound) {
      return {
        label: "Pick a sound",
        tone: "warn",
        title: "This rule plays a sound, but none is picked yet.",
      };
    }
    if (!rule.enabled) return { label: "Off", tone: "muted" };
    if (status?.health === "no-data") {
      return {
        label: "No data",
        tone: "warn",
        title: status.message ?? "The source hasn't given a value yet.",
      };
    }
    if (status?.active) return { label: "Active", tone: "ok" };
    return { label: "Waiting", tone: "muted" };
  });

  const sourceText = $derived(
    rule.source.kind === "parameter"
      ? shortAddress(rule.source.address)
      : rule.source.template,
  );

  const summary = $derived(
    !sourceText
      ? "No source yet"
      : rule.mode === "live"
        ? `Follows ${sourceText}`
        : `${sourceText} ${/^\s*(==|=|!=|>=|<=|>|<)/.test(rule.match) ? rule.match.trim() : `= ${rule.match.trim()}`}`,
  );

  async function reset() {
    try {
      await automations.reset(rule.id);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
</script>

<Card.Root class="gap-3 p-3">
  <div class="flex items-center gap-2">
    <Checkbox
      aria-label="Enable {rule.name || 'this rule'}"
      checked={rule.enabled}
      onCheckedChange={(v) => automations.update(rule.id, { enabled: !!v })}
    />
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-expanded={expanded}
      onclick={onToggle}
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-sm">{rule.name || "Untitled rule"}</span>
        <span class="truncate font-mono text-xs text-muted-foreground">
          {MODE_LABELS[rule.mode]}: {summary}
        </span>
      </span>
      {#if status?.lastValue !== undefined}
        <span
          class="max-w-32 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
          title={status.lastValue}
        >
          {status.lastValue || '""'}
        </span>
      {/if}
      <StatusPill tone={health.tone} title={health.title}>{health.label}</StatusPill>
      <ChevronDownIcon
        class="size-4 shrink-0 text-muted-foreground transition-transform {expanded
          ? 'rotate-180'
          : ''}"
      />
    </button>
  </div>

  {#if broken}
    <div
      role="alert"
      class="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
    >
      <TriangleAlertIcon class="size-3.5 shrink-0" />
      <span class="min-w-0 flex-1">
        {status?.message ??
          (tripped
            ? "This rule fired too fast, so it was stopped."
            : "This rule hit a problem.")}
      </span>
      <!-- The engine only resets a tripped rule. An error clears once its cause is fixed. -->
      {#if tripped}
        <Button variant="outline" size="sm" class="h-7" onclick={reset}>
          <RotateCcwIcon class="size-3.5" />
          Reset
        </Button>
      {:else if !expanded}
        <Button variant="outline" size="sm" class="h-7" onclick={onToggle}>Edit rule</Button>
      {/if}
    </div>
  {/if}

  {#if expanded}
    <AutomationEditor {rule} {status} {onDelete} />
  {/if}
</Card.Root>
