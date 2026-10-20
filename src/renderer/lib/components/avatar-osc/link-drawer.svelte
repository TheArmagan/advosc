<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { LinkIcon, UnlinkIcon, XIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import ParameterPicker from "./parameter-picker.svelte";
  import { normalizeAddress } from "./parameter-search";

  let { open = $bindable(false), address }: { open?: boolean; address: string } = $props();

  const links = avatarOSC.links;
  const schemaIndex = avatarOSC.schemaIndex;

  let target = $state("");

  const targets = $derived($links[address] ?? []);
  const incoming = $derived(
    Object.entries($links)
      .filter(([, list]) => list.includes(address))
      .map(([from]) => from),
  );

  $effect(() => {
    if (open) target = "";
  });

  function add() {
    const to = normalizeAddress(target);
    if (!to) return;
    if (avatarOSC.link(address, to)) toast.success("Linked");
    else toast.info(to === address ? "Can't link a parameter to itself" : "Already linked");
    target = "";
  }

  const label = (a: string) => $schemaIndex[a]?.name ?? a;
</script>

<Drawer.Root bind:open>
  <Drawer.Content class="flex items-center justify-center">
    <div class="flex w-[28rem] flex-col gap-4 p-4">
      <Drawer.Header class="flex flex-col items-center gap-2">
        <Drawer.Title class="text-center">Link parameter</Drawer.Title>
        <Drawer.Description class="text-center">
          When VRChat changes <span class="font-medium text-foreground">{label(address)}</span>,
          the same value gets sent to every parameter linked below.
        </Drawer.Description>
      </Drawer.Header>

      <div class="flex flex-col gap-1">
        <Label>Add a target</Label>
        <div class="flex items-center gap-2">
          <ParameterPicker
            class="flex-1"
            bind:value={target}
            exclude={[address, ...targets]}
            onpick={add}
          />
          <Button size="icon" variant="secondary" disabled={!target.trim()} onclick={add} aria-label="Link">
            <LinkIcon />
          </Button>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <Label>Sends to</Label>
        {#if targets.length}
          <div class="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-1">
            {#each targets as linked (linked)}
              <div class="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                <span class="truncate">{label(linked)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-6"
                  onclick={() => avatarOSC.unlink(address, linked)}
                  aria-label="Remove link"
                >
                  <XIcon class="size-3.5" />
                </Button>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">Nothing linked yet.</p>
        {/if}
      </div>

      {#if incoming.length}
        <p class="text-xs text-muted-foreground">
          This one also receives values from: {incoming.map(label).join(", ")}
        </p>
      {/if}

      <Drawer.Footer class="flex flex-row items-center justify-between px-0">
        <Button
          variant="destructive"
          disabled={!targets.length}
          onclick={() => {
            avatarOSC.unlink(address);
            toast.success("All links removed");
          }}
        >
          <UnlinkIcon /> Remove all
        </Button>
        <Drawer.Close>
          {#snippet child({ props })}
            <Button {...props} variant="outline">Close</Button>
          {/snippet}
        </Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>
