<script lang="ts">
  import type {
    ChatboxOVRTrackersModule,
    TrackerBattery,
  } from "$lib/api/chatbox/modules/chatbox-ovr-trackers-module";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import {
    CopyIcon,
    RefreshCwIcon,
    BatteryChargingIcon,
    BatteryIcon,
    HashIcon,
    TagIcon,
    CpuIcon,
    MonitorIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { onMount, onDestroy } from "svelte";

  const {
    module,
  }: {
    module: ChatboxOVRTrackersModule;
  } = $props();

  let trackers = $state<TrackerBattery[]>([]);
  let loading = $state(false);
  let initialLoading = $state(true);
  let error = $state<string | null>(null);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  function trackersEqual(a: TrackerBattery[], b: TrackerBattery[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].deviceIndex !== b[i].deviceIndex ||
        a[i].batteryLevel !== b[i].batteryLevel ||
        a[i].isCharging !== b[i].isCharging ||
        a[i].serialNumber !== b[i].serialNumber ||
        a[i].modelNumber !== b[i].modelNumber ||
        a[i].deviceClass !== b[i].deviceClass
      ) {
        return false;
      }
    }
    return true;
  }

  async function refreshTrackers() {
    loading = true;
    error = null;
    try {
      const newTrackers = await module.getTrackers();
      // Only update if data actually changed to prevent flickering
      if (!trackersEqual(trackers, newTrackers)) {
        trackers = newTrackers;
      }
    } catch (e) {
      error = String(e);
      trackers = [];
    } finally {
      loading = false;
      initialLoading = false;
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  }

  function getBatteryColor(level: number): string {
    if (level >= 0.7) return "text-green-500";
    if (level >= 0.3) return "text-yellow-500";
    return "text-red-500";
  }

  function formatDeviceClass(deviceClass: string): string {
    // Remove "TrackedDeviceClass_" prefix if present
    return deviceClass.replace("TrackedDeviceClass_", "");
  }

  onMount(() => {
    refreshTrackers();
    // Auto-refresh every 5 seconds
    refreshInterval = setInterval(refreshTrackers, 5000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
</script>

<div class="flex flex-col gap-3 items-start justify-start">
  <div class="flex gap-2 items-center">
    <Button variant="outline" onclick={refreshTrackers} disabled={loading}>
      <RefreshCwIcon class={loading ? "animate-spin" : ""} />
      Refresh
    </Button>
    <span class="text-sm text-muted-foreground">
      {trackers.length} device{trackers.length !== 1 ? "s" : ""} found
    </span>
  </div>

  {#if error}
    <div class="text-sm text-red-500 p-2 bg-red-500/10 rounded-md w-full">
      Error: {error}
    </div>
  {/if}

  {#if trackers.length === 0 && !initialLoading && !error}
    <div
      class="text-sm text-muted-foreground p-4 bg-muted/50 rounded-md w-full text-center"
    >
      No OpenVR devices found. Make sure SteamVR is running.
    </div>
  {/if}

  {#if initialLoading}
    <div
      class="text-sm text-muted-foreground p-4 bg-muted/50 rounded-md w-full text-center"
    >
      Loading devices...
    </div>
  {/if}

  {#each trackers as tracker (tracker.deviceIndex)}
    <Item.Root class="w-full">
      <Item.Content>
        <Item.Header>
          <Item.Title class="flex items-center gap-2">
            <span class="font-mono text-sm bg-muted px-2 py-0.5 rounded"
              >#{tracker.deviceIndex}</span
            >
            <span>{tracker.modelNumber || "Unknown Model"}</span>
            <span class={getBatteryColor(tracker.batteryLevel)}>
              {#if tracker.isCharging}
                <BatteryChargingIcon class="w-4 h-4" />
              {:else}
                <BatteryIcon class="w-4 h-4" />
              {/if}
            </span>
            <span class="text-sm {getBatteryColor(tracker.batteryLevel)}">
              {Math.round(tracker.batteryLevel * 100)}%
            </span>
          </Item.Title>
          <Item.Description>
            {formatDeviceClass(tracker.deviceClass)}
            {#if tracker.serialNumber}
              • {tracker.serialNumber}
            {/if}
          </Item.Description>
        </Item.Header>
        <Item.Actions>
          <Button
            variant="ghost"
            size="icon"
            onclick={() =>
              copyToClipboard(tracker.deviceIndex.toString(), "Device Index")}
            title="Copy Device Index"
          >
            <HashIcon class="w-3.5 h-3.5" />
          </Button>
          {#if tracker.serialNumber}
            <Button
              variant="ghost"
              size="icon"
              onclick={() =>
                copyToClipboard(tracker.serialNumber!, "Serial Number")}
              title="Copy Serial Number"
            >
              <TagIcon class="w-3.5 h-3.5" />
            </Button>
          {/if}
          {#if tracker.modelNumber}
            <Button
              variant="ghost"
              size="icon"
              onclick={() =>
                copyToClipboard(tracker.modelNumber!, "Model Number")}
              title="Copy Model Number"
            >
              <CpuIcon class="w-3.5 h-3.5" />
            </Button>
          {/if}
          <Button
            variant="ghost"
            size="icon"
            onclick={() => copyToClipboard(tracker.deviceClass, "Device Class")}
            title="Copy Device Class"
          >
            <MonitorIcon class="w-3.5 h-3.5" />
          </Button>
        </Item.Actions>
      </Item.Content>
    </Item.Root>
  {/each}

  <div
    class="text-xs text-muted-foreground mt-2 p-3 bg-muted/30 rounded-md w-full"
  >
    <p class="font-medium mb-1">Finder Usage:</p>
    <ul class="list-disc list-inside space-y-0.5">
      <li>
        <code class="bg-muted px-1 rounded"
          >{"{{OVRTrackers;BatteryLevel;3}}"}</code
        > - By device index
      </li>
      <li>
        <code class="bg-muted px-1 rounded"
          >{"{{OVRTrackers;BatteryLevel;LHR-12345}}"}</code
        > - By serial number
      </li>
      <li>
        <code class="bg-muted px-1 rounded"
          >{"{{OVRTrackers;BatteryLevel;Vive}}"}</code
        > - By model (contains)
      </li>
      <li>
        <code class="bg-muted px-1 rounded"
          >{"{{OVRTrackers;BatteryLevel;GenericTracker}}"}</code
        > - By device class
      </li>
    </ul>
  </div>
</div>
