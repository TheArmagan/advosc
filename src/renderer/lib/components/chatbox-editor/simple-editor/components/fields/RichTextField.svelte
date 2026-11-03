<script lang="ts">
  import ValuePicker from "$lib/components/value-picker/value-picker.svelte";

  /** Free text that can hold placeholders, with autocomplete and a live preview. */
  let {
    label,
    value,
    onChange,
    placeholder = "Text, or type {{ or [[ for a placeholder",
    class: className = "w-full",
  }: {
    label?: string;
    value: string | undefined;
    onChange: (value: string) => void;
    placeholder?: string;
    class?: string;
  } = $props();
</script>

<ValuePicker {label} value={value ?? ""} {placeholder} widthClass={className} {onChange} />
