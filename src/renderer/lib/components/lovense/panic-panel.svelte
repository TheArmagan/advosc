<script lang="ts">
  import { panic } from "$lib/api/toys";
  import ConfirmDrawer from "$lib/components/confirm-drawer.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { OctagonXIcon, TriangleAlertIcon } from "@lucide/svelte";

  const panicState = panic.state;

  const REARM_EXPLAINED =
    "Toys reconnect and rules can start them again. Live and While it matches rules stay quiet until their value goes inactive once, so nothing jumps back on by itself.";

  let rearmOpen = $state(false);
  let rearming = $state(false);
  let failure = $state<string | null>(null);

  async function stopEverything() {
    failure = null;
    try {
      await panic.trigger();
    } catch {
      failure = "The panic stop didn't go through, so a plain stop was sent instead. Check your toys.";
    }
  }

  async function rearm() {
    rearming = true;
    failure = null;
    try {
      await panic.rearm();
      rearmOpen = false;
    } catch (error) {
      failure = `Couldn't re-arm: ${(error as Error).message}`;
      rearmOpen = false;
    } finally {
      rearming = false;
    }
  }
</script>

<section
  aria-label="Panic stop"
  class="sticky top-0 z-20 flex flex-col gap-2 border-b bg-background p-3"
>
  <Button
    variant="destructive"
    class="h-14 w-full text-base font-semibold"
    onclick={stopEverything}
  >
    <OctagonXIcon class="size-6" />
    Panic: stop all toys
    {#if $panicState.hotkey && !$panicState.hotkeyError}
      <span class="ml-2 font-mono text-xs font-normal opacity-80">{$panicState.hotkey}</span>
    {/if}
  </Button>

  {#if $panicState.latched}
    <div
      role="alert"
      class="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2"
    >
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium text-destructive">
          Panic stop is on. Nothing can start a toy.
        </span>
        <span class="text-xs text-muted-foreground">
          It stays on, even after a restart, until you re-arm.
        </span>
      </div>
      <Button variant="outline" size="sm" onclick={() => (rearmOpen = true)}>Re-arm toys</Button>
    </div>
  {/if}

  {#if $panicState.hotkeyError}
    <p role="alert" class="flex items-start gap-1.5 text-xs text-amber-400">
      <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      <span>
        Your panic hotkey isn't working right now: {$panicState.hotkeyError} Pick another one under
        Strength and safety.
      </span>
    </p>
  {/if}

  {#if failure}
    <p role="alert" class="flex items-start gap-1.5 text-xs text-destructive">
      <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      {failure}
    </p>
  {/if}
</section>

<ConfirmDrawer
  bind:open={rearmOpen}
  title="Re-arm toys?"
  description={REARM_EXPLAINED}
  confirmLabel="Re-arm toys"
  destructive={false}
  busy={rearming}
  onConfirm={rearm}
/>
