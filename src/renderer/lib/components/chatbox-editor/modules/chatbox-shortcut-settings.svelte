<script lang="ts">
  import { ChatboxModule } from "$lib/api/chatbox/chatbox-module";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { CopyIcon, PenIcon, PlusIcon, Trash2Icon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ChatboxMonacoEditor from "../chatbox-monaco-editor.svelte";

  const {
    module,
  }: {
    module: ChatboxModule;
  } = $props();

  const values = module.values;

  let shortcutAddKey = $state("");
</script>

<div class="flex flex-col gap-2 items-start justify-start">
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
          <div class="flex flex-col gap-1">
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
  {#each Object.entries($values.shortcuts || {}) as [key, value]}
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
          readonly
          {value}
        />
        <InputGroup.Addon align="inline-end">
          <Drawer.Root>
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
                    module.values.set(rest);
                    toast.success("Shortcut deleted.");
                  }}
                  class="text-destructive"
                >
                  <Trash2Icon />
                  Delete Shortcut
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </InputGroup.Addon>
      </InputGroup.Root>
    </Item.Root>
  {/each}
</div>
