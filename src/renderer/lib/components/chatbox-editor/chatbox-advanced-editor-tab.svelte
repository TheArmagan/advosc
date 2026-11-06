<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { livePreview } from "$lib/components/value-picker/live-preview.svelte";
  import { cn } from "$lib/utils";
  import {
    BracesIcon,
    BracketsIcon,
    CheckIcon,
    CopyIcon,
    FileTextIcon,
    MessageSquareOffIcon,
    PencilIcon,
    PlusIcon,
    Redo2Icon,
    SquarePlusIcon,
    TypeIcon,
    Undo2Icon,
    XIcon,
  } from "@lucide/svelte";
  import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
  import { onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import PlaceholderBrowser from "./advanced/PlaceholderBrowser.svelte";
  import {
    asOuter,
    buildCall,
    escapeArg,
    findCallAt,
    insideOuter,
    unescapeArg,
    type CallForm,
    type ShortcutCall,
  } from "./advanced/shortcut-call";
  import ShortcutBrowser from "./advanced/ShortcutBrowser.svelte";
  import { shortcuts, TEMPLATE_TAB, type ShortcutPanel } from "./advanced/shortcuts.svelte";
  import ChatboxMonacoEditor from "./chatbox-monaco-editor.svelte";
  import PreviewCard from "./shared/PreviewCard.svelte";
  import { oneOffMessage } from "./shared/one-off-message.svelte";
  import { textFormats } from "./simple-editor/options";

  let { isActive = false }: { isActive?: boolean } = $props();

  const settings = chatbox.settings;
  const renderedTemplate = chatbox.renderedTemplate;
  const advancedTemplate = chatbox.advancedTemplate;

  let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  let monaco: typeof Monaco | null = null;
  let ready = $state(false);

  // One model per tab, so each keeps its own undo history. The template's model is the one
  // the editor component made; shortcut models are made here and disposed here.
  let templateModel: Monaco.editor.ITextModel | null = null;
  const shortcutModels = new Map<string, Monaco.editor.ITextModel>();
  const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  /** The tab whose model is in the editor right now. Not runes state: Monaco owns it. */
  let shownKey = TEMPLATE_TAB;

  shortcuts.loadPanel();

  let originalTemplate = $advancedTemplate;
  const oneOff = oneOffMessage(() => originalTemplate);

  let cursor = $state({ line: 1, column: 1 });
  let length = $state(0);
  let copied = $state(false);

  /** Writes the template's model, whatever tab is on screen. */
  function setTemplateText(text: string) {
    if (templateModel && text && text.trim() !== templateModel.getValue().trim()) {
      templateModel.setValue(text);
    }
  }

  $effect(() => {
    if (!isActive) return;

    const savedTemplate = $advancedTemplate;

    if (!oneOff.active && savedTemplate !== $settings.template) {
      originalTemplate = savedTemplate;
      $settings.template = savedTemplate;
      setTemplateText(savedTemplate);
      return;
    }

    const current = $settings.template;
    if (!oneOff.active) {
      originalTemplate = current;
      $advancedTemplate = current;
      setTemplateText(current);
    }
  });

  // ------------------------------------------------------------------ tabs

  function modelFor(key: string): Monaco.editor.ITextModel | null {
    if (key === TEMPLATE_TAB) return templateModel;
    let model = shortcutModels.get(key);
    if (!model && monaco) {
      model = monaco.editor.createModel(shortcuts.all[key] ?? "", "advosc-placeholders");
      shortcutModels.set(key, model);
    }
    return model ?? null;
  }

  function show(key: string) {
    if (!editor) return;
    const model = modelFor(key);
    if (!model) return;
    if (editor.getModel() !== model) {
      viewStates.set(shownKey, editor.saveViewState());
      shownKey = key;
      editor.setModel(model);
      const state = viewStates.get(key);
      if (state) editor.restoreViewState(state);
      const position = editor.getPosition();
      if (position) cursor = { line: position.lineNumber, column: position.column };
    }
    shownKey = key;
    length = model.getValueLength();
  }

  // Put the active tab on screen, and let go of models whose tab was closed.
  $effect(() => {
    const active = shortcuts.active;
    const open = new Set(shortcuts.tabs);
    if (!ready) return;
    show(active);
    for (const [key, model] of shortcutModels) {
      if (open.has(key) || editor?.getModel() === model) continue;
      model.dispose();
      shortcutModels.delete(key);
      viewStates.delete(key);
    }
  });

  // Changes that come from somewhere else (a preset import, an undo of a delete) land in the
  // open tabs, but never over what you're typing.
  $effect(() => {
    if (!ready) return;
    for (const key of shortcuts.tabs) {
      const stored = shortcuts.all[key];
      const model = shortcutModels.get(key);
      if (stored === undefined || !model || model.getValue() === stored) continue;
      if (key === shownKey && editor?.hasTextFocus()) continue;
      model.setValue(stored);
    }
  });

  onDestroy(() => {
    // The editor component disposes whichever model it has, so leave that one to it.
    const attached = editor?.getModel();
    for (const model of shortcutModels.values()) if (model !== attached) model.dispose();
    if (templateModel && templateModel !== attached && !templateModel.isDisposed()) templateModel.dispose();
    shortcutModels.clear();
  });

  function closeTab(key: string) {
    shortcuts.close(key);
    editor?.focus();
  }

  // ------------------------------------------------------------------ try it

  const activeKey = $derived(shortcuts.active);
  const onShortcut = $derived(activeKey !== TEMPLATE_TAB && shortcuts.has(activeKey));
  const paramCount = $derived(onShortcut ? shortcuts.paramCount(activeKey) : 0);
  /** Kept per shortcut for the session, so switching tabs doesn't lose them. */
  let paramValues = $state<Record<string, string[]>>({});
  let tryElement = $state<HTMLDivElement | null>(null);

  function escapeParam(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;");
  }

  const tryTemplate = $derived.by(() => {
    if (!onShortcut) return "";
    const params = Array.from({ length: paramCount }, (_, i) => escapeParam(paramValues[activeKey]?.[i] ?? ""));
    return `{{${["Shortcut", activeKey, ...params].join(";")}}}`;
  });

  // Read-only, so a {{Sound;Play;x}} inside a shortcut doesn't fire while you edit it.
  const tryResult = livePreview({
    template: () => tryTemplate,
    enabled: () => onShortcut,
    element: () => tryElement,
  });

  function setParam(index: number, value: string) {
    const list = [...(paramValues[activeKey] ?? [])];
    list[index] = value;
    paramValues[activeKey] = list;
  }

  // ------------------------------------------------------------------ selection to shortcut

  let hasSelection = $state(false);
  let extract = $state<{ name: string } | null>(null);
  let extractInput = $state<HTMLInputElement | null>(null);
  /** Where the text came from. Not runes state, Monaco objects stay out of proxies. */
  let extractFrom: {
    model: Monaco.editor.ITextModel;
    range: Monaco.IRange;
    text: string;
    form: CallForm;
  } | null = null;
  let extractForm = $state<CallForm>("outer");
  const extractError = $derived(extract && extract.name ? shortcuts.validateName(extract.name) : null);

  function startExtract() {
    if (!editor) return;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection || selection.isEmpty()) {
      toast.error("Select the text you want in the shortcut first");
      return;
    }
    const text = model.getValueInRange(selection);
    const before = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: selection.startLineNumber,
      endColumn: selection.startColumn,
    });
    const form: CallForm = insideOuter(before) ? "inner" : "outer";
    if (form === "inner" && text.includes("{{")) {
      toast.error("That selection is inside a {{ }} and holds another one", {
        description: "Select the whole placeholder, or only text inside it.",
      });
      return;
    }
    extractFrom = { model, range: selection, text, form };
    extractForm = form;
    extract = { name: shortcuts.suggestName() };
    setTimeout(() => {
      extractInput?.focus();
      extractInput?.select();
    });
  }

  function cancelExtract() {
    extract = null;
    extractFrom = null;
    editor?.focus();
  }

  function confirmExtract() {
    if (!extract || !extractFrom || shortcuts.validateName(extract.name)) return;
    const { model, range, text, form } = extractFrom;
    if (model.isDisposed() || model.getValueInRange(range) !== text) {
      toast.error("The text changed since you selected it", { description: "Select it again." });
      cancelExtract();
      return;
    }
    const name = shortcuts.create(extract.name, text, false);
    const replacement = buildCall(form, name, []);
    if (editor && editor.getModel() === model) {
      editor.executeEdits("make-shortcut", [{ range, text: replacement, forceMoveMarkers: true }]);
    } else {
      model.pushEditOperations([], [{ range, text: replacement }], () => null);
    }
    // Straight into the new shortcut, since the next thing is usually adding a $0 to it.
    const cameFrom = shownKey;
    shortcuts.open(name);
    toast.success(`Made ${name}`, {
      description: `The selection is now ${replacement}.`,
      action: {
        label: "Go back",
        onClick: () => shortcuts.open(cameFrom === TEMPLATE_TAB || shortcuts.has(cameFrom) ? cameFrom : TEMPLATE_TAB),
      },
    });
    cancelExtract();
  }

  // ------------------------------------------------------------------ params of a call

  /** The shortcut call the cursor is in, if any. */
  let call = $state<ShortcutCall | null>(null);
  let callElement = $state<HTMLDivElement | null>(null);
  let rewritingCall = false;
  const callExists = $derived(!!call && shortcuts.has(call.key));
  const callParamCount = $derived(call && callExists ? shortcuts.paramCount(call.key) : 0);

  function updateCall() {
    if (rewritingCall || !editor) return;
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) {
      call = null;
      return;
    }
    call = findCallAt(model.getLineContent(position.lineNumber), position.lineNumber, position.column);
  }

  function setCallParam(index: number, value: string) {
    if (!editor || !call) return;
    const rawArgs = [...call.rawArgs];
    while (rawArgs.length <= index) rawArgs.push("");
    rawArgs[index] = escapeArg(value, call.form);
    const text = buildCall(call.form, call.key, rawArgs);
    const range = {
      startLineNumber: call.line,
      startColumn: call.startColumn,
      endLineNumber: call.line,
      endColumn: call.endColumn,
    };
    rewritingCall = true;
    try {
      editor.executeEdits("call-params", [{ range, text }]);
    } finally {
      rewritingCall = false;
    }
    call = { ...call, rawArgs, endColumn: call.startColumn + text.length };
  }

  const callResult = livePreview({
    template: () => (call && callExists ? asOuter(call) : ""),
    enabled: () => !!call && callExists,
    element: () => callElement,
  });

  // ------------------------------------------------------------------ toolbar

  function run(action: string) {
    if (!editor) return;
    editor.focus();
    editor.trigger("toolbar", action, null);
  }

  /** Tabstops in the snippet let you Tab through a placeholder's arguments. */
  function insertSnippet(snippet: string) {
    if (!editor) return;
    editor.focus();
    const controller = editor.getContribution("snippetController2") as
      | { insert: (template: string) => void }
      | null;
    if (controller) controller.insert(snippet);
    else editor.trigger("toolbar", "type", { text: snippet });
  }

  function styleSelection(style: string) {
    if (!editor) return;
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;
    const text = model.getValueInRange(selection);
    if (!text) {
      insertSnippet(`{{Text;Format;${style};\${1:text}}}`);
      return;
    }
    if (text.includes("{{")) {
      toast.error("Can't style text that holds a {{ }} placeholder", {
        description: "Use the [[ ]] form inside it, or put it in a shortcut first.",
      });
      return;
    }
    const escaped = text.replace(/\\/g, "\\\\").replace(/;/g, "\\;");
    editor.focus();
    editor.executeEdits("toolbar", [
      { range: selection, text: `{{Text;Format;${style};${escaped}}}`, forceMoveMarkers: true },
    ]);
  }

  async function copyCurrent() {
    try {
      await navigator.clipboard.writeText(editor?.getValue() ?? $advancedTemplate);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast.error("Couldn't copy that");
    }
  }

  const styles = textFormats.filter((format) => format.value);
