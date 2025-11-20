<script lang="ts">
  import ChatboxAdvancedEditorTab from "$lib/components/chatbox-editor/chatbox-advanced-editor-tab.svelte";
  import ChatboxSettingsTab from "$lib/components/chatbox-editor/chatbox-settings-tab.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
</script>

<div class="p-4 w-full">
  <Tabs.Root value="advanced">
    <Tabs.List>
      <Tabs.Trigger value="simple">Simple Editor</Tabs.Trigger>
      <Tabs.Trigger value="advanced">Advanced Editor</Tabs.Trigger>
      <Tabs.Trigger value="modules">Module Settings</Tabs.Trigger>
      <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="simple"></Tabs.Content>
    <Tabs.Content value="advanced">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxAdvancedEditorTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="settings">
      <Card.Root class="p-1 bg-transparent border">
        <ChatboxSettingsTab />
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
