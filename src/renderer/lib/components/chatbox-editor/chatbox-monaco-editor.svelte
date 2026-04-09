<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
  import {
    registerDynamicAutocomplete,
    registerRegexHighlighting,
    type GetCompletionsFunction,
    type GetHoverInfoFunction,
    type RegexHighlightRule,
  } from "../../editor/monaco-lib";
  import { chatbox } from "$lib/api/chatbox";

  let editor: Monaco.editor.IStandaloneCodeEditor;
  let monaco: typeof Monaco;
  let editorContainer: HTMLElement;
  let highlightDisposable: Monaco.IDisposable | null = null;
  let isHighlightingRegistered = false;
  let modelId = `model-${Math.random().toString(36).substring(7)}`;

  // Flag for global provider registration (single provider for all instances)
  let isProviderRegistered = false;

  let {
    onLoad,
    onChange,
    width = 900,
    height = 400,
    value = $bindable(
      `// Example placeholders:\n// Normal placehodler: {{ModuleId;Param}}\n// Inner placeholder: [[ModuleId:Param]]\n// To get auto complete type {{ or [[ and then press CTRL + SPACE.\n`,
    ),
    language = "advosc-placeholders",
  }: {
    onLoad?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
    onChange?: (value: string) => void;
    width?: number;
    height?: number;
    value?: string;
    language?: string;
  } = $props();

  // Dynamic/live autocomplete function
  const getCompletions: GetCompletionsFunction = async (
    textUntilPosition,
    position,
    model,
  ) => {
    // Only run for this editor's model
    if (editor && model.uri.toString() !== editor.getModel()?.uri.toString()) {
      return [];
    }

    const placeholders = chatbox.getPlaceholders();

    // PRIORITY 1: autocomplete for [[ - inner placeholders (even inside {{)
    const innerPlaceholderMatch = textUntilPosition.match(/\[\[([^\]]*)$/);
    if (innerPlaceholderMatch) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textAfterPosition = lineContent.substring(position.column - 1);
      const needsClosing = !textAfterPosition.includes("]]");

      const currentText = innerPlaceholderMatch[1]; // Text typed after [[
      const parts = chatbox.splitParams(currentText, ":");
      const lastPart = parts[parts.length - 1]?.toLowerCase() || "";

      // Column where [[ starts
      const placeholderStartColumn = position.column - currentText.length;

      // Dedupe by params
      const seenParams = new Set<string>();

      return placeholders
        .filter((placeholder) => {
          // If nothing has been typed yet, show all
          if (!lastPart) return true;
          // Show items matching the last typed part
          return placeholder.params.some((param) =>
            param.toLowerCase().includes(lastPart),
          );
        })
        .filter((placeholder) => {
          // Dedupe by parameter combination
          const paramsKey = placeholder.params.join(";");
          if (seenParams.has(paramsKey)) {
            return false;
          }
          seenParams.add(paramsKey);
          return true;
        })
        .map((placeholder) => {
          const insertBase = placeholder.fillText
            ? chatbox.splitParams(placeholder.fillText, ";").join(":")
            : placeholder.params.join(":");

          let documentation = `**Inner Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``;

          if (placeholder.fillText) {
            const formatted = formatFillText(placeholder.fillText, ":");
            documentation += `\n\n${formatted}`;
          }

          return {
            label: `${placeholder.params.join(";")}`,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: needsClosing ? `${insertBase}]]` : `${insertBase}`,
            detail: placeholder.description,
            documentation,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: placeholderStartColumn,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          };
        });
    }

    // PRIORITY 2: autocomplete for {{ - normal placeholders
    const normalPlaceholderMatch = textUntilPosition.match(/{{([^}]*)$/);
    if (normalPlaceholderMatch) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textAfterPosition = lineContent.substring(position.column - 1);
      const needsClosing = !textAfterPosition.includes("}}");

      const currentText = normalPlaceholderMatch[1]; // Text typed after {{
      const parts = chatbox.splitParams(currentText, ";");
      const lastPart = parts[parts.length - 1]?.toLowerCase() || "";

      // Column where {{ starts
      const placeholderStartColumn = position.column - currentText.length;

      // Dedupe by params
      const seenParams = new Set<string>();

      return placeholders
        .filter((placeholder) => {
          // If nothing has been typed yet, show all
          if (!lastPart) return true;
          // Show items matching the last typed part
          return placeholder.params.some((param) =>
            param.toLowerCase().includes(lastPart),
          );
        })
        .filter((placeholder) => {
          // Dedupe by parameter combination
          const paramsKey = placeholder.params.join(";");
          if (seenParams.has(paramsKey)) {
            return false;
          }
          seenParams.add(paramsKey);
          return true;
        })
        .map((placeholder) => {
          let documentation = `**Normal Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``;

          if (placeholder.fillText) {
            const formatted = formatFillText(placeholder.fillText, ";");
            documentation += `\n\n${formatted}`;
          }

          return {
            label: `${placeholder.params.join(";")}`,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: needsClosing
              ? `${placeholder.fillText ?? placeholder.params.join(";")}}}`
              : `${placeholder.fillText ?? placeholder.params.join(";")}`,
            detail: placeholder.description,
            documentation,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: placeholderStartColumn,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          };
        });
    }

    return [];
  };

  // Parse fillText and format it - list each argument on its own line
  const formatFillText = (
    fillText: string,
    separator: string = ";",
  ): string => {
    // Text;Animate;Marquee;${1:inputText};${2:Left|Right};${3:maxLength}
    const parts = chatbox.splitParams(fillText, separator);

    let result = "**Arguments:**\n";

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
            result += `\n${index + 1}. **${options[0]}...** (Options: ${options.join(", ")}) *(repeatable)*`;
          } else {
            result += `\n${index + 1}. **${paramName}...** *(repeatable)*`;
          }
        }
        // Split options like Left|Right
        else if (content.includes("|")) {
          const options = content.split("|");
          result += `\n${index + 1}. **${content.split("|")[0]}** (Options: ${options.join(", ")})`;
        } else {
          result += `\n${index + 1}. **${content}**`;
        }
      } else {
        // Normal parameter (fixed value)
        result += `\n${index + 1}. \`${part}\` (fixed)`;
      }
    });

    return result;
  };

  // Function that returns hover information
  const getHoverInfo: GetHoverInfoFunction = async (word, position, model) => {
    // Only run for this editor's model
    if (editor && model.uri.toString() !== editor.getModel()?.uri.toString()) {
      return null;
    }

    const placeholders = chatbox.getPlaceholders();

    // Get the line where the cursor is located
    const lineContent = model.getLineContent(position.lineNumber);

    // Check whether the cursor is inside {{ }} or [[ ]]
    const cursorColumn = position.column;

    let match;

    // Check inner placeholder [[...]]
    const innerPlaceholderRegex = /\[\[([^\]]*)\]\]/g;
    while ((match = innerPlaceholderRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = match.index + match[0].length + 1;

      if (cursorColumn >= startCol && cursorColumn <= endCol) {
        const placeholderText = match[1];
        const parts = chatbox.splitParams(placeholderText, ":");

        const placeholder = placeholders.find((p) =>
          p.params.every((param) => parts.includes(param)),
        );

        if (placeholder) {
          let hoverText = `**Inner Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``;

          if (placeholder.fillText) {
            const formatted = formatFillText(placeholder.fillText, ":");
            hoverText += `\n\n${formatted}`;
          }

          return {
            value: hoverText,
            isTrusted: true,
          };
        }
      }
    }

    // Check normal placeholder {{...}}
    const normalPlaceholderRegex = /{{([^}]*)}}/g;

    while ((match = normalPlaceholderRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = match.index + match[0].length + 1;

      if (cursorColumn >= startCol && cursorColumn <= endCol) {
        const placeholderText = match[1];
        const parts = chatbox.splitParams(placeholderText, ";");

        const placeholder = placeholders.find((p) =>
          p.params.every((param) => parts.includes(param)),
        );

        if (placeholder) {
          let hoverText = `**Normal Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``;

          if (placeholder.fillText) {
            const formatted = formatFillText(placeholder.fillText, ";");
            hoverText += `\n\n${formatted}`;
          }

          return {
            value: hoverText,
            isTrusted: true,
          };
        }
      }
    }

    return null;
  };

  // Example highlighting rules
  const highlightRules: RegexHighlightRule[] = [
    { pattern: /\/\/.*$/, token: "comment" },
    { pattern: /{{[^}]*}}/, token: "advosc.placeholder" },
    { pattern: /\[\[[^\]]*\]\]/, token: "advosc.innerPlaceholder" },
  ];

  // Update the editor when the value prop changes
  $effect(() => {
    if (editor && value !== editor.getValue()) {
      const position = editor.getPosition();
      editor.setValue(value);
      if (position) {
        editor.setPosition(position);
      }
    }
  });

  onMount(async () => {
    // Load monaco-worker (for worker setup)
    await import("../../editor/monaco-worker");
    // Get monaco from monaco-lib
    monaco = (await import("../../editor/monaco-lib")).default;

    // Register highlighting (only for the first instance, avoid duplicate registration)
    try {
      const languages = monaco.languages.getLanguages();
      isHighlightingRegistered = languages.some(
        (lang) => lang.id === "advosc-placeholders",
      );

      if (!isHighlightingRegistered) {
        highlightDisposable = registerRegexHighlighting(
          "advosc-placeholders",
          highlightRules,
        );
        isHighlightingRegistered = true;
      }
    } catch (e) {
      // If the language is already registered, continue without failing
    }

    editor = monaco.editor.create(editorContainer, {
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      theme: "advosc-theme",
      minimap: { enabled: false },
    });

    const model = monaco.editor.createModel(
      value,
      language,
      monaco.Uri.parse(`inmemory://${modelId}`),
    );

    editor.setModel(model);

    // Register the provider globally only once (for all editors)
    if (!isProviderRegistered) {
      registerDynamicAutocomplete(language, getCompletions, getHoverInfo);
      isProviderRegistered = true;
    }

    onLoad?.(editor);

    editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      value = newValue;
      onChange?.(newValue);
    });
  });

  onDestroy(() => {
    // Dispose highlighting only if this instance registered it
    if (highlightDisposable && isHighlightingRegistered) {
      highlightDisposable?.dispose();
    }
    // Dispose only the model belonging to this editor
    editor?.getModel()?.dispose();
    editor?.dispose();
  });
</script>

<div
  class="flex flex-col relative"
  style="width: {width}px; height: {height}px;"
>
  <div
    style="width: {width}px; height: {height}px; flex: 1;"
    bind:this={editorContainer}
  ></div>
</div>
