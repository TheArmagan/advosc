<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { BracesIcon, CopyIcon, RefreshCwIcon, SearchIcon, TableIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import TypeBadge from "./type-badge.svelte";
  import { buildParameterList, scoreParameter } from "./parameter-search";

  const schema = avatarOSC.schema;
  const schemaIndex = avatarOSC.schemaIndex;

  let query = $state("");
  let raw = $state(false);

  const rows = $derived.by(() => {
    const items = buildParameterList({}, $schemaIndex, avatarOSC.getParameterType);
    const filtered = query.trim() ? items.filter((i) => scoreParameter(i, query) >= 0) : items;
    return filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  });
</script>

<Card.Root class="gap-3 py-4">
  <Card.Header class="flex flex-row flex-wrap items-center justify-between gap-2 px-4">
    <div class="flex flex-col gap-1">
      <Card.Title>{$schema?.name ?? "No schema loaded"}</Card.Title>
      <Card.Description class="font-mono text-xs">
        {#if $schema}
          {$schema.id}, {$schema.parameters.length} parameters
        {:else}
          VRChat writes this file when you switch into an avatar with OSC on.
        {/if}
      </Card.Description>
    </div>
    <div class="flex items-center gap-2">
      {#if $schema && !raw}
        <InputGroup.Root class="w-56">
          <InputGroup.Addon><SearchIcon /></InputGroup.Addon>
          <InputGroup.Input placeholder="Filter" bind:value={query} />
        </InputGroup.Root>
      {/if}
      <Button variant="outline" size="sm" disabled={!$schema} onclick={() => (raw = !raw)}>
        {#if raw}<TableIcon /> Table{:else}<BracesIcon /> JSON{/if}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!$schema}
        onclick={() => {
          navigator.clipboard.writeText(JSON.stringify($schema, null, 2));
          toast.success("Schema copied");
        }}
      >
        <CopyIcon /> Copy
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={async () => {
          await avatarOSC.updateOSCSchema();
          toast.success("Schema refreshed");
        }}
      >
        <RefreshCwIcon /> Refresh
      </Button>
    </div>
  </Card.Header>
  {#if $schema}
    <Card.Content class="px-4">
      {#if raw}
        <pre class="max-h-[70vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs">{JSON.stringify($schema, null, 2)}</pre>
      {:else}
        <div class="overflow-hidden rounded-md border">
          <table class="w-full text-sm">
            <thead class="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">Type</th>
                <th class="px-3 py-2 font-medium">Direction</th>
                <th class="px-3 py-2 font-medium">Address</th>
              </tr>
            </thead>
            <tbody>
              {#each rows as row (row.address)}
                {@const entry = $schemaIndex[row.address]}
                <tr class="border-t">
                  <td class="px-3 py-1.5">{row.name}</td>
                  <td class="px-3 py-1.5"><TypeBadge type={row.type} /></td>
                  <td class="px-3 py-1.5 text-xs text-muted-foreground">
                    {entry.writable && entry.readable ? "In and out" : entry.writable ? "In only" : "Out only"}
                  </td>
                  <td class="px-3 py-1.5 font-mono text-xs text-muted-foreground">{row.address}</td>
                </tr>
              {:else}
                <tr><td colspan="4" class="px-3 py-6 text-center text-muted-foreground">Nothing matches "{query}".</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Card.Content>
  {/if}
</Card.Root>
