<script lang="ts" module>
  export type PillTone = "ok" | "muted" | "warn" | "error";
</script>

<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  let {
    tone = "muted",
    title,
    class: className,
    children,
  }: { tone?: PillTone; title?: string; class?: string; children: Snippet } = $props();

  const tones: Record<PillTone, string> = {
    ok: "bg-emerald-500/15 text-emerald-400",
    muted: "bg-muted text-muted-foreground",
    warn: "bg-amber-500/15 text-amber-400",
    error: "bg-destructive/15 text-destructive",
  };
</script>

<span
  {title}
  class={cn(
    "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs",
    tones[tone],
    className,
  )}
>
  {@render children()}
</span>
