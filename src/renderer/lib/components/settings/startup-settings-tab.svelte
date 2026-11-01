<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { RotateCcwIcon } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type { StartupSettings } from "../../../../shared/native-types";

  const startup = window.ADVOSCNative.startup;

  let settings = $state<StartupSettings | null>(null);

  onMount(async () => {
    settings = await startup.get();
  });

  async function update(patch: Partial<Pick<StartupSettings, "startHidden" | "gpuAcceleration">>) {
    try {
      settings = await startup.set(patch);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
</script>

<div class="flex flex-col gap-3 p-2">
  {#if settings}
    <Card.Root class="gap-4 p-3">
      <label class="flex cursor-pointer items-start gap-2 select-none">
        <Checkbox
          class="mt-0.5"
          checked={settings.startHidden}
          onCheckedChange={(v) => update({ startHidden: !!v })}
        />
        <span class="flex flex-col">
          <span class="text-sm">Start hidden</span>
          <span class="text-xs text-muted-foreground">
            ADVOSC starts in the tray without opening its window.
          </span>
        </span>
      </label>

      <label class="flex cursor-pointer items-start gap-2 select-none">
        <Checkbox
          class="mt-0.5"
          checked={settings.gpuAcceleration}
          onCheckedChange={(v) => update({ gpuAcceleration: !!v })}
        />
        <span class="flex flex-col">
          <span class="text-sm">GPU acceleration</span>
          <span class="text-xs text-muted-foreground">
            With this off, ADVOSC uses no video memory, and the window may be less smooth. Changing
            it needs a restart.
          </span>
        </span>
      </label>

      {#if settings.restartNeeded}
        <div
          role="status"
          class="flex items-center gap-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
        >
          <span class="min-w-0 flex-1">Restart ADVOSC to apply the GPU setting.</span>
          <Button variant="outline" size="sm" onclick={() => startup.restart()}>
            <RotateCcwIcon class="size-4" />
            Restart
          </Button>
        </div>
      {/if}
    </Card.Root>
  {/if}
</div>
