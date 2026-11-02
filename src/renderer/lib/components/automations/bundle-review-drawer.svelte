<script lang="ts">
  import { automations } from "$lib/api/automations";
  import { bundleReview } from "$lib/api/automations/bundle-review.svelte";
  import {
    describeAction,
    describeSource,
    describeTrigger,
    hasToyAction,
    isContactRule,
  } from "$lib/api/automations/describe";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { bundleToRules, importKeyOf, MAX_BUNDLE_JSON } from "$shared/automation-bundle";
  import { get } from "$shared/store";
  import { FileJsonIcon, PlusIcon, TriangleAlertIcon, UploadIcon } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  const rules = automations.rules;

  let pasted = $state("");
  let fileInput = $state<HTMLInputElement | null>(null);

  const bundle = $derived(bundleReview.bundle);
  const review = $derived(bundle ? bundleToRules(bundle, $rules) : null);

  /** Shows a rule's own name for an entry in `skipped`, whichever way that entry names it. */
  const skippedNames = $derived.by(() => {
    if (!bundle || !review) return [];
    const current = bundle;
    return review.skipped.map((entry) => {
      const rule = current.rules.find(
        (r) => r.name === entry || r.key === entry || importKeyOf(current, r) === entry,
      );
      return rule?.name ?? entry;
    });
  });

  const addLabel = $derived.by(() => {
    const count = review?.rules.length ?? 0;
    if (count === 0) return "Nothing new to add";
    return count === 1 ? "Add 1 rule, off" : `Add ${count} rules, off`;
  });

  onMount(() => bundleReview.listen());

  function close() {
    pasted = "";
    bundleReview.close();
  }

  function add() {
    if (!bundle || !bundleReview.open) return;
    // Worked out again here, since the preview's copy can be behind the store by now.
    const { rules: added } = bundleToRules(bundle, get(rules));
    if (added.length > 0) {
      automations.addImported(added);
      toast.success(
        added.length === 1
          ? "Added 1 rule. It's off until you turn it on in Automations."
          : `Added ${added.length} rules. They're off until you turn them on in Automations.`,
      );
    }
    close();
  }

  async function pickFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_BUNDLE_JSON) {
      bundleReview.fail("That file is too big to be a set of rules.");
      return;
    }
    bundleReview.submit(await file.text());
  }
</script>

<Drawer.Root
  bind:open={() => bundleReview.open, (value) => {
    if (!value) close();
  }}
>
  <Drawer.Content class="flex w-full items-center justify-center">
    <div class="flex min-h-0 w-[40rem] max-w-full flex-1 flex-col gap-4 p-4">
      {#if bundleReview.pasting}
        <div class="flex flex-col gap-1">
          <Label class="text-lg">Import rules</Label>
          <p class="text-sm text-muted-foreground">
            Paste a link or a code, or pick a .advosc.json file. You'll see every rule before
            anything is added.
          </p>
        </div>
        <Textarea
          bind:value={pasted}
          class="h-32 font-mono text-xs"
          aria-label="Link or code"
          placeholder="advosc://import?d=... or ADVOSCR1:..."
        />
        {#if bundleReview.error}
          <p role="alert" class="flex items-start gap-1.5 text-sm text-destructive">
            <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
            {bundleReview.error}
          </p>
        {/if}
        <Drawer.Footer class="flex-row justify-end p-0">
          <Button variant="outline" onclick={close}>Cancel</Button>
          <Button variant="outline" onclick={() => fileInput?.click()}>
            <FileJsonIcon />
            Pick a file
          </Button>
          <Button disabled={!pasted.trim()} onclick={() => bundleReview.submit(pasted)}>
            <UploadIcon />
            Review
          </Button>
        </Drawer.Footer>
        <input
          bind:this={fileInput}
          type="file"
          accept=".json,application/json"
          class="hidden"
          onchange={pickFile}
        />
      {:else if bundle && review}
        <div class="flex flex-col gap-1">
          <Label class="text-lg [overflow-wrap:anywhere]">{bundle.name}</Label>
          {#if bundle.avatarName}
            <p class="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              For {bundle.avatarName}
            </p>
          {/if}
          <p class="text-sm text-muted-foreground">
            Check these before you add them. Every rule arrives off, so nothing runs until you turn
            it on.
            {#if bundle.avatarIds?.length}
              They'll only run on the avatar they were made for.
            {/if}
          </p>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {#each review.rules as rule (rule.id)}
            <Card.Root class="gap-2 p-3">
              <p class="text-sm font-medium [overflow-wrap:anywhere]">
                {rule.name || "Untitled rule"}
              </p>
              <dl class="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
                <dt class="text-muted-foreground">Watches</dt>
                <dd class="min-w-0 [overflow-wrap:anywhere]">{describeSource(rule)}</dd>
                <dt class="text-muted-foreground">When</dt>
                <dd class="min-w-0 [overflow-wrap:anywhere]">{describeTrigger(rule)}</dd>
                <dt class="text-muted-foreground">Does</dt>
                <dd class="min-w-0 [overflow-wrap:anywhere]">
                  {#if rule.actions.length === 0}
                    Nothing yet
                  {:else}
                    <ul class="flex flex-col gap-0.5">
                      {#each rule.actions as action}
                        <li>{describeAction(action)}</li>
                      {/each}
                    </ul>
                  {/if}
                </dd>
              </dl>

              {#if hasToyAction(rule)}
                <p class="flex items-start gap-1.5 text-xs text-amber-400">
                  <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
                  <span>
                    This rule controls a toy. Your max strength and panic hotkey still apply, and it
                    arrives off.
                    {#if !toyStatus.enabled}
                      Toy control is off in Settings, so this part stays hidden until you turn it
                      on.
                    {/if}
                  </span>
                </p>
              {/if}
              {#if isContactRule(rule)}
                <p class="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
                  Anyone nearby can trigger this rule.
                </p>
              {/if}
            </Card.Root>
          {/each}

          {#if skippedNames.length > 0}
            <div class="rounded-lg border p-3 text-sm">
              <p class="font-medium">Already added</p>
              <ul class="mt-1 list-disc pl-4 text-muted-foreground [overflow-wrap:anywhere]">
                {#each skippedNames as name}
                  <li>{name}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>

        <Drawer.Footer class="flex-row justify-end p-0">
          <Button variant="outline" onclick={close}>Cancel</Button>
          <Button disabled={review.rules.length === 0} onclick={add}>
            <PlusIcon />
            {addLabel}
          </Button>
        </Drawer.Footer>
      {:else}
        <div class="flex flex-col gap-1">
          <Label class="text-lg">Couldn't read that link</Label>
          <p role="alert" class="text-sm text-muted-foreground">
            {bundleReview.error ?? "This link is corrupted or incomplete."}
          </p>
        </div>
        <Drawer.Footer class="flex-row justify-end p-0">
          <Button variant="outline" onclick={close}>Close</Button>
        </Drawer.Footer>
      {/if}
    </div>
  </Drawer.Content>
</Drawer.Root>
