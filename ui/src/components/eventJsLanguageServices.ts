import type { Monaco } from '@monaco-editor/react';
import type { editor, languages, Position, Range } from 'monaco-editor';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { request } from '../services/io/api';
import type { CodeEditorSuggestion } from './CodeEditor';
import { codeEditorSuggestionInternals } from './CodeEditor';
import { acquireLanguageProviders, type Disposable } from './monacoProviderRegistry';

export interface EventFieldDescriptorLike { name: string; type?: string; }

export interface EventJsServicesContext {
  fields: Array<string | EventFieldDescriptorLike>;
  components: DesignComponent[];
  tables: SrcTableEntry[];
  workflows: WorkflowFile[];
  suggestions: CodeEditorSuggestion[];
}

const contextByUri = new Map<string, EventJsServicesContext>();

function contextOf(model: editor.ITextModel | null): EventJsServicesContext {
  if (!model) return { fields: [], components: [], tables: [], workflows: [], suggestions: [] };
  return contextByUri.get(model.uri.toString()) || { fields: [], components: [], tables: [], workflows: [], suggestions: [] };
}

const FIELD_CALLS = new Set([
  'getValue', 'setValue', 'getValues', 'setValues', 'clearValue', 'clearValues',
  'setRequired', 'toggleRequired', 'setFieldState', 'focusField', 'scrollToField',
  'requireFields', 'fields',
]);
const COMPONENT_CALLS = new Set([
  'setVisible', 'setDisabled', 'toggleVisible', 'toggleDisabled', 'focusControl', 'scrollToControl',
]);
const TABLE_CALLS = new Set(['querySheet', 'findRows', 'findRow', 'nextSequence', 'fillForm', 'table']);
const WORKFLOW_CALLS = new Set(['runWorkflow', 'flow']);
const LEVEL_CALLS = new Set(['showMessage']);

export interface EventJsCallAnalysis {
  name: string;
  openParenIndex: number;
  argIndex: number;
  inStringOrArray: boolean;
}

/**
 * 分析行内最外层调用：调用名、光标所在参数下标（顶层逗号计数）以及
 * 当前是否位于字符串或数组字面量内（决定补全种类）。
 */
export function analyzeEventJsCall(line: string): EventJsCallAnalysis | null {
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let lastOpenCall: { name: string; index: number } | null = null;
  let topLevelCommas = 0;
  let inStringOrArray = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      if (lastOpenCall) inStringOrArray = true;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      if (parenDepth === 1) {
        const nameMatch = line.slice(0, index).match(/([A-Za-z_$][\w$]*)\s*$/);
        lastOpenCall = { name: nameMatch ? nameMatch[1] : '', index };
        inStringOrArray = false;
        topLevelCommas = 0;
      }
      continue;
    }
    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === '[') {
      bracketDepth += 1;
      if (lastOpenCall) inStringOrArray = true;
      continue;
    }
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === ',' && parenDepth === 1 && bracketDepth === 0) topLevelCommas += 1;
  }
  if (!lastOpenCall || parenDepth === 0) return null;
  return { name: lastOpenCall.name, openParenIndex: lastOpenCall.index, argIndex: topLevelCommas, inStringOrArray: quote !== null || bracketDepth > 0 };
}

/**
 * 事件 JS 的上下文解析：先识别字符串参数位置（字段/控件/表/流程/级别），
 * 再回退到通用 resolver（ctx 成员、JSON 对象键、getValue 字符串等）。
 */
