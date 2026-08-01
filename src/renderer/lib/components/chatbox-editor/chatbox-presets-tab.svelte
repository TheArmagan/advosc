<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import {
    ArrowDownIcon,
    ArrowUpIcon,
    CheckIcon,
    CopyIcon,
    DownloadIcon,
    EllipsisVerticalIcon,
    FileJsonIcon,
    PenIcon,
    PlayIcon,
    PlusIcon,
    SaveIcon,
    Share2Icon,
    Trash2Icon,
    UploadIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import {
    chatboxPresets,
    type ChatboxPreset,
  } from "$lib/api/chatbox/presets";

  const presets = chatboxPresets.presets;
  const activePresetId = chatboxPresets.activePresetId;

  let saveOpen = $state(false);
  let saveName = $state("");
  let saveDescription = $state("");

  let renameOpen = $state(false);
  let renameTarget = $state<ChatboxPreset | null>(null);
  let renameName = $state("");
  let renameDescription = $state("");

  let applyOpen = $state(false);
  let applyTarget = $state<ChatboxPreset | null>(null);
  let backupBeforeApply = $state(false);
  let backupName = $state("");

  let deleteOpen = $state(false);
  let deleteTarget = $state<ChatboxPreset | null>(null);

  let shareOpen = $state(false);
  let shareTarget = $state<ChatboxPreset | null>(null);
  let includeSecrets = $state(false);
  let shareRemoved = $derived(
    shareTarget
      ? chatboxPresets.shareCode(shareTarget, includeSecrets).removed
      : [],
  );

  let importOpen = $state(false);
  let importValue = $state("");
  let fileInput = $state<HTMLInputElement | null>(null);

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString();
  }

  function openSave() {
    saveName = `Template ${$presets.length + 1}`;
    saveDescription = "";
    saveOpen = true;
  }

  function handleSave() {
    const preset = chatboxPresets.savePreset(saveName, saveDescription);
    saveOpen = false;
    toast.success(`Saved "${preset.name}".`);
  }

  function openApply(preset: ChatboxPreset) {
    applyTarget = preset;
    backupBeforeApply = false;
    backupName = `Before ${preset.name}`;
    applyOpen = true;
  }

  function handleApply() {
    if (!applyTarget) return;
    if (backupBeforeApply) chatboxPresets.savePreset(backupName);
    const name = applyTarget.name;
    const ok = chatboxPresets.applyPreset(applyTarget.id);
    applyOpen = false;
    if (ok) toast.success(`Switched to "${name}".`);
    else toast.error("That template no longer exists.");
  }

  function handleUpdate(preset: ChatboxPreset) {
    chatboxPresets.updatePreset(preset.id);
    toast.success(`Updated "${preset.name}" with your current setup.`);
  }

  function openRename(preset: ChatboxPreset) {
    renameTarget = preset;
    renameName = preset.name;
    renameDescription = preset.description;
    renameOpen = true;
  }

  function handleRename() {
    if (!renameTarget) return;
    chatboxPresets.renamePreset(renameTarget.id, renameName, renameDescription);
    renameOpen = false;
  }

  function openDelete(preset: ChatboxPreset) {
    deleteTarget = preset;
    deleteOpen = true;
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    chatboxPresets.deletePreset(deleteTarget.id);
    deleteOpen = false;
    toast.success(`Deleted "${name}".`);
  }

  function openShare(preset: ChatboxPreset) {
    shareTarget = preset;
    includeSecrets = false;
    shareOpen = true;
  }

  function handleDuplicate(preset: ChatboxPreset) {
    const copy = chatboxPresets.duplicatePreset(preset.id);
    if (copy) toast.success(`Created "${copy.name}".`);
  }

  function copyShareCode() {
    if (!shareTarget) return;
    const { text } = chatboxPresets.shareCode(shareTarget, includeSecrets);
    navigator.clipboard.writeText(text);
    toast.success("Share code copied. Paste it anywhere to share.");
  }

  function copyShareJSON() {
    if (!shareTarget) return;
    const { text } = chatboxPresets.shareJSON(shareTarget, includeSecrets);
    navigator.clipboard.writeText(text);
    toast.success("Template JSON copied.");
  }

  function downloadShareFile() {
    if (!shareTarget) return;
    const { text } = chatboxPresets.shareJSON(shareTarget, includeSecrets);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = chatboxPresets.shareFileName(shareTarget);
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Template file saved.");
  }

  function handleImport() {
    try {
      const preset = chatboxPresets.importPreset(importValue);
      importOpen = false;
      importValue = "";
      toast.success(`Imported "${preset.name}". Apply it when you are ready.`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleFilePick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    importValue = await file.text();
    importOpen = true;
  }
</script>

<div class="flex flex-col gap-3 p-2">
  <div class="flex flex-wrap gap-2">
    <Button variant="outline" onclick={openSave}>
      <PlusIcon />
      Save Current As Template
    </Button>
    <Button variant="outline" onclick={() => (importOpen = true)}>
      <UploadIcon />
      Import From Code Or JSON
    </Button>
    <Button variant="outline" onclick={() => fileInput?.click()}>
      <FileJsonIcon />
      Import From File
    </Button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".json,application/json"
      class="hidden"
      onchange={handleFilePick}
    />
  </div>

  <p class="text-muted-foreground text-sm max-w-[720px]">
    A template stores your whole chatbox setup: the template text, both editors'
    state and every module's settings. Switching replaces the current setup, so
    save your work first if you want to come back to it. Shared templates have
    heart rate credentials and hidden shortcuts removed.
  </p>

  {#if $presets.length === 0}
    <div class="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
      No saved templates yet. Build a chatbox setup, then use "Save Current As
      Template" to keep it.
    </div>
  {/if}

  {#each $presets as preset, index (preset.id)}
    <Item.Root class="w-full border rounded-lg p-3">
      <div class="flex w-full items-center gap-3">
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium">{preset.name}</span>
            {#if $activePresetId === preset.id}
              <span
                class="flex items-center gap-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400"
              >
                <CheckIcon class="size-3" />
                Active
              </span>
            {/if}
          </div>
          {#if preset.description}
            <span class="text-muted-foreground truncate text-sm">
              {preset.description}
            </span>
          {/if}
          <span class="text-muted-foreground text-xs">
            Updated {formatDate(preset.updatedAt)}
          </span>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onclick={() => openApply(preset)}>
            <PlayIcon />
            Use
          </Button>
          <Button
            variant="outline"
            size="sm"
            onclick={() => openShare(preset)}
          >
            <Share2Icon />
            Share
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button variant="ghost" size="sm">
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item onclick={() => handleUpdate(preset)}>
                <SaveIcon />
                Overwrite With Current Setup
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={() => openRename(preset)}>
                <PenIcon />
                Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={() => handleDuplicate(preset)}>
                <CopyIcon />
                Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={index === 0}
                onclick={() => chatboxPresets.movePreset(preset.id, -1)}
              >
                <ArrowUpIcon />
                Move Up
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={index === $presets.length - 1}
                onclick={() => chatboxPresets.movePreset(preset.id, 1)}
              >
                <ArrowDownIcon />
                Move Down
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                variant="destructive"
                onclick={() => openDelete(preset)}
              >
                <Trash2Icon />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    </Item.Root>
  {/each}
</div>

<!-- Save current setup -->
<Drawer.Root bind:open={saveOpen}>
  <Drawer.Content class="flex items-center justify-center w-full">
    <div class="flex w-96 flex-col gap-4 p-4">
      <div class="flex flex-col gap-2">
        <Label>Template Name</Label>
        <Input bind:value={saveName} placeholder="My chatbox setup" />
      </div>
      <div class="flex flex-col gap-2">
        <Label>Description (optional)</Label>
        <Input bind:value={saveDescription} placeholder="What it is for" />
      </div>
      <Drawer.Footer class="p-0">
        <Button onclick={handleSave} disabled={!saveName.trim()}>
          <SaveIcon />
          Save Template
        </Button>
        <Drawer.Close>Cancel</Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>

<!-- Rename -->
<Drawer.Root bind:open={renameOpen}>
  <Drawer.Content class="flex items-center justify-center w-full">
    <div class="flex w-96 flex-col gap-4 p-4">
      <div class="flex flex-col gap-2">
        <Label>Template Name</Label>
        <Input bind:value={renameName} />
      </div>
      <div class="flex flex-col gap-2">
        <Label>Description</Label>
        <Input bind:value={renameDescription} />
      </div>
      <Drawer.Footer class="p-0">
        <Button onclick={handleRename} disabled={!renameName.trim()}>
          <PenIcon />
          Save
        </Button>
        <Drawer.Close>Cancel</Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>

<!-- Apply confirm -->
<Drawer.Root bind:open={applyOpen}>
  <Drawer.Content class="flex items-center justify-center w-full">
    <div class="flex w-96 flex-col gap-4 p-4">
      <div class="flex flex-col gap-1">
        <Label class="text-lg">Switch to "{applyTarget?.name}"?</Label>
        <p class="text-muted-foreground text-sm">
          This replaces your current template, editor state and module settings.
        </p>
      </div>
      <Label
        class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3"
      >
        <Checkbox bind:checked={backupBeforeApply} />
        <div class="grid gap-1.5 font-normal">
          <p class="text-sm font-medium leading-none">
            Save my current setup first
          </p>
          <p class="text-muted-foreground text-sm">
            Keeps what you have now as its own template.
          </p>
        </div>
      </Label>
      {#if backupBeforeApply}
        <Input bind:value={backupName} placeholder="Backup name" />
      {/if}
      <Drawer.Footer class="p-0">
        <Button
          onclick={handleApply}
          disabled={backupBeforeApply && !backupName.trim()}
        >
          <PlayIcon />
          Switch
        </Button>
        <Drawer.Close>Cancel</Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>

<!-- Delete confirm -->
<Drawer.Root bind:open={deleteOpen}>
  <Drawer.Content class="flex items-center justify-center w-full">
    <div class="flex w-96 flex-col gap-4 p-4">
      <Label class="text-lg">Delete "{deleteTarget?.name}"?</Label>
      <p class="text-muted-foreground text-sm">
        This only removes the saved template. Your current chatbox setup stays as
        it is.
      </p>
      <Drawer.Footer class="p-0">
        <Button variant="destructive" onclick={handleDelete}>
          <Trash2Icon />
          Delete
        </Button>
        <Drawer.Close>Cancel</Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>

<!-- Share -->
<Drawer.Root bind:open={shareOpen}>
  <Drawer.Content class="flex items-center justify-center w-full">
    <div class="flex w-[32rem] max-w-full flex-col gap-4 p-4">
      <Label class="text-lg">Share "{shareTarget?.name}"</Label>

      <Label
        class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3"
      >
        <Checkbox bind:checked={includeSecrets} />
        <div class="grid gap-1.5 font-normal">
          <p class="text-sm font-medium leading-none">
            Include my credentials
          </p>
          <p class="text-muted-foreground text-sm">
            Only for your own backups. Anyone with the export can use these
            tokens.
          </p>
        </div>
      </Label>

      {#if !includeSecrets && shareRemoved.length > 0}
        <div class="rounded-lg border p-3 text-sm">
          <p class="font-medium">Removed before sharing</p>
          <ul class="text-muted-foreground mt-1 list-disc pl-4">
            {#each shareRemoved as entry}
              <li>{entry}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="flex flex-col gap-2">
        <Button onclick={copyShareCode}>
          <CopyIcon />
          Copy Share Code
        </Button>
        <Button variant="outline" onclick={copyShareJSON}>
          <CopyIcon />
          Copy JSON
        </Button>
        <Button variant="outline" onclick={downloadShareFile}>
          <DownloadIcon />
          Save As File
        </Button>
      </div>

      <Drawer.Footer class="p-0">
        <Drawer.Close>Close</Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>

<!-- Import -->
<Drawer.Root bind:open={importOpen}>
  <Drawer.Content class="flex items-center justify-center w-full">
    <div class="flex w-[32rem] max-w-full flex-col gap-4 p-4">
      <div class="flex flex-col gap-1">
        <Label class="text-lg">Import Template</Label>
        <p class="text-muted-foreground text-sm">
          Paste a share code or template JSON. It is saved to your list without
          touching your current setup.
        </p>
      </div>
      <Textarea
        bind:value={importValue}
        class="h-40 font-mono text-xs"
        placeholder="ADVOSC1:... or {'{'} &quot;kind&quot;: &quot;advosc.chatbox.preset&quot;, ... {'}'}"
      />
      <Drawer.Footer class="p-0">
        <Button onclick={handleImport} disabled={!importValue.trim()}>
          <UploadIcon />
          Import
        </Button>
        <Drawer.Close>Cancel</Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>
