import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type BeforeMount, type Monaco, type OnMount, type OnValidate } from '@monaco-editor/react';
import type { editor, languages, Position } from 'monaco-editor';
import Modal, { ModalHeader } from './Modal';

type CodeEditorLanguage = string;
type CodeEditorLineNumbers = boolean | editor.IStandaloneEditorConstructionOptions['lineNumbers'];

export interface CodeEditorSuggestion {
  label: string;
  insertText?: string;
  kind?: string | number;
  insertTextRules?: languages.CompletionItemInsertTextRule;
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
  scope?: string | string[];
}

export interface CodeEditorExtraLib {
  content: string;
  filePath: string;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: CodeEditorLanguage;
  path?: string;
  defaultPath?: string;
  line?: number;
  title?: string;
  height?: string | number;
  minHeight?: string | number;
  disabled?: boolean;
  placeholder?: string;
  fullscreen?: boolean;
  className?: string;
  compact?: boolean;
  lineNumbers?: CodeEditorLineNumbers;
  suggestions?: CodeEditorSuggestion[];
  suggestionTriggerCharacters?: string[];
  theme?: 'vs-dark' | 'light' | string;
  loading?: React.ReactNode;
  options?: editor.IStandaloneEditorConstructionOptions;
  beforeMount?: BeforeMount;
  onMount?: OnMount;
  onValidate?: OnValidate;
  onFocus?: () => void;
  onBlur?: () => void;
  extraLibs?: CodeEditorExtraLib[];
  autoSuggestPolicy?: 'explicit' | 'contextual' | 'json-contextual';
  suggestionContextResolver?: (context: { fullPrefix: string; linePrefix: string; completionPrefix: string }) => string;
}

const baseOptions: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: 'line',
  fontFamily: '"SF Mono", "SFMono-Regular", Consolas, monospace',
  fontSize: 12,
  lineHeight: 20,
  tabSize: 2,
  padding: { top: 10, bottom: 10 },
  wordWrap: 'on',
  quickSuggestions: { other: true, comments: false, strings: true },
  suggestOnTriggerCharacters: true,
  inlineSuggest: { enabled: false },
  snippetSuggestions: 'top',
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'off',
  accessibilitySupport: 'off',
};

function toCssSize(value: string | number | undefined) {
  if (typeof value === 'number') return `${value}px`;
  return value;
}

function normalizeLineNumbers(lineNumbers: CodeEditorLineNumbers | undefined) {
  if (typeof lineNumbers === 'boolean') return lineNumbers ? 'on' : 'off';
  return lineNumbers ?? 'on';
}

function resolveSuggestionKind(monaco: Monaco, kind: CodeEditorSuggestion['kind']) {
  if (typeof kind === 'number') return kind;
  if (kind && kind in monaco.languages.CompletionItemKind) {
    return monaco.languages.CompletionItemKind[kind as keyof typeof monaco.languages.CompletionItemKind];
  }
  return monaco.languages.CompletionItemKind.Snippet;
}

type SuggestionMode = string;

function resolveCompletionInsertText(item: CodeEditorSuggestion, completionPrefix: string, mode: SuggestionMode) {
  const rawInsertText = item.insertText ?? item.label;
  if (completionPrefix.endsWith('$') && rawInsertText.startsWith('$')) {
    return rawInsertText.slice(1);
  }
  if (completionPrefix.endsWith('ctx.') && rawInsertText.startsWith('ctx.')) {
    return rawInsertText.slice(4);
  }
  if (completionPrefix.endsWith('ctx.values.') && rawInsertText.startsWith('ctx.values.')) {
    return rawInsertText.slice('ctx.values.'.length);
  }
  if (completionPrefix.endsWith('ctx.detail.') && rawInsertText.startsWith('ctx.detail.')) {
    return rawInsertText.slice('ctx.detail.'.length);
  }
  if ((mode === 'json-object-key' || mode === 'json-string-value') && /^".*"$/.test(rawInsertText)) {
    return rawInsertText.slice(1, -1);
  }
  return rawInsertText;
}

