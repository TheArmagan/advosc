<script lang="ts">
  import { chatbox } from "$lib/api/chatbox";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    BracesIcon,
    BracketsIcon,
    CheckIcon,
    CopyIcon,
    MessageSquareOffIcon,
    Redo2Icon,
    TypeIcon,
    Undo2Icon,
  } from "@lucide/svelte";
  import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
  import { toast } from "svelte-sonner";
  import PlaceholderBrowser from "./advanced/PlaceholderBrowser.svelte";
  import ChatboxMonacoEditor from "./chatbox-monaco-editor.svelte";
  import PreviewCard from "./shared/PreviewCard.svelte";
  import { oneOffMessage } from "./shared/one-off-message.svelte";
  import { textFormats } from "./simple-editor/options";

  let { isActive = false }: { isActive?: boolean } = $props();

  const settings = chatbox.settings;
  const renderedTemplate = chatbox.renderedTemplate;
  const advancedTemplate = chatbox.advancedTemplate;

  let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  let setText = (text: string) => {};

  let originalTemplate = $advancedTemplate;
  const oneOff = oneOffMessage(() => originalTemplate);

  let cursor = $state({ line: 1, column: 1 });
  let length = $state(0);
  let copied = $state(false);

  $effect(() => {
    if (!isActive) return;

    const savedTemplate = $advancedTemplate;

    if (!oneOff.active && savedTemplate !== $settings.template) {
      originalTemplate = savedTemplate;
      $settings.template = savedTemplate;
      setText(savedTemplate);
      return;
    }

    const current = $settings.template;
    if (!oneOff.active) {
      originalTemplate = current;
      $advancedTemplate = current;
      setText(current);
    }
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

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(editor?.getValue() ?? $advancedTemplate);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast.error("Couldn't copy the template");
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

<Tooltip.Provider delayDuration={300}>
  <div class="grid gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_20rem]">
    <!-- One height for the editor and the column next to it, so neither leaves a gap. -->
    <div
      class="flex h-[clamp(22rem,65vh,40rem)] min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm min-[1100px]:h-[calc(100vh-7rem)] min-[1100px]:min-h-[30rem]"
    >
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

        <Button variant="ghost" size="sm" class="ml-auto h-8 gap-1.5 px-2 text-xs" onclick={copyTemplate}>
          {#if copied}<CheckIcon class="size-3.5" /> Copied{:else}<CopyIcon class="size-3.5" /> Copy{/if}
        </Button>
      </div>

      <div class="min-h-0 flex-1">
      <ChatboxMonacoEditor
        height="100%"
        onLoad={(instance) => {
          editor = instance;
          setText = (text: string) => {
            if (text && text.trim() !== instance.getValue().trim()) {
              instance.setValue(text);
            }
          };
          setText($settings.template);
          length = instance.getValue().length;
          instance.onDidChangeCursorPosition((e) => {
            cursor = { line: e.position.lineNumber, column: e.position.column };
          });
        }}
        onChange={(value) => {
          length = value.length;
          if (isActive && originalTemplate !== value) {
            originalTemplate = value;
            $advancedTemplate = value;
            if (!oneOff.active) $settings.template = value;
          }
        }}
      />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span class="tabular-nums">Line {cursor.line}, column {cursor.column}</span>
        <span class="tabular-nums">{length} characters</span>
        <span class="ml-auto">
          Type {"{{"} or [[ for suggestions, Ctrl+Space for more. Lines starting with // are skipped.
        </span>
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
      <PlaceholderBrowser class="h-[28rem] min-[1100px]:h-auto min-[1100px]:min-h-64 min-[1100px]:flex-1" onInsert={insertSnippet} />
    </div>
  </div>
</Tooltip.Provider>
