<script lang="ts">
  import type { ChatboxVarModule } from "$lib/api/chatbox/modules/chatbox-var-module";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import { Trash2Icon, VariableIcon } from "@lucide/svelte";

  const {
    module,
  }: {
    module: ChatboxVarModule;
  } = $props();

  const values = module.values;
  const variables = $derived(
    Object.entries(($values.variables ?? {}) as Record<string, string>),
  );
</script>

{#if variables.length === 0}
  <p class="text-sm text-muted-foreground">
    No variables yet. An automation can set one, and {"{{Var;name}}"} reads it.
  </p>
{:else}
  <Item.Group class="gap-2">
    {#each variables as [name, value] (name)}
      <Item.Root variant="outline" size="sm">
        <Item.Media>
          <VariableIcon class="size-4" />
        </Item.Media>
        <Item.Content class="min-w-0">
          <Item.Title>{name}</Item.Title>
          <Item.Description class="truncate">{value}</Item.Description>
        </Item.Content>
        <Item.Actions>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear {name}"
            onclick={() => module.clearVariable(name)}
          >
            <Trash2Icon class="size-4" />
          </Button>
        </Item.Actions>
      </Item.Root>
    {/each}
  </Item.Group>
{/if}
