<script lang="ts">
  import ValuePicker from "$lib/components/value-picker/value-picker.svelte";
  import { genericSourceHint } from "../options";

  let {
    label,
    value,
    placeholder,
    widthClass,
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

<ValuePicker
  {label}
  {value}
  {placeholder}
  {widthClass}
  {onChange}
  {showHint}
  hint={genericSourceHint}
  rawAddress
/>
