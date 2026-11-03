<script lang="ts">
  import { localData } from "$lib/api/local-data";
  import ChatboxAdvancedEditorTab from "$lib/components/chatbox-editor/chatbox-advanced-editor-tab.svelte";
  import ChatboxPresetsTab from "$lib/components/chatbox-editor/chatbox-presets-tab.svelte";
  import ChatboxSettingsTab from "$lib/components/chatbox-editor/chatbox-settings-tab.svelte";
  // @ts-ignore
  import ChatboxSimpleEditorTab from "$lib/components/chatbox-editor/chatbox-simple-editor-tab.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";

  // Whichever editor tab is active writes the live template when it mounts, so
  // this page has to come back on the tab you left. Otherwise a quick trip to
  // Modules would swap a Simple Editor template for the Advanced one.
  let activeTab = $state<string>(localData.get("Chatbox;ActiveTab", "editor"));
  $effect(() => localData.set("Chatbox;ActiveTab", activeTab));
</script>

<div class="p-4 w-full min-h-full flex flex-col">
  <Tabs.Root bind:value={activeTab} class="flex-1">
    <Tabs.List>
      <Tabs.Trigger value="simple">Simple Editor</Tabs.Trigger>
      <Tabs.Trigger value="editor">Advanced Editor</Tabs.Trigger>
      <Tabs.Trigger value="templates">My Templates</Tabs.Trigger>
      <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
    </Tabs.List>
    <!-- Both editors draw their own cards, so they sit straight on the page. -->
    <Tabs.Content value="simple" class="pt-1">
      <ChatboxSimpleEditorTab isActive={activeTab === "simple"} />
    </Tabs.Content>
    <Tabs.Content value="editor" class="pt-1">
      <ChatboxAdvancedEditorTab isActive={activeTab === "editor"} />
    </Tabs.Content>
    <Tabs.Content value="templates">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxPresetsTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="settings">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxSettingsTab />
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
