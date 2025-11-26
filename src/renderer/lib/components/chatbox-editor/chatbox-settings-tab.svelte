<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { DownloadIcon, UploadIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import ChatboxMonacoEditor from "./chatbox-monaco-editor.svelte";

  const settings = chatbox.settings;

  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  function handleExport() {
    const allValues = chatbox.getAllValues();
    const json = JSON.stringify(allValues, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Chatbox settings exported to clipboard!");
  }

  function handleImport() {
    try {
      const parsed = JSON.parse(bulkImportValue);
      chatbox.setAllValues(parsed);
      toast.success("Chatbox settings imported successfully!");
      bulkImportOpen = false;
      bulkImportValue = "";
    } catch (error) {
      toast.error("Invalid JSON: " + (error as Error).message);
    }
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex gap-2">
    <Button variant="outline" onclick={handleExport}>
      <DownloadIcon />
      Export All Settings
    </Button>

    <Drawer.Root bind:open={bulkImportOpen}>
      <Drawer.Trigger>
        <Button variant="outline">
          <UploadIcon />
          Import All Settings
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex flex-col gap-2 w-full p-2">
        <Label class="text-lg">Import All Chatbox Settings (JSON)</Label>
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
          <Button onclick={handleImport}>
            <UploadIcon />
            Import
          </Button>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>
  </div>
  <div class="flex max-w-[600px]">
    <Label
      class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-aria-checked:border-blue-600 has-aria-checked:bg-blue-50 dark:has-aria-checked:border-blue-900 dark:has-aria-checked:bg-blue-950"
    >
      <Checkbox
        id="auto-send"
        bind:checked={$settings.autoSend}
        class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
      <div class="grid gap-1.5 font-normal">
        <p class="text-sm font-medium leading-none">Enable auto send</p>
        <p class="text-muted-foreground text-sm">
          This will automatically send the generated OSC messages to the VRChat
          every 2.2 seconds. This is the rate-limit
        </p>
      </div>
    </Label>
  </div>
  <div class="flex max-w-[600px]">
    <Label
      class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-aria-checked:border-blue-600 has-aria-checked:bg-blue-50 dark:has-aria-checked:border-blue-900 dark:has-aria-checked:bg-blue-950"
    >
      <Checkbox
        id="egg-mode"
        bind:checked={$settings.eggMode}
        class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
      <div class="grid gap-1.5 font-normal">
        <p class="text-sm font-medium leading-none">Enable Egg Mode</p>
        <p class="text-muted-foreground text-sm">
          This makes the chatbox messages background transparent in VRChat.
        </p>
      </div>
    </Label>
  </div>
  <div class="flex max-w-[600px]">
    <Label
      class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-aria-checked:border-blue-600 has-aria-checked:bg-blue-50 dark:has-aria-checked:border-blue-900 dark:has-aria-checked:bg-blue-950"
    >
      <Checkbox
        id="egg-mode"
        bind:checked={$settings.debugMode}
        class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
      <div class="grid gap-1.5 font-normal">
        <p class="text-sm font-medium leading-none">Enable Debug Mode</p>
        <p class="text-muted-foreground text-sm">
          This will enable additional debug information in the chatbox messages
          for troubleshooting.
        </p>
      </div>
    </Label>
  </div>
</div>
