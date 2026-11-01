<script lang="ts">
  import { panic, toys, type ToyTransportId } from "$lib/api/toys";
  import NumberField from "$lib/components/number-field.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { CircleCheckIcon, PlugZapIcon, RefreshCwIcon, TriangleAlertIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import TransportCard from "./transport-card.svelte";

  const settings = toys.settings;
  const toyState = toys.state;
  const panicState = panic.state;

  let testing = $state(false);
  let testResult = $state<{ ok: boolean; text: string } | null>(null);

  const lan = $derived($settings.lovenseLan);
  const canTest = $derived(!!lan.host.trim() && lan.port >= 1 && lan.port <= 65535);

  function statusOf(id: ToyTransportId) {
    return $toyState.transports.find((transport) => transport.id === id);
  }

  function setLan(patch: Partial<typeof lan>) {
    testResult = null;
    toys.updateSettings({ lovenseLan: { ...lan, ...patch } });
  }

  async function testConnection() {
    testing = true;
    testResult = null;
    try {
      const result = await toys.testLovense(lan.host.trim(), lan.port);
      testResult = result.ok
        ? { ok: true, text: `Connected over ${result.scheme === "http" ? "HTTP" : "HTTPS"}.` }
        : { ok: false, text: result.error ?? "No answer from that address." };
    } catch (error) {
      testResult = { ok: false, text: (error as Error).message };
    } finally {
      testing = false;
    }
  }

  async function refresh() {
    try {
      await toys.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
</script>

{#snippet steps(items: string[])}
  <ol class="ml-4 list-decimal text-xs text-muted-foreground">
    {#each items as item}
      <li>{item}</li>
    {/each}
  </ol>
{/snippet}

<section class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <h2 class="text-sm font-medium">Connections</h2>
    <Button variant="outline" size="sm" onclick={refresh}>
      <RefreshCwIcon class="size-4" />
      Check again
    </Button>
  </div>

  <TransportCard
    title="Lovense Remote on this PC"
    description="For toys connected to Lovense Remote on the same computer."
    enabled={$settings.lovensePc.enabled}
    held={$panicState.latched}
    status={statusOf("lovense-pc")}
    onToggle={(enabled) => toys.updateSettings({ lovensePc: { enabled } })}
  >
    {@render steps([
      "Open Lovense Remote on this PC and connect your toy.",
      "Go to Discover, then Game Mode.",
      "Turn on Enable LAN.",
    ])}
  </TransportCard>

  <TransportCard
    title="Lovense Remote on your phone"
    description="For toys connected to the phone app. The phone and this PC have to be on the same network."
    enabled={lan.enabled}
    held={$panicState.latched}
    status={statusOf("lovense-lan")}
    onToggle={(enabled) => setLan({ enabled })}
  >
    {@render steps([
      "Open Lovense Remote on your phone and connect your toy.",
      "Go to Discover, then Game Mode, and turn on Enable LAN.",
      "Type the Local IP and port it shows into the boxes below.",
    ])}

    <div class="flex flex-wrap items-end gap-2">
      <div class="flex min-w-40 flex-1 flex-col gap-1">
        <Label for="lovense-host" class="text-xs">Local IP</Label>
        <Input
          id="lovense-host"
          class="h-8 font-mono text-xs"
          placeholder="192.168.1.44"
          value={lan.host}
          oninput={(e) => setLan({ host: (e.target as HTMLInputElement).value })}
        />
      </div>
      <NumberField
        label="Port"
        integer
        min={1}
        max={65535}
        placeholder="34567"
        value={lan.port || undefined}
        onChange={(port) => setLan({ port })}
      />
      <Button variant="outline" size="sm" disabled={!canTest || testing || $panicState.latched} onclick={testConnection}>
        <PlugZapIcon class="size-4" />
        {testing ? "Testing..." : "Test connection"}
      </Button>
    </div>

    {#if $panicState.latched}
      <p class="text-xs text-muted-foreground">
        Test connection is off while the panic stop is on.
      </p>
    {:else if testResult}
      <p
        role="status"
        class="flex items-start gap-1.5 text-xs {testResult.ok
          ? 'text-emerald-400'
          : 'text-destructive'}"
      >
        {#if testResult.ok}
          <CircleCheckIcon class="mt-0.5 size-3 shrink-0" />
        {:else}
          <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
        {/if}
        {testResult.text}
      </p>
    {/if}
  </TransportCard>

  <TransportCard
    title="Intiface Central"
    description="For toys connected through Intiface Central. Start its server, then check the address matches."
    enabled={$settings.intiface.enabled}
    held={$panicState.latched}
    status={statusOf("intiface")}
    onToggle={(enabled) =>
      toys.updateSettings({ intiface: { ...$settings.intiface, enabled } })}
  >
    <div class="flex flex-col gap-1">
      <Label for="intiface-url" class="text-xs">Server address</Label>
      <Input
        id="intiface-url"
        class="h-8 font-mono text-xs"
        placeholder="ws://127.0.0.1:12345"
        value={$settings.intiface.url}
        oninput={(e) =>
          toys.updateSettings({
            intiface: { ...$settings.intiface, url: (e.target as HTMLInputElement).value },
          })}
      />
    </div>
  </TransportCard>
</section>
