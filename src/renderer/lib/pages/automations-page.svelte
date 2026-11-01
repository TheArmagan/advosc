<script lang="ts">
  import { automations, type Automation } from "$lib/api/automations";
  import AutomationRow from "$lib/components/automations/automation-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { PlusIcon, ZapIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";

  const rules = automations.rules;
  const statuses = automations.statuses;

  let expandedId = $state<string | null>(null);

  function addRule() {
    expandedId = automations.add().id;
  }

  function deleteRule(rule: Automation) {
    const index = $rules.findIndex((r) => r.id === rule.id);
    automations.remove(rule.id);
    if (expandedId === rule.id) expandedId = null;
    toast(`Deleted ${rule.name || "rule"}.`, {
      action: { label: "Undo", onClick: () => automations.restore(rule, index) },
    });
  }
</script>

<div class="flex w-full flex-col gap-3 p-4">
  <div class="flex items-center justify-between gap-2">
    <div class="flex min-w-0 items-center gap-2">
      <ZapIcon class="size-4 shrink-0 text-muted-foreground" />
      <span class="text-sm text-muted-foreground">
        When a value does something, do something else.
      </span>
    </div>
    <Button variant="outline" size="sm" onclick={addRule}>
      <PlusIcon class="size-4" />
      Add rule
    </Button>
  </div>

  {#if $rules.length === 0}
    <div class="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
      <ZapIcon class="size-10 opacity-30" />
      <p class="max-w-md text-center text-sm">
        Automations watch a value, like an avatar parameter, and do something when it changes. Add
        a rule to play a sound when someone boops you, for example.
      </p>
    </div>
  {/if}

  {#each $rules as rule (rule.id)}
    <AutomationRow
      {rule}
      status={$statuses[rule.id]}
      expanded={expandedId === rule.id}
      onToggle={() => (expandedId = expandedId === rule.id ? null : rule.id)}
      onDelete={() => deleteRule(rule)}
    />
  {/each}
</div>