function resolveCompletionDisplay(item: CodeEditorSuggestion, completionPrefix: string) {
  const rawLabel = item.label;
  const rawFilterText = item.filterText ?? rawLabel;

  if (completionPrefix.endsWith('ctx.values.')) {
    if (rawLabel.startsWith('ctx.values.')) {
      const suffix = rawLabel.slice('ctx.values.'.length);
      return {
        label: suffix,
        filterText: suffix,
        detail: item.detail ? `${rawLabel} · ${item.detail}` : rawLabel,
      };
    }
  }

  if (completionPrefix.endsWith('ctx.')) {
    if (rawLabel.startsWith('ctx.')) {
      const suffix = rawLabel.slice(4);
      return {
        label: suffix,
        filterText: rawFilterText.startsWith('ctx.') ? rawFilterText.slice(4) : suffix,
        detail: item.detail ? `${rawLabel} · ${item.detail}` : rawLabel,
      };
    }
  }

  return {
    label: rawLabel,
    filterText: rawFilterText,
    detail: item.detail,
  };
}

function getQuotedFragment(prefix: string) {
  const single = prefix.match(/'([^']*)$/);
  if (single) return single[1];
  const double = prefix.match(/"([^"]*)$/);
  if (double) return double[1];
  return '';
}

function inferJsonCompletionMode(prefix: string): SuggestionMode {
  const stack: Array<{ type: 'object' | 'array'; state: 'key' | 'value' | 'after-value' }> = [];
  let inString = false;
  let escaped = false;
  let stringContext: 'key' | 'value' = 'value';

  const markValueConsumed = () => {
    const top = stack[stack.length - 1];
    if (top) top.state = 'after-value';
  };

  for (let index = 0; index < prefix.length; index += 1) {
    const char = prefix[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
        if (stringContext === 'value') markValueConsumed();
      }
      continue;
    }

    if (/\s/.test(char)) continue;

    const top = stack[stack.length - 1];

    if (char === '"') {
      inString = true;
      stringContext = top?.type === 'object' && top.state === 'key' ? 'key' : 'value';
      continue;
    }

    if (char === '{') {
      if (top?.state === 'value') markValueConsumed();
      stack.push({ type: 'object', state: 'key' });
      continue;
    }

    if (char === '[') {
      if (top?.state === 'value') markValueConsumed();
      stack.push({ type: 'array', state: 'value' });
      continue;
    }

    if (char === ':' && top?.type === 'object') {
      top.state = 'value';
      continue;
    }

    if (char === ',' && top) {
      top.state = top.type === 'object' ? 'key' : 'value';
      continue;
    }

    if (char === '}' || char === ']') {
      stack.pop();
      markValueConsumed();
      continue;
    }

    if (top?.state === 'value') {
      markValueConsumed();
    }
  }

  const top = stack[stack.length - 1];
  if (inString) return stringContext === 'key' ? 'json-object-key' : 'json-string-value';
  if (!top) return 'top-level';
  if (top.type === 'object') return top.state === 'key' ? 'json-object-key' : 'json-object-value';
  return top.state === 'value' ? 'json-array-value' : 'top-level';
}

