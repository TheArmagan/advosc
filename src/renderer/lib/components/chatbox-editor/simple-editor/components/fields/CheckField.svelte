<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";

  let {
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean | undefined;
    onChange: (checked: boolean) => void;
  } = $props();
</script>

<label class="flex h-9 cursor-pointer select-none items-center gap-2 text-sm">
  <Checkbox checked={!!checked} onCheckedChange={(v) => onChange(!!v)} />
  {label}
</label>
