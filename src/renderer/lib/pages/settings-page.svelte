<script lang="ts">
  import BackupSettingsTab from "$lib/components/settings/backup-settings-tab.svelte";
  import GeneralSettingsTab from "$lib/components/settings/general-settings-tab.svelte";
  import LovenseSettingsTab from "$lib/components/settings/lovense-settings-tab.svelte";
  import StartupSettingsTab from "$lib/components/settings/startup-settings-tab.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";

  let activeTab = $state("general");
</script>

<div class="p-4 w-full">
  <Tabs.Root bind:value={activeTab}>
    <Tabs.List>
      <Tabs.Trigger value="general">General</Tabs.Trigger>
      <Tabs.Trigger value="startup">Startup</Tabs.Trigger>
      <Tabs.Trigger value="backup">Backup</Tabs.Trigger>
      <Tabs.Trigger value="lovense">Lovense</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="general">
      <Card.Root class="p-1 bg-transparent border">
        <GeneralSettingsTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="startup">
      <Card.Root class="p-1 bg-transparent border">
        <StartupSettingsTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="backup">
      <Card.Root class="p-1 bg-transparent border">
        <BackupSettingsTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="lovense">
      <Card.Root class="p-1 bg-transparent border">
        <LovenseSettingsTab />
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
