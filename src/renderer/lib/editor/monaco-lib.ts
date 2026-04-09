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
  range?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

export interface HoverInfo {
  value: string; // Supports Markdown
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
 * Simple infrastructure for regex-based autocomplete
 * @param languageId Language ID (e.g. 'javascript', 'text')
 * @param rules Autocomplete rules
 * @returns Dispose function
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

      // Find the start position of the current word
      const wordUntilPosition = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntilPosition.startColumn,
        endColumn: wordUntilPosition.endColumn,
      };

      // Check each rule
      for (const rule of rules) {
        const match = textUntilPosition.match(rule.pattern);
        if (match) {
          // Add suggestions from the matching rule
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
 * Dynamic/live API-based autocomplete - fetches suggestions at runtime
 * @param languageId Language ID
 * @param getCompletions Function that returns suggestions (can be async)
 * @param getHoverInfo Function that returns hover info (optional, can be async)
 * @param triggerCharacters Trigger characters (optional)
 * @returns Dispose handlers
 */
export function registerDynamicAutocomplete(
  languageId: string,
  getCompletions: GetCompletionsFunction,
  getHoverInfo?: GetHoverInfoFunction,
  triggerCharacters?: string[]
): monaco.IDisposable {
  const disposables: monaco.IDisposable[] = [];

  // Register autocomplete provider
  const completionDisposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: triggerCharacters ?? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '.', '(', '['],
    provideCompletionItems: async (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Find the start position of the current word
      const wordUntilPosition = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntilPosition.startColumn,
        endColumn: wordUntilPosition.endColumn,
      };

      try {
        // Get suggestions dynamically (can be async)
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
            range: suggestion.range ?? range, // Custom range or default range
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

  // If a hover function exists, register the hover provider too
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
  token: string; // Monaco token type: 'keyword', 'string', 'comment', 'number', 'type', etc.
}

/**
 * Regex-based syntax highlighting
 * @param languageId Language ID
 * @param rules Highlighting rules
 * @returns Dispose function
 */
export function registerRegexHighlighting(
  languageId: string,
  rules: RegexHighlightRule[]
): monaco.IDisposable {
  // Register language
  monaco.languages.register({ id: languageId });

  // Configure tokenizer
  monaco.languages.setMonarchTokensProvider(languageId, {
    tokenizer: {
      root: rules.map((rule) => {
        // Convert RegExp to string form (remove / delimiters)
        const pattern = rule.pattern.source;
        return [new RegExp(pattern), rule.token];
      }),
    },
  });

  // Configure theme colors
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
      // Dispose logic can be added here if needed
    },
  };
}

export default monaco;