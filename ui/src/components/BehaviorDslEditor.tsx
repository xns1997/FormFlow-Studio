import { useEffect, useMemo, useRef, useState } from 'react';
import type { Monaco, OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import CodeEditor from './CodeEditor';
import { BEHAVIOR_DSL_LANGUAGE_ID, createBehaviorDslSuggestions, registerBehaviorDslLanguage, resolveBehaviorDslCompletionContext } from './behaviorDslSuggestions';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { compileBehaviorDsl, hasBehaviorDslErrors, naturalLanguageToBehaviorDsl } from '../services/engine/behaviorDsl';
import { BEHAVIOR_DSL_TEMPLATES } from '../services/engine/behaviorDslLanguage';
import RuleAgentPanel from './RuleAgentPanel';

interface Props { projectId: string; value: string; onChange: (value: string) => void; fields: string[]; components: DesignComponent[]; tables: SrcTableEntry[]; workflows: WorkflowFile[]; formId: string; formName?: string; onApply: () => void; onProposalApplied: (result: { ruleCode: string; components: DesignComponent[]; updatedAt: string }) => void; }

export function createBehaviorRuleModelPath(formId: string) {
  return `inmemory://formflow/forms/${encodeURIComponent(formId || 'unknown')}/behavior-rules.ffrule`;
}

export default function BehaviorDslEditor({ projectId, value, onChange, fields, components, tables, workflows, formId, formName, onApply, onProposalApplied }: Props) {
  const [naturalSource, setNaturalSource] = useState('');
  const instanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const compilation = useMemo(() => compileBehaviorDsl(value, { fields, components, tables, workflows }), [value, fields, components, tables, workflows]);
  const hasErrors = hasBehaviorDslErrors(compilation);
  const translation = useMemo(() => naturalLanguageToBehaviorDsl(naturalSource), [naturalSource]);
  const suggestions = useMemo(() => createBehaviorDslSuggestions({ fields, components, tables, workflows }), [fields, components, tables, workflows]);
  useEffect(() => {
    const model = instanceRef.current?.getModel(); const monaco = monacoRef.current;
    if (!model || !monaco) return;
    monaco.editor.setModelMarkers(model, 'formflow-behavior-dsl', compilation.diagnostics.map((item) => ({ startLineNumber: item.line, endLineNumber: item.line, startColumn: item.column, endColumn: item.endColumn || Math.max(item.column + 1, model.getLineMaxColumn(item.line)), message: `[${item.code}] ${item.message}${item.suggestion ? `\n建议：${item.suggestion}` : ''}`, severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info })));
  }, [compilation]);
  const handleMount: OnMount = (instance, monaco) => {
    instanceRef.current = instance; monacoRef.current = monaco;
    const model = instance.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'formflow-behavior-dsl', compilation.diagnostics.map((item) => ({ startLineNumber: item.line, endLineNumber: item.line, startColumn: item.column, endColumn: item.endColumn || Math.max(item.column + 1, model.getLineMaxColumn(item.line)), message: `[${item.code}] ${item.message}${item.suggestion ? `\n建议：${item.suggestion}` : ''}`, severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info })));
  };
  const appendRule = (text: string) => onChange(`${value}${value.trim() ? '\n' : ''}${text}`);
  return <div className="behavior-dsl-editor">
    <div className="behavior-dsl-header"><div><strong>规则语法</strong><span>为 {formName || '当前表单'} 生成可视化联动</span></div><button type="button" className="toolbar-btn primary" disabled={!compilation.rules.length || hasErrors} onClick={onApply}>应用到当前表单</button></div>
    <div className="behavior-dsl-natural"><label><strong>业务语言辅助输入</strong><textarea value={naturalSource} onChange={(event) => setNaturalSource(event.target.value)} rows={2} placeholder="例如：部门是技术部时显示技术栈；提交前姓名和手机号必填" /></label><button type="button" className="ui-btn ui-btn-primary ui-btn-xs" disabled={!translation.dsl || !!translation.diagnostics.length} onClick={() => onChange(translation.dsl)}>转换为规则语法</button>{translation.diagnostics.map((message) => <span key={message} className="property-editor-warning">{message}</span>)}</div>
    <div className="behavior-dsl-workspace">
      <div className="behavior-dsl-code"><div className="behavior-dsl-templates">{BEHAVIOR_DSL_TEMPLATES.map((template) => <button key={template.label} type="button" className="ui-btn ui-btn-xs" onClick={() => appendRule(template.value)}>{template.label}</button>)}</div><CodeEditor value={value} onChange={onChange} language={BEHAVIOR_DSL_LANGUAGE_ID} path={createBehaviorRuleModelPath(formId)} theme="light" lineNumbers suggestions={suggestions} suggestionContextResolver={resolveBehaviorDslCompletionContext} autoSuggestPolicy="contextual" suggestionTriggerCharacters={['$', '@', ' ', '>', '=', '(', ',', ';']} beforeMount={registerBehaviorDslLanguage} onMount={handleMount} options={{ minimap: { enabled: false }, folding: false, fontSize: 13, lineHeight: 22, wordBasedSuggestions: 'off' }} fullscreen /><small>按 Ctrl+Space 查看补全。动作统一使用函数形式，以分号分隔；字段使用 $，控件使用 @。</small></div>
      <RuleAgentPanel projectId={projectId} formId={formId} code={value} components={components} tables={tables} diagnostics={compilation.diagnostics} onApplied={onProposalApplied} />
    </div>
  </div>;
}
