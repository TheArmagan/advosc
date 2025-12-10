<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { ChatboxStopwatchModule } from "$lib/api/chatbox/modules/chatbox-stopwatch-module";
  import { ChatboxHotkeyModule } from "$lib/api/chatbox/modules/chatbox-hotkey-module";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    CopyIcon,
    PlusIcon,
    Trash2Icon,
    TimerIcon,
    PlayIcon,
    PauseIcon,
    RotateCcwIcon,
    StopCircleIcon,
    DownloadIcon,
    UploadIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ChatboxMonacoEditor from "../chatbox-monaco-editor.svelte";
  import { onMount, onDestroy } from "svelte";

  const {
    module,
  }: {
    module: ChatboxStopwatchModule;
  } = $props();

  const values = module.values;

  interface StopwatchEntry {
    name: string;
    startHotkey: string;
    pauseHotkey: string;
    resetHotkey: string;
    stopHotkey: string;
    resetStartHotkey: string;
  }

  // Get available hotkey names from the Hotkey module
  function getAvailableHotkeys(): string[] {
    const hotkeyModule = chatbox.modules.get("Hotkey") as
      | ChatboxHotkeyModule
      | undefined;
    if (!hotkeyModule) return [];
    return Object.keys(hotkeyModule.getHotkeys());
  }

  let stopwatches = $state<StopwatchEntry[]>([]);
  let availableHotkeys = $state<string[]>([]);
  let stopwatchStates = $state<
    Map<string, { isRunning: boolean; isPaused: boolean; elapsedMs: number }>
  >(new Map());

  let stopwatchAddName = $state("");
  let stopwatchAddStartHotkey = $state("");
  let stopwatchAddPauseHotkey = $state("");
  let stopwatchAddResetHotkey = $state("");
  let stopwatchAddStopHotkey = $state("");
  let stopwatchAddResetStartHotkey = $state("");
  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  function loadStopwatches() {
    const configs = module.getStopwatchConfigs();
    const entries: StopwatchEntry[] = [];

    for (const [name, config] of Object.entries(configs)) {
      entries.push({
        name,
        startHotkey: config.startHotkey,
        pauseHotkey: config.pauseHotkey,
        resetHotkey: config.resetHotkey,
        stopHotkey: config.stopHotkey,
        resetStartHotkey: config.resetStartHotkey || "",
      });
    }

    stopwatches = entries;
    availableHotkeys = getAvailableHotkeys();
  }

  function updateStopwatchStates() {
    const newStates = new Map<
      string,
      { isRunning: boolean; isPaused: boolean; elapsedMs: number }
    >();

    for (const sw of stopwatches) {
      // Access private stopwatches map through module
      const state = (module as any).stopwatches.get(sw.name) || {
        startTime: 0,
        pausedTime: 0,
        isPaused: false,
        isRunning: false,
      };

      let elapsedMs = state.pausedTime;
      if (state.isRunning && !state.isPaused) {
        elapsedMs = state.pausedTime + (Date.now() - state.startTime);
      }

      newStates.set(sw.name, {
        isRunning: state.isRunning && !state.isPaused,
        isPaused: state.isPaused,
        elapsedMs,
      });
    }

    stopwatchStates = newStates;
  }

  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
  }

  function addStopwatch() {
    if (!stopwatchAddName.trim()) {
      toast.error("Please provide a stopwatch name.");
      return;
    }

    module.setStopwatchConfig(stopwatchAddName.trim(), {
      startHotkey: stopwatchAddStartHotkey,
      pauseHotkey: stopwatchAddPauseHotkey,
      resetHotkey: stopwatchAddResetHotkey,
      stopHotkey: stopwatchAddStopHotkey,
      resetStartHotkey: stopwatchAddResetStartHotkey,
    });

    toast.success(`Stopwatch "${stopwatchAddName.trim()}" added!`);
    stopwatchAddName = "";
    stopwatchAddStartHotkey = "";
    stopwatchAddPauseHotkey = "";
    stopwatchAddResetHotkey = "";
    stopwatchAddStopHotkey = "";
    stopwatchAddResetStartHotkey = "";
    loadStopwatches();
  }

  function updateStopwatchHotkey(
    name: string,
    field:
      | "startHotkey"
      | "pauseHotkey"
      | "resetHotkey"
      | "stopHotkey"
      | "resetStartHotkey",
    value: string
  ) {
    module.setStopwatchConfig(name, { [field]: value });
    loadStopwatches();
  }

  function removeStopwatch(name: string) {
    module.removeStopwatchConfig(name);
    toast.success(`Stopwatch "${name}" removed!`);
    loadStopwatches();
  }

  function copyPlaceholder(
    name: string,
    type: "ElapsedMs" | "IsRunning" | "IsPaused"
  ) {
    const placeholder = `{{Stopwatch;${type};${name}}}`;
    navigator.clipboard.writeText(placeholder);
    toast.success("Placeholder copied to clipboard!");
  }

  function handleBulkExport() {
    const exportData = module.getStopwatchConfigs();
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Stopwatches exported to clipboard!");
  }

  function handleBulkImport() {
    try {
      const parsed = JSON.parse(bulkImportValue);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        toast.error("Invalid JSON format. Expected an object.");
        return;
      }

      let successCount = 0;

      for (const [name, config] of Object.entries(parsed)) {
        if (typeof config !== "object" || config === null) {
          continue;
        }
        module.setStopwatchConfig(name, config as any);
        successCount++;
      }

      loadStopwatches();
      toast.success(`Imported ${successCount} stopwatches!`);
      bulkImportOpen = false;
      bulkImportValue = "";
    } catch (error) {
      toast.error("Invalid JSON: " + (error as Error).message);
    }
  }

  // Manual control buttons
  function manualStart(name: string) {
    module.startStopwatch(name);
  }

  function manualPause(name: string) {
    module.pauseStopwatch(name);
  }

  function manualReset(name: string) {
    module.resetStopwatch(name);
  }

  function manualStop(name: string) {
    module.stopStopwatch(name);
  }

  onMount(() => {
    loadStopwatches();
    updateStopwatchStates();

    // Subscribe to values changes to reload stopwatches
    const unsubscribe = values.subscribe(() => {
      loadStopwatches();
    });

    // Also subscribe to hotkey module changes to refresh available hotkeys
    const hotkeyModule = chatbox.modules.get("Hotkey") as
      | ChatboxHotkeyModule
      | undefined;
    let hotkeyUnsubscribe: (() => void) | undefined;
    if (hotkeyModule) {
      hotkeyUnsubscribe = hotkeyModule.values.subscribe(() => {
        availableHotkeys = getAvailableHotkeys();
      });
    }

    // Refresh states every 100ms for responsive UI
    refreshInterval = setInterval(() => {
      updateStopwatchStates();
    }, 100);

    return () => {
      unsubscribe();
      hotkeyUnsubscribe?.();
    };
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
</script>

<div class="flex flex-col gap-2 items-start justify-start">
  <div class="flex gap-2">
    <Drawer.Root>
      <Drawer.Trigger>
        <Button
          variant="outline"
          onclick={() => {
            stopwatchAddName = `Stopwatch${stopwatches.length + 1}`;
            stopwatchAddStartHotkey = "";
            stopwatchAddPauseHotkey = "";
            stopwatchAddResetHotkey = "";
            stopwatchAddStopHotkey = "";
            stopwatchAddResetStartHotkey = "";
          }}
        >
          <PlusIcon />
          Add Stopwatch
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex items-center justify-center w-full">
        <div class="w-lg flex flex-col gap-4 p-4">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <Label>Stopwatch Name</Label>
              <Input
                bind:value={stopwatchAddName}
                placeholder="Stopwatch name (e.g., GameTimer)"
              />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label class="flex items-center gap-1">
                  <PlayIcon class="w-4 h-4" />
                  Start/Toggle Hotkey
                </Label>
                <Select.Root type="single" bind:value={stopwatchAddStartHotkey}>
                  <Select.Trigger class="w-full">
                    {stopwatchAddStartHotkey || "Select hotkey..."}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex flex-col gap-2">
                <Label class="flex items-center gap-1">
                  <PauseIcon class="w-4 h-4" />
                  Pause Hotkey
                </Label>
                <Select.Root type="single" bind:value={stopwatchAddPauseHotkey}>
                  <Select.Trigger class="w-full">
                    {stopwatchAddPauseHotkey || "Select hotkey..."}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex flex-col gap-2">
                <Label class="flex items-center gap-1">
                  <RotateCcwIcon class="w-4 h-4" />
                  Reset Hotkey
                </Label>
                <Select.Root type="single" bind:value={stopwatchAddResetHotkey}>
                  <Select.Trigger class="w-full">
                    {stopwatchAddResetHotkey || "Select hotkey..."}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex flex-col gap-2">
                <Label class="flex items-center gap-1">
                  <StopCircleIcon class="w-4 h-4" />
                  Stop Hotkey
                </Label>
                <Select.Root type="single" bind:value={stopwatchAddStopHotkey}>
                  <Select.Trigger class="w-full">
                    {stopwatchAddStopHotkey || "Select hotkey..."}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex flex-col gap-2 col-span-2">
                <Label class="flex items-center gap-1">
                  <RotateCcwIcon class="w-4 h-4" />
                  <PlayIcon class="w-4 h-4" />
                  Reset + Start Hotkey
                </Label>
                <Select.Root
                  type="single"
                  bind:value={stopwatchAddResetStartHotkey}
                >
                  <Select.Trigger class="w-full">
                    {stopwatchAddResetStartHotkey || "Select hotkey..."}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            </div>
          </div>
          <Drawer.Footer>
            <Drawer.Close>
              <Button
                disabled={!stopwatchAddName.trim()}
                onclick={addStopwatch}
              >
                <PlusIcon />
                Add Stopwatch
              </Button>
            </Drawer.Close>
            <Drawer.Close>Cancel</Drawer.Close>
          </Drawer.Footer>
        </div>
      </Drawer.Content>
    </Drawer.Root>

    <Button variant="outline" onclick={handleBulkExport}>
      <DownloadIcon />
      Bulk Export
    </Button>

    <Drawer.Root bind:open={bulkImportOpen}>
      <Drawer.Trigger>
        <Button variant="outline">
          <UploadIcon />
          Bulk Import
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex flex-col gap-2 w-full p-2">
        <Label class="text-lg">Bulk Import Stopwatches (JSON)</Label>
        <div class="flex w-full items-center justify-center">
          <ChatboxMonacoEditor
            width={Math.floor(window.innerWidth * 0.98)}
            height={250}
            language="json"
            onLoad={(editor) => {
              editor.setValue(bulkImportValue);
            }}
            onChange={(newValue) => {
              bulkImportValue = newValue;
            }}
          />
        </div>
        <Drawer.Footer>
          <Button onclick={handleBulkImport}>
            <UploadIcon />
            Import
          </Button>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>
  </div>

  {#if availableHotkeys.length === 0}
    <div class="text-muted-foreground text-sm py-2 px-2 bg-muted/50 rounded-md">
      <span class="font-medium">Tip:</span> Create hotkeys in the "Hotkey" module
      first, then assign them to stopwatch actions here.
    </div>
  {/if}

  {#if stopwatches.length === 0}
    <div class="text-muted-foreground text-sm py-4">
      No stopwatches configured. Click "Add Stopwatch" to create one.
    </div>
  {:else}
    <div class="flex flex-col gap-2 w-full">
      {#each stopwatches as sw (sw.name)}
        {@const state = stopwatchStates.get(sw.name) || {
          isRunning: false,
          isPaused: false,
          elapsedMs: 0,
        }}
        <Item.Root class="flex items-center gap-2">
          <Item.Media>
            <TimerIcon class="w-5 h-5" />
          </Item.Media>
          <Item.Content>
            <Item.Title class="font-mono flex items-center gap-2">
              {sw.name}
              <span
                class="font-mono text-sm {state.isRunning
                  ? 'text-green-500'
                  : state.isPaused
                    ? 'text-yellow-500'
                    : 'text-muted-foreground'}"
              >
                {formatTime(state.elapsedMs)}
              </span>
              {#if state.isRunning}
                <span class="text-xs text-green-500">Running</span>
              {:else if state.isPaused}
                <span class="text-xs text-yellow-500">Paused</span>
              {:else}
                <span class="text-xs text-muted-foreground">Stopped</span>
              {/if}
            </Item.Title>
            <Item.Description class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1">
                <PlayIcon class="w-3 h-3" />
                <Select.Root
                  type="single"
                  value={sw.startHotkey}
                  onValueChange={(v) =>
                    updateStopwatchHotkey(sw.name, "startHotkey", v ?? "")}
                >
                  <Select.Trigger size="sm" class="h-6 text-xs min-w-24">
                    {sw.startHotkey || "None"}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex items-center gap-1">
                <PauseIcon class="w-3 h-3" />
                <Select.Root
                  type="single"
                  value={sw.pauseHotkey}
                  onValueChange={(v) =>
                    updateStopwatchHotkey(sw.name, "pauseHotkey", v ?? "")}
                >
                  <Select.Trigger size="sm" class="h-6 text-xs min-w-24">
                    {sw.pauseHotkey || "None"}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex items-center gap-1">
                <RotateCcwIcon class="w-3 h-3" />
                <Select.Root
                  type="single"
                  value={sw.resetHotkey}
                  onValueChange={(v) =>
                    updateStopwatchHotkey(sw.name, "resetHotkey", v ?? "")}
                >
                  <Select.Trigger size="sm" class="h-6 text-xs min-w-24">
                    {sw.resetHotkey || "None"}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex items-center gap-1">
                <StopCircleIcon class="w-3 h-3" />
                <Select.Root
                  type="single"
                  value={sw.stopHotkey}
                  onValueChange={(v) =>
                    updateStopwatchHotkey(sw.name, "stopHotkey", v ?? "")}
                >
                  <Select.Trigger size="sm" class="h-6 text-xs min-w-24">
                    {sw.stopHotkey || "None"}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <div class="flex items-center gap-1">
                <RotateCcwIcon class="w-3 h-3" />
                <PlayIcon class="w-3 h-3" />
                <Select.Root
                  type="single"
                  value={sw.resetStartHotkey}
                  onValueChange={(v) =>
                    updateStopwatchHotkey(sw.name, "resetStartHotkey", v ?? "")}
                >
                  <Select.Trigger size="sm" class="h-6 text-xs min-w-24">
                    {sw.resetStartHotkey || "None"}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="">None</Select.Item>
                    {#each availableHotkeys as hk}
                      <Select.Item value={hk}>{hk}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() =>
                state.isRunning ? manualPause(sw.name) : manualStart(sw.name)}
              title={state.isRunning ? "Pause" : "Start"}
            >
              {#if state.isRunning}
                <PauseIcon class="w-4 h-4" />
              {:else}
                <PlayIcon class="w-4 h-4" />
              {/if}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => manualReset(sw.name)}
              title="Reset"
            >
              <RotateCcwIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => manualStop(sw.name)}
              title="Stop"
            >
              <StopCircleIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => copyPlaceholder(sw.name, "ElapsedMs")}
              title="Copy ElapsedMs placeholder"
            >
              <CopyIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => removeStopwatch(sw.name)}
              title="Remove stopwatch"
            >
              <Trash2Icon class="w-4 h-4" />
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  {/if}
</div>
