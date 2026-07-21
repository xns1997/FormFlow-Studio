import type { Monaco } from '@monaco-editor/react';
import type { CodeEditorSuggestion } from './CodeEditor';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { BEHAVIOR_DSL_ACTIONS, BEHAVIOR_DSL_KEYWORDS, BEHAVIOR_DSL_MESSAGE_LEVELS, BEHAVIOR_DSL_OPERATORS, BEHAVIOR_DSL_STATEMENTS } from '../services/engine/behaviorDslLanguage';

export const BEHAVIOR_DSL_LANGUAGE_ID = 'formflow-behavior-dsl';

export interface BehaviorDslSuggestionOptions { fields?: string[]; components?: DesignComponent[]; tables?: SrcTableEntry[]; workflows?: WorkflowFile[]; }

type DslCompletionContext = 'statement' | 'condition-field' | 'condition-operator' | 'condition-value' | 'action' | 'action-field' | 'action-component' | 'action-workflow' | 'action-table' | 'message-level' | 'watch-field';

function currentCallArgument(line: string) {
  const match = line.match(/([a-z]+)\s*\(([^()]*)$/i);
  if (!match) return null;
  return { name: match[1].toLowerCase(), index: match[2].split(',').length - 1 };
}

export function resolveBehaviorDslCompletionContext({ linePrefix }: { fullPrefix: string; linePrefix: string; completionPrefix: string }): DslCompletionContext {
  const line = linePrefix.trimStart();
  const call = currentCallArgument(line);
  if (call) {
    if (['show', 'hide', 'enable', 'disable'].includes(call.name)) return 'action-component';
    if (['require', 'optional', 'clear', 'set'].includes(call.name)) return call.name === 'set' && call.index > 0 ? 'condition-value' : 'action-field';
    if (call.name === 'run') return 'action-workflow';
    if (call.name === 'message') return call.index > 0 ? 'message-level' : 'condition-value';
    if (call.name === 'watch' || call.name === 'change') return call.name === 'watch' ? 'watch-field' : 'condition-field';
    if (call.name === 'options') return call.index === 0 ? 'action-field' : call.index === 1 ? 'action-table' : call.index === 2 ? 'action-field' : 'condition-value';
  }
  const actionSource = line.includes('->') ? line.slice(line.lastIndexOf('->') + 2) : '';
  if (actionSource && (!actionSource.trim() || /;\s*[\w-]*$/.test(actionSource))) return 'action';
  if (/^when\s*$/i.test(line) || /^when\s+\$?[\w\u4e00-\u9fff.-]*$/i.test(line)) return 'condition-field';
  if (/^when\s+\$?(?:form\.)?[\w\u4e00-\u9fff.-]+\s+[^-]*$/i.test(line) && !line.includes('->')) {
    return BEHAVIOR_DSL_OPERATORS.some((item) => line.toLowerCase().includes(item.syntax)) ? 'condition-value' : 'condition-operator';
  }
  return 'statement';
}

const syntaxSuggestions: CodeEditorSuggestion[] = [
  ...BEHAVIOR_DSL_STATEMENTS.map((item, index) => ({ label: item.syntax, insertText: item.syntax.replace('<运算符>', '==').replace('<值>', '"值"').replace('<动作>', 'show(@控件)').replace('<表达式>', '$数量 * $单价').replace(/\.\.\./g, '$字段'), kind: 'Snippet', detail: item.description, documentation: item.syntax, sortText: `00${index}`, scope: 'statement' })),
  ...BEHAVIOR_DSL_ACTIONS.map((item, index) => ({ label: item.name, insertText: item.syntax, kind: 'Function', detail: item.description, documentation: item.syntax, sortText: `10${index}`, scope: 'action' })),
  ...BEHAVIOR_DSL_OPERATORS.map((item, index) => ({ label: item.syntax, insertText: item.syntax, kind: 'Operator', detail: `${item.description}；else 反向为 ${item.inverse}`, sortText: `20${index}`, scope: 'condition-operator' })),
  ...BEHAVIOR_DSL_MESSAGE_LEVELS.map((level, index) => ({ label: level, insertText: level, kind: 'EnumMember', detail: `${level} 消息级别`, sortText: `30${index}`, scope: 'message-level' })),
];

export function createBehaviorDslSuggestions(options: BehaviorDslSuggestionOptions = {}): CodeEditorSuggestion[] {
  const fields = [...new Set((options.fields || []).filter(Boolean))];
  return [
    ...syntaxSuggestions,
    ...fields.map<CodeEditorSuggestion>((field, index) => ({ label: `$${field}`, insertText: `$${field}`, kind: 'Field', detail: `当前表单字段：${field}`, sortText: `4${index.toString().padStart(3, '0')}`, scope: ['condition-field', 'condition-value', 'action-field', 'watch-field'] })),
    ...(options.components || []).map<CodeEditorSuggestion>((component, index) => {
      const name = String(component.props?.label || component.fieldBinding || component.props?.name || component.id);
      return { label: `@${name}`, insertText: `@${component.id}`, kind: 'Reference', detail: `${name} · ${component.type} · ${component.id}`, sortText: `5${index.toString().padStart(3, '0')}`, scope: 'action-component' };
    }),
    ...(options.tables || []).map<CodeEditorSuggestion>((table, index) => ({ label: table.fileName, insertText: JSON.stringify(table.id), kind: 'Reference', detail: `数据表 · ${table.id}`, sortText: `6${index.toString().padStart(3, '0')}`, scope: 'action-table' })),
    ...(options.workflows || []).map<CodeEditorSuggestion>((workflow, index) => ({ label: workflow.name, insertText: JSON.stringify(workflow.id), kind: 'Function', detail: `流程 · ${workflow.id}`, sortText: `7${index.toString().padStart(3, '0')}`, scope: 'action-workflow' })),
  ];
}

export function registerBehaviorDslLanguage(monaco: Monaco) {
  if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === BEHAVIOR_DSL_LANGUAGE_ID)) monaco.languages.register({ id: BEHAVIOR_DSL_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    ignoreCase: true,
    keywords: [...BEHAVIOR_DSL_KEYWORDS, 'contains', 'starts', 'ends', 'empty'],
    actions: BEHAVIOR_DSL_ACTIONS.map((item) => item.name),
    levels: [...BEHAVIOR_DSL_MESSAGE_LEVELS],
    tokenizer: { root: [
      [/#.*$/, 'comment'],
      [/@[\w\u4e00-\u9fff.:-]+/, 'tag'],
      [/\$(?:form\.)?[\w\u4e00-\u9fff.-]+/, 'variable'],
      [/[a-zA-Z_][\w-]*/, { cases: { '@keywords': 'keyword', '@actions': 'function', '@levels': 'type', '@default': 'identifier' } }],
      [/(==|!=|>=|<=|>|<|=|->)/, 'operator'],
      [/[;,()]/, 'delimiter'],
      [/-?\d+(?:\.\d+)?/, 'number'],
      [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 'string'],
    ] },
  });
  monaco.languages.setLanguageConfiguration(BEHAVIOR_DSL_LANGUAGE_ID, {
    comments: { lineComment: '#' }, brackets: [['(', ')']],
    autoClosingPairs: [{ open: '"', close: '"' }, { open: "'", close: "'" }, { open: '(', close: ')' }],
    surroundingPairs: [{ open: '"', close: '"' }, { open: "'", close: "'" }, { open: '(', close: ')' }],
  });
}
