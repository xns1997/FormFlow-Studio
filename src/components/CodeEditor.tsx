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
}: CodeEditorProps) {
  const [fullOpen, setFullOpen] = useState(false);
  const suggestionsRef = useRef(suggestions);
  const handlersRef = useRef({ onFocus, onBlur });

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

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

  const handleMount: OnMount = (instance, monaco) => {
    instance.layout();
    const disposables = [
      instance.onDidFocusEditorWidget(() => handlersRef.current.onFocus?.()),
      instance.onDidBlurEditorWidget(() => handlersRef.current.onBlur?.()),
    ];

    if (suggestionsRef.current || suggestionTriggerCharacters?.length) {
      const provider = monaco.languages.registerCompletionItemProvider(language, {
        triggerCharacters: suggestionTriggerCharacters,
        provideCompletionItems(model: editor.ITextModel, position: Position) {
          const word = model.getWordUntilPosition(position);
          const range = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          );

          return {
            suggestions: (suggestionsRef.current || []).map((item) => ({
              label: item.label,
              kind: resolveSuggestionKind(monaco, item.kind),
              insertText: item.insertText ?? item.label,
              insertTextRules: item.insertTextRules,
              detail: item.detail,
              documentation: item.documentation,
              sortText: item.sortText,
              filterText: item.filterText,
              preselect: item.preselect,
              range,
            })),
          };
        },
      });
      disposables.push(provider);
    }

    instance.onDidDispose(() => disposables.forEach((disposable) => disposable.dispose()));
    onMount?.(instance, monaco);
  };

  useEffect(() => {
    if (!fullOpen) return;
    const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 40);
    return () => window.clearTimeout(id);
  }, [fullOpen]);

  const editorNode = (isFullscreen: boolean) => (
    <div
      className={`code-editor-shell ${compact ? 'compact' : ''} ${disabled ? 'readonly' : ''} ${className || ''}`}
      style={{ height: toCssSize(isFullscreen ? '100%' : height), minHeight: toCssSize(isFullscreen ? undefined : minHeight) }}
    >
      {placeholder && !value && <div className="code-editor-placeholder">{placeholder}</div>}
      <Editor
        value={value}
        language={language}
        path={path}
        defaultPath={defaultPath}
        line={line}
        theme={theme}
        loading={loading}
        options={options}
        onChange={(next) => onChange(next ?? '')}
        beforeMount={beforeMount}
        onMount={handleMount}
        onValidate={onValidate}
        height="100%"
      />
    </div>
  );

  return (
    <>
      <div className="code-editor-frame">
        {fullscreen && (
          <button className="code-editor-expand-btn" type="button" onClick={() => setFullOpen(true)} title="全屏编辑">
            ⛶
          </button>
        )}
        {editorNode(false)}
      </div>
      {fullscreen && (
        <Modal open={fullOpen} onClose={() => setFullOpen(false)} width="96vw" maxWidth="none" maxHeight="94vh">
          <ModalHeader title={title} onClose={() => setFullOpen(false)} />
          <div className="code-editor-modal-body">{editorNode(true)}</div>
        </Modal>
      )}
    </>
  );
}
