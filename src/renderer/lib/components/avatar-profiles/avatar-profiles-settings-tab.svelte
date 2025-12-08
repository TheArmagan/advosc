<script lang="ts">
  import { avatarProfiles } from "$lib/api/vrc-osc";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { toast } from "svelte-sonner";
  import { DownloadIcon, Trash2Icon, UploadIcon } from "@lucide/svelte";
  import ChatboxMonacoEditor from "$lib/components/chatbox-editor/chatbox-monaco-editor.svelte";

  const profiles = avatarProfiles.profiles;

  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  let confirmClearOpen = $state(false);

  function handleExportAll() {
    const json = avatarProfiles.exportAllProfiles();
    navigator.clipboard.writeText(json);
    toast.success("All profiles exported to clipboard!");
  }

  function handleImportAll() {
    if (!bulkImportValue.trim()) {
      toast.error("Please enter valid JSON");
      return;
    }

    const success = avatarProfiles.importAllProfiles(bulkImportValue.trim());
    if (success) {
      toast.success("Profiles imported successfully!");
      bulkImportOpen = false;
      bulkImportValue = "";
    } else {
      toast.error("Failed to import profiles. Invalid JSON format.");
    }
  }

  function handleClearAll() {
    avatarProfiles.clearAllProfiles();
    toast.success("All profiles cleared!");
    confirmClearOpen = false;
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex gap-2">
    <Button
      variant="outline"
      onclick={handleExportAll}
      disabled={$profiles.length === 0}
    >
      <DownloadIcon class="w-4 h-4" />
      Export All Profiles ({$profiles.length})
    </Button>

    <Drawer.Root bind:open={bulkImportOpen}>
      <Drawer.Trigger>
        <Button variant="outline">
          <UploadIcon class="w-4 h-4" />
          Import Profiles
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex flex-col gap-2 w-full p-2">
        <Label class="text-lg">Import All Profiles (JSON)</Label>
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
          <Button onclick={handleImportAll}>
            <UploadIcon class="w-4 h-4" />
            Import
          </Button>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>

    <Drawer.Root bind:open={confirmClearOpen}>
      <Drawer.Trigger disabled={$profiles.length === 0}>
        <Button variant="destructive" disabled={$profiles.length === 0}>
          <Trash2Icon class="w-4 h-4" />
          Clear All Profiles
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex items-center justify-center">
        <div class="w-96 flex flex-col gap-4 p-4">
          <Drawer.Header class="flex items-center flex-col gap-2">
            <Drawer.Title class="text-center">Clear All Profiles?</Drawer.Title>
            <Drawer.Description class="text-center text-destructive">
              This will permanently delete all {$profiles.length} saved profiles.
              This action cannot be undone.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Footer class="flex items-center justify-between">
            <Button variant="destructive" onclick={handleClearAll}>
              <Trash2Icon class="w-4 h-4" />
              Yes, Clear All
            </Button>
            <Drawer.Close>
              <Button variant="outline">Cancel</Button>
            </Drawer.Close>
          </Drawer.Footer>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  </div>

  <div class="flex flex-col gap-2 max-w-[600px]">
    <div class="rounded-lg border p-4">
      <h3 class="font-medium mb-2">About Avatar Profiles</h3>
      <p class="text-muted-foreground text-sm">
        Avatar Profiles allow you to save and restore parameter configurations
        for your VRChat avatars. Each profile stores all current parameter
        values which can be loaded later to quickly restore your preferred
        settings.
      </p>
    </div>

    <div class="rounded-lg border p-4">
      <h3 class="font-medium mb-2">Storage Info</h3>
      <div class="flex flex-col gap-1 text-sm text-muted-foreground">
        <div class="flex justify-between">
          <span>Total Profiles:</span>
          <span class="font-mono">{$profiles.length}</span>
        </div>
        <div class="flex justify-between">
          <span>Total Parameters Stored:</span>
          <span class="font-mono">
            {$profiles.reduce(
              (acc, p) => acc + Object.keys(p.parameters).length,
              0
            )}
          </span>
        </div>
        <div class="flex justify-between">
          <span>Unique Avatars:</span>
          <span class="font-mono">
            {new Set($profiles.map((p) => p.avatarId)).size}
          </span>
        </div>
      </div>
    </div>
  </div>
</div>
