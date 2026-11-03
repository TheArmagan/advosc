<script lang="ts">
  import type { AutomationAction, AutomationMode } from "$lib/api/automations";
  import { ACTION_LABELS, VARIABLE_OP_LABELS, actionProblem } from "$lib/api/automations/actions";
  import { VARIABLE_OPS, type VariableOp } from "$shared/automation";
  import { soundEffects, type SoundOscType } from "$lib/api/sound-effects";
  import { avatarProfiles } from "$lib/api/vrc-osc";
  import RouteLink from "$lib/components/route-link.svelte";
  import ValuePicker from "$lib/components/value-picker/value-picker.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import {
    ArrowDownIcon,
    ArrowUpIcon,
    BlocksIcon,
    BookUserIcon,
    CalculatorIcon,
    RadioIcon,
    SlidersHorizontalIcon,
    Trash2Icon,
    TriangleAlertIcon,
    VariableIcon,
    VibrateIcon,
    Volume2Icon,
  } from "@lucide/svelte";
  import AddressField from "./address-field.svelte";
  import ModuleInputEditor from "./module-input-editor.svelte";
  import ToyActionEditor from "./toy-action-editor.svelte";

  let {
    action,
    mode,
    first,
    last,
    onChange,
    onMove,
    onRemove,
  }: {
    action: AutomationAction;
    mode: AutomationMode;
    first: boolean;
    last: boolean;
    onChange: (patch: Partial<AutomationAction>) => void;
    onMove: (direction: -1 | 1) => void;
    onRemove: () => void;
  } = $props();

  const sounds = soundEffects.sounds;
  const profiles = avatarProfiles.profiles;

  const ICONS = {
    sound: Volume2Icon,
    osc: RadioIcon,
    setParameter: SlidersHorizontalIcon,
    loadProfile: BookUserIcon,
    moduleInput: BlocksIcon,
    setVariable: VariableIcon,
    changeVariable: CalculatorIcon,
    toy: VibrateIcon,
  };

  const OSC_TYPES: (SoundOscType | "String")[] = ["Bool", "Int", "Float", "String"];
  const MAPPED_NOTE = "Sends the mapped value from the range above.";
  const VALUE_FIELD = "h-8 font-mono text-xs";

  const Icon = $derived(ICONS[action.type]);
  const problem = $derived(actionProblem(action, mode));

  function setSounds(ids: string[]) {
    const names = ids.map((id) => $sounds.find((s) => s.id === id)?.name ?? "");
    onChange({ soundIds: ids, soundNames: names } as Partial<AutomationAction>);
  }

  function soundLabel(ids: string[], savedNames: string[]) {
    const names = ids.map(
      (id, index) => $sounds.find((s) => s.id === id)?.name ?? savedNames[index] ?? "Missing sound",
    );
    return names.length ? names.join(", ") : "Pick sounds";
  }

  function profileLabel(id: string) {
    if (!id) return "Pick a profile";
    const profile = $profiles.find((p) => p.id === id);
    return profile ? `${profile.name} (${profile.avatarName})` : "Not available any more";
  }
</script>

