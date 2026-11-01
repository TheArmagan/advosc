<script lang="ts">
  import { panic, toys, type ToysState } from "$lib/api/toys";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import ConnectionsSection from "$lib/components/lovense/connections-section.svelte";
  import PanicHotkeyField from "$lib/components/lovense/panic-hotkey-field.svelte";
  import PanicPanel from "$lib/components/lovense/panic-panel.svelte";
  import PatternCard from "$lib/components/lovense/pattern-card.svelte";
  import ToysSection from "$lib/components/lovense/toys-section.svelte";
  import NumberField from "$lib/components/number-field.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { DEFAULT_PATH } from "$lib/nav";
  import { navigateTo } from "$lib/router";
  import { PauseIcon, PlusIcon } from "@lucide/svelte";

  const settings = toys.settings;
  const toyState = toys.state;
  const panicState = panic.state;
  const panicReady = panic.ready;

  const PAUSED: Record<NonNullable<ToysState["paused"]>, string> = {
    "osc-silence": "Paused: VRChat has gone quiet. Rules pick up again when OSC comes back.",
    "vrchat-closed": "Stopped: VRChat isn't running.",
    "safe-mode": "Paused: ADVOSC is in safe mode, so rules are off until you restart it.",
  };

  // The page can be open when something else turns toys off, such as a restored backup.
  $effect(() => {
    if (!toyStatus.enabled) navigateTo(DEFAULT_PATH);
  });
</script>

<div class="flex w-full flex-col">
  <PanicPanel />

  <div class="flex flex-col gap-5 p-4">
    {#if $toyState.paused}
      <p
        role="status"
        class="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
      >
        <PauseIcon class="size-3.5 shrink-0" />
        {PAUSED[$toyState.paused]}
      </p>
    {/if}

    <section class="flex flex-col gap-2">
      <h2 class="text-sm font-medium">Strength and safety</h2>
      <Card.Root class="gap-4 p-3">
        <div class="flex max-w-md flex-col gap-1">
          <Label class="text-xs">
            Max strength: {Math.round($settings.maxLevel * 100)}%
          </Label>
          <Slider
            class="h-8"
            type="single"
            min={5}
            max={100}
            step={5}
            value={Math.round($settings.maxLevel * 100)}
            onValueChange={(v: number) => toys.updateSettings({ maxLevel: v / 100 })}
          />
          <p class="text-xs text-muted-foreground">
            Nothing goes above this, from any rule or test. On/off devices have no level between
            off and full, so they stay off until this is 100%.
          </p>
        </div>

        <div class="flex flex-wrap items-start gap-6">
          <div class="flex flex-col gap-1">
            <Label class="text-xs">Panic hotkey</Label>
            <PanicHotkeyField />
            {#if $panicReady && !$panicState.hotkey}
              <p class="text-xs text-amber-400">
                No hotkey is set. Add one so you can stop toys from inside VR.
              </p>
            {/if}
          </div>

          <div class="flex flex-col gap-1">
            <NumberField
              label="Pause after silence (seconds)"
              integer
              min={0}
              inputClass="w-28"
              value={$settings.silencePauseSec}
              onChange={(silencePauseSec) => toys.updateSettings({ silencePauseSec })}
            />
            <p class="max-w-64 text-xs text-muted-foreground">
              Pauses Live and While it matches rules when VRChat stops sending OSC. 0 turns this
              off.
            </p>
          </div>
        </div>

        <label class="flex cursor-pointer items-center gap-2 select-none">
          <Checkbox
            checked={$settings.stopOnAvatarChange}
            onCheckedChange={(v) => toys.updateSettings({ stopOnAvatarChange: !!v })}
          />
          <span class="text-xs">Stop toys when you change avatar</span>
        </label>
      </Card.Root>
    </section>

    <ConnectionsSection />

    <ToysSection />

    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium">Patterns</h2>
        <Button variant="outline" size="sm" onclick={() => toys.addPattern()}>
          <PlusIcon class="size-4" />
          Add pattern
        </Button>
      </div>

      {#if $settings.patterns.length === 0}
        <p class="py-4 text-center text-sm text-muted-foreground">
          No patterns yet. A pattern is a list of strengths played in order and repeated, and rules
          can use it as an action.
        </p>
      {/if}

      {#each $settings.patterns as pattern (pattern.id)}
        <PatternCard {pattern} />
      {/each}
    </section>
  </div>
</div>
