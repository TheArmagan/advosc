<script lang="ts">
  import {
    downloadPercent,
    restartToUpdate,
    startUpdateWatch,
    timeAgo,
    updates,
  } from "$lib/api/updates.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { cn } from "$lib/utils";
  import { ArrowDownToLineIcon, LoaderCircleIcon, RotateCwIcon } from "@lucide/svelte";
  import { onMount } from "svelte";

  /** The version in the sidebar footer, which turns into update progress and a restart button. */
  let { collapsed = false }: { collapsed?: boolean } = $props();

  onMount(startUpdateWatch);

  const version = window.ADVOSCNative.version;
  const update = $derived(updates.state);
  const percent = $derived(downloadPercent(update));

  const tooltip = $derived.by(() => {
    switch (update.status) {
      case "checking":
        return "Checking for updates";
      case "idle":
        return update.checkedAt ? `Up to date, checked ${timeAgo(update.checkedAt)}` : "Up to date";
      case "error":
        return "The last update check failed. See Settings, Updates.";
      case "downloading":
        return `Downloading ${update.version ?? "an update"}${percent !== null ? `, ${percent}%` : ""}`;
      case "ready":
        return `${update.version} is downloaded. Restart to install it.`;
      default:
        return `Version ${version}`;
    }
  });

  // Ring for the collapsed sidebar: circumference of r=7.
  const RING = 2 * Math.PI * 7;
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      {#if update.status === "ready"}
        {#if collapsed}
          <Button {...props} size="icon-sm" class="relative" aria-label="Restart to update" onclick={restartToUpdate}>
            <RotateCwIcon />
          </Button>
        {:else}
          <Button {...props} size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={restartToUpdate}>
            <RotateCwIcon class="size-3.5" />
            Restart to update
          </Button>
        {/if}
      {:else if update.status === "downloading"}
        {#if collapsed}
          <span {...props} class="relative flex size-7 items-center justify-center" role="status">
            <svg viewBox="0 0 18 18" class="size-5 -rotate-90">
              <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="2" class="text-white/10" />
              <circle
                cx="9"
                cy="9"
                r="7"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                class={cn("origin-center text-primary transition-[stroke-dashoffset] duration-500", percent === null && "animate-spin motion-reduce:animate-none")}
                stroke-dasharray={RING}
                stroke-dashoffset={RING * (1 - (percent ?? 25) / 100)}
              />
            </svg>
          </span>
        {:else}
          <span {...props} class="flex min-w-0 flex-1 flex-col gap-1 pr-2" role="status">
            <span class="flex items-center gap-1.5 text-xs text-foreground/80">
              <ArrowDownToLineIcon class="size-3.5 shrink-0 text-primary" />
              <span class="truncate">Updating</span>
              <span class="ml-auto tabular-nums text-muted-foreground">{percent !== null ? `${percent}%` : ""}</span>
            </span>
            <span class="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
              {#if percent === null}
                <span class="absolute inset-y-0 w-1/3 animate-[update-slide_1.4s_ease-in-out_infinite] rounded-full bg-primary/70 motion-reduce:left-1/3 motion-reduce:animate-none"></span>
              {:else}
                <span class="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500" style="width: {percent}%"></span>
              {/if}
            </span>
          </span>
        {/if}
      {:else}
        <span {...props} class={cn("flex items-center gap-1", collapsed ? "text-[10px]" : "text-xs")}>
          <code class="text-white/50">v{version}</code>
          {#if update.status === "checking"}
            <LoaderCircleIcon class="size-3 animate-spin text-muted-foreground" />
          {:else if update.status === "error"}
            <span class="size-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
          {/if}
        </span>
      {/if}
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content side="top">{tooltip}</Tooltip.Content>
</Tooltip.Root>

<style>
  @keyframes -global-update-slide {
    0% {
      left: -33%;
    }
    100% {
      left: 100%;
    }
  }
</style>
