import * as monaco from 'monaco-editor';

export interface RegexAutocompleteSuggestion {
  pattern: RegExp;
  suggestions: {
    label: string;
    insertText: string;
    detail?: string;
    documentation?: string;
    kind?: monaco.languages.CompletionItemKind;
  }[];
}

export interface DynamicAutocompleteSuggestion {
  label: string;
  insertText: string;
  detail?: string;
  documentation?: string;
  kind?: monaco.languages.CompletionItemKind;
}

export interface HoverInfo {
  value: string; // Markdown destekler
  isTrusted?: boolean;
}

export type GetCompletionsFunction = (
  textUntilPosition: string,
  position: monaco.Position,
  model: monaco.editor.ITextModel
) => DynamicAutocompleteSuggestion[] | Promise<DynamicAutocompleteSuggestion[]>;

export type GetHoverInfoFunction = (
  word: string,
  position: monaco.Position,
  model: monaco.editor.ITextModel
) => HoverInfo | null | Promise<HoverInfo | null>;

/**
 * Regex tabanlı autocomplete için basit altyapı
 * @param languageId Dil ID'si (örn: 'javascript', 'text')
 * @param rules Autocomplete kuralları
 * @returns Dispose fonksiyonu
 */
export function registerRegexAutocomplete(
  languageId: string,
  rules: RegexAutocompleteSuggestion[]
): monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Kelimenin başlangıç pozisyonunu bul
      const wordUntilPosition = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntilPosition.startColumn,
        endColumn: wordUntilPosition.endColumn,
      };

      // Her kural için kontrol yap
      for (const rule of rules) {
        const match = textUntilPosition.match(rule.pattern);
        if (match) {
          // Eşleşen kuralın önerilerini ekle
          for (const suggestion of rule.suggestions) {
            suggestions.push({
              label: suggestion.label,
              kind: suggestion.kind ?? monaco.languages.CompletionItemKind.Snippet,
              insertText: suggestion.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: suggestion.detail,
              documentation: suggestion.documentation,
              range: range,
            });
          }
        }
      }

      return { suggestions };
    },
  });
}

/**
 * Dinamik/Live API tabanlı autocomplete - runtime'da öneriler alır
 * @param languageId Dil ID'si
 * @param getCompletions Önerileri döndüren fonksiyon (async olabilir)
 * @param getHoverInfo Hover bilgisi döndüren fonksiyon (opsiyonel, async olabilir)
 * @param triggerCharacters Tetikleyici karakterler (opsiyonel)
 * @returns Dispose fonksiyonları
 */
export function registerDynamicAutocomplete(
  languageId: string,
  getCompletions: GetCompletionsFunction,
  getHoverInfo?: GetHoverInfoFunction,
  triggerCharacters?: string[]
): monaco.IDisposable {
  const disposables: monaco.IDisposable[] = [];

  // Autocomplete provider'ı kaydet
  const completionDisposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: triggerCharacters ?? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '.', '(', '['],
    provideCompletionItems: async (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Kelimenin başlangıç pozisyonunu bul
      const wordUntilPosition = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntilPosition.startColumn,
        endColumn: wordUntilPosition.endColumn,
      };

      try {
        // Dinamik olarak önerileri al (async olabilir)
        const dynamicSuggestions = await getCompletions(textUntilPosition, position, model);

        const suggestions: monaco.languages.CompletionItem[] = dynamicSuggestions.map(
          (suggestion) => ({
            label: suggestion.label,
            kind: suggestion.kind ?? monaco.languages.CompletionItemKind.Snippet,
            insertText: suggestion.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: suggestion.detail,
            documentation: suggestion.documentation
              ? { value: suggestion.documentation, isTrusted: true }
              : undefined,
            range: range,
          })
        );

        return { suggestions };
      } catch (error) {
        console.error('Dynamic autocomplete error:', error);
        return { suggestions: [] };
      }
    },
  });

  disposables.push(completionDisposable);

  // Eğer hover fonksiyonu varsa, hover provider'ı da kaydet
  if (getHoverInfo) {
    const hoverDisposable = monaco.languages.registerHoverProvider(languageId, {
      provideHover: async (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        try {
          const hoverInfo = await getHoverInfo(word.word, position, model);
          if (!hoverInfo) return null;

          return {
            range: new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn
            ),
            contents: [
              { value: hoverInfo.value, isTrusted: hoverInfo.isTrusted ?? false }
            ],
          };
        } catch (error) {
          console.error('Hover provider error:', error);
          return null;
        }
      },
    });

    disposables.push(hoverDisposable);
  }

  return {
    dispose: () => {
      disposables.forEach(d => d.dispose());
    }
  };
}

export interface RegexHighlightRule {
  pattern: RegExp;
  token: string; // Monaco token tipi: 'keyword', 'string', 'comment', 'number', 'type', vb.
}

/**
 * Regex tabanlı syntax highlighting
 * @param languageId Dil ID'si
 * @param rules Highlighting kuralları
 * @returns Dispose fonksiyonu
 */
export function registerRegexHighlighting(
  languageId: string,
  rules: RegexHighlightRule[]
): monaco.IDisposable {
  // Dili kaydet
  monaco.languages.register({ id: languageId });

  // Tokenizer'ı ayarla
  monaco.languages.setMonarchTokensProvider(languageId, {
    tokenizer: {
      root: rules.map((rule) => {
        // RegExp'i string'e çevir (/ karakterlerini kaldır)
        const pattern = rule.pattern.source;
        return [new RegExp(pattern), rule.token];
      }),
    },
  });

  // Tema renklerini ayarla
  monaco.editor.defineTheme('advosc-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'advosc.placeholder', foreground: 'FF8800', fontStyle: 'underline' },
      { token: 'advosc.innerPlaceholder', foreground: '00AAFF', fontStyle: 'underline' },
    ],
    colors: {},
  });

  return {
    dispose: () => {
      // Dispose işlemi gerekirse buraya eklenebilir
    },
  };
}

export default monaco;