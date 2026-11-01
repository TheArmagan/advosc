<script lang="ts">
  import { panic, toys, type ToyFeature, type ToyInfo, type ToyTransportId } from "$lib/api/toys";
  import StatusPill from "$lib/components/status-pill.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { SquareIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";

  const TEST_LEVEL = 0.25;

  const TRANSPORT_LABELS: Record<ToyTransportId, string> = {
    "lovense-pc": "This PC",
    "lovense-lan": "Phone",
    intiface: "Intiface",
  };

  const toyState = toys.state;
  const settings = toys.settings;
  const panicState = panic.state;

  async function test(toy: ToyInfo, feature: ToyFeature) {
    try {
      await toys.test(toy.id, feature, TEST_LEVEL);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
</script>

<section class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <h2 class="text-sm font-medium">Toys</h2>
    <Button
      variant="outline"
      size="sm"
      disabled={$toyState.toys.length === 0}
      onclick={() => toys.stopAll()}
    >
      <SquareIcon class="size-4" />
      Stop tests
    </Button>
  </div>

  {#if $toyState.toys.length === 0}
    <p class="py-4 text-center text-sm text-muted-foreground">
      {$panicState.latched
        ? "Toys disconnect while the panic stop is on. They come back after you re-arm."
        : "No toys connected yet. Turn on a connection above."}
    </p>
  {:else}
    <p class="text-xs text-muted-foreground">
      Tests run for a moment at 25%, or at your max strength if that's lower.
    </p>
  {/if}

  {#each $toyState.toys as toy (toy.id)}
    <Card.Root class="gap-2 p-3 {toy.connected ? '' : 'opacity-60'}">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-sm">{toy.name}</span>
        <StatusPill>{TRANSPORT_LABELS[toy.transport]}</StatusPill>
        {#if toy.battery !== null}
          <StatusPill tone={toy.battery <= 15 ? "warn" : "muted"}>
            Battery {toy.battery}%
          </StatusPill>
        {/if}
        {#if !toy.connected}
          <StatusPill tone="warn">Not connected</StatusPill>
        {/if}
      </div>
      {#if toy.onOff && $settings.maxLevel < 1}
        <p class="text-xs text-amber-400">
          This device is only on or off, so it stays off until max strength is 100%.
        </p>
      {/if}
      <div class="flex flex-wrap gap-2">
        {#each toy.features as feature (feature)}
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            disabled={!toy.connected || $panicState.latched}
            onclick={() => test(toy, feature)}
          >
            Test {feature}
          </Button>
        {/each}
      </div>
    </Card.Root>
  {/each}
</section>
