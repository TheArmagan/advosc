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
  import Label from "../ui/label/label.svelte";

  let insertText = (text: string) => {};

  const settings = chatbox.settings;
  const renderedTempalteText = chatbox.renderedTempalteText;
  const placeholders = chatbox.placeholders;
</script>

<div class="flex flex-col gap-2">
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
                  <Tooltip.Content>
                    <p>{ph.description}</p>
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
                  onclick={() => insertText(`[[${ph.params.join(":")}]]`)}
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
                    position.column
                  ),
                  text,
                  forceMoveMarkers: true,
                },
              ]);
              editor.focus();
            }
          };
          editor.setValue($settings.template);
        }}
        onChange={(value) => {
          $settings.template = value;
        }}
      />
    </div>
  </div>
  <div class="flex w-full">
    <Card.Root class="p-2 flex w-full">
      <Card.Title>Tempalte Preview</Card.Title>
      <Textarea
        id="template-preview"
        value={$renderedTempalteText}
        class="w-full h-48 font-mono bg-secondary text-foreground text-center"
        placeholder="Template preview will appear here..."
        readonly
      />
    </Card.Root>
  </div>
</div>
