<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";

  let {
    open = $bindable(false),
    title,
    description,
    confirmLabel,
    destructive = true,
    busy = false,
    onConfirm,
  }: {
    open?: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    busy?: boolean;
    onConfirm: () => void;
  } = $props();
</script>

<Drawer.Root bind:open>
  <Drawer.Content class="mx-auto flex max-w-xl flex-col gap-2 p-3">
    <Drawer.Header>
      <Drawer.Title>{title}</Drawer.Title>
      <Drawer.Description>{description}</Drawer.Description>
    </Drawer.Header>
    <Drawer.Footer class="flex-row justify-end">
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button
        variant={destructive ? "destructive" : "default"}
        disabled={busy}
        onclick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>
