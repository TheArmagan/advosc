<script lang="ts">
  import { cn } from "$lib/utils";
  import { type Snippet } from "svelte";
  import { router } from "$lib/router";

  const {
    class: className = "",
    activeClass = "",
    to,
    children,
  }: {
    to: string;
    class?: string;
    activeClass?: string;
    children: Snippet;
  } = $props();

  const isActive = $derived($router.currentPage.path === to.split("?")[0]);
</script>

<a
  href="#{to}"
  data-active={isActive}
  class={cn(className, isActive ? activeClass : undefined)}
  style="-webkit-app-region: no-drag;"
>
  {@render children()}
</a>
