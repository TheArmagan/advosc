<script lang="ts">
  import { avatarOSC, type OSCSendType } from "$lib/api/vrc-osc";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { HistoryIcon, LockIcon, RotateCcwIcon, SendIcon, TrashIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import ParameterPicker from "./parameter-picker.svelte";
  import TypeBadge from "./type-badge.svelte";
  import { formatValue, normalizeAddress, shortAddress } from "./parameter-search";

  let { address = $bindable("") }: { address?: string } = $props();

  const parameters = avatarOSC.parameters;
  const schemaIndex = avatarOSC.schemaIndex;
  const history = avatarOSC.history;

  type TypeChoice = "Auto" | OSCSendType;
  const TYPE_CHOICES: TypeChoice[] = ["Auto", "Float", "Int", "Bool", "String"];

  let typeChoice = $state<TypeChoice>("Auto");
  let numberValue = $state("0");
  let boolValue = $state(false);
  let stringValue = $state("");

  const target = $derived(normalizeAddress(address));
  const knownType = $derived(target ? ($schemaIndex[target]?.type ?? avatarOSC.getParameterType(target)) : null);
  const current = $derived(target ? $parameters[target] : undefined);
  const isAvatarParameter = $derived(target.startsWith("/avatar/parameters/"));

  const resolvedType = $derived.by<OSCSendType>(() => {
    if (typeChoice !== "Auto") return typeChoice;
    if (knownType) return knownType;
    const n = Number(numberValue);
    return Number.isInteger(n) ? "Int" : "Float";
  });

  const numberValid = $derived(numberValue.trim() !== "" && Number.isFinite(Number(numberValue)));
  const canSend = $derived(
    !!target && (resolvedType === "String" || resolvedType === "Bool" || numberValid),
  );

  const outgoingValue = $derived.by<number | string | boolean>(() => {
    switch (resolvedType) {
      case "String": return stringValue;
      case "Bool": return boolValue;
      case "Int": return Math.round(Number(numberValue) || 0);
      default: return Number(numberValue) || 0;
    }
  });

  // What actually goes on the wire, so there's no doubt about the type.
  const wirePreview = $derived.by(() => {
    switch (resolvedType) {
      case "String": return `,s "${stringValue}"`;
      case "Bool": return boolValue ? ",T (true)" : ",F (false)";
      case "Int": return `,i ${outgoingValue}`;
      default: return `,f ${outgoingValue}`;
    }
  });

  function useCurrent() {
    if (current === undefined) return;
    numberValue = String(Number(current.toFixed(4)));
    boolValue = !!current;
  }

  // Picking a parameter loads its live value so you start from what it is now.
  function onpick() {
    typeChoice = "Auto";
    useCurrent();
  }

  function send(lock = false) {
    if (!canSend) return;
    avatarOSC.sendRaw(target, outgoingValue, resolvedType);
    if (lock && resolvedType !== "String") {
      avatarOSC.lockParameter(target, Number(outgoingValue === true ? 1 : outgoingValue) || 0, resolvedType);
      toast.success("Sent and locked");
    } else {
      toast.success("Sent");
    }
  }
</script>

<div class="grid gap-3 lg:grid-cols-[1fr_20rem]">
  <Card.Root>
    <Card.Header>
      <Card.Title>Send a value</Card.Title>
      <Card.Description>
        Pick any parameter or type any OSC address, then choose exactly which type to send it as.
      </Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label>Address</Label>
        <ParameterPicker bind:value={address} {onpick} />
        <div class="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
          {#if target}
            {#if target !== address.trim()}
              <span>Sends to <span class="font-mono">{target}</span></span>
            {/if}
            {#if $schemaIndex[target]}
              <span>{$schemaIndex[target].name}</span>
            {/if}
            {#if knownType}
              <span class="flex items-center gap-1">expects <TypeBadge type={knownType} /></span>
            {:else if isAvatarParameter}
              <span>Not in this avatar's schema</span>
            {/if}
            {#if current !== undefined}
              <span>now <span class="font-mono text-foreground">{formatValue(current, knownType)}</span></span>
            {/if}
          {:else}
            <span>A bare name like <span class="font-mono">Hat_On</span> is sent to /avatar/parameters/Hat_On.</span>
          {/if}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <Label>Send as</Label>
        <div class="inline-flex w-fit flex-wrap rounded-md border p-0.5">
          {#each TYPE_CHOICES as choice (choice)}
            <Button
              size="sm"
              variant={typeChoice === choice ? "secondary" : "ghost"}
              class="h-7 px-3"
              onclick={() => (typeChoice = choice)}
            >
              {choice === "Auto" ? `Auto (${resolvedType})` : choice}
            </Button>
          {/each}
        </div>
        {#if knownType && resolvedType !== knownType}
          <p class="text-xs text-amber-600 dark:text-amber-400">
            This parameter is a {knownType}. VRChat may ignore or convert a {resolvedType}.
          </p>
        {/if}
      </div>

      <div class="flex flex-col gap-1.5">
        <Label>Value</Label>
        {#if resolvedType === "Bool"}
          <div class="inline-flex w-fit rounded-md border p-0.5">
            <Button size="sm" variant={!boolValue ? "secondary" : "ghost"} class="h-7 px-4" onclick={() => (boolValue = false)}>False</Button>
            <Button size="sm" variant={boolValue ? "default" : "ghost"} class="h-7 px-4" onclick={() => (boolValue = true)}>True</Button>
          </div>
        {:else if resolvedType === "String"}
          <InputGroup.Root>
            <InputGroup.Input
              placeholder="Text"
              bind:value={stringValue}
              onkeydown={(e) => e.key === "Enter" && send()}
            />
          </InputGroup.Root>
        {:else}
          <div class="flex items-center gap-3">
            <InputGroup.Root class="w-40">
              <InputGroup.Input
                type="number"
                step={resolvedType === "Int" ? 1 : 0.01}
                class="font-mono"
                aria-invalid={!numberValid}
                bind:value={numberValue}
                onkeydown={(e) => e.key === "Enter" && send()}
              />
            </InputGroup.Root>
            {#if resolvedType === "Float"}
              <Slider
                type="single"
                class="max-w-64"
                min={-1}
                max={1}
                step={0.01}
                value={Math.max(-1, Math.min(1, Number(numberValue) || 0))}
                onValueChange={(v) => (numberValue = String(v))}
              />
            {/if}
          </div>
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button disabled={!canSend} onclick={() => send()}>
          <SendIcon /> Send
        </Button>
        {#if isAvatarParameter && resolvedType !== "String"}
          <Button variant="outline" disabled={!canSend} onclick={() => send(true)}>
            <LockIcon /> Send and lock
          </Button>
        {/if}
        <Button variant="ghost" disabled={current === undefined} onclick={useCurrent}>
          <RotateCcwIcon /> Use current value
        </Button>
        {#if target}
          <span class="ml-auto truncate font-mono text-xs text-muted-foreground" title="Exact OSC message">
            {target} {wirePreview}
          </span>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root class="gap-2">
    <Card.Header class="flex flex-row items-center justify-between">
      <Card.Title class="flex items-center gap-2 text-sm"><HistoryIcon class="size-4" /> Recent sends</Card.Title>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!$history.length}
        onclick={() => avatarOSC.clearHistory()}
        aria-label="Clear history"
        title="Clear history"
      >
        <TrashIcon />
      </Button>
    </Card.Header>
    <Card.Content class="flex flex-col gap-1">
      {#each $history as entry (entry.at)}
        <div class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
          <TypeBadge type={entry.type} />
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            title="Load into the form"
            onclick={() => {
              address = entry.address;
              typeChoice = entry.type;
              if (entry.type === "String") stringValue = String(entry.value);
              else if (entry.type === "Bool") boolValue = !!entry.value;
              else numberValue = String(entry.value);
            }}
          >
            <div class="truncate text-xs">{$schemaIndex[entry.address]?.name ?? shortAddress(entry.address)}</div>
            <div class="truncate font-mono text-[10px] text-muted-foreground">{String(entry.value)}</div>
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 opacity-0 group-hover:opacity-100"
            onclick={() => {
              avatarOSC.sendRaw(entry.address, entry.value, entry.type);
              toast.success("Sent again");
            }}
            aria-label="Send again"
            title="Send again"
          >
            <SendIcon class="size-3.5" />
          </Button>
        </div>
      {:else}
        <p class="py-4 text-center text-sm text-muted-foreground">Things you send here show up in this list.</p>
      {/each}
    </Card.Content>
  </Card.Root>
</div>
