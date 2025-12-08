<script lang="ts">
  import AvatarProfilesListingTab from "$lib/components/avatar-profiles/avatar-profiles-listing-tab.svelte";
  import AvatarProfilesSettingsTab from "$lib/components/avatar-profiles/avatar-profiles-settings-tab.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
</script>

<div class="p-4 w-full">
  <Tabs.Root value="profiles">
    <Tabs.List>
      <Tabs.Trigger value="profiles">Profiles</Tabs.Trigger>
      <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="profiles">
      <Card.Root class="p-2 bg-transparent border">
        <AvatarProfilesListingTab />
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="settings">
      <Card.Root class="p-2 bg-transparent border">
        <AvatarProfilesSettingsTab />
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