<Card.Root class="gap-2 p-2">
  <div class="flex items-center gap-2">
    <Icon class="size-4 shrink-0 text-muted-foreground" />
    <span class="min-w-0 flex-1 truncate text-xs font-medium">{ACTION_LABELS[action.type]}</span>
    <Button
      variant="ghost"
      size="icon"
      class="size-7"
      aria-label="Move up"
      title="Move up"
      disabled={first}
      onclick={() => onMove(-1)}
    >
      <ArrowUpIcon class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-7"
      aria-label="Move down"
      title="Move down"
      disabled={last}
      onclick={() => onMove(1)}
    >
      <ArrowDownIcon class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-7 text-destructive hover:text-destructive"
      aria-label="Remove action"
      title="Remove action"
      onclick={onRemove}
    >
      <Trash2Icon class="size-4" />
    </Button>
  </div>

  {#if problem}
    <p class="flex items-start gap-1.5 text-xs text-amber-400">
      <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      {problem}
    </p>
  {/if}

  {#if action.type === "sound"}
    <div class="flex flex-col gap-2">
      <div class="flex flex-col gap-1">
        <Label class="text-xs">Sounds</Label>
        <Select.Root
          type="multiple"
          value={action.soundIds}
          onValueChange={(v) => setSounds(v ?? [])}
        >
          <Select.Trigger class="h-8 w-full max-w-sm text-xs">
            <span class="truncate">{soundLabel(action.soundIds, action.soundNames)}</span>
          </Select.Trigger>
          <Select.Content>
            {#each $sounds as sound (sound.id)}
              <Select.Item value={sound.id}>{sound.name}</Select.Item>
            {/each}
            {#if $sounds.length === 0}
              <p class="p-2 text-xs text-muted-foreground">
                Add sounds to the library first.
              </p>
            {/if}
          </Select.Content>
        </Select.Root>
      </div>

      {#if $sounds.length === 0}
        <p class="text-xs text-muted-foreground">
          Your library is empty. Add files on the
          <RouteLink to="/sound-effects" class="underline underline-offset-2">
            Sound Effects
          </RouteLink>
          page.
        </p>
      {:else if action.soundIds.length > 1}
        <p class="text-xs text-muted-foreground">Plays one of these at random.</p>
      {/if}

      {#if mode === "while"}
        <div class="flex flex-wrap gap-4">
          <label class="flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={action.loop}
              onCheckedChange={(v) => onChange({ loop: !!v })}
            />
            <span class="text-xs">Loop while it matches</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={action.loop || action.stopOnEnd}
              disabled={action.loop}
              onCheckedChange={(v) => onChange({ stopOnEnd: !!v })}
            />
            <span class="text-xs" class:opacity-50={action.loop}>
              Stop right away when it stops matching
            </span>
          </label>
        </div>
      {/if}
    </div>
  {:else if action.type === "osc"}
    <div class="flex flex-col gap-2">
      <AddressField
        label="OSC address"
        placeholder="/avatar/parameters/MyParam"
        value={action.address}
        onChange={(address) => onChange({ address })}
      />
      <div class="flex flex-wrap items-start gap-2">
        <div class="flex flex-col gap-1">
          <Label class="text-xs">Type</Label>
          <Select.Root
            type="single"
            value={action.oscType}
            onValueChange={(v) => {
              if (v) onChange({ oscType: v as SoundOscType | "String" });
            }}
          >
            <Select.Trigger class="h-8 w-24 text-xs">{action.oscType}</Select.Trigger>
            <Select.Content>
              {#each OSC_TYPES as type (type)}
                <Select.Item value={type}>{type}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        {#if mode === "live"}
          <p class="self-end pb-2 text-xs text-muted-foreground">{MAPPED_NOTE}</p>
        {:else}
          <div class="flex min-w-48 flex-1 flex-col gap-1">
            <Label class="text-xs">Value</Label>
            <ValuePicker
              ariaLabel="Value"
              inputClass={VALUE_FIELD}
              placeholder="1, or a placeholder"
              value={action.value}
              onChange={(value) => onChange({ value })}
            />
          </div>
        {/if}
      </div>
    </div>
  {:else if action.type === "setParameter"}
    <div class="flex flex-col gap-2">
      <AddressField
        label="Avatar parameter"
        value={action.address}
        onChange={(address) => onChange({ address })}
      />
      {#if mode === "live"}
        <p class="text-xs text-muted-foreground">{MAPPED_NOTE}</p>
      {:else}
        <div class="flex flex-col gap-1">
          <Label class="text-xs">Value</Label>
          <ValuePicker
            ariaLabel="Value"
            inputClass={VALUE_FIELD}
            placeholder="1, or a placeholder"
            value={action.value}
            onChange={(value) => onChange({ value })}
          />
        </div>
      {/if}
    </div>
  {:else if action.type === "loadProfile"}
    <div class="flex flex-col gap-1">
      <Label class="text-xs">Profile</Label>
      <Select.Root
        type="single"
        value={action.profileId}
        onValueChange={(v) => {
          if (v) onChange({ profileId: v });
        }}
      >
        <Select.Trigger class="h-8 w-full max-w-sm text-xs">
          <span class="truncate">{profileLabel(action.profileId)}</span>
        </Select.Trigger>
        <Select.Content>
          {#each $profiles as profile (profile.id)}
            <Select.Item value={profile.id}>
              {profile.name} ({profile.avatarName})
            </Select.Item>
          {/each}
          {#if $profiles.length === 0}
            <p class="p-2 text-xs text-muted-foreground">No profiles saved yet.</p>
          {/if}
        </Select.Content>
      </Select.Root>
    </div>
  {:else if action.type === "moduleInput"}
    <ModuleInputEditor {action} {onChange} />
  {:else if action.type === "setVariable"}
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-start gap-2">
        <div class="flex w-40 flex-col gap-1">
          <Label class="text-xs">Name</Label>
          <Input
            class="h-8 font-mono text-xs"
            placeholder="myVariable"
            aria-label="Variable name"
            value={action.name}
            oninput={(e) => onChange({ name: (e.target as HTMLInputElement).value })}
          />
        </div>
        {#if mode === "live"}
          <p class="self-end pb-2 text-xs text-muted-foreground">
            Stores the mapped value from the range above.
          </p>
        {:else}
          <div class="flex min-w-48 flex-1 flex-col gap-1">
            <Label class="text-xs">Value</Label>
            <ValuePicker
              ariaLabel="Value"
              inputClass={VALUE_FIELD}
              placeholder="Text, a number, or a placeholder"
              value={action.value}
              onChange={(value) => onChange({ value })}
            />
          </div>
        {/if}
      </div>
      {#if action.name}
        <p class="text-xs text-muted-foreground">
          Read it anywhere with <span class="font-mono">{`{{Var;${action.name}}}`}</span>.
        </p>
      {/if}
      {#if mode !== "live"}
        <p class="text-xs text-muted-foreground">
          <span class="font-mono">$value</span> is the variable's current value, so
          <span class="font-mono">{"{{Expr;$value * 2}}"}</span> doubles it.
        </p>
      {/if}
    </div>
  {:else if action.type === "changeVariable"}
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-start gap-2">
        <div class="flex w-40 flex-col gap-1">
          <Label class="text-xs">Name</Label>
          <Input
            class="h-8 font-mono text-xs"
            placeholder="myVariable"
            aria-label="Variable name"
            value={action.name}
            oninput={(e) => onChange({ name: (e.target as HTMLInputElement).value })}
          />
        </div>
        <div class="flex flex-col gap-1">
          <Label class="text-xs">Change</Label>
          <Select.Root
            type="single"
            value={action.op}
            onValueChange={(v) => {
              if (v) onChange({ op: v as VariableOp });
            }}
          >
            <Select.Trigger class="h-8 w-52 text-xs">{VARIABLE_OP_LABELS[action.op]}</Select.Trigger>
            <Select.Content>
              {#each VARIABLE_OPS as op (op)}
                <Select.Item value={op}>{VARIABLE_OP_LABELS[op]}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="flex min-w-32 flex-1 flex-col gap-1">
          <Label class="text-xs">{action.op === "append" ? "Text" : "Number"}</Label>
          <ValuePicker
            ariaLabel={action.op === "append" ? "Text" : "Number"}
            inputClass={VALUE_FIELD}
            placeholder={action.op === "append" ? "Text, or a placeholder" : "1, or a placeholder"}
            value={action.value}
            onChange={(value) => onChange({ value })}
          />
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        {#if action.op === "append"}
          Adds the text to whatever the variable holds now.
        {:else}
          A variable that isn't set yet counts as 0. If it holds text, nothing changes.
        {/if}
      </p>
    </div>
  {:else if action.type === "toy"}
    <ToyActionEditor {action} {mode} {onChange} />
  {/if}
</Card.Root>
