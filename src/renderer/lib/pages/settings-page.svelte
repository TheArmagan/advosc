<script lang="ts">
  import GeneralSettingsTab from "$lib/components/settings/general-settings-tab.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";

  let activeTab = $state("general");
</script>

<div class="p-4 w-full">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      <Tabs.Trigger value="general">General</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="general">
      <Card.Root class="p-1 bg-transparent border">
        <GeneralSettingsTab />
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
