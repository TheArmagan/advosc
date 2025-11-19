<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
  import {
    registerRegexAutocomplete,
    registerDynamicAutocomplete,
    registerRegexHighlighting,
    type RegexAutocompleteSuggestion,
    type GetCompletionsFunction,
    type GetHoverInfoFunction,
    type RegexHighlightRule,
  } from "../editor/monaco-lib";
  import { chatboxModules } from "$lib/api/chatbox";

  let editor: Monaco.editor.IStandaloneCodeEditor;
  let monaco: typeof Monaco;
  let editorContainer: HTMLElement;
  let dynamicAutocompleteDisposable: Monaco.IDisposable | null = null;
  let highlightDisposable: Monaco.IDisposable | null = null;

  // Örnek dinamik/live autocomplete fonksiyonu
  const getCompletions: GetCompletionsFunction = async (
    textUntilPosition,
    position,
    model
  ) => {
    const placeholders = chatboxModules.getExamplePlaceholders();

    // {{ için autocomplete - başlangıç veya devamı
    const normalPlaceholderMatch = textUntilPosition.match(/{{([^}]*)$/);
    if (normalPlaceholderMatch) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textAfterPosition = lineContent.substring(position.column - 1);
      const needsClosing = !textAfterPosition.includes("}}");

      const currentText = normalPlaceholderMatch[1]; // {{ sonrası yazılan text
      const parts = currentText.split(";");
      const lastPart = parts[parts.length - 1]?.toLowerCase() || "";

      // {{ 'nin başladığı kolon
      const placeholderStartColumn = position.column - currentText.length;

      return placeholders
        .filter((placeholder) => {
          // Eğer henüz bir şey yazılmadıysa hepsini göster
          if (!lastPart) return true;
          // Son yazılan kısım ile eşleşenleri göster
          return placeholder.params.some((param) =>
            param.toLowerCase().includes(lastPart)
          );
        })
        .map((placeholder) => ({
          label: `${placeholder.params.join(";")}`,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: needsClosing
            ? `${placeholder.params.join(";")}}}`
            : `${placeholder.params.join(";")}`,
          detail: placeholder.description,
          documentation: `**Normal Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: placeholderStartColumn,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        }));
    }

    // [[ için autocomplete - başlangıç veya devamı
    const innerPlaceholderMatch = textUntilPosition.match(/\[\[([^\]]*)$/);
    if (innerPlaceholderMatch) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textAfterPosition = lineContent.substring(position.column - 1);
      const needsClosing = !textAfterPosition.includes("]]");

      const currentText = innerPlaceholderMatch[1]; // [[ sonrası yazılan text
      const parts = currentText.split(":");
      const lastPart = parts[parts.length - 1]?.toLowerCase() || "";

      // [[ 'nin başladığı kolon
      const placeholderStartColumn = position.column - currentText.length;

      return placeholders
        .filter((placeholder) => {
          // Eğer henüz bir şey yazılmadıysa hepsini göster
          if (!lastPart) return true;
          // Son yazılan kısım ile eşleşenleri göster
          return placeholder.params.some((param) =>
            param.toLowerCase().includes(lastPart)
          );
        })
        .map((placeholder) => ({
          label: `${placeholder.params.join(";")}`,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: needsClosing
            ? `${placeholder.params.join(":")}]]`
            : `${placeholder.params.join(":")}`,
          detail: placeholder.description,
          documentation: `**Inner Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: placeholderStartColumn,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
        }));
    }

    return [];
  };

  // Hover bilgisi döndüren fonksiyon
  const getHoverInfo: GetHoverInfoFunction = async (word, position, model) => {
    const examplePlaceholders = chatboxModules.getExamplePlaceholders();

    // Cursor'un bulunduğu satırı al
    const lineContent = model.getLineContent(position.lineNumber);

    // {{ }} veya [[ ]] içinde mi kontrol et
    const cursorColumn = position.column;

    // Normal placeholder {{...}} kontrolü
    const normalPlaceholderRegex = /{{([^}]*)}}/g;
    let match;
    while ((match = normalPlaceholderRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = match.index + match[0].length + 1;

      if (cursorColumn >= startCol && cursorColumn <= endCol) {
        const placeholderText = match[1];
        const parts = placeholderText.split(";");

        const placeholder = examplePlaceholders.find((p) =>
          p.params.every((param) => parts.includes(param))
        );

        if (placeholder) {
          return {
            value: `**Normal Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``,
            isTrusted: true,
          };
        }
      }
    }

    // Inner placeholder [[...]] kontrolü
    const innerPlaceholderRegex = /\[\[([^\]]*)\]\]/g;
    while ((match = innerPlaceholderRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = match.index + match[0].length + 1;

      if (cursorColumn >= startCol && cursorColumn <= endCol) {
        const placeholderText = match[1];
        const parts = placeholderText.split(":");

        const placeholder = examplePlaceholders.find((p) =>
          p.params.every((param) => parts.includes(param))
        );

        if (placeholder) {
          return {
            value: `**Inner Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``,
            isTrusted: true,
          };
        }
      }
    }

    return null;
  };

  // Örnek highlighting kuralları
  const highlightRules: RegexHighlightRule[] = [
    { pattern: /"[^"]*"/, token: "string" },
    { pattern: /'[^']*'/, token: "string" },
    { pattern: /\/\/.*$/, token: "comment" },
    { pattern: /\b\d+\b/, token: "number" },
    { pattern: /{{[^}]*}}/, token: "advosc.placeholder" },
    { pattern: /\[\[[^\]]*\]\]/, token: "advosc.innerPlaceholder" },
  ];

  onMount(async () => {
    // monaco-worker'ı yükle (worker setup için)
    await import("../editor/monaco-worker");
    // monaco-lib'den monaco'yu al
    monaco = (await import("../editor/monaco-lib")).default;

    // Highlighting'i kaydet (editor oluşturmadan önce)
    highlightDisposable = registerRegexHighlighting(
      "advosc-placeholders",
      highlightRules
    );

    editor = monaco.editor.create(editorContainer, {
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      theme: "advosc-theme",
      minimap: { enabled: false },
    });
    const model = monaco.editor.createModel(
      `// Example placeholders:\n// Normal placehodler: {{ModuleId;Param}}\n// Inner placeholder: [[ModuleId:Param]]\n// To get auto complete type {{ or [[ and then press CTRL + SPACE.\n`,
      "advosc-placeholders"
    );

    editor.setModel(model);

    // Dinamik autocomplete'i kaydet (hover ile birlikte)
    dynamicAutocompleteDisposable = registerDynamicAutocomplete(
      "advosc-placeholders",
      getCompletions,
      getHoverInfo
    );
  });

  onDestroy(() => {
    dynamicAutocompleteDisposable?.dispose();
    highlightDisposable?.dispose();
    monaco?.editor.getModels().forEach((model) => model.dispose());
    editor?.dispose();
  });
</script>

<div
  style="width: 900px; height: 400px; display: flex; flex-direction: column; position: relative;"
>
  <div
    style="width: 900px; height: 400px; flex: 1;"
    bind:this={editorContainer}
  ></div>
</div>
