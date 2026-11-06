<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { livePreview } from "$lib/components/value-picker/live-preview.svelte";
  import { cn } from "$lib/utils";
  import {
    BracesIcon,
    BracketsIcon,
    CopyPlusIcon,
    DownloadIcon,
    EllipsisIcon,
    LockIcon,
    LockOpenIcon,
    PencilIcon,
    PlusIcon,
    SearchIcon,
    Trash2Icon,
    UploadIcon,
    XIcon,
  } from "@lucide/svelte";
  import { tick, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import ChatboxMonacoEditor from "../chatbox-monaco-editor.svelte";
  import { shortcuts, shortcutSnippet } from "./shortcuts.svelte";

  let {
    onInsert,
    class: className,
  }: {
    onInsert: (snippet: string) => void;
    class?: string;
  } = $props();

  let query = $state("");
  let creating = $state(false);
  let newName = $state("");
  let newInput = $state<HTMLInputElement | null>(null);
  const newError = $derived(creating && newName ? shortcuts.validateName(newName) : null);

  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let renameInput = $state<HTMLInputElement | null>(null);
  const renameError = $derived(renaming ? shortcuts.validateName(renameValue, renaming) : null);

  /** The row whose details show at the bottom. Clicking only selects, so a double click can insert. */
  let selected = $state<string | null>(null);
  let detail = $state<HTMLDivElement | null>(null);
  const current = $derived(selected && shortcuts.has(selected) ? selected : null);
  const currentParams = $derived(current ? shortcuts.paramCount(current) : 0);

  const live = livePreview({
    template: () => (current && !currentParams ? `{{Shortcut;${current}}}` : ""),
    enabled: () => !!current && !currentParams,
    element: () => detail,
  });

  /** Inserts a call into whatever tab is on screen, but never into the shortcut itself. */
  function insert(key: string, form: "outer" | "inner") {
    if (shortcuts.active === key) {
      toast.error(`${key} is the shortcut you're editing`, {
        description: "A shortcut that calls itself never finishes. Switch to another tab first.",
      });
      return;
    }
    onInsert(shortcutSnippet(key, form));
  }

  function edit(key: string) {
    shortcuts.open(key);
  }

  /** Set by menu items that move focus, so closing the menu doesn't pull it back. */
  let keepFocus = false;

  let importOpen = $state(false);
  let importValue = $state("");

  const items = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts.list;
    return shortcuts.list.filter(
      ([key, body]) => key.toLowerCase().includes(q) || (!shortcuts.isSecret(key) && body.toLowerCase().includes(q)),
    );
  });

  function firstLine(body: string) {
    const line = body.split("\n").find((l) => l.trim() && !l.trim().startsWith("//")) ?? "";
    return line.trim();
  }

  function paramLabel(count: number) {
    return count === 1 ? "$0" : `$0-$${count - 1}`;
  }

  async function startCreate() {
    creating = true;
    newName = shortcuts.suggestName();
    await tick();
    newInput?.focus();
    newInput?.select();
  }

  function confirmCreate() {
    if (shortcuts.validateName(newName)) return;
    shortcuts.create(newName);
    creating = false;
    newName = "";
  }

  // The + in the editor's tab strip asks for a new one through this counter.
  $effect(() => {
    const request = shortcuts.newRequest;
    if (request <= shortcuts.handledRequest) return;
    shortcuts.handledRequest = request;
    untrack(startCreate);
  });

  async function startRename(key: string) {
    keepFocus = true;
    renaming = key;
    renameValue = key;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function insertFromMenu(key: string, form: "outer" | "inner") {
    keepFocus = true;
    insert(key, form);
  }

  function confirmRename() {
    if (!renaming) return;
    const from = renaming;
    const to = renameValue.trim();
    renaming = null;
    if (to === from || shortcuts.validateName(to, from)) return;
    const changed = shortcuts.rename(from, to);
    toast.success(`Renamed to ${to}`, {
      description:
        (changed ? `Updated ${changed === 1 ? "1 place" : `${changed} places`} that called it. ` : "") +
        "Simple Editor blocks and Automations that use the old name aren't changed.",
    });
  }

  function remove(key: string) {
    const removed = shortcuts.remove(key);
    toast.success(`Deleted ${key}`, {
      action: { label: "Undo", onClick: () => shortcuts.restore(removed) },
    });
  }

  async function exportAll() {
    try {
      await navigator.clipboard.writeText(shortcuts.exportJson());
      toast.success("Shortcuts copied as JSON", {
        description: "Ones kept out of shares aren't included.",
      });
    } catch {
      toast.error("Couldn't copy the shortcuts");
    }
  }

  function importAll() {
    try {
      const count = shortcuts.importJson(importValue);
      toast.success(count === 1 ? "Imported 1 shortcut" : `Imported ${count} shortcuts`);
      importOpen = false;
      importValue = "";
    } catch (error) {
      toast.error("Couldn't import that", { description: (error as Error).message });
    }
  }
</script>

<div class={cn("flex min-h-0 flex-col rounded-lg border bg-card shadow-sm", className)}>
  <div class="flex flex-col gap-2 border-b p-3">
    <div class="flex items-center gap-2">
      <h3 class="text-sm font-semibold">Shortcuts</h3>
      <span class="text-xs text-muted-foreground">{shortcuts.list.length}</span>
      <Button size="sm" variant="ghost" class="ml-auto h-7 gap-1 px-2 text-xs" onclick={startCreate}>
        <PlusIcon class="size-3.5" />
        New
      </Button>
    </div>

    {#if creating}
      <div class="flex flex-col gap-1">
        <div class="flex gap-1.5">
          <Input
            bind:ref={newInput}
            class="h-8 font-mono text-xs"
            placeholder="MediaBar"
            aria-label="New shortcut name"
            aria-invalid={!!newError}
            bind:value={newName}
            onkeydown={(e) => {
              if (e.key === "Enter") confirmCreate();
              if (e.key === "Escape") creating = false;
            }}
          />
          <Button size="sm" class="h-8 px-2.5 text-xs" disabled={!!shortcuts.validateName(newName)} onclick={confirmCreate}>
            Add
          </Button>
          <Button size="icon" variant="ghost" class="size-8" aria-label="Cancel" onclick={() => (creating = false)}>
            <XIcon class="size-3.5" />
          </Button>
        </div>
        {#if newError}<p class="text-[11px] text-destructive">{newError}</p>{/if}
      </div>
    {:else}
      <div class="relative">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input class="h-8 pr-8 pl-8" placeholder="Search names and text" bind:value={query} />
        {#if query}
          <button
            type="button"
            class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            onclick={() => (query = "")}
          >
            <XIcon class="size-3.5" />
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5">
    {#each items as [key, body] (key)}
      {@const count = shortcuts.paramCount(key)}
      {@const secret = shortcuts.isSecret(key)}
      {@const isActive = shortcuts.active === key}
      {@const isSelected = current === key}
      <div
        class={cn(
          "group relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1 rounded select-none",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
        )}
      >
        {#if isActive}
          <span class="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-amber-500" title="Open in the editor"></span>
        {/if}
        {#if renaming === key}
          <div class="col-span-2 flex min-w-0 flex-col gap-1 p-1">
            <Input
              bind:ref={renameInput}
              class="h-7 font-mono text-xs"
              aria-label="New name for {key}"
              aria-invalid={!!renameError}
              bind:value={renameValue}
              onkeydown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") renaming = null;
              }}
              onblur={confirmRename}
            />
            {#if renameError}<p class="text-[11px] text-destructive">{renameError}</p>{/if}
          </div>
        {:else}
          <button
            type="button"
            class="flex w-full min-w-0 flex-col gap-0.5 overflow-hidden py-1 pl-2 text-left"
            onclick={() => (selected = key)}
            onkeydown={(e) => {
              if (e.key === "Escape") selected = null;
            }}
            ondblclick={() => insert(key, "outer")}
            title="Double click to insert"
          >
            <span class="flex w-full min-w-0 items-center gap-1.5">
              <span class="truncate font-mono text-xs text-amber-600 dark:text-amber-400">{key}</span>
              {#if count}
                <span class="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                  {paramLabel(count)}
                </span>
              {/if}
              {#if secret}
                <LockIcon class="size-3 shrink-0 text-muted-foreground" aria-label="Kept out of shares" />
              {/if}
            </span>
            <span class="block w-full truncate font-mono text-[11px] text-muted-foreground">
              {secret ? "••••••••" : firstLine(body) || "(empty)"}
            </span>
          </button>

          <div class="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            class="mt-1 size-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Edit {key}"
            title="Edit"
            onclick={() => edit(key)}
          >
            <PencilIcon class="size-3.5" />
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="mt-1 mr-0.5 size-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  aria-label="More for {key}"
                >
                  <EllipsisIcon class="size-4" />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              class="w-52"
              onCloseAutoFocus={(e) => {
                if (keepFocus) e.preventDefault();
                keepFocus = false;
              }}
            >
              <DropdownMenu.Item onclick={() => insertFromMenu(key, "outer")}>
                <BracesIcon class="text-amber-500" />
                Insert {"{{ }}"}
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={() => insertFromMenu(key, "inner")}>
                <BracketsIcon class="text-sky-500" />
                Insert [[ ]]
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onclick={() => startRename(key)}>
                <PencilIcon />
                Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={() => shortcuts.duplicate(key)}>
                <CopyPlusIcon />
                Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={() => shortcuts.toggleSecret(key)}>
                {#if secret}
                  <LockOpenIcon />
                  Include in shares
                {:else}
                  <LockIcon />
                  Keep out of shares
                {/if}
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item class="text-destructive" onclick={() => remove(key)}>
                <Trash2Icon />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          </div>
        {/if}
      </div>
    {:else}
      {#if query}
        <p class="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches "{query}".</p>
      {:else}
        <div class="flex flex-col items-center gap-2 px-3 py-6 text-center">
          <p class="text-sm text-muted-foreground">
            A shortcut is a named piece of template you call with {"{{Shortcut;Name}}"}. Use $0, $1 in
            it for values you pass in.
          </p>
          {#if !creating}
            <Button size="sm" variant="outline" class="h-8 gap-1 text-xs" onclick={startCreate}>
              <PlusIcon class="size-3.5" />
              New shortcut
            </Button>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  {#if current}
    {@const body = shortcuts.all[current] ?? ""}
    {@const secret = shortcuts.isSecret(current)}
    <div bind:this={detail} class="flex flex-col gap-2 border-t p-3">
      <div class="flex items-start gap-2">
        <p class="min-w-0 flex-1 font-mono text-xs break-all">
          {`{{Shortcut;${current}${Array.from({ length: currentParams }, (_, i) => `;$${i}`).join("")}}}`}
        </p>
        <button
          type="button"
          class="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Close details"
          onclick={() => (selected = null)}
        >
          <XIcon class="size-3.5" />
        </button>
      </div>
      <pre
        class="max-h-24 overflow-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-snug break-all whitespace-pre-wrap text-muted-foreground">{secret
          ? "Kept out of shares. Edit it to see the text."
          : body || "(empty)"}</pre>
      <div class="flex items-baseline gap-2 text-xs">
        {#if currentParams}
          <span class="text-muted-foreground">
            Takes {currentParams === 1 ? "$0" : `$0 to $${currentParams - 1}`}. Put the cursor in a call to fill them.
          </span>
        {:else}
          <span class="shrink-0 text-muted-foreground">Right now</span>
          <span class="min-w-0 truncate font-mono" title={live.text ?? ""}>
            {live.failed ? "Couldn't render it" : live.text === null ? "..." : live.text || "(empty)"}
          </span>
        {/if}
      </div>
      <div class="flex gap-1.5">
        <Button size="sm" class="h-8 flex-1 gap-1.5 text-xs" onclick={() => edit(current)}>
          <PencilIcon class="size-3.5" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-8 flex-1 font-mono text-xs"
          disabled={shortcuts.active === current}
          title={shortcuts.active === current ? "This is the shortcut on screen" : "Insert at the cursor"}
          onclick={() => insert(current, "outer")}
        >
          Insert {"{{ }}"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-8 flex-1 font-mono text-xs"
          disabled={shortcuts.active === current}
          title="Inner form, for use inside another placeholder"
          onclick={() => insert(current, "inner")}
        >
          Insert [[ ]]
        </Button>
      </div>
    </div>
  {/if}

  <div class="flex items-center gap-1 border-t px-1.5 py-1">
    <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={exportAll} disabled={!shortcuts.list.length}>
      <DownloadIcon class="size-3.5" />
      Export
    </Button>
    <Drawer.Root bind:open={importOpen}>
      <Drawer.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs">
            <UploadIcon class="size-3.5" />
            Import
          </Button>
        {/snippet}
      </Drawer.Trigger>
      <Drawer.Content class="flex w-full flex-col gap-2 p-3">
        <div class="flex flex-col gap-0.5">
          <h3 class="text-sm font-semibold">Import shortcuts</h3>
          <p class="text-xs text-muted-foreground">
            Paste JSON like {'{ "Name": "text" }'}. Shortcuts with the same name get replaced, the rest stay.
          </p>
        </div>
        <div class="overflow-hidden rounded-md border">
          <ChatboxMonacoEditor
            height={250}
            language="json"
            value={importValue}
            onChange={(value) => (importValue = value)}
          />
        </div>
        <Drawer.Footer class="flex-row justify-end px-0">
          <Drawer.Close>
            {#snippet child({ props })}
              <Button {...props} variant="outline">Cancel</Button>
            {/snippet}
          </Drawer.Close>
          <Button onclick={importAll} disabled={!importValue.trim()}>
            <UploadIcon />
            Import
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>
  </div>
</div>
