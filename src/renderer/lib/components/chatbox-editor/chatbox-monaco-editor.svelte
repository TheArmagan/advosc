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

  // Global provider kaydı için flag (tüm instance'lar için tek bir provider)
  let isProviderRegistered = false;

  const {
    onLoad,
    onChange,
    width = 900,
    height = 400,
    initialValue = `// Example placeholders:\n// Normal placehodler: {{ModuleId;Param}}\n// Inner placeholder: [[ModuleId:Param]]\n// To get auto complete type {{ or [[ and then press CTRL + SPACE.\n`,
    language = "advosc-placeholders",
  }: {
    onLoad?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
    onChange?: (value: string) => void;
    width?: number;
    height?: number;
    initialValue?: string;
    language?: string;
  } = $props();

  // Örnek dinamik/live autocomplete fonksiyonu
  const getCompletions: GetCompletionsFunction = async (
    textUntilPosition,
    position,
    model
  ) => {
    // Sadece bu editörün modeli için çalış
    if (editor && model.uri.toString() !== editor.getModel()?.uri.toString()) {
      return [];
    }

    const placeholders = chatbox.getPlaceholders();

    // ÖNCELİK 1: [[ için autocomplete - inner placeholder ({{ içinde bile olsa)
    const innerPlaceholderMatch = textUntilPosition.match(/\[\[([^\]]*)$/);
    if (innerPlaceholderMatch) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textAfterPosition = lineContent.substring(position.column - 1);
      const needsClosing = !textAfterPosition.includes("]]");

      const currentText = innerPlaceholderMatch[1]; // [[ sonrası yazılan text
      const parts = chatbox.splitParams(currentText, ":");
      const lastPart = parts[parts.length - 1]?.toLowerCase() || "";

      // [[ 'nin başladığı kolon
      const placeholderStartColumn = position.column - currentText.length;

      // Params'a göre dedupe
      const seenParams = new Set<string>();

      return placeholders
        .filter((placeholder) => {
          // Eğer henüz bir şey yazılmadıysa hepsini göster
          if (!lastPart) return true;
          // Son yazılan kısım ile eşleşenleri göster
          return placeholder.params.some((param) =>
            param.toLowerCase().includes(lastPart)
          );
        })
        .filter((placeholder) => {
          // Params kombinasyonuna göre dedupe
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
          return {
            label: `${placeholder.params.join(";")}`,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: needsClosing ? `${insertBase}]]` : `${insertBase}`,
            detail: placeholder.description,
            documentation: `**Inner Placeholder**\n\n${placeholder.description}\n\n**Example:** \`${placeholder.value}\`\n\n**Params:** \`${placeholder.params.join(", ")}\``,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: placeholderStartColumn,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          };
        });
    }

    // ÖNCELİK 2: {{ için autocomplete - normal placeholder
    const normalPlaceholderMatch = textUntilPosition.match(/{{([^}]*)$/);
    if (normalPlaceholderMatch) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textAfterPosition = lineContent.substring(position.column - 1);
      const needsClosing = !textAfterPosition.includes("}}");

      const currentText = normalPlaceholderMatch[1]; // {{ sonrası yazılan text
      const parts = chatbox.splitParams(currentText, ";");
      const lastPart = parts[parts.length - 1]?.toLowerCase() || "";

      // {{ 'nin başladığı kolon
      const placeholderStartColumn = position.column - currentText.length;

      // Params'a göre dedupe
      const seenParams = new Set<string>();

      return placeholders
        .filter((placeholder) => {
          // Eğer henüz bir şey yazılmadıysa hepsini göster
          if (!lastPart) return true;
          // Son yazılan kısım ile eşleşenleri göster
          return placeholder.params.some((param) =>
            param.toLowerCase().includes(lastPart)
          );
        })
        .filter((placeholder) => {
          // Params kombinasyonuna göre dedupe
          const paramsKey = placeholder.params.join(";");
          if (seenParams.has(paramsKey)) {
            return false;
          }
          seenParams.add(paramsKey);
          return true;
        })
        .map((placeholder) => ({
          label: `${placeholder.params.join(";")}`,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: needsClosing
            ? `${placeholder.fillText ?? placeholder.params.join(";")}}}`
            : `${placeholder.fillText ?? placeholder.params.join(";")}`,
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

    return [];
  };

  // Hover bilgisi döndüren fonksiyon
  const getHoverInfo: GetHoverInfoFunction = async (word, position, model) => {
    const placeholders = chatbox.getPlaceholders();

    // Cursor'un bulunduğu satırı al
    const lineContent = model.getLineContent(position.lineNumber);

    // {{ }} veya [[ ]] içinde mi kontrol et
    const cursorColumn = position.column;

    let match;

    // Inner placeholder [[...]] kontrolü
    const innerPlaceholderRegex = /\[\[([^\]]*)\]\]/g;
    while ((match = innerPlaceholderRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = match.index + match[0].length + 1;

      if (cursorColumn >= startCol && cursorColumn <= endCol) {
        const placeholderText = match[1];
        const parts = chatbox.splitParams(placeholderText, ":");

        const placeholder = placeholders.find((p) =>
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

    // Normal placeholder {{...}} kontrolü
    const normalPlaceholderRegex = /{{([^}]*)}}/g;

    while ((match = normalPlaceholderRegex.exec(lineContent)) !== null) {
      const startCol = match.index + 1;
      const endCol = match.index + match[0].length + 1;

      if (cursorColumn >= startCol && cursorColumn <= endCol) {
        const placeholderText = match[1];
        const parts = chatbox.splitParams(placeholderText, ";");

        const placeholder = placeholders.find((p) =>
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
    await import("../../editor/monaco-worker");
    // monaco-lib'den monaco'yu al
    monaco = (await import("../../editor/monaco-lib")).default;

    // Highlighting'i kaydet (sadece ilk instance için, tekrar kayıt yapmamak için kontrol et)
    try {
      const languages = monaco.languages.getLanguages();
      isHighlightingRegistered = languages.some(
        (lang) => lang.id === "advosc-placeholders"
      );

      if (!isHighlightingRegistered) {
        highlightDisposable = registerRegexHighlighting(
          "advosc-placeholders",
          highlightRules
        );
        isHighlightingRegistered = true;
      }
    } catch (e) {
      // Dil zaten kayıtlıysa hata vermez, devam eder
    }

    editor = monaco.editor.create(editorContainer, {
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      theme: "advosc-theme",
      minimap: { enabled: false },
    });

    const model = monaco.editor.createModel(
      initialValue,
      language,
      monaco.Uri.parse(`inmemory://${modelId}`)
    );

    editor.setModel(model);

    // Provider'ı global olarak sadece bir kere kaydet (tüm editörler için)
    if (!isProviderRegistered) {
      registerDynamicAutocomplete(language, getCompletions, getHoverInfo);
      isProviderRegistered = true;
    }

    onLoad?.(editor);

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      onChange?.(value);
    });
  });

  onDestroy(() => {
    // Highlighting'i sadece bu instance kaydettiyse dispose et
    if (highlightDisposable && isHighlightingRegistered) {
      highlightDisposable?.dispose();
    }
    // Sadece bu editöre ait modeli dispose et
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
