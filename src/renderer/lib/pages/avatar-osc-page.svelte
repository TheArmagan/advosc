<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  const schema = avatarOSC.schema;
  const parameters = avatarOSC.parameters;
</script>

<!-- <pre>{JSON.stringify($schema, null, 2)}</pre>
<pre>{JSON.stringify($parameters, null, 2)}</pre> -->

<div class="p-4 w-full">
  <Tabs.Root value="parameters" class="w-[400px]">
    <Tabs.List>
      <Tabs.Trigger value="parameters">Parameters</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="parameters">
      <Item.Root variant="muted">
        <Item.Content>
          <Item.Title>Muted Variant</Item.Title>
          <Item.Description>
            Subdued appearance with muted colors for secondary content.
          </Item.Description>
        </Item.Content>
        <Item.Actions>
          <Button variant="outline" size="sm">Open</Button>
        </Item.Actions>
      </Item.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
