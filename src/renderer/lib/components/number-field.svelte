<script lang="ts" module>
  let nextId = 0;
</script>

<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { cn } from "$lib/utils";

  let {
    label,
    value,
    onChange,
    min,
    max,
    step = "any",
    integer = false,
    disabled = false,
    placeholder,
    class: className,
    inputClass = "w-24",
  }: {
    label: string;
    value: number | undefined;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number | "any";
    integer?: boolean;
    disabled?: boolean;
    placeholder?: string;
    class?: string;
    inputClass?: string;
  } = $props();

  const id = `number-field-${nextId++}`;

  // Half-typed text like "-" isn't a number yet, so it stays in the box and nothing is saved.
  // The same goes for being under `min`, since "1" can be on its way to "150".
  function oninput(e: Event) {
    const parsed = integer
      ? parseInt((e.target as HTMLInputElement).value)
      : parseFloat((e.target as HTMLInputElement).value);
    if (Number.isNaN(parsed)) return;
    if (min !== undefined && parsed < min) return;
    onChange(max !== undefined ? Math.min(parsed, max) : parsed);
  }

  /** Leaving the field shows what was really saved, in case that isn't what's in the box. */
  function onblur(e: Event) {
    (e.target as HTMLInputElement).value = String(value ?? "");
  }
</script>

<div class={cn("flex flex-col gap-1", className)}>
  <Label for={id} class="text-xs">{label}</Label>
  <Input
    {id}
    type="number"
    class={cn("h-8 text-xs", inputClass)}
    {min}
    {max}
    {step}
    {disabled}
    {placeholder}
    value={value ?? ""}
    {oninput}
    {onblur}
  />
</div>
