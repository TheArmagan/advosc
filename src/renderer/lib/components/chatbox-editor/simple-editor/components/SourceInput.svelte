<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { genericSourceHint } from "../options";

  let {
    label,
    value,
    placeholder = "42, /avatar/parameters/HP, [[MediaInfo:Duration]], {{Shortcut;Time}}",
    widthClass = "w-full",
    onChange,
    showHint = false,
  }: {
    label: string;
    value: string;
    placeholder?: string;
    widthClass?: string;
    onChange: (value: string) => void;
    showHint?: boolean;
  } = $props();
</script>

<div class={`flex flex-col gap-0.5 ${widthClass}`}>
  <Label class="text-xs text-muted-foreground">{label}</Label>
  <Input
    {value}
    {placeholder}
    oninput={(e) => onChange((e.target as HTMLInputElement).value)}
  />
  {#if showHint}
    <p class="text-[10px] text-muted-foreground leading-tight">
      {genericSourceHint}
    </p>
  {/if}
</div>
