<script lang="ts">
  import { backup } from "$lib/api/backup";
  import { panic } from "$lib/api/toys";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import RouteLink from "$lib/components/route-link.svelte";
  import { Maximize, Minus, OctagonX, RotateCcw, X } from "@lucide/svelte";
  import { toast } from "svelte-sonner";

  const buttonClass = "w-11 h-full flex items-center justify-center transition-colors";

  const restartNeeded = backup.restartNeeded;

  async function stopEverything() {
    try {
      await panic.trigger();
    } catch {
      toast.error("The panic stop didn't go through, so a plain stop was sent instead.");
    }
  }
</script>

<header
  class="h-8 shrink-0 bg-black/95 flex items-center justify-between pl-3 border-b select-none"
  style="-webkit-app-region: drag;"
>
  <div class="flex min-w-0 items-center gap-3">
    <h1 class="text-sm font-semibold">ADVOSC</h1>
    {#if toyStatus.enabled}
      {#if toyStatus.latched}
        <RouteLink
          to="/lovense"
          class="flex h-6 items-center gap-1 rounded bg-destructive/20 px-2 text-xs font-medium text-destructive hover:bg-destructive/30"
          title="Panic stop is on. Open the Lovense page to re-arm."
        >
          <OctagonX class="size-3.5" />
          Panic stop on
        </RouteLink>
      {:else}
        <button
          class="flex h-6 items-center gap-1 rounded px-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
          title="Panic stop: stops every toy until you re-arm"
          onclick={stopEverything}
          style="-webkit-app-region: no-drag;"
        >
          <OctagonX class="size-3.5" />
          Panic stop
        </button>
      {/if}
    {/if}
    {#if $restartNeeded}
      <!-- Up here because nothing saves until the restart, wherever you are in the app. -->
      <button
        class="flex h-6 items-center gap-1 rounded bg-amber-500/15 px-2 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/25"
        title="Your restore is waiting on a restart. Nothing you change gets saved until then."
        onclick={() => window.ADVOSCNative.startup.restart()}
        style="-webkit-app-region: no-drag;"
      >
        <RotateCcw class="size-3.5" />
        Restart to finish restore
      </button>
    {/if}
  </div>
  <div class="flex h-full">
    <button
      class="{buttonClass} hover:bg-white/25"
      aria-label="Minimize"
      onclick={() => window.ADVOSCNative.frame.minimize()}
      style="-webkit-app-region: no-drag;"
    >
      <Minus class="size-4" />
    </button>
    <button
      class="{buttonClass} hover:bg-white/25"
      aria-label="Maximize"
      onclick={() => window.ADVOSCNative.frame.maximize()}
      style="-webkit-app-region: no-drag;"
    >
      <Maximize class="size-3.5" />
    </button>
    <button
      class="{buttonClass} hover:bg-red-500/75"
      aria-label="Close"
      onclick={() => window.ADVOSCNative.frame.close()}
      style="-webkit-app-region: no-drag;"
    >
      <X class="size-4" />
    </button>
  </div>
</header>