function resolveCompletionMode(language: CodeEditorLanguage, fullPrefix: string, completionPrefix: string): SuggestionMode {
  if (language === 'json') return inferJsonCompletionMode(fullPrefix);
  const normalized = fullPrefix.replace(/\s+/g, ' ');
  if (/ctx\.(?:getValue|setValue)\(\s*['"][^'"]*$/.test(normalized)) return 'field-name';
  if (completionPrefix.endsWith('ctx.detail.')) return 'ctx-detail-member';
  if (completionPrefix.endsWith('ctx.values.')) return 'ctx-values-member';
  if (completionPrefix.endsWith('ctx.')) return 'ctx-member';
  return 'top-level';
}

function resolveCompletionContext(item: CodeEditorSuggestion, mode: SuggestionMode) {
  const scopes = Array.isArray(item.scope) ? item.scope : [item.scope || 'any'];
  return scopes.includes('any') || scopes.includes(mode);
}

function matchesCompletionQuery(
  query: string,
  item: CodeEditorSuggestion,
  display: { label: string; filterText?: string; detail?: string },
) {
  if (!query) return true;
  const haystacks = [
    display.label,
    display.filterText,
    item.label,
    item.filterText,
    item.detail,
    display.detail,
    item.documentation,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return haystacks.some((value) => value.includes(query));
}

function resolveCompletionQuery(
  language: CodeEditorLanguage,
  mode: SuggestionMode,
  fullPrefix: string,
  word: editor.IWordAtPosition,
) {
  if (mode === 'field-name' || mode === 'json-object-key' || mode === 'json-string-value') {
    return getQuotedFragment(fullPrefix).trim().toLowerCase();
  }
  if (language === 'json' && mode === 'json-object-value') {
    return getQuotedFragment(fullPrefix).trim().toLowerCase() || String(word.word || '').toLowerCase();
  }
  return String(word.word || '').trim().toLowerCase();
}

export const codeEditorSuggestionInternals = {
  inferJsonCompletionMode,
  resolveCompletionMode,
  resolveCompletionInsertText,
  resolveCompletionContext,
  resolveCompletionQuery,
};

export default function CodeEditor({
  value,
  onChange,
  language = 'javascript',
  path,
  defaultPath,
  line,
  title = '代码编辑',
  height = '100%',
  minHeight = 120,
  disabled = false,
  placeholder,
  fullscreen = false,
  className,
  compact = false,
  lineNumbers,
  suggestions,
  suggestionTriggerCharacters,
  theme = 'light',
  loading,
  options: optionsOverride,
  beforeMount,
  onMount,
  onValidate,
  onFocus,
  onBlur,
  extraLibs,
  autoSuggestPolicy = 'explicit',
  suggestionContextResolver,
}: CodeEditorProps) {
  const [fullOpen, setFullOpen] = useState(false);
  const suggestionsRef = useRef(suggestions);
  const handlersRef = useRef({ onFocus, onBlur });
  const extraLibsRef = useRef(extraLibs);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const extraLibDisposablesRef = useRef<Array<{ dispose(): void }>>([]);

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  useEffect(() => {
    extraLibsRef.current = extraLibs;
  }, [extraLibs]);

  useEffect(() => {
    handlersRef.current = { onFocus, onBlur };
  }, [onFocus, onBlur]);

  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(() => ({
    ...baseOptions,
    readOnly: disabled,
    fontSize: compact ? 11 : 12,
    lineHeight: compact ? 18 : 20,
    lineNumbers: normalizeLineNumbers(lineNumbers),
    folding: !compact,
    glyphMargin: false,
    fixedOverflowWidgets: true,
    ...optionsOverride,
  }), [compact, disabled, lineNumbers, optionsOverride]);

  const configureLanguageService: BeforeMount = (monaco) => {
    // 注册自定义浅色主题
    monaco.editor.defineTheme('formflow-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '172033', background: 'ffffff' },
        { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7c3aed' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: '2563eb' },
        { token: 'type', foreground: '0891b2' },
        { token: 'function', foreground: '2563eb' },
        { token: 'variable', foreground: '172033' },
        { token: 'operator', foreground: '6b7280' },
        { token: 'delimiter', foreground: '6b7280' },
        { token: 'tag', foreground: '2563eb' },
        { token: 'attribute.name', foreground: '7c3aed' },
        { token: 'attribute.value', foreground: '059669' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#172033',
        'editor.lineHighlightBackground': '#f8fafc',
        'editor.selectionBackground': '#dbeafe',
        'editor.inactiveSelectionBackground': '#eff6ff',
        'editorCursor.foreground': '#2563eb',
        'editorWhitespace.foreground': '#e5e7eb',
        'editorIndentGuide.background': '#e5e7eb',
        'editorIndentGuide.activeBackground': '#cbd5e1',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#2563eb',
        // Suggest widget
        'editorSuggestWidget.background': '#ffffff',
        'editorSuggestWidget.foreground': '#172033',
        'editorSuggestWidget.border': '#e2e8f0',
        'editorSuggestWidget.selectedBackground': '#dbeafe',
        'editorSuggestWidget.selectedForeground': '#0f172a',
        'editorSuggestWidget.highlightForeground': '#2563eb',
        'editorSuggestWidget.focusHighlightForeground': '#1d4ed8',
        // Suggest widget status bar
        'editorSuggestWidgetStatus.foreground': '#64748b',
        // Widget shadow
        'widget.shadow': 'rgba(15, 23, 42, 0.12)',
        // Hover widget
        'editorHoverWidget.background': '#ffffff',
        'editorHoverWidget.foreground': '#172033',
        'editorHoverWidget.border': '#e2e8f0',
        // Focus border
        'focusBorder': '#2563eb',
        'contrastBorder': '#e2e8f0',
      },
    });
    // 只有当 theme 为 'light' 时使用自定义浅色主题
    if (theme === 'light' || theme === 'formflow-light') {
      monaco.editor.setTheme('formflow-light');
    }

    const compilerOptions = {
      allowJs: true,
      allowNonTsExtensions: true,
      checkJs: true,
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
      strict: true,
    };
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    beforeMount?.(monaco);
  };

  const blurEditorIfAutoFocused = (instance: editor.IStandaloneCodeEditor) => {
    window.setTimeout(() => {
      const domNode = instance.getDomNode();
      const activeElement = document.activeElement as HTMLElement | null;
      if (!domNode || !activeElement) return;
      if (!domNode.contains(activeElement)) return;
      if (typeof activeElement.blur === 'function') activeElement.blur();
      if (document.activeElement === activeElement && typeof (document.body as HTMLElement).focus === 'function') {
        document.body.focus();
      }
    }, 0);
  };

  const handleMount: OnMount = (instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    instance.layout();
    blurEditorIfAutoFocused(instance);
    const disposables = [
      instance.onDidFocusEditorWidget(() => handlersRef.current.onFocus?.()),
      instance.onDidBlurEditorWidget(() => handlersRef.current.onBlur?.()),
    ];

    if (suggestionsRef.current || suggestionTriggerCharacters?.length) {
      const provider = monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: suggestionTriggerCharacters,
        provideCompletionItems(model: editor.ITextModel, position: Position) {
          const word = model.getWordUntilPosition(position);
          const fullPrefix = model.getValueInRange(new monaco.Range(
            1,
            1,
            position.lineNumber,
            position.column,
          ));
          const linePrefix = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
          const completionPrefix = linePrefix.slice(0, Math.max(0, linePrefix.length - (word.word?.length || 0)));
          const mode = suggestionContextResolver?.({ fullPrefix, linePrefix, completionPrefix }) || resolveCompletionMode(language, fullPrefix, completionPrefix);
          const query = resolveCompletionQuery(language, mode, fullPrefix, word);
          const range = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          );

          const items = (suggestionsRef.current || []).map((item) => {
            const display = resolveCompletionDisplay(item, completionPrefix);
            return { item, display };
          });

          const contextualItems = items.filter(({ item }) => resolveCompletionContext(item, mode));
          const matchedItems = contextualItems.filter(({ item, display }) => matchesCompletionQuery(query, item, display));
          const activeItems = matchedItems.length > 0
            ? matchedItems
            : contextualItems.length > 0
              ? contextualItems
              : items;

          return {
            incomplete: true,
            suggestions: activeItems.map(({ item, display }) => {
              return {
                label: display.label,
                kind: resolveSuggestionKind(monaco, item.kind),
                insertText: resolveCompletionInsertText(item, completionPrefix, mode),
                insertTextRules: item.insertTextRules,
                detail: display.detail,
                documentation: item.documentation,
                sortText: item.sortText,
                filterText: matchedItems.length > 0 ? display.filterText : query || display.filterText,
                preselect: item.preselect,
                range,
              };
            }),
          };
        },
      });
      disposables.push(provider);
    }

    if (autoSuggestPolicy !== 'explicit' && (suggestionTriggerCharacters?.length || suggestionsRef.current?.length)) {
      disposables.push((instance as unknown as { onDidType: (listener: (typedText: string) => void) => { dispose: () => void } }).onDidType((typedText: string) => {
        if (!typedText) return;
        const model = instance.getModel();
        const position = instance.getPosition();
        const fullPrefix = model && position
          ? model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, position.column))
          : '';
        const linePrefix = model && position
          ? model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column))
          : '';
        const word = model && position ? model.getWordUntilPosition(position) : { word: '', startColumn: position?.column || 1, endColumn: position?.column || 1 };
        const completionPrefix = linePrefix.slice(0, Math.max(0, linePrefix.length - ((word && 'word' in word ? word.word : '')?.length || 0)));
        const mode = suggestionContextResolver?.({ fullPrefix, linePrefix, completionPrefix }) || resolveCompletionMode(language, fullPrefix, completionPrefix);
        const isWordLikeTyping = /[\w$\u4e00-\u9fa5-]/.test(typedText);
        const allowContextual =
          autoSuggestPolicy === 'contextual'
            ? mode !== 'top-level'
            : mode === 'json-object-key'
              || mode === 'json-object-value'
              || mode === 'json-array-value'
              || mode === 'json-string-value';
        if (isWordLikeTyping && allowContextual) {
          window.setTimeout(() => {
            if (editorRef.current === instance) {
              instance.trigger('code-editor', 'editor.action.triggerSuggest', {});
            }
          }, 0);
        }
      }));
    }

    instance.onDidDispose(() => {
      if (editorRef.current === instance) editorRef.current = null;
      extraLibDisposablesRef.current.forEach((disposable) => disposable.dispose());
      extraLibDisposablesRef.current = [];
      disposables.forEach((disposable) => disposable.dispose());
    });
    onMount?.(instance, monaco);
  };

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    extraLibDisposablesRef.current.forEach((disposable) => disposable.dispose());
    extraLibDisposablesRef.current = [];
    const target = language === 'typescript'
      ? monaco.languages.typescript.typescriptDefaults
      : monaco.languages.typescript.javascriptDefaults;
    extraLibDisposablesRef.current = (extraLibs || []).map((lib) => target.addExtraLib(lib.content, lib.filePath));
    return () => {
      extraLibDisposablesRef.current.forEach((disposable) => disposable.dispose());
      extraLibDisposablesRef.current = [];
    };
  }, [extraLibs, language]);

  useEffect(() => {
    if (!fullOpen) return;
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      editorRef.current?.layout();
    }, 40);
    return () => window.clearTimeout(id);
  }, [fullOpen]);

  const editorNode = (isFullscreen: boolean) => (
    <div
      className={`code-editor-shell ${compact ? 'compact' : ''} ${disabled ? 'readonly' : ''} ${className || ''}`}
      style={{ height: toCssSize(isFullscreen ? '100%' : height), minHeight: toCssSize(isFullscreen ? undefined : minHeight) }}
    >
      {placeholder && !value && <div className="code-editor-placeholder">{placeholder}</div>}
      <Editor
        key={isFullscreen ? `${path || title || 'editor'}:fullscreen` : `${path || title || 'editor'}:inline`}
        value={value}
        language={language}
        path={path}
        defaultPath={defaultPath}
        line={line}
        theme={theme}
        loading={loading}
        options={options}
        onChange={(next) => onChange(next ?? '')}
        beforeMount={configureLanguageService}
        onMount={handleMount}
        onValidate={onValidate}
        height="100%"
      />
    </div>
  );

  return (
    <>
      <div className="code-editor-frame">
        {fullscreen && !fullOpen && (
          <button className="code-editor-expand-btn" type="button" onClick={() => setFullOpen(true)} title="全屏编辑">
            ⛶
          </button>
        )}
        {!fullOpen && editorNode(false)}
      </div>
      {fullscreen && (
        <Modal
          open={fullOpen}
          onClose={() => setFullOpen(false)}
          width="96vw"
          maxWidth="none"
          maxHeight="94vh"
          overlayClassName="code-editor-modal-overlay"
          containerClassName="code-editor-modal-container"
        >
          <ModalHeader title={title} onClose={() => setFullOpen(false)} />
          <div className="code-editor-modal-body">{editorNode(true)}</div>
        </Modal>
      )}
    </>
  );
}
