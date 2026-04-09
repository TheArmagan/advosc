<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import {
    CopyIcon,
    PenIcon,
    PlusIcon,
    Trash2Icon,
    DownloadIcon,
    UploadIcon,
    EyeOffIcon,
    EyeIcon,
    HashIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ChatboxMonacoEditor from "../chatbox-monaco-editor.svelte";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { chatbox } from "$lib/api/chatbox";
  import { onMount } from "svelte";
  import { ChatboxShortcutModule } from "$lib/api/chatbox/modules/chatbox-shortcut-module";

  const {
    module,
  }: {
    module: ChatboxShortcutModule;
  } = $props();

  const values = module.values;

  let shortcutAddKey = $state("");
  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  let openedShortcutKey = $state<string | null>(null);
  let shortcutRender = $state<string>("");
  let shortcutParamsCount = $derived(
    openedShortcutKey ? module.getMaxParamCount(openedShortcutKey) : 0,
  );
  let placeholderParams = $state<string[]>([]);

  async function updateShortcutRender(key: string) {
    shortcutRender = await chatbox.fillTemplate(
      `{{Shortcut;${key}${
        shortcutParamsCount > 0
          ? `;${placeholderParams
              .slice(0, shortcutParamsCount)
              .map((i) => i.replaceAll(";", "\\;"))
              .join(";")}`
          : ""
      }}}`,
      "{{;}}",
    );
  }

  function handleBulkExport() {
    const shortcuts = module.getCleanValues().shortcuts;
    const json = JSON.stringify(shortcuts, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Shortcuts exported to clipboard!");
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
      $values.shortcuts = {
        ...($values.shortcuts || {}),
        ...parsed,
      };
      toast.success("Shortcuts imported successfully!");
      bulkImportOpen = false;
      bulkImportValue = "";
    } catch (error) {
      toast.error("Invalid JSON: " + (error as Error).message);
    }
  }

  onMount(() => {
    const interval = setInterval(() => {
      if (openedShortcutKey) {
        updateShortcutRender(openedShortcutKey);
      }
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

<div class="flex flex-col gap-2 items-start justify-start">
  <div class="flex gap-2">
    <Drawer.Root>
      <Drawer.Trigger>
        <Button
          variant="outline"
          onclick={() => {
            shortcutAddKey = `Cut${Object.keys($values.shortcuts || {}).length + 1}`;
          }}
        >
          <PlusIcon />
          Add Shortcut
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex items-center justify-center w-full">
        <div class="w-96 flex flex-col gap-4 p-4">
          <div class="flex flex-col gap-2">
            <div class="flex flex-col gap-2">
              <Label>Shortcut Key</Label>
              <Input
                bind:value={shortcutAddKey}
                placeholder="Shortcut key (e.g., Shortcut1)"
              />
            </div>
          </div>
          <Drawer.Footer>
            <Drawer.Close>
              <Button
                disabled={!shortcutAddKey.trim()}
                onclick={() => {
                  $values.shortcuts = {
                    ...($values.shortcuts || {}),
                    [shortcutAddKey.trim()]: "",
                  };
                  toast.success("Shortcut added.");
                  shortcutAddKey = "";
                }}
              >
                <PlusIcon />
                Add Shortcut
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
        <Label class="text-lg">Bulk Import Shortcuts (JSON)</Label>
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
  {#each Object.entries($values.shortcuts || {}).filter(([key]) => !key.startsWith("__SE_")) as [key, value]}
    <Item.Root class="w-full p-0">
      <InputGroup.Root>
        <InputGroup.Addon>
          <InputGroup.Button
            variant="secondary"
            size="icon-xs"
            onclick={() => {
              navigator.clipboard.writeText(key);
              toast.success("Copied to clipboard!");
            }}
          >
            <CopyIcon />
          </InputGroup.Button>
        </InputGroup.Addon>
        <InputGroup.Addon>
          <InputGroup.Text>
            {key}
          </InputGroup.Text>
        </InputGroup.Addon>
        <InputGroup.Input
          placeholder="Shortcut goes here."
          class="w-full"
          type={$values.secrets?.includes(key) ? "password" : "text"}
          readonly
          {value}
        />
        <InputGroup.Addon align="inline-end">
          <Drawer.Root
            onOpenChange={(open) => {
              openedShortcutKey = open ? key : null;
              if (open) {
                updateShortcutRender(key);
              }
            }}
          >
            <Drawer.Trigger>
              <InputGroup.Button>
                <PenIcon />
                Edit
              </InputGroup.Button>
            </Drawer.Trigger>
            <Drawer.Content class="flex flex-col gap-2 w-full p-2">
              <Label class="text-lg">Editing Shortcut: {key}</Label>
              <div class="flex w-full items-center justify-center">
                <ChatboxMonacoEditor
                  width={Math.floor(window.innerWidth * 0.98)}
                  height={250}
                  onLoad={(editor) => {
                    editor.setValue(value as string);
                  }}
                  onChange={(newValue) => {
                    $values.shortcuts = {
                      ...($values.shortcuts || {}),
                      [key]: newValue,
                    };
                  }}
                />
              </div>
              <div class="flex gap-2 w-full items-center justify-between">
                {#each Array.from({ length: shortcutParamsCount }) as _, index}
                  <div class="flex flex-col gap-2">
                    <InputGroup.Root>
                      <InputGroup.Addon>
                        <HashIcon />
                      </InputGroup.Addon>
                      <InputGroup.Addon>
                        <InputGroup.Text>
                          {index}
                        </InputGroup.Text>
                      </InputGroup.Addon>
                      <InputGroup.Input
                        placeholder="Param{index} value here!"
                        bind:value={placeholderParams[index]}
                      />
                    </InputGroup.Root>
                  </div>
                {/each}
              </div>
              <div class="flex gap-2 w-full">
                <Textarea
                  id="template-preview"
                  value={shortcutRender}
                  class="w-full h-16 font-mono bg-secondary text-foreground text-center"
                  placeholder="Template preview will appear here..."
                  readonly
                />
              </div>
            </Drawer.Content>
          </Drawer.Root>
        </InputGroup.Addon>
        <InputGroup.Addon align="inline-end">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <InputGroup.Button>⋮</InputGroup.Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Group>
                <DropdownMenu.Item
                  onclick={() => {
                    const { [key]: _, ...rest } = $values.shortcuts || {};
                    module.values.set({
                      ...$values,
                      shortcuts: rest,
                    });
                    toast.success("Shortcut deleted.");
                  }}
                  class="text-destructive"
                >
                  <Trash2Icon />
                  Delete Shortcut
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onclick={() => {
                    const secrets = $values.secrets || [];
                    if (!secrets.includes(key)) {
                      secrets.push(key);
                    } else {
                      const index = secrets.indexOf(key);
                      if (index > -1) {
                        secrets.splice(index, 1);
                      }
                    }
                    $values.secrets = secrets;
                  }}
                >
                  {#if !$values.secrets?.includes(key)}
                    <EyeOffIcon />
                    Hide Shortcut
                  {:else}
                    <EyeIcon />
                    Unhide Shortcut
                  {/if}
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </InputGroup.Addon>
      </InputGroup.Root>
    </Item.Root>
  {/each}
</div>
