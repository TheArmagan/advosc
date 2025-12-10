<script lang="ts">
  import {
    ChatboxHotkeyModule,
    HOTKEY_PREFIX,
  } from "$lib/api/chatbox/modules/chatbox-hotkey-module";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import ShortcutRecorder from "$lib/components/shortcut-recorder.svelte";
  import {
    CopyIcon,
    PlusIcon,
    Trash2Icon,
    KeyboardIcon,
    ToggleLeftIcon,
    ToggleRightIcon,
    ZapIcon,
    ZapOffIcon,
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
    module: ChatboxHotkeyModule;
  } = $props();

  const values = module.values;

  interface HotkeyEntry {
    name: string;
    accelerator: string;
  }

  // Derive hotkeys from module values
  let hotkeys = $state<HotkeyEntry[]>([]);
  let hotkeyStates = $state<
    Map<string, { isToggled: boolean; isPressed: boolean }>
  >(new Map());

  let hotkeyAddName = $state("");
  let hotkeyAddAccelerator = $state("");
  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  function loadHotkeys() {
    const hotkeyData = module.getHotkeys();
    const entries: HotkeyEntry[] = [];

    for (const [name, accelerator] of Object.entries(hotkeyData)) {
      entries.push({ name, accelerator });
    }

    hotkeys = entries;
  }

  function updateHotkeyStates() {
    const now = Date.now();
    const newStates = new Map<
      string,
      { isToggled: boolean; isPressed: boolean }
    >();

    for (const hotkey of hotkeys) {
      // Access private hotkeyStates through module
      const state = (module as any).hotkeyStates.get(hotkey.name) || {
        lastPressedAt: 0,
        isToggled: false,
      };

      newStates.set(hotkey.name, {
        isToggled: state.isToggled,
        isPressed: state.lastPressedAt > 0 && now - state.lastPressedAt < 1000,
      });
    }

    hotkeyStates = newStates;
  }

  async function addHotkey() {
    if (!hotkeyAddName.trim() || !hotkeyAddAccelerator.trim()) {
      toast.error("Please provide both a name and a shortcut.");
      return;
    }

    const success = await module.setHotkey(
      hotkeyAddName.trim(),
      hotkeyAddAccelerator.trim()
    );

    if (success) {
      toast.success(`Hotkey "${hotkeyAddName.trim()}" added!`);
      hotkeyAddName = "";
      hotkeyAddAccelerator = "";
      loadHotkeys();
    } else {
      toast.error(
        "Failed to register hotkey. The shortcut may already be in use."
      );
    }
  }

  async function updateHotkeyAccelerator(name: string, accelerator: string) {
    if (!accelerator) {
      await removeHotkey(name);
      return;
    }

    const success = await module.setHotkey(name, accelerator);

    if (success) {
      toast.success(`Hotkey "${name}" updated!`);
      loadHotkeys();
    } else {
      toast.error(
        "Failed to update hotkey. The shortcut may already be in use."
      );
    }
  }

  async function removeHotkey(name: string) {
    await module.removeHotkey(name);
    toast.success(`Hotkey "${name}" removed!`);
    loadHotkeys();
  }

  function copyPlaceholder(name: string, type: "IsPressed" | "IsToggled") {
    const placeholder =
      type === "IsPressed"
        ? `{{Hotkey;IsPressed;${name};1000}}`
        : `{{Hotkey;IsToggled;${name}}}`;
    navigator.clipboard.writeText(placeholder);
    toast.success("Placeholder copied to clipboard!");
  }

  function handleBulkExport() {
    const exportData = module.getHotkeys();
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Hotkeys exported to clipboard!");
  }

  async function handleBulkImport() {
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
      let failCount = 0;

      for (const [name, accelerator] of Object.entries(parsed)) {
        if (typeof accelerator !== "string") {
          failCount++;
          continue;
        }
        const success = await module.setHotkey(name, accelerator);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      loadHotkeys();
      toast.success(
        `Imported ${successCount} hotkeys${failCount > 0 ? `, ${failCount} failed` : ""}!`
      );
      bulkImportOpen = false;
      bulkImportValue = "";
    } catch (error) {
      toast.error("Invalid JSON: " + (error as Error).message);
    }
  }

  onMount(() => {
    loadHotkeys();
    updateHotkeyStates();

    // Subscribe to values changes to reload hotkeys
    const unsubscribe = values.subscribe(() => {
      loadHotkeys();
    });

    // Refresh states every 100ms for responsive UI
    refreshInterval = setInterval(() => {
      updateHotkeyStates();
    }, 100);

    return () => {
      unsubscribe();
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
            hotkeyAddName = `Hotkey${hotkeys.length + 1}`;
            hotkeyAddAccelerator = "";
          }}
        >
          <PlusIcon />
          Add Hotkey
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex items-center justify-center w-full">
        <div class="w-96 flex flex-col gap-4 p-4">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <Label>Hotkey Name</Label>
              <Input
                bind:value={hotkeyAddName}
                placeholder="Hotkey name (e.g., MyHotkey)"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>Shortcut</Label>
              <ShortcutRecorder
                bind:value={hotkeyAddAccelerator}
                placeholder="Click to record shortcut"
                class="w-full justify-start"
              />
            </div>
          </div>
          <Drawer.Footer>
            <Drawer.Close>
              <Button
                disabled={!hotkeyAddName.trim() || !hotkeyAddAccelerator.trim()}
                onclick={addHotkey}
              >
                <PlusIcon />
                Add Hotkey
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
        <Label class="text-lg">Bulk Import Hotkeys (JSON)</Label>
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

  {#if hotkeys.length === 0}
    <div class="text-muted-foreground text-sm py-4">
      No hotkeys configured. Click "Add Hotkey" to create one.
    </div>
  {:else}
    <div class="flex flex-col gap-2 w-full">
      {#each hotkeys as hotkey (hotkey.name)}
        {@const state = hotkeyStates.get(hotkey.name) || {
          isToggled: false,
          isPressed: false,
        }}
        <Item.Root class="flex items-center gap-2">
          <Item.Media>
            <KeyboardIcon class="w-5 h-5" />
          </Item.Media>
          <Item.Content>
            <Item.Title class="font-mono">{hotkey.name}</Item.Title>
            <Item.Description class="flex items-center gap-2">
              <ShortcutRecorder
                value={hotkey.accelerator}
                onRecord={(acc) => updateHotkeyAccelerator(hotkey.name, acc)}
                placeholder="Click to set"
                size="sm"
                class="h-6 text-xs"
              />
              <span class="flex items-center gap-1">
                {#if state.isPressed}
                  <ZapIcon class="w-4 h-4 text-yellow-500" />
                  <span class="text-yellow-500 text-xs">Pressed</span>
                {:else}
                  <ZapOffIcon class="w-4 h-4 text-muted-foreground" />
                {/if}
              </span>
              <span class="flex items-center gap-1">
                {#if state.isToggled}
                  <ToggleRightIcon class="w-4 h-4 text-green-500" />
                  <span class="text-green-500 text-xs">ON</span>
                {:else}
                  <ToggleLeftIcon class="w-4 h-4 text-muted-foreground" />
                  <span class="text-muted-foreground text-xs">OFF</span>
                {/if}
              </span>
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => copyPlaceholder(hotkey.name, "IsPressed")}
              title="Copy IsPressed placeholder"
            >
              <ZapIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => copyPlaceholder(hotkey.name, "IsToggled")}
              title="Copy IsToggled placeholder"
            >
              <ToggleRightIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => removeHotkey(hotkey.name)}
              title="Remove hotkey"
            >
              <Trash2Icon class="w-4 h-4" />
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  {/if}
</div>
