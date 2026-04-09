<script lang="ts">
  import SimpleEditor from "./simple-editor/SimpleEditor.svelte";

  let { isActive = false }: { isActive?: boolean } = $props();
</script>

<SimpleEditor {isActive} />
