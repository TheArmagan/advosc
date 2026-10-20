<script lang="ts">
  import { avatarOSC, type AvatarParameterType } from "$lib/api/vrc-osc";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import {
    CopyIcon,
    EllipsisVerticalIcon,
    EqualIcon,
    FastForwardIcon,
    LockIcon,
    LockOpenIcon,
    RotateCcwIcon,
    SendIcon,
    SquareIcon,
    StarIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import TypeBadge from "./type-badge.svelte";
  import ValueControl from "./value-control.svelte";
  import { formatValue, valuePercent, type ParameterListItem } from "./parameter-search";

  let {
    item,
    sendType,
    typeOverridden,
    typeGuessed,
    locked,
    animating,
    linkCount,
    favorite,
    flash,
    onanimate,
    onlink,
    onopensend,
    onsendtype,
  }: {
    item: ParameterListItem;
    sendType: AvatarParameterType;
    typeOverridden: boolean;
    typeGuessed: boolean;
    locked: boolean;
    animating: boolean;
    linkCount: number;
    favorite: boolean;
    flash: boolean;
    onanimate: () => void;
    onlink: () => void;
    onopensend: () => void;
    onsendtype: (type: AvatarParameterType | null) => void;
  } = $props();

  function send(value: number) {
    if (locked) avatarOSC.lockParameter(item.address, value, sendType);
    else avatarOSC.sendParameter(item.address, value, sendType);
  }

  function toggleLock() {
    if (locked) {
      avatarOSC.unlockParameter(item.address);
    } else {
      avatarOSC.lockParameter(item.address, item.value ?? 0, sendType);
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  }
</script>

<div
  class="group flex items-center gap-3 rounded-md border px-2 py-1.5 transition-colors duration-500
    {locked ? 'border-red-500/60' : animating ? 'border-green-500/60' : linkCount ? 'border-orange-500/50' : ''}
    {flash ? 'bg-primary/5 duration-75' : 'bg-muted/30'}"
>
  <button
    type="button"
    class="shrink-0 text-muted-foreground transition-opacity hover:text-yellow-500 {favorite
      ? 'text-yellow-500'
      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
    onclick={() => avatarOSC.toggleFavorite(item.address)}
    aria-label={favorite ? "Unpin" : "Pin to top"}
    title={favorite ? "Unpin" : "Pin to top"}
  >
    <StarIcon class="size-4" fill={favorite ? "currentColor" : "none"} />
  </button>

  <TypeBadge type={sendType} guessed={typeGuessed} class={typeOverridden ? "underline" : ""} />

  <div class="flex min-w-0 flex-1 flex-col gap-1">
    <div class="flex min-w-0 items-center gap-2">
      <span class="truncate text-sm font-medium" title={item.address}>{item.name}</span>
      {#if item.name !== item.short}
        <span class="truncate font-mono text-[10px] text-muted-foreground">{item.short}</span>
      {/if}
      {#if !item.writable}
        <span class="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="The schema has no input for this one, so VRChat may ignore what you send">read only</span>
      {/if}
      {#if linkCount}
        <span class="shrink-0 rounded bg-orange-500/15 px-1 text-[10px] text-orange-600 dark:text-orange-400">
          linked to {linkCount}
        </span>
      {/if}
      {#if animating}
        <span class="shrink-0 rounded bg-green-500/15 px-1 text-[10px] text-green-600 dark:text-green-400">animating</span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <div class="h-1 w-24 overflow-hidden rounded-full bg-primary/15">
        <div
          class="h-full bg-primary transition-[width] duration-75"
          style="width: {valuePercent(item.value, sendType)}%"
        ></div>
      </div>
      <span class="font-mono text-[11px] text-muted-foreground">
        {formatValue(item.value, sendType)}
      </span>
    </div>
  </div>

  <ValueControl type={sendType} value={item.value} onsend={send} />

  <div class="flex shrink-0 items-center gap-0.5">
    <Button
      variant="ghost"
      size="icon-sm"
      class={locked ? "text-red-500 hover:text-red-500" : "text-muted-foreground"}
      onclick={toggleLock}
      title={locked ? "Unlock" : "Lock at the current value"}
      aria-label={locked ? "Unlock" : "Lock"}
    >
      {#if locked}<LockIcon />{:else}<LockOpenIcon />{/if}
    </Button>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label="More">
            <EllipsisVerticalIcon />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-52">
        <DropdownMenu.Group>
          {#if animating}
            <DropdownMenu.Item onclick={() => avatarOSC.stopAnimation(item.address)}>
              <SquareIcon /> Stop animation
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item onclick={onanimate}>
            <FastForwardIcon /> Animate...
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={onlink}>
            <EqualIcon /> Link...
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={onopensend}>
            <SendIcon /> Open in Send tab
          </DropdownMenu.Item>
          <DropdownMenu.Item onclick={() => send(0)}>
            <RotateCcwIcon /> Set to 0
          </DropdownMenu.Item>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>Send as {sendType}</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.RadioGroup
              value={typeOverridden ? sendType : "auto"}
              onValueChange={(v) => onsendtype(v === "auto" ? null : (v as AvatarParameterType))}
            >
              <DropdownMenu.RadioItem value="auto">
                Auto ({item.type ?? "guess"})
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="Float">Float</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="Int">Int</DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="Bool">Bool</DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => copy(item.address, "Address")}>
          <CopyIcon /> Copy address
        </DropdownMenu.Item>
        {#if item.name !== item.short}
          <DropdownMenu.Item onclick={() => copy(item.name, "Name")}>
            <CopyIcon /> Copy name
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
