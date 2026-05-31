<script lang="ts">
  import ChatboxAdvancedEditorTab from "$lib/components/chatbox-editor/chatbox-advanced-editor-tab.svelte";
  import ChatboxModulesTab from "$lib/components/chatbox-editor/chatbox-modules-tab.svelte";
  import ChatboxOscForwarderTab from "$lib/components/chatbox-editor/chatbox-osc-forwarder-tab.svelte";
  import ChatboxSettingsTab from "$lib/components/chatbox-editor/chatbox-settings-tab.svelte";
  // @ts-ignore
  import ChatboxSimpleEditorTab from "$lib/components/chatbox-editor/chatbox-simple-editor-tab.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";

  let activeTab = $state("editor");
</script>

<div class="p-4 w-full">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      <Tabs.Trigger value="simple">Simple Editor</Tabs.Trigger>
      <Tabs.Trigger value="editor">Advanced Editor</Tabs.Trigger>
      <Tabs.Trigger value="modules">Modules</Tabs.Trigger>
      <Tabs.Trigger value="forwarder">OSC Forwarder</Tabs.Trigger>
      <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="simple">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxSimpleEditorTab isActive={activeTab === "simple"} />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="editor">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxAdvancedEditorTab isActive={activeTab === "editor"} />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="modules">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxModulesTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="forwarder">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxOscForwarderTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="settings">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxSettingsTab />
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
