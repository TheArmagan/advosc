<script lang="ts">
  import { avatarOSC, type AvatarParameterType } from "$lib/api/vrc-osc";
  import { localData } from "$lib/api/local-data";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    ArrowUpDownIcon,
    FilterIcon,
    LockOpenIcon,
    SearchIcon,
    SquareIcon,
    XIcon,
  } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import ParameterRow from "$lib/components/avatar-osc/parameter-row.svelte";
  import AnimateDrawer from "$lib/components/avatar-osc/animate-drawer.svelte";
  import LinkDrawer from "$lib/components/avatar-osc/link-drawer.svelte";
  import SendPanel from "$lib/components/avatar-osc/send-panel.svelte";
  import SchemaPanel from "$lib/components/avatar-osc/schema-panel.svelte";
  import VirtualList from "$lib/components/virtual-list.svelte";
  import {
    buildParameterList,
    scoreParameter,
    sortParameters,
    type ParameterListItem,
    type ParameterSort,
  } from "$lib/components/avatar-osc/parameter-search";

  const schema = avatarOSC.schema;
  const schemaIndex = avatarOSC.schemaIndex;
  const parameters = avatarOSC.parameters;
  const changedAt = avatarOSC.changedAt;
  const lockedParameterAddresses = avatarOSC.lockedParameterAddresses;
  const links = avatarOSC.links;
  const favorites = avatarOSC.favorites;
  const animations = avatarOSC.animations;

  type TypeFilter = "All" | AvatarParameterType;
  type ViewSettings = {
    sort: ParameterSort;
    typeFilter: TypeFilter;
    hideBuiltins: boolean;
    onlySchema: boolean;
    onlyActive: boolean;
  };

  const SORT_LABELS: Record<ParameterSort, string> = {
    name: "Name",
    address: "Address",
    recent: "Recently changed",
    type: "Type",
  };
  const FLASH_MS = 500;

  type ListRow = { kind: "header"; label: string } | { kind: "item"; item: ParameterListItem };

  // ParameterRow is h-14 (56px), and the rest of the slot is the gap between rows.
  const ROW_HEIGHT = 60;
  const HEADER_HEIGHT = 28;
  const rowHeight = (row: ListRow) => (row.kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT);
  const rowKey = (row: ListRow) => (row.kind === "header" ? `\0${row.label}` : row.item.address);

  let view = $state<ViewSettings>({
    sort: "name",
    typeFilter: "All",
    hideBuiltins: false,
    onlySchema: false,
    onlyActive: false,
    ...localData.get("AvatarOSC;View", {}),
  });
  $effect(() => localData.set("AvatarOSC;View", $state.snapshot(view)));

  let typeOverrides = $state<Record<string, AvatarParameterType>>(localData.get("AvatarOSC;TypeOverrides", {}));
  $effect(() => localData.set("AvatarOSC;TypeOverrides", $state.snapshot(typeOverrides)));

  let tab = $state("parameters");
  let query = $state("");
  let searchInput = $state<HTMLInputElement | null>(null);
  let now = $state(Date.now());

  let animateOpen = $state(false);
  let animateAddress = $state("");
  let linkOpen = $state(false);
  let linkAddress = $state("");
  let sendAddress = $state("");

  function effectiveType(item: ParameterListItem, v = item.value): AvatarParameterType {
    if (typeOverrides[item.address]) return typeOverrides[item.address];
    if (item.type) return item.type;
    if (v === undefined || v % 1 !== 0) return "Float";
    return v === 0 || v === 1 ? "Bool" : "Int";
  }

  // Values arrive about 30 times a second, but the list only changes shape when an address
  // appears or goes away. Rebuilding and re-sorting a couple of thousand rows on every update
  // is what made big avatars lag, so the rows read their live value on their own instead.
  const addressKey = $derived(Object.keys($parameters).join("\n"));
  const allItems = $derived.by(() => {
    addressKey;
    return buildParameterList(untrack(() => $parameters), $schemaIndex, avatarOSC.getParameterType);
  });

  // "Recently changed" would re-sort on every update too, so it only re-sorts once a second.
  let sortTick = $state(0);
  const sortChangedAt = $derived.by<Record<string, number>>(() => {
    if (view.sort !== "recent") return {};
    sortTick;
    return untrack(() => $changedAt);
  });
  $effect(() => {
    if (view.sort !== "recent") return;
    const timer = setInterval(() => sortTick++, 1000);
    return () => clearInterval(timer);
  });
  const lockedSet = $derived(new Set($lockedParameterAddresses));
  const favoriteSet = $derived(new Set($favorites));

  const isActive = (address: string) => lockedSet.has(address) || !!$animations[address] || !!$links[address]?.length;

  const visible = $derived.by(() => {
    let items = allItems.filter((item) => {
      if (view.typeFilter !== "All" && effectiveType(item) !== view.typeFilter) return false;
      if (view.hideBuiltins && item.builtin) return false;
      if (view.onlySchema && !item.inSchema) return false;
      if (view.onlyActive && !isActive(item.address)) return false;
      return true;
    });

    if (query.trim()) {
      items = items
        .map((item) => ({ item, score: scoreParameter(item, query) }))
        .filter((r) => r.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.item);
    } else {
      items = sortParameters(items, view.sort, sortChangedAt);
    }

    const pinned = items.filter((i) => favoriteSet.has(i.address));
    const rest = items.filter((i) => !favoriteSet.has(i.address));
    return { pinned, rest, total: items.length };
  });

  const listRows = $derived.by<ListRow[]>(() => {
    const { pinned, rest } = visible;
    const toRows = (items: ParameterListItem[]) => items.map((item): ListRow => ({ kind: "item", item }));
    if (!pinned.length) return toRows(rest);
    return [
      { kind: "header", label: "Pinned" },
      ...toRows(pinned),
      ...(rest.length ? [{ kind: "header", label: "Everything else" } as const, ...toRows(rest)] : []),
    ];
  });

  const filtersActive = $derived(
    view.typeFilter !== "All" || view.hideBuiltins || view.onlySchema || view.onlyActive,
  );
  const animationCount = $derived(Object.keys($animations).length);
  const linkCount = $derived(Object.keys($links).length);

  function clearFilters() {
    view.typeFilter = "All";
    view.hideBuiltins = false;
    view.onlySchema = false;
    view.onlyActive = false;
    query = "";
  }

  onMount(() => {
    // The ticker only drives the "just changed" highlight.
    const ticker = setInterval(() => (now = Date.now()), 150);

    const onKeydown = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey && e.key.toLowerCase() === "f") || (e.key === "/" && !typing)) {
        e.preventDefault();
        tab = "parameters";
        queueMicrotask(() => searchInput?.focus());
      }
    };
    window.addEventListener("keydown", onKeydown);

    return () => {
      clearInterval(ticker);
      window.removeEventListener("keydown", onKeydown);
    };
  });