export function resolveEventJsCompletionContext({ fullPrefix, linePrefix, completionPrefix }: {
  fullPrefix: string;
  linePrefix: string;
  completionPrefix: string;
}): string {
  if (completionPrefix.endsWith('ctx.controls.')) return 'ctx-controls-member';
  if (completionPrefix.endsWith('ctx.detail.')) return 'ctx-detail-member';
  if (completionPrefix.endsWith('ctx.values.')) return 'ctx-values-member';
  if (completionPrefix.endsWith('ctx.')) return 'ctx-member';
  const call = analyzeEventJsCall(linePrefix);
  if (call) {
    if (LEVEL_CALLS.has(call.name) && call.argIndex === 1) return 'message-level';
    if (call.inStringOrArray) {
      if (FIELD_CALLS.has(call.name)) return 'field-name';
      if (COMPONENT_CALLS.has(call.name)) return 'component-name';
      if (TABLE_CALLS.has(call.name)) return 'table-name';
      if (WORKFLOW_CALLS.has(call.name)) return 'workflow-name';
    }
    if (call.name === 'setValues' && call.argIndex === 0) {
      const tail = linePrefix.slice(call.openParenIndex + 1);
      if (!/:/.test(tail)) return 'json-object-key';
    }
  }
  return codeEditorSuggestionInternals.resolveCompletionMode('javascript', fullPrefix, completionPrefix);
}

function matchMode(item: CodeEditorSuggestion, mode: string): boolean {
  const scopes = Array.isArray(item.scope) ? item.scope : [item.scope || 'any'];
  return scopes.includes('any') || scopes.includes(mode);
}

function bestSuggestion(ctx: EventJsServicesContext, mode: string): CodeEditorSuggestion | null {
  for (const item of ctx.suggestions) {
    if (matchMode(item, mode)) return item;
  }
  return null;
}