</script>

{#snippet toolButton(label: string, onclick: () => void, Icon: typeof TypeIcon, shortcut?: string)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="ghost" size="icon" class="size-8 text-muted-foreground" aria-label={label} {onclick}>
          <Icon class="size-4" />
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{label}{shortcut ? ` (${shortcut})` : ""}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}

{#snippet tab(key: string, label: string)}
  {@const selected = activeKey === key}
  <div
    class={cn(
      "group relative flex h-9 shrink-0 items-center border-r text-xs",
      selected ? "bg-card text-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
    )}
  >
    {#if selected}<span class="absolute inset-x-0 top-0 h-0.5 bg-primary"></span>{/if}
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      class={cn("flex h-full items-center gap-1.5 pl-3", key === TEMPLATE_TAB ? "pr-3" : "pr-1")}
      onclick={() => shortcuts.open(key)}
      onauxclick={(e) => {
        if (e.button === 1 && key !== TEMPLATE_TAB) closeTab(key);
      }}
    >
      {#if key === TEMPLATE_TAB}
        <FileTextIcon class="size-3.5" />
        {label}
      {:else}
        <BracesIcon class="size-3.5 text-amber-500" />
        <span class="max-w-40 truncate font-mono">{label}</span>
      {/if}
    </button>
    {#if key !== TEMPLATE_TAB}
      <button
        type="button"
        class={cn(
          "mr-1.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground",
          !selected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
        aria-label="Close {label}"
        onclick={() => closeTab(key)}
      >
        <XIcon class="size-3" />
      </button>
    {/if}
  </div>
{/snippet}

<Tooltip.Provider delayDuration={300}>
  <div class="grid gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
    <!-- One height for the editor and the column next to it, so neither leaves a gap. -->
    <div
      class="flex h-[clamp(22rem,65vh,40rem)] min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm min-[1100px]:h-[calc(100vh-7rem)] min-[1100px]:min-h-[30rem]"
    >
      <div role="tablist" aria-label="Open files" class="flex overflow-x-auto border-b bg-muted/40 [scrollbar-width:thin]">
        {@render tab(TEMPLATE_TAB, "Template")}
        {#each shortcuts.tabs as key (key)}
          {@render tab(key, key)}
        {/each}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                aria-label="Open a shortcut"
                title="Open a shortcut, or make a new one"
              >
                <PlusIcon class="size-4" />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenu.Item onclick={() => shortcuts.requestNew()}>
              <PlusIcon />
              New shortcut
            </DropdownMenu.Item>
            {#if shortcuts.list.length}
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="text-xs font-normal text-muted-foreground">Open a shortcut</DropdownMenu.Label>
              <div class="max-h-72 overflow-y-auto">
                {#each shortcuts.list as [key] (key)}
                  {@const count = shortcuts.paramCount(key)}
                  <DropdownMenu.Item
                    onclick={() => {
                      shortcuts.open(key);
                      setTimeout(() => editor?.focus());
                    }}
                  >
                    <BracesIcon class="text-amber-500" />
                    <span class="truncate font-mono text-xs">{key}</span>
                    {#if count}
                      <span class="ml-auto font-mono text-[10px] text-muted-foreground">
                        {count === 1 ? "$0" : `$0-$${count - 1}`}
                      </span>
                    {:else if shortcuts.tabs.includes(key)}
                      <span class="ml-auto text-[10px] text-muted-foreground">open</span>
                    {/if}
                  </DropdownMenu.Item>
                {/each}
              </div>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <div class="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1.5 px-2 font-mono text-xs"
          onclick={() => insertSnippet("{{${1}}}")}
        >
          <BracesIcon class="size-3.5 text-amber-500" />
          {"{{ }}"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1.5 px-2 font-mono text-xs"
          onclick={() => insertSnippet("[[${1}]]")}
        >
          <BracketsIcon class="size-3.5 text-sky-500" />
          [[ ]]
        </Button>
        {#if onShortcut}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="sm"
                  class="h-8 px-2 font-mono text-xs"
                  onclick={() => insertSnippet(`\\$\${1:${paramCount}}`)}
                >
                  $n
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Add a param, filled by whatever calls this shortcut</Tooltip.Content>
          </Tooltip.Root>
        {/if}

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="sm"
                class="h-8 gap-1.5 px-2 text-xs"
                disabled={!hasSelection}
                onclick={startExtract}
              >
                <SquarePlusIcon class="size-3.5" />
                Make shortcut
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Moves the selected text into a new shortcut (Ctrl+Shift+E)</Tooltip.Content>
        </Tooltip.Root>

        <div class="mx-1 h-5 w-px bg-border"></div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="sm" class="h-8 gap-1.5 px-2 text-xs">
                <TypeIcon class="size-3.5" />
                Style
              </Button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-52">
            <DropdownMenu.Label class="text-xs font-normal text-muted-foreground">
              Styles the selected text
            </DropdownMenu.Label>
            {#each styles as style (style.value)}
              <DropdownMenu.Item onclick={() => styleSelection(style.value)}>{style.label}</DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        {@render toolButton("Comment out lines", () => run("editor.action.commentLine"), MessageSquareOffIcon, "Ctrl+/")}

        <div class="mx-1 h-5 w-px bg-border"></div>

        {@render toolButton("Undo", () => run("undo"), Undo2Icon, "Ctrl+Z")}
        {@render toolButton("Redo", () => run("redo"), Redo2Icon, "Ctrl+Y")}

        <Button variant="ghost" size="sm" class="ml-auto h-8 gap-1.5 px-2 text-xs" onclick={copyCurrent}>
          {#if copied}<CheckIcon class="size-3.5" /> Copied{:else}<CopyIcon class="size-3.5" /> Copy{/if}
        </Button>
      </div>

      {#if extract}
        <div class="flex flex-col gap-1 border-b bg-muted/30 px-3 py-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-medium">New shortcut from the selection</span>
            <Input
              bind:ref={extractInput}
              class="h-7 w-44 font-mono text-xs"
              aria-label="Shortcut name"
              aria-invalid={!!extractError}
              bind:value={extract.name}
              onkeydown={(e) => {
                if (e.key === "Enter") confirmExtract();
                if (e.key === "Escape") cancelExtract();
              }}
            />
            <Button size="sm" class="h-7 px-2.5 text-xs" disabled={!!shortcuts.validateName(extract.name)} onclick={confirmExtract}>
              Make it
            </Button>
            <Button size="sm" variant="ghost" class="h-7 px-2 text-xs" onclick={cancelExtract}>Cancel</Button>
          </div>
          <p class={cn("text-[11px]", extractError ? "text-destructive" : "text-muted-foreground")}>
            {extractError ?? `The selection gets replaced with ${buildCall(extractForm, extract.name.trim() || "Name", [])}.`}
          </p>
        </div>
      {/if}

      <div class="min-h-0 flex-1">
      <ChatboxMonacoEditor
        height="100%"
        onLoad={async (instance) => {
          editor = instance;
          templateModel = instance.getModel();
          setTemplateText($settings.template);
          length = instance.getValue().length;
          instance.onDidChangeCursorPosition((e) => {
            cursor = { line: e.position.lineNumber, column: e.position.column };
            updateCall();
          });
          instance.onDidChangeCursorSelection((e) => (hasSelection = !e.selection.isEmpty()));
          instance.onDidChangeModel(() => {
            hasSelection = false;
            updateCall();
          });
          monaco = (await import("$lib/editor/monaco-lib")).default;
          instance.addAction({
            id: "advosc.makeShortcut",
            label: "Make a shortcut from the selection",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
            precondition: "editorHasSelection",
            contextMenuGroupId: "1_modification",
            run: () => startExtract(),
          });
          ready = true;
        }}
        onChange={(value) => {
          length = value.length;
          if (shownKey !== TEMPLATE_TAB) {
            shortcuts.setBody(shownKey, value);
            return;
          }
          if (isActive && originalTemplate !== value) {
            originalTemplate = value;
            $advancedTemplate = value;
            if (!oneOff.active) $settings.template = value;
          }
        }}
      />
      </div>

      {#if call}
        {@const current = call}
        <div bind:this={callElement} class="flex flex-col gap-1.5 border-t bg-muted/30 px-3 py-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <BracesIcon class="size-3.5 text-amber-500" />
            <span class="font-mono text-xs text-amber-600 dark:text-amber-400">{current.key}</span>
            {#if !callExists}
              <span class="text-[11px] text-muted-foreground">There's no shortcut with this name yet.</span>
              {#if !shortcuts.validateName(current.key)}
                <Button size="sm" variant="outline" class="h-7 gap-1 px-2 text-xs" onclick={() => shortcuts.create(current.key)}>
                  <PlusIcon class="size-3.5" />
                  Make it
                </Button>
              {/if}
            {:else}
              {#each Array.from({ length: callParamCount }) as _, index (index)}
                <label class="flex items-center gap-1">
                  <span class="font-mono text-[11px] text-muted-foreground">${index}</span>
                  <Input
                    class="h-7 w-28 font-mono text-xs"
                    placeholder="value"
                    value={unescapeArg(current.rawArgs[index] ?? "")}
                    oninput={(e) => setCallParam(index, (e.target as HTMLInputElement).value)}
                  />
                </label>
              {:else}
                <span class="text-[11px] text-muted-foreground">Takes no params.</span>
              {/each}
              <Button
                size="sm"
                variant="ghost"
                class="ml-auto h-7 gap-1 px-2 text-xs"
                onclick={() => shortcuts.open(current.key)}
              >
                <PencilIcon class="size-3.5" />
                Edit shortcut
              </Button>
            {/if}
          </div>
          {#if callExists}
            <div class="flex items-baseline gap-2 text-xs">
              <span class="shrink-0 text-muted-foreground">Gives</span>
              <span
                class={cn("min-w-0 truncate font-mono", callResult.failed && "text-destructive")}
                title={callResult.text ?? ""}
              >
                {#if callResult.failed}
                  Couldn't render it
                {:else if callResult.text === null}
                  ...
                {:else}
                  {callResult.text || "(empty)"}
                {/if}
              </span>
            </div>
          {/if}
        </div>
      {:else if onShortcut}
        <div bind:this={tryElement} class="flex flex-col gap-1.5 border-t bg-muted/30 px-3 py-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-medium">Try it</span>
            {#each Array.from({ length: paramCount }) as _, index (index)}
              <label class="flex items-center gap-1">
                <span class="font-mono text-[11px] text-muted-foreground">${index}</span>
                <Input
                  class="h-7 w-28 font-mono text-xs"
                  placeholder="value"
                  value={paramValues[activeKey]?.[index] ?? ""}
                  oninput={(e) => setParam(index, (e.target as HTMLInputElement).value)}
                />
              </label>
            {:else}
              <span class="text-[11px] text-muted-foreground">No params. Use $0, $1 in the text to take some.</span>
            {/each}
          </div>
          <div class="flex items-baseline gap-2 text-xs">
            <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{tryTemplate}</span>
            <span class="shrink-0 text-muted-foreground">gives</span>
            <span
              class={cn("min-w-0 truncate font-mono", tryResult.failed && "text-destructive")}
              title={tryResult.text ?? ""}
            >
              {#if tryResult.failed}
                Couldn't render it
              {:else if tryResult.text === null}
                ...
              {:else}
                {tryResult.text || "(empty)"}
              {/if}
            </span>
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span class="tabular-nums">Line {cursor.line}, column {cursor.column}</span>
        <span class="tabular-nums">{length} characters</span>
        {#if onShortcut}
          <span>{paramCount ? `Takes ${paramCount === 1 ? "$0" : `$0 to $${paramCount - 1}`}` : "No params"}</span>
          <span class="ml-auto">Saves as you type. Call it with {`{{Shortcut;${activeKey}}}`}.</span>
        {:else}
          <span class="ml-auto">
            Type {"{{"} or [[ for suggestions. Put the cursor in a shortcut call to fill its params.
          </span>
        {/if}
      </div>
    </div>

    <div class="flex min-w-0 flex-col gap-3 min-[1100px]:h-[calc(100vh-7rem)] min-[1100px]:min-h-[30rem]">
      <PreviewCard
        rendered={$renderedTemplate}
        overwrite={oneOff.text}
        overwriteActive={oneOff.active}
        onOverwrite={oneOff.input}
        onOverwriteReset={oneOff.reset}
        onOverwriteBlur={oneOff.blur}
      />
      <Tabs.Root
        value={shortcuts.panel}
        onValueChange={(value) => shortcuts.setPanel(value as ShortcutPanel)}
        class="h-[28rem] min-h-0 gap-1.5 min-[1100px]:h-auto min-[1100px]:min-h-64 min-[1100px]:flex-1"
      >
        <Tabs.List class="w-full">
          <Tabs.Trigger value="placeholders" class="text-xs">Placeholders</Tabs.Trigger>
          <Tabs.Trigger value="shortcuts" class="text-xs">
            Shortcuts
            <span class="text-[11px] font-normal text-muted-foreground">{shortcuts.list.length}</span>
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="placeholders" class="flex min-h-0 flex-col">
          <PlaceholderBrowser class="flex-1" hideModules={["Shortcut"]} onInsert={insertSnippet} />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="flex min-h-0 flex-col">
          <ShortcutBrowser class="flex-1" onInsert={insertSnippet} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </div>
</Tooltip.Provider>
