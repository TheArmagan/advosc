<script lang="ts">
  import ChatboxMonacoEditor from "./chatbox-monaco-editor.svelte";
  import * as monaco from "monaco-editor";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { chatbox } from "$lib/api/chatbox";
  import { BracesIcon, BracketsIcon } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import Input from "../ui/input/input.svelte";

  let insertText = (text: string) => {};
  let setText = (text: string) => {};

  let { isActive = false }: { isActive?: boolean } = $props();

  const settings = chatbox.settings;
  const renderedTemplate = chatbox.renderedTemplate;
  const placeholders = chatbox.placeholders;
  const advancedTemplate = chatbox.advancedTemplate;

  let originalTemplate = $advancedTemplate;
  let isOverwriteActive = $state(false);
  let overwriteInput = $state("");
  let overwriteTimer: ReturnType<typeof setTimeout> | null = null;

  // Parse fillText and format it as HTML for a compact white tooltip
  const formatFillTextHTML = (
    fillText: string,
    separator: string = ";",
  ): string => {
    const parts = chatbox.splitParams(fillText, separator);

    let items = "";

    parts.forEach((part, index) => {
      // Parse ${1:inputText} format
      const placeholderMatch = part.match(/\$\{(\d+):([^}]+)\}/);

      if (placeholderMatch) {
        const [_, paramIndex, content] = placeholderMatch;

        // Parameters ending with ... (variadic)
        if (content.endsWith("...")) {
          const paramName = content.slice(0, -3); // Remove the "..." suffix

          // Option-based variadic values like Left|Right|...
          if (paramName.includes("|")) {
            const options = paramName.split("|");
            items += `
              <div class="flex items-center gap-1.5 text-xs">
                <span class="text-gray-500 font-mono">${index + 1}.</span>
                <span class="font-semibold text-gray-900">${options[0]}...</span>
                <div class="flex gap-0.5">
                  ${options.map((opt) => `<span class="bg-gray-100 px-1 py-0.5 rounded text-[10px]">${opt}</span>`).join("")}
                </div>
                <span class="text-gray-400 italic text-[10px]">repeat</span>
              </div>
            `;
          } else {
            items += `
              <div class="flex items-center gap-1.5 text-xs">
                <span class="text-gray-500 font-mono">${index + 1}.</span>
                <span class="font-semibold text-gray-900">${paramName}...</span>
                <span class="text-gray-400 italic text-[10px]">repeat</span>
              </div>
            `;
          }
        }
        // Split options like Left|Right
        else if (content.includes("|")) {
          const options = content.split("|");
          items += `
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-gray-500 font-mono">${index + 1}.</span>
              <span class="font-semibold text-gray-900">${options[0]}</span>
              <div class="flex gap-0.5">
                ${options.map((opt) => `<span class="bg-gray-100 px-1 py-0.5 rounded text-[10px]">${opt}</span>`).join("")}
              </div>
            </div>
          `;
        } else {
          items += `
            <div class="flex items-center gap-1.5 text-xs">
              <span class="text-gray-500 font-mono">${index + 1}.</span>
              <span class="font-semibold text-gray-900">${content}</span>
            </div>
          `;
        }
      } else {
        // Normal parameter (fixed value)
        items += `
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-gray-500 font-mono">${index + 1}.</span>
            <code class="bg-gray-100 px-1 py-0.5 rounded text-[11px] font-mono text-gray-700">${part}</code>
            <span class="text-gray-400 text-[10px]">fixed</span>
          </div>
        `;
      }
    });

    return `<div class="flex flex-col gap-0.5">${items}</div>`;
  };

  $effect(() => {
    if (!isActive) return;

    const savedTemplate = $advancedTemplate;

    if (!isOverwriteActive && savedTemplate !== $settings.template) {
      originalTemplate = savedTemplate;
      $settings.template = savedTemplate;
      setText(savedTemplate);
      return;
    }

    const current = $settings.template;
    if (!isOverwriteActive) {
      originalTemplate = current;
      $advancedTemplate = current;
      setText(current);
    }
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex w-full gap-2 items-center">
    <Input
      type="text"
      bind:value={overwriteInput}
      placeholder="Template Overwrite (Auto-reset in 30s)"
      oninput={() => {
        if (overwriteTimer) {
          clearTimeout(overwriteTimer);
          overwriteTimer = null;
        }
        if (overwriteInput.trim() === "") {
          isOverwriteActive = false;
          $settings.template = originalTemplate;
        } else {
          isOverwriteActive = true;
          $settings.template = overwriteInput;
          overwriteTimer = setTimeout(() => {
            overwriteInput = "";
            isOverwriteActive = false;
            $settings.template = originalTemplate;
            overwriteTimer = null;
          }, 30000);
        }
      }}
    />
    <Button
      variant="outline"
      onclick={() => {
        overwriteInput = "";
        if (overwriteTimer) {
          clearTimeout(overwriteTimer);
          overwriteTimer = null;
        }
        isOverwriteActive = false;
        $settings.template = originalTemplate;
      }}>Reset</Button
    >
  </div>
  <div class="flex gap-2">
    <Card.Root
      class="p-2 flex flex-col gap-2 shrink-0 max-w-[250px] max-h-[400px]"
    >
      <Card.Title>Insert Placeholders</Card.Title>
      <div class="flex flex-col gap-1 overflow-auto">
        {#each $placeholders as ph}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger class="w-full">
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger class="w-full">
                    <Button variant="outline" size="sm" class="w-full">
                      <code
                        class="font-mono text-xs bg-black/50 px-1 py-0.5 rounded text-foreground/70 truncate"
                        >{ph.params.join(";")}</code
                      >
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content class="max-w-md">
                    <div class="flex flex-col gap-1.5">
                      <p class="font-semibold text-sm text-gray-900">
                        {ph.description}
                      </p>
                      {#if ph.value}
                        <div class="text-xs flex items-center gap-1">
                          <span class="text-gray-500">Example:</span>
                          <code
                            class="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-700"
                            >{ph.value}</code
                          >
                        </div>
                      {/if}
                      {#if ph.fillText}
                        <div class="text-xs mt-0.5">
                          <p
                            class="font-medium mb-1 text-gray-600 text-[10px] uppercase tracking-wide"
                          >
                            parameters
                          </p>
                          {@html formatFillTextHTML(ph.fillText, ";")}
                        </div>
                      {/if}
                    </div>
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              <DropdownMenu.Group>
                <DropdownMenu.Item
                  onclick={() => insertText(`{{${ph.params.join(";")}}}`)}
                >
                  <BracesIcon />
                  Normal Placeholder
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onclick={() => {
                    insertText(`[[${ph.params.join(":")}]]`);
                  }}
                >
                  <BracketsIcon />
                  Inner Placeholder
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/each}
      </div>
    </Card.Root>
    <div class="flex">
      <ChatboxMonacoEditor
        onLoad={(editor) => {
          insertText = (text: string) => {
            const position = editor.getPosition();
            if (position) {
              editor.executeEdits("", [
                {
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column,
                  ),
                  text,
                  forceMoveMarkers: true,
                },
              ]);
              editor.focus();
            }
          };
          setText = (text: string) => {
            if (text && text.trim() !== editor.getValue().trim()) {
              editor.setValue(text);
            }
          };
          setText($settings.template);
        }}
        onChange={(value) => {
          if (isActive && originalTemplate !== value) {
            originalTemplate = value;
            $advancedTemplate = value;
            $settings.template = value;
          }
        }}
      />
    </div>
  </div>
  <div class="flex w-full">
    <Card.Root class="p-2 flex w-full">
      <Card.Title>Template Preview</Card.Title>
      <Textarea
        id="template-preview"
        value={$renderedTemplate}
        class="w-full h-38 font-mono bg-secondary text-foreground text-center"
        placeholder="Template preview will appear here..."
        readonly
      />
    </Card.Root>
  </div>
</div>
