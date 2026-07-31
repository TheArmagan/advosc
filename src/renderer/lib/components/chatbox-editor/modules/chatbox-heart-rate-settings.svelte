<script lang="ts">
  import type { ChatboxHeartRateModule } from "$lib/api/chatbox/modules/chatbox-heart-rate-module";
  import {
    getPlatformMeta,
    heartRatePlatforms,
    isSourceConfigured,
    type HeartRatePlatform,
    type HeartRateSource,
  } from "$lib/api/chatbox/modules/heart-rate/providers";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    HeartPulseIcon,
    PlusIcon,
    Trash2Icon,
    CopyIcon,
    PencilIcon,
    WifiIcon,
    WifiOffIcon,
    DownloadIcon,
    UploadIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import ChatboxMonacoEditor from "../chatbox-monaco-editor.svelte";
  import { onMount, onDestroy } from "svelte";

  const {
    module,
  }: {
    module: ChatboxHeartRateModule;
  } = $props();

  const values = module.values;

  interface SourceEntry {
    name: string;
    source: HeartRateSource;
  }

  let sources = $state<SourceEntry[]>([]);
  let statuses = $state<
    Map<string, { connected: boolean; heartRate?: number; error?: string }>
  >(new Map());

  let editorOpen = $state(false);
  /** Name being edited, or null when adding a new source. */
  let editingName = $state<string | null>(null);
  let draftName = $state("");
  let draftSource = $state<HeartRateSource>({ platform: "pulsoid", token: "" });

  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  function loadSources() {
    sources = Object.entries(module.getSources()).map(([name, source]) => ({
      name,
      source: source as HeartRateSource,
    }));
  }

  function refreshStatuses() {
    const next = new Map<
      string,
      { connected: boolean; heartRate?: number; error?: string }
    >();
    for (const entry of sources) {
      // Keep the socket alive while this tab is open so the status is meaningful.
      module.keepAlive(entry.name);
      next.set(entry.name, module.getStatus(entry.name));
    }
    statuses = next;
  }

  function openAddDrawer() {
    editingName = null;
    draftName = `HeartRate${sources.length + 1}`;
    draftSource = { platform: "pulsoid", token: "" };
    editorOpen = true;
  }

  function openEditDrawer(entry: SourceEntry) {
    editingName = entry.name;
    draftName = entry.name;
    draftSource = { ...entry.source };
    editorOpen = true;
  }

  function setPlatform(platform: HeartRatePlatform) {
    // Fields are platform-specific, so start clean rather than carrying stale values over.
    draftSource = { platform, token: "" };
  }

  function saveDraft() {
    const name = draftName.trim();
    if (!name) {
      toast.error("Please give the source a name.");
      return;
    }
    if (name.includes(";") || name.includes(":")) {
      toast.error("Source names cannot contain ';' or ':'.");
      return;
    }
    if (name !== editingName && module.getSources()[name]) {
      toast.error(`A source named "${name}" already exists.`);
      return;
    }
    if (!isSourceConfigured(draftSource)) {
      toast.error("Please fill in every required field for this platform.");
      return;
    }

    if (editingName && editingName !== name) module.removeSource(editingName);
    module.setSource(name, { ...draftSource });

    toast.success(`Heart rate source "${name}" saved!`);
    editorOpen = false;
    loadSources();
  }

  function removeSource(name: string) {
    module.removeSource(name);
    toast.success(`Heart rate source "${name}" removed!`);
    loadSources();
  }

  function copyPlaceholder(name: string) {
    navigator.clipboard.writeText(`{{HeartRate;${name};HeartRate}}`);
    toast.success("Placeholder copied to clipboard!");
  }

  function handleBulkExport() {
    navigator.clipboard.writeText(JSON.stringify(module.getSources(), null, 2));
    toast.success("Heart rate sources exported to clipboard!");
  }

  function handleBulkImport() {
    try {
      const parsed = JSON.parse(bulkImportValue);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        toast.error("Invalid JSON format. Expected an object.");
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const [name, source] of Object.entries(parsed)) {
        const candidate = source as HeartRateSource;
        if (
          !candidate ||
          typeof candidate !== "object" ||
          !heartRatePlatforms.some((platform) => platform.id === candidate.platform)
        ) {
          failCount++;
          continue;
        }
        module.setSource(name, candidate);
        successCount++;
      }

      loadSources();
      toast.success(
        `Imported ${successCount} sources${failCount > 0 ? `, ${failCount} failed` : ""}!`
      );
      bulkImportOpen = false;
      bulkImportValue = "";
    } catch (error) {
      toast.error("Invalid JSON: " + (error as Error).message);
    }
  }

  onMount(() => {
    loadSources();
    refreshStatuses();

    const unsubscribe = values.subscribe(() => {
      loadSources();
    });

    refreshInterval = setInterval(refreshStatuses, 1000);

    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });
