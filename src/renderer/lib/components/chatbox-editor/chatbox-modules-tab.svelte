<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { LOVENSE_MODULE_ID } from "$lib/api/toys";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import * as Accordion from "$lib/components/ui/accordion/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import RouteLink from "$lib/components/route-link.svelte";

  const modules = $derived(
    [...chatbox.modules].filter(([id]) => toyStatus.enabled || id !== LOVENSE_MODULE_ID),
  );
</script>

<div class="flex flex-col gap-2">
  <Card.Root class="px-4 py-2">
    <Accordion.Root type="single">
      {#each modules as [moduleId, m] (moduleId)}
        {@const inputs = m.options.inputs ?? []}
        <Accordion.Item value={moduleId}>
          <Accordion.Trigger>
            <div class="flex items-center gap-2">
              <h1 class="text-lg shrink-0">{m.options.name}</h1>
              <p class="text-start font-normal opacity-90">
                - {m.options.description}
              </p>
              {#if inputs.length}
                <span
                  class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground"
                >
                  {inputs.length === 1 ? "1 input" : `${inputs.length} inputs`}
                </span>
              {/if}
            </div>
          </Accordion.Trigger>
          <Accordion.Content>
            <div class="flex flex-col gap-3">
              {#if inputs.length}
                <section class="flex flex-col gap-1 rounded-md border p-2">
                  <span class="text-xs font-medium">Inputs</span>
                  <p class="text-xs text-muted-foreground">
                    Things other parts of the app can tell this module to do. Use them from
                    <RouteLink to="/automations" class="underline underline-offset-2">
                      Automations
                    </RouteLink>.
                  </p>
                  <ul class="flex flex-col gap-1">
                    {#each inputs as input (input.id)}
                      <li class="text-xs">
                        <span class="font-medium">{input.label}:</span>
                        <span class="text-muted-foreground">{input.description}</span>
                      </li>
                    {/each}
                  </ul>
                </section>
              {/if}

              {#if m.options.Component}
                <m.options.Component module={m} />
              {:else}
                <p class="text-sm italic text-muted-foreground">
                  No settings available for this module.
                </p>
              {/if}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    </Accordion.Root>
  </Card.Root>
</div>
