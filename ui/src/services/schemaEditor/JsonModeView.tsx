import React, { useEffect, useRef } from 'react';
import type { Monaco, OnMount } from '@monaco-editor/react';
import type { editor, languages, Position } from 'monaco-editor';
import CodeEditor, { type CodeEditorProvider } from '../../components/CodeEditor';
import type { EntityJsonKind } from './registry';
import { isEntityJsonModelOfKind, jsonModelPath } from './registry';
import type { SemanticContext, SemanticIssue } from './semantic';
import { semanticCompletionsFor, shouldOfferSemanticCompletion } from './semantic';

export interface JsonModeViewProps {
  kind: EntityJsonKind;
  entityKey: string;
  title: string;
  text: string;
  parseError: string;
  structuralErrors: string[];
  semanticIssues: SemanticIssue[];
  semanticContext: SemanticContext;
  onTextChange: (text: string) => void;
  onValidate: (markers: editor.IMarker[]) => void;
  onApply: () => void;
  onDiscard: () => void;
  onExitToVisual: () => void;
  height?: number | string;
}

function lineForIssue(text: string, path?: string): number {
  if (!path) return 1;
  const segment = path.split(/[[\].]/).filter(Boolean).pop();
  if (!segment) return 1;
  const index = text.indexOf(`"${segment}"`);
  if (index < 0) return 1;
  return text.slice(0, index).split('\n').length;
}

/** 把语义警告写入 Monaco 内联标记（owner 与结构校验分离）。 */
function syncSemanticMarkers(monaco: Monaco, model: editor.ITextModel, issues: SemanticIssue[], text: string) {
  monaco.editor.setModelMarkers(model, 'formflow-semantic', issues.map((issue) => {
    const lineNumber = lineForIssue(text, issue.path);
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: 1,
      endColumn: Math.max(2, model.getLineMaxColumn(lineNumber)),
      message: `[语义] ${issue.message}`,
      severity: monaco.MarkerSeverity.Warning,
    };
  }));
}

export function JsonModeView(props: JsonModeViewProps) {
  const {
    kind,
    entityKey,
    title,
    text,
    parseError,
    structuralErrors,
    semanticIssues,
    semanticContext,
    onTextChange,
    onValidate,
    onApply,
    onDiscard,
    onExitToVisual,
    height = 520,
  } = props;
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modelPath = jsonModelPath(kind, entityKey);

  const handleMount: OnMount = (instance, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = instance;
  };

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    syncSemanticMarkers(monaco, model, semanticIssues, text);
  }, [semanticIssues, text, modelPath]);

  const providers: CodeEditorProvider[] = [
    (monaco: Monaco, editorInstance: editor.IStandaloneCodeEditor) => {
      const uri = editorInstance.getModel()?.uri.toString() || '';
      if (!isEntityJsonModelOfKind(uri, kind)) return;
      const completionItems = semanticCompletionsFor(kind, semanticContext);
      if (!completionItems.length) return;
      return monaco.languages.registerCompletionItemProvider('json', {
        triggerCharacters: ['"', ':'],
        provideCompletionItems(model: editor.ITextModel, position: Position, _context: languages.CompletionContext) {
          if (!isEntityJsonModelOfKind(model.uri.toString(), kind)) return { suggestions: [] };
          const linePrefix = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
          const word = model.getWordUntilPosition(position);
          const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
          const suggestions = completionItems
            .filter((item) => shouldOfferSemanticCompletion(kind, linePrefix, item.label))
            .map((item) => ({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Value,
              detail: item.detail,
              insertText: `"${item.label.replace(/"/g, '\\"')}"`,
              range,
            }));
          return { suggestions };
        },
      });
    },
  ];

  const allProblems = [
    ...(parseError ? [{ level: 'error' as const, message: `JSON 无效：${parseError}` }] : []),
    ...structuralErrors.map((message) => ({ level: 'error' as const, message })),
    ...semanticIssues.map((issue) => ({ level: 'warning' as const, message: issue.message })),
  ];

  return (
    <div className="json-mode-editor">
      <div className="json-mode-toolbar">
        <span className="json-mode-title">{title}</span>
        <span className={`json-mode-status ${structuralErrors.length || parseError ? 'invalid' : 'valid'}`}>
          {parseError || structuralErrors.length ? `${structuralErrors.length + (parseError ? 1 : 0)} 个结构错误` : '结构校验通过'}
        </span>
        <span className="json-mode-status warning">{semanticIssues.length ? `${semanticIssues.length} 个语义警告` : ''}</span>
        <span className="json-mode-spacer" />
        <button type="button" className="toolbar-btn" onClick={onDiscard}>放弃修改</button>
        <button type="button" className="toolbar-btn primary" disabled={Boolean(parseError) || structuralErrors.length > 0} onClick={onApply}>应用</button>
        <button type="button" className="toolbar-btn" onClick={onExitToVisual}>返回可视化</button>
      </div>
      <div className="json-mode-editor-body">
        <CodeEditor
          path={modelPath}
          value={text}
          onChange={onTextChange}
          onValidate={onValidate}
          onMount={handleMount}
          providers={providers}
          language="json"
          title={title}
          theme="light"
          height={height}
          lineNumbers
          options={{
            minimap: { enabled: true },
            folding: true,
            fontSize: 13,
            lineHeight: 21,
            wordWrap: 'off',
            scrollBeyondLastLine: false,
          }}
          fullscreen
        />
      </div>
      <div className="json-mode-problems" aria-live="polite">
        {allProblems.length === 0 ? (
          <span className="json-mode-problems-empty">没有结构错误或语义警告</span>
        ) : (
          allProblems.slice(0, 12).map((problem, index) => (
            <div key={`${problem.level}-${index}`} className={`json-mode-problem ${problem.level}`}>
              <span className="json-mode-problem-level">{problem.level === 'error' ? '结构' : '语义'}</span>
              <span>{problem.message}</span>
            </div>
          ))
        )}
        {allProblems.length > 12 && <span className="json-mode-problems-more">… 还有 {allProblems.length - 12} 条</span>}
      </div>
    </div>
  );
}
