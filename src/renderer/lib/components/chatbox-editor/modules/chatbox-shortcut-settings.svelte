<script lang="ts">
  import type { ShortcutModule } from "$lib/api/chatbox/modules/chatbox-shortcut-module";
  import { localData } from "$lib/api/local-data";
  import { Button } from "$lib/components/ui/button/index.js";
  import { navigateTo } from "$lib/router";
  import { ArrowRightIcon } from "@lucide/svelte";

  // This file is imported by `$lib/api/chatbox` itself, so it can't import the editor's
  // shortcut state (that reads `chatbox` while it loads). The module prop is enough here.
  let { module }: { module: ShortcutModule } = $props();
  const values = module.values;

  const count = $derived(
    Object.keys($values.shortcuts ?? {}).filter((key) => !key.startsWith("__SE_")).length,
  );

  function openShortcuts() {
    // The Chatbox page reads these when it mounts, so they're set before going there.
    // Same keys as `advanced/shortcuts.svelte.ts`.
    localData.set("Chatbox;ActiveTab", "editor");
    localData.set("Chatbox;AdvancedEditor;Panel", "shortcuts");
    navigateTo("/chatbox");
  }
</script>

<div class="flex flex-wrap items-center gap-3">
  <p class="text-sm text-muted-foreground">
    You have {count === 1 ? "1 shortcut" : `${count} shortcuts`}. They're edited in Chatbox, on the
    Advanced Editor tab.
  </p>
  <Button variant="outline" size="sm" onclick={openShortcuts}>
    Open shortcuts
    <ArrowRightIcon />
  </Button>
</div>
