<script lang="ts">
  import { Label } from "$lib/components/ui/label/index.js";
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  let {
    label,
    hint,
    class: className,
    for: forId,
    children,
  }: {
    label?: string;
    hint?: string;
    class?: string;
    for?: string;
    children: Snippet;
  } = $props();
</script>

<div class={cn("flex min-w-0 flex-col gap-1", className)}>
  {#if label}
    <Label for={forId} class="text-xs font-normal text-muted-foreground">{label}</Label>
  {/if}
  {@render children()}
  {#if hint}
    <p class="text-[11px] leading-snug text-muted-foreground">{hint}</p>
  {/if}
</div>
