<script lang="ts">
  import { cn } from "$lib/utils";
  import { type Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { router } from "$lib/router";

  const {
    class: className = "",
    activeClass = "",
    to,
    children,
    ...restProps
  }: Omit<HTMLAnchorAttributes, "class" | "href"> & {
    to: string;
    class?: string;
    activeClass?: string;
    children: Snippet;
  } = $props();

  const isActive = $derived($router.currentPage.path === to.split("?")[0]);
</script>

<a
  {...restProps}
  href="#{to}"
  data-active={isActive}
  aria-current={isActive ? "page" : undefined}
  class={cn(className, isActive ? activeClass : undefined)}
  style="-webkit-app-region: no-drag;"
>
  {@render children()}
</a>
