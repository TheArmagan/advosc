<script lang="ts">
  import type { OSCSendType } from "$lib/api/vrc-osc";

  let {
    type,
    guessed = false,
    class: className = "",
  }: { type: OSCSendType | null; guessed?: boolean; class?: string } = $props();

  const colors: Record<string, string> = {
    Bool: "border-sky-500/40 text-sky-600 dark:text-sky-400",
    Int: "border-amber-500/40 text-amber-600 dark:text-amber-400",
    Float: "border-violet-500/40 text-violet-600 dark:text-violet-400",
    String: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  };
</script>

<span
  class="inline-flex h-5 w-11 shrink-0 items-center justify-center rounded border font-mono text-[10px] {colors[
    type ?? ''
  ] ?? 'text-muted-foreground'} {guessed ? 'border-dashed' : ''} {className}"
  title={guessed ? "Type is a guess, VRChat hasn't confirmed it yet" : undefined}
>
  {type ?? "?"}
</span>
