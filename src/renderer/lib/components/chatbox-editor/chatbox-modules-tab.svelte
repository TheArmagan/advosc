<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import * as Accordion from "$lib/components/ui/accordion/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
</script>

<div class="flex flex-col gap-2">
  <Card.Root class="px-4 py-2">
    <Accordion.Root type="single">
      {#each chatbox.modules as [moduleId, m]}
        <Accordion.Item value={moduleId}>
          <Accordion.Trigger>
            <div class="flex items-center gap-2">
              <h1 class="text-lg">{m.options.name}</h1>
              <p class="text-start font-normal opacity-90">
                - {m.options.description}
              </p>
            </div>
          </Accordion.Trigger>
          <Accordion.Content>
            {#if m.options.Component}
              <m.options.Component module={m} />
            {:else}
              <p class="text-sm italic text-muted-foreground">
                No settings available for this module.
              </p>
            {/if}
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    </Accordion.Root>
  </Card.Root>
</div>
