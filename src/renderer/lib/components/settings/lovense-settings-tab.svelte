<script lang="ts">
  import { panic, toys } from "$lib/api/toys";
  import ConfirmDrawer from "$lib/components/confirm-drawer.svelte";
  import PanicHotkeyField from "$lib/components/lovense/panic-hotkey-field.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { navigateTo } from "$lib/router";
  import { TriangleAlertIcon } from "@lucide/svelte";

  const DEFAULT_PERCENT = 50;

  const settings = toys.settings;
  const panicState = panic.state;

  let settingUp = $state(false);
  let percent = $state(DEFAULT_PERCENT);
  let finishing = $state(false);
  let failure = $state<string | null>(null);
  let turnOffOpen = $state(false);

  function startSetup() {
    percent = DEFAULT_PERCENT;
    failure = null;
    settingUp = true;
  }

  /**
   * Registers again here even when a hotkey is already saved, because a saved one may have failed
   * to register on this launch. Toys only turn on once a panic hotkey is known to work.
   */
  async function finish() {
    finishing = true;
    failure = null;
    try {
      const result = await panic.setHotkey($panicState.hotkey);
      if (!result.ok) {
        failure = result.error ?? "That hotkey didn't register. Try a different one.";
        return;
      }
      toys.updateSettings({ enabled: true, maxLevel: percent / 100 });
      settingUp = false;
      navigateTo("/lovense");
    } catch (error) {
      failure = (error as Error).message;
    } finally {
      finishing = false;
    }
  }

  function turnOff() {
    toys.stopAll();
    toys.updateSettings({ enabled: false });
    turnOffOpen = false;
  }
</script>

<div class="flex flex-col gap-3 p-2">
  {#if $settings.enabled}
    <Card.Root class="gap-3 p-3">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Lovense is on</span>
        <span class="text-xs text-muted-foreground">
          Panic hotkey: <span class="font-mono">{$panicState.hotkey || "none"}</span>. Max strength:
          {Math.round($settings.maxLevel * 100)}%.
        </span>
        {#if $panicState.hotkeyError}
          <span class="flex items-start gap-1.5 text-xs text-amber-400">
            <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
            Your panic hotkey isn't working right now: {$panicState.hotkeyError}
          </span>
        {/if}
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onclick={() => navigateTo("/lovense")}>
          Open Lovense page
        </Button>
        <Button variant="outline" size="sm" onclick={() => (turnOffOpen = true)}>Turn off</Button>
      </div>
    </Card.Root>
  {:else if settingUp}
    <Card.Root class="gap-4 p-3">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Set up Lovense</span>
        <span class="text-xs text-muted-foreground">
          Two things first, so you can always stop a toy.
        </span>
      </div>

      <div class="flex flex-col gap-1">
        <Label class="text-xs font-medium">1. Pick a panic hotkey</Label>
        <p class="text-xs text-muted-foreground">
          It stops every toy and keeps them stopped until you re-arm. Pick something you can reach
          while you're in VR.
        </p>
        <PanicHotkeyField />
      </div>

      <div class="flex max-w-md flex-col gap-1">
        <Label class="text-xs font-medium">2. Set a max strength: {percent}%</Label>
        <p class="text-xs text-muted-foreground">
          Nothing goes above this, from any rule or test. You can change it later.
        </p>
        <Slider
          class="h-8"
          type="single"
          min={5}
          max={100}
          step={5}
          value={percent}
          onValueChange={(v: number) => (percent = v)}
        />
      </div>

      {#if failure}
        <p role="alert" class="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
          {failure}
        </p>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!$panicState.hotkey || finishing} onclick={finish}>
          {finishing ? "Checking hotkey..." : "Turn on Lovense"}
        </Button>
        <Button variant="outline" size="sm" onclick={() => (settingUp = false)}>Cancel</Button>
        {#if !$panicState.hotkey}
          <span class="text-xs text-muted-foreground">Set a panic hotkey to continue.</span>
        {/if}
      </div>
    </Card.Root>
  {:else}
    <Card.Root class="gap-3 p-3">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Lovense is off</span>
        <span class="text-xs text-muted-foreground">
          Turn this on to control Lovense and Intiface toys from Automations. While it's off,
          nothing connects and the page stays out of the sidebar.
        </span>
      </div>
      <div>
        <Button variant="outline" size="sm" onclick={startSetup}>Set up</Button>
      </div>
    </Card.Root>
  {/if}
</div>

<ConfirmDrawer
  bind:open={turnOffOpen}
  title="Turn off Lovense?"
  description="This stops every toy and closes all connections. Rules keep their toy actions for next time, but they won't run."
  confirmLabel="Turn off"
  onConfirm={turnOff}
/>