</script>

<div class="flex flex-col gap-2 items-start justify-start">
  <div class="flex gap-2">
    <Button variant="outline" onclick={openAddDrawer}>
      <PlusIcon />
      Add Source
    </Button>

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
        <Label class="text-lg">Bulk Import Heart Rate Sources (JSON)</Label>
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

  <Drawer.Root bind:open={editorOpen}>
    <Drawer.Content class="flex items-center justify-center w-full">
      {@const meta = getPlatformMeta(draftSource.platform)}
      <div class="w-96 flex flex-col gap-4 p-4">
        <div class="flex flex-col gap-2">
          <Label>Source Name</Label>
          <Input
            bind:value={draftName}
            placeholder="Name used in placeholders (e.g. MyHeart)"
          />
        </div>

        <div class="flex flex-col gap-2">
          <Label>Platform</Label>
          <Select.Root
            type="single"
            value={draftSource.platform}
            onValueChange={(v) => setPlatform((v as HeartRatePlatform) ?? "pulsoid")}
          >
            <Select.Trigger class="w-full">{meta.label}</Select.Trigger>
            <Select.Content>
              {#each heartRatePlatforms as platform}
                <Select.Item value={platform.id}>{platform.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-xs text-muted-foreground">{meta.description}</p>
        </div>

        {#each meta.fields as field (field.key)}
          <div class="flex flex-col gap-2">
            <Label>
              {field.label}{field.optional ? " (optional)" : ""}
            </Label>
            <Input
              type={field.secret ? "password" : "text"}
              placeholder={field.placeholder}
              value={draftSource[field.key] ?? ""}
              oninput={(e) =>
                (draftSource = {
                  ...draftSource,
                  [field.key]: (e.target as HTMLInputElement).value,
                })}
            />
            {#if field.hint}
              <p class="text-xs text-muted-foreground">{field.hint}</p>
            {/if}
          </div>
        {/each}

        <Drawer.Footer>
          <Button onclick={saveDraft}>
            <PlusIcon />
            {editingName ? "Save Changes" : "Add Source"}
          </Button>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </div>
    </Drawer.Content>
  </Drawer.Root>

  {#if sources.length === 0}
    <div class="text-muted-foreground text-sm py-4">
      No heart rate sources configured. Click "Add Source" to connect Pulsoid,
      HypeRate, Stromno or a custom WebSocket feed.
    </div>
  {:else}
    <div class="flex flex-col gap-2 w-full">
      {#each sources as entry (entry.name)}
        {@const status = statuses.get(entry.name) ?? { connected: false }}
        {@const meta = getPlatformMeta(entry.source.platform)}
        <Item.Root class="flex items-center gap-2">
          <Item.Media>
            <HeartPulseIcon
              class={status.connected ? "w-5 h-5 text-rose-500" : "w-5 h-5"}
            />
          </Item.Media>
          <Item.Content>
            <Item.Title class="font-mono">{entry.name}</Item.Title>
            <Item.Description class="flex items-center gap-2">
              <span class="text-xs">{meta.label}</span>
              {#if status.connected}
                <span class="flex items-center gap-1 text-green-500 text-xs">
                  <WifiIcon class="w-4 h-4" />
                  Connected
                </span>
              {:else}
                <span
                  class="flex items-center gap-1 text-muted-foreground text-xs"
                >
                  <WifiOffIcon class="w-4 h-4" />
                  {status.error ?? "Connecting…"}
                </span>
              {/if}
              {#if status.heartRate !== undefined}
                <span class="text-rose-500 text-xs">{status.heartRate} BPM</span>
              {/if}
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => copyPlaceholder(entry.name)}
              title="Copy HeartRate placeholder"
            >
              <CopyIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => openEditDrawer(entry)}
              title="Edit source"
            >
              <PencilIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => removeSource(entry.name)}
              title="Remove source"
            >
              <Trash2Icon class="w-4 h-4" />
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  {/if}
</div>
