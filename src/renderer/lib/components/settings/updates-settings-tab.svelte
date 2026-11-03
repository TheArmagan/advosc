<script lang="ts">
  import {
    checkForUpdates,
    downloadPercent,
    formatBytes,
    restartToUpdate,
    timeAgo,
    timeLeft,
    updates,
  } from "$lib/api/updates.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { cn } from "$lib/utils";
  import {
    CircleAlertIcon,
    CircleCheckIcon,
    DownloadIcon,
    LoaderCircleIcon,
    RotateCwIcon,
  } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  const version = window.ADVOSCNative.version;
  const update = $derived(updates.state);
  const percent = $derived(downloadPercent(update));

  // "Checked 5 min ago" and the time left should move on their own.
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => clearInterval(tick));

  const title = $derived.by(() => {
    void now;
    switch (update.status) {
      case "checking":
        return "Checking for updates...";
      case "downloading":
        return `Downloading ${update.version ? `ADVOSC ${update.version}` : "an update"}`;
      case "ready":
        return `ADVOSC ${update.version} is ready to install`;
      case "error":
        return "The last check didn't work";
      case "idle":
        return "You're up to date";
      default:
        return "Updates are off in this build";
    }
  });

  const detail = $derived.by(() => {
    void now;
    switch (update.status) {
      case "checking":
        return "This takes a few seconds.";
      case "downloading": {
        if (update.total && update.received !== undefined) {
          const left = timeLeft(update);
          return `${formatBytes(update.received)} of ${formatBytes(update.total)}${left ? `, ${left}` : ""}`;
        }
        return "It downloads in the background, so you can keep using ADVOSC.";
      }
      case "ready":
        return "Restarting takes a few seconds. Your settings, templates and profiles are kept.";
      case "error":
        return `${update.message} It tries again every hour.`;
      case "idle":
        return update.checkedAt
          ? `Checked ${timeAgo(update.checkedAt)}. ADVOSC checks every hour.`
          : "ADVOSC checks every hour.";
      default:
        return update.reason === "portable"
          ? "This is the zip build, which doesn't update itself. Download the installer to get updates, or grab new zips from the releases page."
          : update.reason === "dev"
            ? "Running from source. Updates only work in the installed app."
            : "Updates only work on Windows.";
    }
  });

  const canCheck = $derived(update.status === "idle" || update.status === "error");
</script>

<div class="flex flex-col gap-3 p-2">
  <Card.Root class="gap-0 overflow-hidden p-0">
    <div class="flex items-start gap-3 p-4">
      <span
        class={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          update.status === "ready" && "bg-primary text-primary-foreground",
          update.status === "downloading" && "bg-primary/15 text-primary",
          update.status === "error" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          (update.status === "idle" || update.status === "checking" || update.status === "unsupported") &&
            "bg-muted text-muted-foreground",
        )}
      >
        {#if update.status === "checking"}
          <LoaderCircleIcon class="size-4.5 animate-spin motion-reduce:animate-none" />
        {:else if update.status === "downloading"}
          <DownloadIcon class="size-4.5" />
        {:else if update.status === "ready"}
          <RotateCwIcon class="size-4.5" />
        {:else if update.status === "error"}
          <CircleAlertIcon class="size-4.5" />
        {:else}
          <CircleCheckIcon class="size-4.5" />
        {/if}
      </span>

      <div class="flex min-w-0 flex-1 flex-col gap-0.5" aria-live="polite">
        <p class="text-sm font-medium">{title}</p>
        <p class="text-xs text-muted-foreground">{detail}</p>
      </div>

      {#if update.status === "ready"}
        <Button size="sm" class="shrink-0 gap-1.5" onclick={restartToUpdate}>
          <RotateCwIcon class="size-3.5" />
          Restart now
        </Button>
      {:else if update.status !== "unsupported"}
        <Button
          size="sm"
          variant="outline"
          class="shrink-0"
          disabled={!canCheck}
          onclick={checkForUpdates}
        >
          Check now
        </Button>
      {/if}
    </div>

    {#if update.status === "downloading"}
      <div class="flex items-center gap-3 px-4 pb-4">
        {#if percent !== null}
          <Progress value={percent} class="h-1.5" />
          <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{percent}%</span>
        {:else}
          <div class="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <span
              class="absolute inset-y-0 w-1/3 animate-[update-slide_1.4s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:left-1/3 motion-reduce:animate-none"
            ></span>
          </div>
        {/if}
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span>Installed: <code class="text-foreground/80">v{version}</code></span>
      <button
        type="button"
        class="underline-offset-2 hover:text-foreground hover:underline"
        onclick={() => window.ADVOSCNative.shell.openExternal("https://github.com/TheArmagan/advosc/releases")}
      >
        Release notes
      </button>
    </div>
  </Card.Root>
</div>
