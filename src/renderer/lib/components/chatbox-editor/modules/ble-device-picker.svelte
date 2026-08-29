<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { BluetoothSearchingIcon, HeartPulseIcon, RadioIcon } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";

  const {
    value,
    onChange,
  }: {
    value: string;
    onChange: (address: string) => void;
  } = $props();

  interface ScanResult {
    address: string;
    name: string | null;
    rssi: number | null;
    hrService: boolean;
  }

  let scanning = $state(false);
  let results = $state<ScanResult[]>([]);
  let adapter = $state<string | null>(null);
  let error = $state<string | undefined>(undefined);
  let showAll = $state(false);

  let unsubscribe: (() => void) | null = null;

  function applyState(state: any) {
    scanning = state.scanning;
    adapter = state.adapter;
    error = state.error;
    // Strongest signal first, so the band on your wrist is at the top.
    results = [...state.scanResults].sort(
      (a: ScanResult, b: ScanResult) => (b.rssi ?? -999) - (a.rssi ?? -999),
    );
  }

  function startScan() {
    results = [];
    window.ADVOSCNative.ble.scan({ seconds: 15, all: showAll }).then(applyState);
  }

  function stopScan() {
    window.ADVOSCNative.ble.stopScan().then(applyState);
  }

  onMount(() => {
    window.ADVOSCNative.ble.getState().then(applyState);
    unsubscribe = window.ADVOSCNative.ble.onEvent((event: any) => {
      if (event.type === "state") applyState(event.state);
    });
  });

  onDestroy(() => {
    if (scanning) window.ADVOSCNative.ble.stopScan();
    unsubscribe?.();
  });
</script>

<div class="flex flex-col gap-3">
  <div class="flex gap-2">
    <Input
      {value}
      placeholder="AA:BB:CC:DD:EE:FF"
      class="font-mono"
      oninput={(e: Event) => onChange((e.target as HTMLInputElement).value)}
    />
    {#if scanning}
      <Button variant="outline" onclick={stopScan}>
        <RadioIcon class="animate-pulse" />
        Stop
      </Button>
    {:else}
      <Button variant="outline" onclick={startScan}>
        <BluetoothSearchingIcon />
        Scan
      </Button>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <Checkbox id="ble-show-all" bind:checked={showAll} />
    <Label for="ble-show-all" class="text-xs font-normal">
      Show devices that do not advertise heart rate
    </Label>
  </div>

  {#if error}
    <p class="text-xs text-destructive">
      {error === "adapter_unavailable"
        ? "No Bluetooth adapter found. Check that Bluetooth is turned on."
        : error}
    </p>
  {:else if adapter}
    <p class="text-xs text-muted-foreground">Adapter: {adapter}</p>
  {/if}

  {#if results.length > 0}
    <div class="flex flex-col gap-1 max-h-52 overflow-y-auto">
      {#each results as result (result.address)}
        <button
          type="button"
          class="flex items-center gap-2 rounded-md border p-2 text-left text-sm hover:bg-accent {result.address ===
          value.toUpperCase()
            ? 'border-primary'
            : 'border-transparent'}"
          onclick={() => onChange(result.address)}
        >
          <HeartPulseIcon
            class={result.hrService ? "w-4 h-4 text-rose-500" : "w-4 h-4 text-muted-foreground"}
          />
          <span class="flex flex-col">
            <span>{result.name ?? "Unnamed device"}</span>
            <span class="font-mono text-xs text-muted-foreground">{result.address}</span>
          </span>
          {#if result.rssi !== null}
            <span class="ml-auto text-xs text-muted-foreground">{result.rssi} dBm</span>
          {/if}
        </button>
      {/each}
    </div>
  {:else if scanning}
    <p class="text-xs text-muted-foreground">Scanning for devices...</p>
  {:else}
    <p class="text-xs text-muted-foreground">
      Nothing found yet. Start heart rate broadcast on your device, then scan.
    </p>
  {/if}
</div>
