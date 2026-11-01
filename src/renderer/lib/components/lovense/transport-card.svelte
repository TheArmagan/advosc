<script lang="ts">
  import type { ToyTransportStatus } from "$lib/api/toys";
  import StatusPill, { type PillTone } from "$lib/components/status-pill.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { TriangleAlertIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  let {
    title,
    description,
    enabled,
    held,
    status,
    onToggle,
    children,
  }: {
    title: string;
    description: string;
    enabled: boolean;
    /** The panic stop is on, so the engine holds no connections and reports no status. */
    held: boolean;
    status?: ToyTransportStatus;
    onToggle: (enabled: boolean) => void;
    children: Snippet;
  } = $props();

  const states: Record<ToyTransportStatus["state"], { label: string; tone: PillTone }> = {
    disabled: { label: "Off", tone: "muted" },
    connecting: { label: "Connecting", tone: "warn" },
    connected: { label: "Connected", tone: "ok" },
    error: { label: "Can't connect", tone: "error" },
  };

  const view = $derived.by((): { label: string; tone: PillTone } => {
    if (!enabled) return states.disabled;
    if (held) return { label: "Disconnected by panic", tone: "muted" };
    return states[status?.state ?? "connecting"];
  });
</script>

<Card.Root class="gap-2 p-3">
  <div class="flex items-center gap-2">
    <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 select-none">
      <Checkbox checked={enabled} onCheckedChange={(v) => onToggle(!!v)} />
      <span class="truncate text-sm font-medium">{title}</span>
    </label>
    <StatusPill tone={view.tone}>{view.label}</StatusPill>
  </div>

  <p class="text-xs text-muted-foreground">{description}</p>

  {#if enabled && !held && status?.error}
    <p role="alert" class="flex items-start gap-1.5 text-xs text-destructive">
      <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      {status.error}
    </p>
  {/if}

  {#if enabled}
    {@render children()}
  {/if}
</Card.Root>
