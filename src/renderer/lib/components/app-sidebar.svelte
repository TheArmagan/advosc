<script lang="ts">
  import { localData } from "$lib/api/local-data";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import RouteLink from "$lib/components/route-link.svelte";
  import UpdateStatus from "$lib/components/update-status.svelte";
  import {
    NAV_GROUP_LABELS,
    getNavItems,
    getNavTitle,
    type NavItem,
  } from "$lib/nav";
  import { cn } from "$lib/utils";
  import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "@lucide/svelte";

  const COLLAPSED_KEY = "Sidebar;Collapsed";

  let collapsed = $state<boolean>(localData.get(COLLAPSED_KEY, false));

  function toggleCollapsed() {
    collapsed = !collapsed;
    localData.set(COLLAPSED_KEY, collapsed);
  }

  const toggleLabel = $derived(
    collapsed ? "Expand sidebar" : "Collapse sidebar",
  );
</script>

{#snippet navLink(item: NavItem)}
  <Tooltip.Root disabled={!collapsed}>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <RouteLink
          {...props}
          to={item.path}
          aria-label={getNavTitle(item)}
          class="flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground data-[active=true]:bg-white/10 data-[active=true]:text-foreground"
        >
          <item.icon class="size-4 shrink-0" />
          {#if !collapsed}
            <span class="truncate">{item.label}</span>
          {/if}
        </RouteLink>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="right" sideOffset={8}>
      {getNavTitle(item)}
    </Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={200} disableHoverableContent>
  <aside
    class={cn(
      "flex shrink-0 flex-col border-r bg-black/95 transition-[width] duration-150",
      collapsed ? "w-12" : "w-[200px]",
    )}
  >
    <nav class="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div class="flex flex-col gap-0.5 p-2">
        {#each getNavItems("main") as item (item.path)}
          {@render navLink(item)}
        {/each}
      </div>

      <div class="flex flex-col gap-0.5 p-2 pt-0">
        {#if collapsed}
          <div class="mb-2 border-t"></div>
        {:else}
          <div
            class="px-2 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {NAV_GROUP_LABELS.avatar}
          </div>
        {/if}
        {#each getNavItems("avatar") as item (item.path)}
          {@render navLink(item)}
        {/each}
      </div>

      <div class="mt-auto flex flex-col gap-0.5 p-2 pt-0">
        {#each getNavItems("bottom") as item (item.path)}
          {@render navLink(item)}
        {/each}
      </div>
    </nav>

    <div
      class={cn(
        "flex shrink-0 items-center border-t p-2",
        collapsed ? "flex-col gap-1" : "justify-between pl-3",
      )}
    >
      <UpdateStatus {collapsed} />
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              aria-label={toggleLabel}
              onclick={toggleCollapsed}
            >
              {#if collapsed}
                <PanelLeftOpenIcon />
              {:else}
                <PanelLeftCloseIcon />
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right" sideOffset={8}>
          {toggleLabel}
        </Tooltip.Content>
      </Tooltip.Root>
    </div>
  </aside>
</Tooltip.Provider>
