<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import Field from "./Field.svelte";

  let nextId = 0;

  let {
    label,
    hint,
    value,
    onChange,
    placeholder,
    class: className,
    inputClass,
    type = "text",
    min,
    max,
    step,
  }: {
    label?: string;
    hint?: string;
    value: string | undefined;
    onChange: (value: string) => void;
    placeholder?: string;
    class?: string;
    inputClass?: string;
    type?: "text" | "number" | "datetime-local";
    min?: number;
    max?: number;
    step?: number;
  } = $props();

  const id = `se-field-${Math.random().toString(36).slice(2)}-${nextId++}`;
</script>

<Field {label} {hint} class={className} for={id}>
  <Input
    {id}
    {type}
    {min}
    {max}
    {step}
    class={inputClass}
    {placeholder}
    value={value ?? ""}
    spellcheck={false}
    oninput={(e) => onChange((e.target as HTMLInputElement).value)}
  />
</Field>
