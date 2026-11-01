<script lang="ts">
  import ParameterPicker from "$lib/components/avatar-osc/parameter-picker.svelte";
  import { normalizeAddress } from "$lib/components/avatar-osc/parameter-search";
  import { Label } from "$lib/components/ui/label/index.js";

  let {
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  } = $props();

  // A bare name is fine while typing, but the rule needs the full address.
  function onfocusout() {
    const normalized = normalizeAddress(value);
    if (normalized !== value) onChange(normalized);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex min-w-0 flex-col gap-1" {onfocusout}>
  <Label class="text-xs">{label}</Label>
  <ParameterPicker
    {placeholder}
    bind:value={() => value, (next) => onChange(next)}
  />
</div>
