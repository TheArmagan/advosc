<script lang="ts">
  import {
    automations,
    mapRange,
    matches,
    type Automation,
    type AutomationAction,
    type AutomationActionType,
    type AutomationRange,
    type AutomationSource,
    type AutomationStatus,
  } from "$lib/api/automations";
  import {
    ACTION_LABELS,
    ACTION_ORDER,
    actionFitsMode,
    defaultAction,
  } from "$lib/api/automations/actions";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import { avatarOSC } from "$lib/api/vrc-osc";
  import NumberField from "$lib/components/number-field.svelte";
  import ValuePicker from "$lib/components/value-picker/value-picker.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    ArrowRightIcon,
    LockIcon,
    LockOpenIcon,
    PlayIcon,
    PlusIcon,
    Trash2Icon,
    TriangleAlertIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import ActionEditor from "./action-editor.svelte";
  import AddressField from "./address-field.svelte";
  import ModePicker from "./mode-picker.svelte";

  let {
    rule,
    status,
    onDelete,
  }: { rule: Automation; status?: AutomationStatus; onDelete: () => void } = $props();

  const SOURCE_KINDS: { id: AutomationSource["kind"]; label: string }[] = [
    { id: "template", label: "A value or placeholder" },
    { id: "parameter", label: "An avatar parameter" },
  ];

  const currentAvatarId = avatarOSC.avatarId;

  let testing = $state(false);

  const source = $derived(rule.source);
  const range = $derived(rule.range ?? { inMin: 0, inMax: 1, outMin: 0, outMax: 1 });

  /** Toy actions stay in the rule while Lovense is off. They're only hidden from view. */
  const shownActions = $derived(
    rule.actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => toyStatus.enabled || action.type !== "toy"),
  );
  const hiddenActions = $derived(rule.actions.length - shownActions.length);
  const hasToyAction = $derived(rule.actions.some((action) => action.type === "toy"));
  const addable = $derived(
    ACTION_ORDER.filter((type) => type !== "toy" || toyStatus.enabled),
  );

  const matchNow = $derived.by(() => {
    if (status?.lastValue === undefined) return null;
    return matches(status.lastValue, rule.match);
  });

  const mappedNow = $derived.by(() => {
    if (status?.lastValue === undefined) return null;
    const number = Number(status.lastValue);
    if (status.lastValue.trim() === "" || Number.isNaN(number)) return null;
    return { input: number, output: mapRange(number, range) };
  });

  const lockedIds = $derived(rule.avatarIds ?? []);
  const lockedHere = $derived(!!$currentAvatarId && lockedIds.includes($currentAvatarId));

  const lockText = $derived.by(() => {
    if (lockedIds.length === 0) return "Runs on every avatar.";
    if (lockedHere) {
      return lockedIds.length === 1
        ? "Only runs on the avatar you're in."
        : `Only runs on the avatar you're in and ${lockedIds.length - 1} more.`;
    }
    return lockedIds.length === 1
      ? "Only runs on one avatar, and it's not the one you're in."
      : `Only runs on ${lockedIds.length} avatars, and none of them is the one you're in.`;
  });

  function lockToCurrentAvatar() {
    if (!$currentAvatarId || lockedHere) return;
    automations.update(rule.id, { avatarIds: [...lockedIds, $currentAvatarId] });
  }

  /** An empty box takes the field away, so `match` decides on its own again. */
  function setReleaseMatch(value: string) {
    automations.update(rule.id, { releaseMatch: value.trim() ? value : undefined });
  }

  /** Keeps what's typed when switching, where that's possible. */
  function setSourceKind(kind: AutomationSource["kind"]) {
    if (kind === source.kind) return;
    if (kind === "template") {
      const address = source.kind === "parameter" ? source.address : "";
      automations.update(rule.id, {
        source: { kind, template: address ? `{{OSCData;${address}}}` : "" },
      });
    } else {
      const template = source.kind === "template" ? source.template : "";
      const address = /^\{\{OSCData;([^;}]+)\}\}$/.exec(template.trim())?.[1] ?? "";
      automations.update(rule.id, { source: { kind, address } });
    }
  }

  function setRange(patch: Partial<AutomationRange>) {
    automations.update(rule.id, { range: { ...range, ...patch } });
  }

  function setAction(index: number, patch: Partial<AutomationAction>) {
    automations.updateActions(rule.id, (actions) =>
      actions.map((action, i) =>
        i === index ? ({ ...action, ...patch } as AutomationAction) : action,
      ),
    );
  }

  function addAction(type: AutomationActionType) {
    automations.updateActions(rule.id, (actions) => [...actions, defaultAction(type, rule.mode)]);
  }

  function removeAction(index: number) {
    automations.updateActions(rule.id, (actions) => actions.filter((_, i) => i !== index));
  }

  /** Moves past the neighbour you can see, so a hidden action never makes a click do nothing. */
  function moveAction(position: number, direction: -1 | 1) {
    const from = shownActions[position]?.index;
    const to = shownActions[position + direction]?.index;
    if (from === undefined || to === undefined) return;
    automations.updateActions(rule.id, (actions) => {
      const next = [...actions];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  async function runTest() {
    testing = true;
    try {
      await automations.test(rule.id);
      toast.success("Actions ran once.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      testing = false;
    }
  }
</script>

<div class="flex flex-col gap-4 border-t pt-3">
  <div class="flex flex-wrap items-end gap-2">
    <div class="flex min-w-48 flex-1 flex-col gap-1">
      <Label class="text-xs">Name</Label>
      <Input
        class="h-8 text-sm"
        placeholder="What this rule is for"
        aria-label="Rule name"
        value={rule.name}
        oninput={(e) =>
          automations.update(rule.id, { name: (e.target as HTMLInputElement).value })}
      />
    </div>
    <Button variant="outline" size="sm" disabled={testing} onclick={runTest}>
      <PlayIcon class="size-4" />
      Test actions
    </Button>
    <Button variant="outline" size="sm" class="text-destructive" onclick={onDelete}>
      <Trash2Icon class="size-4" />
      Delete
    </Button>
  </div>

  {#if rule.legacySideEffects}
    <p class="flex items-start gap-1.5 text-xs text-amber-400">
      <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      This rule came from Sound Effects, and its template used a placeholder that does something,
      like playing a sound. Automations only read values, so that part doesn't run here. Add it as
      an action instead.
    </p>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-sm font-medium">When</h3>
    <div class="flex flex-wrap items-start gap-2">
      <div class="flex flex-col gap-1">
        <Label class="text-xs">Watch</Label>
        <Select.Root
          type="single"
          value={source.kind}
          onValueChange={(v) => {
            if (v) setSourceKind(v as AutomationSource["kind"]);
          }}
        >
          <Select.Trigger class="h-8 w-48 text-xs">
            {SOURCE_KINDS.find((kind) => kind.id === source.kind)?.label}
          </Select.Trigger>
          <Select.Content>
            {#each SOURCE_KINDS as kind (kind.id)}
              <Select.Item value={kind.id}>{kind.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="min-w-56 flex-1">
        {#if source.kind === "template"}
          <div class="flex flex-col gap-1">
            <Label class="text-xs">Value</Label>
            <ValuePicker
              ariaLabel="Value to watch"
              inputClass="h-8 font-mono text-xs"
              placeholder={"{{OSCData;/avatar/parameters/Booped}}"}
              value={source.template}
              onChange={(template) =>
                automations.update(rule.id, { source: { kind: "template", template } })}
            />
          </div>
        {:else}
          <AddressField
            label="Parameter"
            includeDerived
            value={source.address}
            onChange={(address) =>
              automations.update(rule.id, { source: { kind: "parameter", address } })}
          />
        {/if}
      </div>
    </div>
    <p class="text-xs text-muted-foreground">
      This only reads the value, so a placeholder that does something, like playing a sound, won't
      fire from here.
    </p>
    {#if source.kind === "parameter"}
      <p class="text-xs text-muted-foreground">
        SPS depth is listed here once a socket or plug is sending. Turn on Keep SPS haptics on in
        Settings and the socket in game, then touch it once.
      </p>
    {/if}
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-sm font-medium">How it runs</h3>
    <ModePicker value={rule.mode} onChange={(mode) => automations.setMode(rule.id, mode)} />

    {#if rule.mode === "live"}
      <div class="flex flex-wrap items-end gap-2">
        <NumberField
          label="Value from"
          value={range.inMin}
          onChange={(inMin) => setRange({ inMin })}
        />
        <NumberField
          label="Value to"
          value={range.inMax}
          onChange={(inMax) => setRange({ inMax })}
        />
        <ArrowRightIcon class="mb-2 size-4 shrink-0 text-muted-foreground" />
        <NumberField
          label="Output from"
          value={range.outMin}
          onChange={(outMin) => setRange({ outMin })}
        />
        <NumberField
          label="Output to"
          value={range.outMax}
          onChange={(outMax) => setRange({ outMax })}
        />
      </div>
      <NumberField
        label="Minimum time between updates (ms)"
        integer
        min={0}
        step={50}
        inputClass="w-28"
        value={rule.cooldownMs ?? 0}
        onChange={(cooldownMs) => automations.update(rule.id, { cooldownMs })}
      />
      <p class="text-xs text-muted-foreground">
        {#if range.inMin === range.inMax}
          <span class="text-amber-400">
            Value from and Value to are the same, so the output stays at {range.outMin}.
          </span>
        {:else if mappedNow}
          Right now {mappedNow.input} becomes {Number(mappedNow.output.toFixed(3))}.
        {:else}
          Anything outside the range stops at the nearest end.
        {/if}
        {#if hasToyAction}
          For toys, 1 is full strength before your max strength applies.
        {/if}
      </p>
    {:else}
      <div class="flex flex-wrap items-start gap-3">
        <div class="flex flex-col gap-1">
          <Label class="text-xs">Matches</Label>
          <Input
            class="h-8 w-40 font-mono text-xs"
            placeholder="1, > 0.5, != idle"
            aria-label="Match"
            value={rule.match}
            oninput={(e) =>
              automations.update(rule.id, { match: (e.target as HTMLInputElement).value })}
          />
        </div>
        <div class="flex flex-col gap-1">
          <Label class="text-xs">Stays matched until (optional)</Label>
          <Input
            class="h-8 w-48 font-mono text-xs"
            placeholder="<= 0.05"
            aria-label="Stays matched until"
            value={rule.releaseMatch ?? ""}
            oninput={(e) => setReleaseMatch((e.target as HTMLInputElement).value)}
          />
        </div>
        <NumberField
          label="Cooldown (ms)"
          integer
          min={0}
          step={100}
          value={rule.cooldownMs ?? 0}
          onChange={(cooldownMs) => automations.update(rule.id, { cooldownMs })}
        />
      </div>
      <p class="text-xs text-muted-foreground">
        A value like <span class="font-mono">1</span>, or an operator first:
        <span class="font-mono">&gt; 0.5</span>, <span class="font-mono">!= idle</span>.
        {#if matchNow !== null}
          Right now it's <span class="font-mono">{status?.lastValue || "empty"}</span>, which
          {matchNow ? "matches" : "doesn't match"}.
        {/if}
        Fill in "Stays matched until" if a value hovering around the match keeps setting this off.
      </p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      <span
        class="min-w-48 flex-1 text-xs text-muted-foreground"
        title={lockedIds.join("\n") || undefined}
      >
        {lockText}
      </span>
      {#if !lockedHere}
        <Button
          variant="outline"
          size="sm"
          disabled={!$currentAvatarId}
          title={$currentAvatarId ? undefined : "ADVOSC hasn't seen an avatar yet."}
          onclick={lockToCurrentAvatar}
        >
          <LockIcon class="size-4" />
          Lock to current avatar
        </Button>
      {/if}
      {#if lockedIds.length > 0}
        <Button
          variant="outline"
          size="sm"
          onclick={() => automations.update(rule.id, { avatarIds: undefined })}
        >
          <LockOpenIcon class="size-4" />
          Clear lock
        </Button>
      {/if}
    </div>
  </section>

  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-medium">Do this</h3>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm">
              <PlusIcon class="size-4" />
              Add action
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
          {#each addable as type (type)}
            {@const fits = actionFitsMode(type, rule.mode)}
            <DropdownMenu.Item disabled={!fits} onSelect={() => addAction(type)}>
              {ACTION_LABELS[type]}
            </DropdownMenu.Item>
          {/each}
          {#if rule.mode === "live"}
            <p class="px-2 py-1 text-xs text-muted-foreground">
              Greyed out actions don't run in Live mode.
            </p>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>

    {#if rule.actions.length === 0}
      <p class="text-xs text-muted-foreground">No actions yet. Add one to make this rule do something.</p>
    {/if}

    {#each shownActions as { action, index }, position}
      <ActionEditor
        {action}
        mode={rule.mode}
        first={position === 0}
        last={position === shownActions.length - 1}
        onChange={(patch) => setAction(index, patch)}
        onMove={(direction) => moveAction(position, direction)}
        onRemove={() => removeAction(index)}
      />
    {/each}

    {#if hiddenActions > 0}
      <p class="text-xs text-muted-foreground">
        {hiddenActions === 1 ? "1 action is" : `${hiddenActions} actions are`} hidden, because the
        feature {hiddenActions === 1 ? "it uses" : "they use"} is off in Settings.
      </p>
    {/if}
  </section>
</div>