</script>

{#snippet parameterRow(item: ParameterListItem)}
  <ParameterRow
    {item}
    value={$parameters[item.address]}
    sendType={effectiveType(item, $parameters[item.address])}
    typeOverridden={!!typeOverrides[item.address]}
    typeGuessed={!typeOverrides[item.address] && !item.type}
    locked={lockedSet.has(item.address)}
    animating={!!$animations[item.address]}
    linkCount={$links[item.address]?.length ?? 0}
    favorite={favoriteSet.has(item.address)}
    flash={now - ($changedAt[item.address] ?? 0) < FLASH_MS}
    onanimate={() => {
      animateAddress = item.address;
      animateOpen = true;
    }}
    onlink={() => {
      linkAddress = item.address;
      linkOpen = true;
    }}
    onopensend={() => {
      sendAddress = item.address;
      tab = "send";
    }}
    onsendtype={(type) => {
      if (type) typeOverrides[item.address] = type;
      else delete typeOverrides[item.address];
    }}
  />
{/snippet}

<div class="w-full p-4">
  <Tabs.Root bind:value={tab}>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Tabs.List>
        <Tabs.Trigger value="parameters">Parameters</Tabs.Trigger>
        <Tabs.Trigger value="send">Send</Tabs.Trigger>
        <Tabs.Trigger value="schema">Schema</Tabs.Trigger>
      </Tabs.List>

      <div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {#if $schema}
          <span class="truncate font-medium text-foreground">{$schema.name}</span>
          <span class="hidden truncate font-mono md:inline">{$schema.id}</span>
        {:else}
          <span>Waiting for an avatar change from VRChat</span>
        {/if}
      </div>
    </div>

    <Tabs.Content value="parameters" class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <InputGroup.Root class="min-w-56 flex-1">
          <InputGroup.Addon><SearchIcon /></InputGroup.Addon>
          <InputGroup.Input
            bind:ref={searchInput}
            placeholder="Search by name or address (Ctrl+F)"
            bind:value={query}
            onkeydown={(e) => e.key === "Escape" && (query = "")}
          />
          {#if query}
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button size="icon-xs" onclick={() => (query = "")} aria-label="Clear search">
                <XIcon />
              </InputGroup.Button>
            </InputGroup.Addon>
          {/if}
        </InputGroup.Root>

        <div class="inline-flex rounded-md border p-0.5">
          {#each ["All", "Bool", "Int", "Float"] as const as t (t)}
            <Button
              size="sm"
              variant={view.typeFilter === t ? "secondary" : "ghost"}
              class="h-7 px-2.5"
              onclick={() => (view.typeFilter = t)}
            >
              {t}
            </Button>
          {/each}
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant={view.hideBuiltins || view.onlySchema || view.onlyActive ? "secondary" : "outline"} size="sm">
                <FilterIcon /> Show
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-56">
            <DropdownMenu.CheckboxItem bind:checked={view.hideBuiltins}>
              Hide VRChat built-ins
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem bind:checked={view.onlySchema}>
              Only parameters in the schema
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem bind:checked={view.onlyActive}>
              Only locked, linked or animating
            </DropdownMenu.CheckboxItem>
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="outline" size="sm" disabled={!!query.trim()} title={query.trim() ? "Search results are sorted by best match" : undefined}>
                <ArrowUpDownIcon /> {SORT_LABELS[view.sort]}
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.RadioGroup bind:value={view.sort}>
              {#each Object.entries(SORT_LABELS) as [value, label] (value)}
                <DropdownMenu.RadioItem {value}>{label}</DropdownMenu.RadioItem>
              {/each}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <div class="flex min-h-7 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {#if visible.total === allItems.length}
            {allItems.length} parameters
          {:else}
            {visible.total} of {allItems.length} parameters
          {/if}
        </span>
        {#if filtersActive || query}
          <Button variant="link" size="sm" class="h-auto p-0 text-xs" onclick={clearFilters}>Clear filters</Button>
        {/if}
        <div class="ml-auto flex items-center gap-2">
          {#if $lockedParameterAddresses.length}
            <Button
              variant="outline"
              size="sm"
              class="h-7 border-red-500/40 text-xs"
              onclick={() => {
                avatarOSC.unlockAll();
                toast.success("Unlocked everything");
              }}
            >
              <LockOpenIcon /> Unlock {$lockedParameterAddresses.length}
            </Button>
          {/if}
          {#if animationCount}
            <Button
              variant="outline"
              size="sm"
              class="h-7 border-green-500/40 text-xs"
              onclick={() => {
                avatarOSC.stopAllAnimations();
                toast.success("Stopped all animations");
              }}
            >
              <SquareIcon /> Stop {animationCount} animation{animationCount === 1 ? "" : "s"}
            </Button>
          {/if}
          {#if linkCount}
            <span class="text-orange-600 dark:text-orange-400">{linkCount} linked</span>
          {/if}
        </div>
      </div>

      {#if visible.total}
        <VirtualList items={listRows} height={rowHeight} key={rowKey}>
          {#snippet row(entry)}
            {#if entry.kind === "header"}
              <div class="flex h-full items-end px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </div>
            {:else}
              {@render parameterRow(entry.item)}
            {/if}
          {/snippet}
        </VirtualList>
      {:else if allItems.length}
        <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing matches.
          <Button variant="link" size="sm" class="h-auto p-0" onclick={clearFilters}>Clear filters</Button>
        </div>
      {:else}
        <div class="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No parameters yet. Make sure OSC is on in VRChat, then switch avatars or move a parameter.
          You can still send to any address from the Send tab.
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="send">
      <SendPanel bind:address={sendAddress} />
    </Tabs.Content>

    <Tabs.Content value="schema">
      <SchemaPanel />
    </Tabs.Content>
  </Tabs.Root>
</div>

<AnimateDrawer bind:open={animateOpen} address={animateAddress} />
<LinkDrawer bind:open={linkOpen} address={linkAddress} />