function registerInlineCompletions(monaco: Monaco): Disposable {
  return monaco.languages.registerInlineCompletionsProvider('javascript', {
    provideInlineCompletions(model: editor.ITextModel, position: Position) {
      const ctx = contextOf(model);
      const linePrefix = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
      const fullPrefix = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, position.column));
      const word = model.getWordUntilPosition(position);
      const completionPrefix = linePrefix.slice(0, Math.max(0, linePrefix.length - ((word && 'word' in word ? word.word : '')?.length || 0)));
      const mode = resolveEventJsCompletionContext({ fullPrefix, linePrefix, completionPrefix });
      const item = bestSuggestion(ctx, mode);
      let insertText = item
        ? codeEditorSuggestionInternals.resolveCompletionInsertText(item, completionPrefix, mode)
        : '';
      if (item && /['"`]$/.test(linePrefix)) {
        if (mode === 'field-name' || mode === 'component-name' || mode === 'table-name' || mode === 'workflow-name') {
          insertText += /\(\s*['"`]$/.test(linePrefix) ? "')" : "'";
        }
      }
      if (/setValue\(\s*['"`][^'"`]+['"`]\s*,\s*$/.test(linePrefix) && !insertText) {
        insertText = 'ctx.value)';
      }
      if (!insertText) return null;
      return {
        items: [{ insertText, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }],
        commands: [],
      };
    },
    freeInlineCompletions() { /* no-op */ },
  });
}

const PROMISE_METHODS = new Set([
  'setValue', 'setValues', 'clearValue', 'clearValues',
  'setVisible', 'toggleVisible', 'setDisabled', 'toggleDisabled',
  'setRequired', 'toggleRequired', 'setFieldState',
  'focusField', 'focusControl', 'scrollToField', 'scrollToControl',
  'switchTab', 'openTab', 'showMessage', 'requireFields', 'resetForm',
  'fillForm', 'runWorkflow', 'runConfiguredWorkflow', 'call',
]);

function awaitFixes(model: editor.ITextModel, lineNumber: number, ctx: EventJsServicesContext): languages.CodeAction[] {
  const line = model.getLineContent(lineNumber);
  const actions: languages.CodeAction[] = [];
  if (!ctx.fields.length) return actions;
  const pattern = /(^|[;{}]\s*)(ctx\.)([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of line.matchAll(pattern)) {
    const method = match[3];
    if (!PROMISE_METHODS.has(method)) continue;
    const segmentStart = match.index + match[1].length;
    const before = line.slice(0, segmentStart);
    if (/(^|\s)await\s+$/.test(before)) continue;
    const insertColumn = segmentStart + 1;
    actions.push({
      title: `为 ctx.${method}() 补上 await`,
      kind: 'quickfix',
      edit: {
        edits: [{
          resource: model.uri,
          versionId: model.getVersionId(),
          textEdit: { range: { startLineNumber: lineNumber, startColumn: insertColumn, endLineNumber: lineNumber, endColumn: insertColumn }, text: 'await ' },
        }],
      },
    });
  }
  return actions;
}

function unknownFieldFixes(model: editor.ITextModel, lineNumber: number, ctx: EventJsServicesContext): languages.CodeAction[] {
  const line = model.getLineContent(lineNumber);
  const actions: languages.CodeAction[] = [];
  const fieldNames = new Set(ctx.fields.map((field) => typeof field === 'string' ? field : field.name));
  const pattern = /(getValue|setValue|getValues|clearValue|clearValues|setRequired|toggleRequired|focusField|scrollToField|requireFields|setFieldState|setValues)\s*\(\s*['"]([^'"]+)['"]/g;
  for (const match of line.matchAll(pattern)) {
    const name = match[2];
    if (fieldNames.has(name)) continue;
    const offset = match.index + match[0].indexOf(name);
    for (const candidate of [...fieldNames].slice(0, 5)) {
      actions.push({
        title: `替换字段 "${name}" 为 "${candidate}"`,
        kind: 'quickfix',
        edit: {
          edits: [{
            resource: model.uri,
            versionId: model.getVersionId(),
            textEdit: { range: { startLineNumber: lineNumber, startColumn: offset + 1, endLineNumber: lineNumber, endColumn: offset + name.length + 1 }, text: candidate },
          }],
        },
      });
    }
  }
  return actions;
}

function registerCodeActions(monaco: Monaco): Disposable {
  return monaco.languages.registerCodeActionProvider('javascript', {
    provideCodeActions(model: editor.ITextModel, range: Range) {
      const ctx = contextOf(model);
      const actions = [
        ...awaitFixes(model, range.startLineNumber, ctx),
        ...unknownFieldFixes(model, range.startLineNumber, ctx),
      ];
      return { actions, dispose() { /* no-op */ } };
    },
  });
}

/** 调用服务端 oxfmt 接口格式化事件 JS；失败由调用方静默降级。 */
export async function formatEventJsCode(code: string): Promise<{ code: string }> {
  return request<{ code: string }>('/ai/code-format', {
    method: 'POST',
    body: JSON.stringify({ language: 'javascript', code }),
  });
}

function registerFormatting(monaco: Monaco): Disposable {
  return monaco.languages.registerDocumentFormattingEditProvider('javascript', {
    async provideDocumentFormattingEdits(model: editor.ITextModel) {
      try {
        const result = await formatEventJsCode(model.getValue());
        if (!result?.code || result.code === model.getValue()) return [];
        return [{ range: model.getFullModelRange(), text: result.code }];
      } catch {
        return [];
      }
    },
  });
}

/**
 * 注册事件 JS 的全部增强服务（TS worker 之外的补全、ghost、修复、格式化）。
 * 上下文按 model URI 绑定，多编辑器实例互不串扰；Provider 按语言共享。
 */
export function registerEventJsLanguageServices(
  monaco: Monaco,
  instance: editor.IStandaloneCodeEditor,
  ctx: EventJsServicesContext,
): Disposable {
  const uri = instance.getModel()?.uri.toString();
  if (uri) contextByUri.set(uri, ctx);
  const acquire = acquireLanguageProviders(monaco, 'javascript:formflow-event', (monacoInstance) => [
    registerInlineCompletions(monacoInstance),
    registerCodeActions(monacoInstance),
    registerFormatting(monacoInstance),
  ]);
  return {
    dispose() {
      acquire.dispose();
      if (uri) contextByUri.delete(uri);
    },
  };
}

/** 测试辅助：清空 URI 上下文。 */
export function resetEventJsContextForTest() {
  contextByUri.clear();
}
