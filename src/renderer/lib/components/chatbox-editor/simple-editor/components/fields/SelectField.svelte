<script lang="ts">
  import * as Select from "$lib/components/ui/select/index.js";
  import Field from "./Field.svelte";

  let {
    label,
    hint,
    value,
    options,
    onChange,
    class: className,
    placeholder = "Pick one",
  }: {
    label?: string;
    hint?: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
    class?: string;
    placeholder?: string;
  } = $props();

  const current = $derived(options.find((item) => item.value === value));
</script>

<Field {label} {hint} class={className}>
  <Select.Root type="single" {value} onValueChange={(v) => onChange(v ?? "")}>
    <Select.Trigger class="w-full">
      <span class="truncate">{current?.label ?? (value || placeholder)}</span>
    </Select.Trigger>
    <Select.Content>
      {#each options as item (item.value)}
        <Select.Item value={item.value}>{item.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</Field>
