import type { Monaco } from '@monaco-editor/react';
import type { editor, languages, Position, Range } from 'monaco-editor';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { compileBehaviorDsl, hasBehaviorDslErrors } from '../services/engine/behaviorDsl';
import { BEHAVIOR_DSL_ACTIONS, BEHAVIOR_DSL_KEYWORDS, BEHAVIOR_DSL_MESSAGE_LEVELS, BEHAVIOR_DSL_OPERATORS, BEHAVIOR_DSL_STATEMENTS } from '../services/engine/behaviorDslLanguage';
import { parseLegacyAction, splitTopLevel, normalizeReference } from '../../../shared/formflow-core/behaviorDsl';
import { BEHAVIOR_DSL_LANGUAGE_ID } from './behaviorDslSuggestions';
import { acquireLanguageProviders, type Disposable } from './monacoProviderRegistry';

export interface BehaviorDslServicesContext {
  fields: string[];
  components: DesignComponent[];
  tables: SrcTableEntry[];
  workflows: WorkflowFile[];
}

const contextByUri = new Map<string, BehaviorDslServicesContext>();

function contextOf(model: editor.ITextModel | null): BehaviorDslServicesContext {
  if (!model) return { fields: [], components: [], tables: [], workflows: [] };
  return contextByUri.get(model.uri.toString()) || { fields: [], components: [], tables: [], workflows: [] };
}

export type DslTokenKind =
  | 'comment' | 'field' | 'component' | 'action' | 'operator' | 'level'
  | 'string' | 'number' | 'keyword' | 'identifier' | 'table' | 'workflow' | 'error';

export interface DslTokenSpan {
  kind: DslTokenKind;
  text: string;
  start: number; // 0-based char offset
  end: number;   // exclusive
}

const CJK = '\u4e00-\u9fff';
const REF_CHARS = `\\w${CJK}.-`;
const STRING_PATTERN = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/y;
const FIELD_PATTERN = /\$(?:form\.)?[\w\u4e00-\u9fff.-]+/y;
const COMPONENT_PATTERN = /@[\w\u4e00-\u9fff.-]+/y;
const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/y;
const WORD_PATTERN = /[A-Za-z_][\w-]*/y;
const SYMBOL_PATTERN = /->|===|!==|>=|<=|==|!=|&&|\|\||[+\-*/%<>()=,;]/y;

const KEYWORD_SET = new Set(BEHAVIOR_DSL_KEYWORDS.map((item) => item.toLowerCase()));
const OPERATOR_WORDS = new Set(['contains', 'starts', 'ends', 'empty', 'not', 'with', 'is']);
const LEVEL_SET = new Set(BEHAVIOR_DSL_MESSAGE_LEVELS.map((item) => item.toLowerCase()));
const ACTION_NAMES = new Set(BEHAVIOR_DSL_ACTIONS.map((item) => item.name.toLowerCase()));
const GUARD_ACTION_NAMES = new Set(['requireany', 'requiredirty', 'keepreadonly', 'validate', 'range', 'length', 'compare']);

/**
 * 扫描一行 DSL 源码，返回字符串感知的 token 片段（0-based 偏移，按位置排序）。
 */
/** 扫描 DSL 行，返回 token 跨度（高亮/诊断定位）。 */
export function scanDslLine(line: string): DslTokenSpan[] {
  const result: DslTokenSpan[] = [];
  if (line.trimStart().startsWith('#')) {
    return [{ kind: 'comment', text: line, start: 0, end: line.length }];
  }
  const patterns: Array<{ kind: DslTokenKind | 'word'; re: RegExp }> = [
    { kind: 'string', re: STRING_PATTERN },
    { kind: 'field', re: FIELD_PATTERN },
    { kind: 'component', re: COMPONENT_PATTERN },
    { kind: 'number', re: NUMBER_PATTERN },
    { kind: 'word', re: WORD_PATTERN },
    { kind: 'operator', re: SYMBOL_PATTERN },
  ];
  let index = 0;
  while (index < line.length) {
    const rest = line.slice(index);
    let matchedKind: DslTokenKind | 'word' | null = null;
    let text = '';
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      const match = rest.match(pattern.re);
      if (match && match.index === 0) {
        matchedKind = pattern.kind;
        text = match[0];
        break;
      }
    }
    if (!matchedKind || !text) {
      index += 1;
      continue;
    }
    const start = index;
    const end = index + text.length;
    let kind: DslTokenKind = matchedKind === 'word' ? 'identifier' : matchedKind;
    if (matchedKind === 'word') {
      const lower = text.toLowerCase();
      if (ACTION_NAMES.has(lower) || GUARD_ACTION_NAMES.has(lower)) {
        // 动作名后必须紧跟 '('（允许中间空格）
        const after = line.slice(end).replace(/^\s+/, '');
        kind = after.startsWith('(') ? 'action' : 'identifier';
      } else if (OPERATOR_WORDS.has(lower)) {
        kind = 'operator';
      } else if (LEVEL_SET.has(lower)) {
        kind = 'level';
      } else if (KEYWORD_SET.has(lower)) {
        kind = 'keyword';
      }
    }
    result.push({ kind, text, start, end });
    index = end;
  }
  return result;
}

/** 行内最外层调用上下文：`name(...)` 中光标所在参数下标（0-based）。 */
/** 定位列所在的函数调用上下文（函数名与参数序号）。 */
export function callContextAt(line: string, column: number): { name: string; index: number } | null {
  let depth = 0;
  let quote = '';
  let callName = '';
  let callStart = -1;
  let topLevelCommas = 0;
  let currentArg = 0;
  for (let index = 0; index < column - 1; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') {
      if (depth === 0) {
        const nameMatch = line.slice(0, index).match(/([a-z][\w-]*)\s*$/i);
        callName = nameMatch ? nameMatch[1].toLowerCase() : '';
        callStart = index;
        topLevelCommas = 0;
        currentArg = 0;
      }
      depth += 1;
      continue;
    }
    if (char === ')') {
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth === 1 && char === ',') {
      topLevelCommas += 1;
      currentArg = topLevelCommas;
    }
  }
  if (callStart < 0 || depth <= 0) return null;
  return { name: callName, index: currentArg };
}

function markdown(value: string): { value: string } {
  return { value };
}

function statementForKeyword(keyword: string) {
  const lower = keyword.toLowerCase();
  return BEHAVIOR_DSL_STATEMENTS.find((item) => item.syntax.toLowerCase().startsWith(`${lower} `) || item.syntax.toLowerCase().startsWith(lower));
}

function operatorPhraseAt(line: string, column: number) {
  for (const operator of BEHAVIOR_DSL_OPERATORS) {
    let searchFrom = 0;
    while (true) {
      const found = line.toLowerCase().indexOf(operator.syntax.toLowerCase(), searchFrom);
      if (found < 0) break;
      const start = found + 1; // 1-based
      const end = found + operator.syntax.length;
      if (column >= start && column <= end) return operator;
      searchFrom = found + 1;
    }
  }
  return null;
}

function registerHover(monaco: Monaco): Disposable {
  return monaco.languages.registerHoverProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    provideHover(model: editor.ITextModel, position: Position) {
      const ctx = contextOf(model);
      const line = model.getLineContent(position.lineNumber);
      const tokens = scanDslLine(line);
      const token = tokens.find((item) => position.column >= item.start + 1 && position.column <= item.end + 1);
      const operator = operatorPhraseAt(line, position.column);
      const contents: Array<{ value: string }> = [];
      if (operator) {
        contents.push(markdown(`**${operator.syntax}**\n\n${operator.description}\n\n反向：\`${operator.inverse}\``));
      } else if (token) {
        switch (token.kind) {
          case 'action': {
            const action = BEHAVIOR_DSL_ACTIONS.find((item) => item.name.toLowerCase() === token.text.toLowerCase());
            if (action) contents.push(markdown(`**${action.syntax}**\n\n${action.description}`));
            break;
          }
          case 'level': {
            contents.push(markdown(`**${token.text}**\n\n消息级别：\`message("内容", ${token.text})\``));
            break;
          }
          case 'keyword': {
            const statement = statementForKeyword(token.text);
            if (statement) contents.push(markdown(`**${statement.syntax}**\n\n${statement.description}`));
            break;
          }
          case 'field': {
            const name = token.text.replace(/^\$(form\.)?/, '');
            const known = ctx.fields.includes(name);
            contents.push(markdown(`**${token.text}**\n\n${known ? `当前表单字段：${name}` : `字段引用：${name}（当前表单中不存在）`}`));
            break;
          }
          case 'component': {
            const name = token.text.replace(/^@/, '');
            const component = ctx.components.find((item) => item.id === name || item.fieldBinding === name || item.props?.name === name || item.props?.label === name);
            contents.push(markdown(component
              ? `**${token.text}**\n\n${String(component.props?.label || component.fieldBinding || component.props?.name || component.id)} · ${component.type} · ${component.id}`
              : `**${token.text}**\n\n控件引用：${name}（当前表单中不存在）`));
            break;
          }
          case 'string': {
            const call = callContextAt(line, position.column);
            if (call) {
              const value = token.text.slice(1, -1);
              if (call.name === 'run' && call.index === 0) {
                const workflow = ctx.workflows.find((item) => item.id === value || item.name === value);
                contents.push(markdown(workflow ? `**流程**：${workflow.name} · ${workflow.id}` : `流程：${value}（未找到）`));
              } else if (call.name === 'options' && call.index === 1) {
                const table = ctx.tables.find((item) => item.id === value || item.fileName === value);
                contents.push(markdown(table ? `**数据表**：${table.fileName} · ${table.id}` : `数据表：${value}（未找到）`));
              }
            }
            break;
          }
          default:
            break;
        }
      }
      if (!contents.length) return null;
      const range = token
        ? new monaco.Range(position.lineNumber, token.start + 1, position.lineNumber, token.end + 1)
        : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);
      return { contents, range };
    },
  });
}

const ARG_LABELS: Record<string, string> = {
  field: '$字段',
  component: '@控件',
  string: '字符串',
  number: '数字',
  level: '级别',
  workflow: '流程ID',
  table: '数据表',
  operator: '运算符',
  validator: '校验器',
  any: '任意',
};

const DSL_CALL_SIGNATURES: Record<string, { args: string[]; variadic?: boolean }> = {
  show: { args: ['component'], variadic: true },
  hide: { args: ['component'], variadic: true },
  enable: { args: ['component'], variadic: true },
  disable: { args: ['component'], variadic: true },
  require: { args: ['field'], variadic: true },
  optional: { args: ['field'], variadic: true },
  clear: { args: ['field'], variadic: true },
  set: { args: ['field', 'any'] },
  message: { args: ['string', 'level'] },
  run: { args: ['workflow'] },
  options: { args: ['field', 'table', 'field', 'any'] },
  watch: { args: ['field'], variadic: true },
};

function signatureOf(name: string) {
  const signature = DSL_CALL_SIGNATURES[name];
  return signature ? { name, contexts: ['normal'], args: signature.args, variadic: signature.variadic } : null;
}

function registerSignatureHelp(monaco: Monaco): Disposable {
  return monaco.languages.registerSignatureHelpProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model: editor.ITextModel, position: Position) {
      const linePrefix = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
      const call = callContextAt(linePrefix, position.column);
      if (!call) return null;
      const signature = signatureOf(call.name);
      if (!signature) return null;
      const parameters = signature.args.map((kind, index) => ({
        label: `${ARG_LABELS[kind] || kind}${signature.variadic && index === signature.args.length - 1 ? ', …' : ''}`,
        documentation: kindDoc(kind),
      }));
      const label = `${call.name}(${signature.args.map((kind) => ARG_LABELS[kind] || kind).join(', ')}${signature.variadic ? ', …' : ''})`;
      const action = BEHAVIOR_DSL_ACTIONS.find((item) => item.name === call.name);
      const help: languages.SignatureHelp = {
        signatures: [{
          label,
          documentation: action ? { value: action.description } : undefined,
          parameters,
        }],
        activeSignature: 0,
        activeParameter: Math.min(call.index, Math.max(0, parameters.length - 1)),
      };
      return { value: help, dispose() { /* no-op */ } };
    },
  });
}

function kindDoc(kind: string): string {
  switch (kind) {
    case 'field': return '字段引用，使用 $字段';
    case 'component': return '控件引用，使用 @控件';
    case 'string': return '字符串字面量';
    case 'number': return '数字字面量';
    case 'level': return '消息级别：info / success / warning / error';
    case 'workflow': return '流程 ID（字符串）';
    case 'table': return '数据表 ID（字符串）';
    case 'operator': return '比较运算符';
    case 'validator': return '校验器名或 pattern("正则")';
    default: return '任意值或表达式';
  }
}

export interface DslReferenceFixCandidate {
  kind: 'field' | 'component' | 'table' | 'workflow';
  fromText: string;
  start: number;
  end: number;
  candidates: string[];
}

function componentRefSet(ctx: BehaviorDslServicesContext) {
  return new Set(ctx.components.flatMap((item) => [item.id, item.fieldBinding, item.props?.name, item.props?.label].filter(Boolean).map(String)));
}

/**
 * 收集一行内的无效引用及其候选替换项（与 lintRules 的 FFR202-205 同源判定）。
 */
/** 生成引用修复候选（字段/组件名纠错）。 */
export function dslReferenceFixCandidates(line: string, ctx: BehaviorDslServicesContext): DslReferenceFixCandidate[] {
  const result: DslReferenceFixCandidate[] = [];
  const hasContext = ctx.fields.length || ctx.components.length || ctx.tables.length || ctx.workflows.length;
  if (!hasContext) return result;
  const fields = new Set(ctx.fields);
  const components = componentRefSet(ctx);
  const tables = new Set(ctx.tables.flatMap((item) => [item.id, item.fileName].filter(Boolean).map(String)));
  const workflows = new Set(ctx.workflows.flatMap((item) => [item.id, item.name].filter(Boolean).map(String)));
  for (const token of scanDslLine(line)) {
    if (token.kind === 'field') {
      const name = token.text.replace(/^\$(form\.)?/, '');
      if (fields.size && !fields.has(name) && name !== 'value' && name !== 'event') {
        result.push({ kind: 'field', fromText: token.text, start: token.start, end: token.end, candidates: ctx.fields });
      }
    } else if (token.kind === 'component') {
      const name = token.text.replace(/^@/, '');
      if (components.size && !components.has(name)) {
        result.push({ kind: 'component', fromText: token.text, start: token.start, end: token.end, candidates: ctx.components.map((item) => item.id) });
      }
    }
  }
  const call = /(run|options)\(/.test(line);
  if (call && (tables.size || workflows.size)) {
    const runMatch = line.match(/run\s*\(([^)]*)\)/i);
    if (runMatch && workflows.size) {
      const value = normalizeReference(runMatch[1]);
      if (value && !workflows.has(value)) {
        const offset = line.indexOf(runMatch[0]);
        const valueOffset = offset + runMatch[0].indexOf(runMatch[1]);
        result.push({ kind: 'workflow', fromText: value, start: valueOffset, end: valueOffset + runMatch[1].length, candidates: ctx.workflows.map((item) => item.id) });
      }
    }
    const optionsMatch = line.match(/options\s*\(([^)]*)\)/i);
    if (optionsMatch && tables.size) {
      const args = splitTopLevel(optionsMatch[1]);
      if (args[1]) {
        const value = normalizeReference(args[1]);
        if (value && !tables.has(value)) {
          const offset = line.indexOf(optionsMatch[0]);
          const argOffset = offset + optionsMatch[0].indexOf(args[1]);
          result.push({ kind: 'table', fromText: value, start: argOffset, end: argOffset + args[1].length, candidates: ctx.tables.map((item) => item.id) });
        }
      }
    }
  }
  return result;
}

function textEditForLine(model: editor.ITextModel, lineNumber: number, replaceWith: string): languages.TextEdit {
  const maxColumn = model.getLineMaxColumn(lineNumber);
  return { range: monacoRange(model, lineNumber, 1, lineNumber, maxColumn), text: replaceWith };
}

// 轻量 Range 构造，避免在纯函数里依赖 Monaco 单例
function monacoRange(_model: editor.ITextModel, startLine: number, startColumn: number, endLine: number, endColumn: number): Range {
  return { startLineNumber: startLine, startColumn, endLineNumber: endLine, endColumn } as Range;
}

function registerCodeActions(monaco: Monaco): Disposable {
  return monaco.languages.registerCodeActionProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    provideCodeActions(model: editor.ITextModel, _range: Range, context: languages.CodeActionContext) {
      const ctx = contextOf(model);
      const actions: languages.CodeAction[] = [];
      const markers = context.markers || [];
      const seenLines = new Set<number>();
      for (const marker of markers) {
        const lineNumber = marker.startLineNumber;
        if (seenLines.has(lineNumber)) continue;
        seenLines.add(lineNumber);
        const line = model.getLineContent(lineNumber);
        if (marker.code === 'FFR101') {
          const phraseMatch = String(marker.message).match(/旧式动作语法"([^"]*)"仍可读取/);
          if (phraseMatch) {
            const phrase = phraseMatch[1];
            const legacy = parseLegacyAction(phrase);
            if (legacy?.suggestion && legacy.suggestion !== phrase) {
              const offset = line.indexOf(phrase);
              if (offset >= 0) {
                actions.push({
                  title: `转换为函数式动作：${legacy.suggestion}`,
                  kind: 'quickfix',
                  diagnostics: [marker],
                  edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: monacoRange(model, lineNumber, offset + 1, lineNumber, offset + phrase.length + 1), text: legacy.suggestion } }] },
                });
              }
            }
          }
        } else if (marker.code === 'FFR105') {
          actions.push({
            title: '补上 -> 动作分隔符',
            kind: 'quickfix',
            diagnostics: [marker],
            edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: textEditForLine(model, lineNumber, `${line} -> `) }] },
          });
        } else if (marker.code === 'FFR106') {
          const missing = String(marker.message).match(/还缺少 (\d+) 个右括号/);
          if (missing) {
            const count = Number(missing[1]);
            actions.push({
              title: `补全右括号${')'.repeat(count)}`,
              kind: 'quickfix',
              diagnostics: [marker],
              edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: monacoRange(model, lineNumber, line.length + 1, lineNumber, line.length + 1), text: ')'.repeat(count) } }] },
            });
          } else if (/多余的右括号/.test(String(marker.message))) {
            const trimmed = line.replace(/\)+$/, '');
            actions.push({
              title: '删除多余右括号',
              kind: 'quickfix',
              diagnostics: [marker],
              edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: textEditForLine(model, lineNumber, trimmed) }] },
            });
          }
        } else if (marker.code === 'FFR003') {
          const lineCount = model.getLineCount();
          const endRange = lineNumber < lineCount
            ? monacoRange(model, lineNumber, 1, lineNumber + 1, 1)
            : monacoRange(model, lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber) + 1);
          actions.push({
            title: '删除孤立 else 行',
            kind: 'quickfix',
            diagnostics: [marker],
            edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: endRange, text: '' } }] },
          });
        } else if (marker.code === 'FFR202' || marker.code === 'FFR203' || marker.code === 'FFR204' || marker.code === 'FFR205') {
          for (const candidate of dslReferenceFixCandidates(line, ctx)) {
            for (const replacement of candidate.candidates.slice(0, 5)) {
              const insertText = candidate.kind === 'field' ? `$${replacement}` : candidate.kind === 'component' ? `@${replacement}` : JSON.stringify(replacement);
              if (insertText === candidate.fromText) continue;
              actions.push({
                title: `替换 ${candidate.fromText} 为 ${insertText}`,
                kind: 'quickfix',
                diagnostics: [marker],
                edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: monacoRange(model, lineNumber, candidate.start + 1, lineNumber, candidate.end + 1), text: insertText } }] },
              });
            }
          }
        }
      }
      const source = model.getValue();
      if (source.trim()) {
        const formattedEdits = formatDslEdits(model, ctx);
        if (formattedEdits.length) {
          actions.push({
            title: '格式化规则文档',
            kind: 'quickfix',
            edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: formattedEdits[0] }] },
          });
        }
      }
      return { actions, dispose() { /* no-op */ } };
    },
  });
}

function statementName(line: string): { name: string; kind: languages.SymbolKind } | null {
  const trimmed = line.trim();
  if (/^when\b/i.test(trimmed)) return { name: `when ${trimmed.replace(/^when\b/i, '').trim()}`, kind: 23 }; // SymbolKind.Event
  if (/^else\b/i.test(trimmed)) return { name: 'else', kind: 23 };
  if (/^compute\b/i.test(trimmed)) return { name: trimmed, kind: 7 }; // SymbolKind.Field
  if (/^on change\b/i.test(trimmed)) return { name: trimmed, kind: 23 };
  if (/^(on load|on submit|before submit|before click)\b/i.test(trimmed)) return { name: trimmed, kind: 23 };
  return null;
}

/** 大纲符号：规则条目 + 注释段落。 */
/** 收集 DSL 符号（文档大纲用）。 */
export function collectDslSymbols(source: string): Array<{ name: string; kind: number; startLine: number; endLine: number }> {
  const symbols: Array<{ name: string; kind: number; startLine: number; endLine: number }> = [];
  const lines = source.split(/\r?\n/);
  let commentStart = -1;
  const flushComment = (endLine: number) => {
    if (commentStart >= 0) {
      symbols.push({ name: '注释', kind: 14, startLine: commentStart, endLine }); // SymbolKind.String
      commentStart = -1;
    }
  };
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) {
      flushComment(lineNumber - 1);
      return;
    }
    if (trimmed.startsWith('#')) {
      if (commentStart < 0) commentStart = lineNumber;
      return;
    }
    flushComment(lineNumber - 1);
    const statement = statementName(raw);
    if (statement) symbols.push({ name: statement.name, kind: statement.kind, startLine: lineNumber, endLine: lineNumber });
  });
  flushComment(lines.length);
  return symbols;
}

function isStatementLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(when|else|compute|on change|on load|on submit|before submit|before click)\b/i.test(trimmed);
}

/** 折叠区间：连续注释块与规则块（到下一个语句/注释/空行前）。 */
/** 收集折叠区间。 */
export function collectDslFoldingRanges(source: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const lines = source.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    if (trimmed.startsWith('#')) {
      let end = index;
      while (end + 1 < lines.length && lines[end + 1].trim().startsWith('#')) end += 1;
      if (end > index) ranges.push({ start: index + 1, end: end + 1 });
      index = end + 1;
      continue;
    }
    if (isStatementLine(lines[index])) {
      let end = index;
      while (end + 1 < lines.length && lines[end + 1].trim() && !lines[end + 1].trim().startsWith('#')) end += 1;
      if (end > index) ranges.push({ start: index + 1, end: end + 1 });
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return ranges;
}

/**
 * DSL 全量规范化：
 * - 字符串统一双引号（原串含双引号则保留单引号）；
 * - `->`、逗号、分号、二元运算符两侧单空格，函数括号内无空格；
 * - 规则块/注释块之间最多一空行（when/else 保持相邻）；
 * - 注释保留，行尾空白清除。
 */
/** 整文档格式化（空行压缩与注释保留）。 */
export function normalizeBehaviorDslDocument(source: string): string {
  const blocks: string[][] = [];
  let current: string[] | null = null;
  let pendingBlank = false;
  for (const raw of source.split(/\r?\n/)) {
    const normalized = normalizeBehaviorDslLine(raw);
    if (!normalized) {
      if (current) pendingBlank = true;
      continue;
    }
    if (current && pendingBlank) {
      blocks.push(current);
      current = [];
      pendingBlank = false;
    }
    if (!current) current = [];
    current.push(normalized);
  }
  if (current) blocks.push(current);
  if (!blocks.length) return '';
  const output = blocks.map((block) => block.join('\n')).join('\n\n');
  return `${output}\n`;
}

/** 单行格式化。 */
export function normalizeBehaviorDslLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return trimmed.replace(/[ \t]+$/, '');
  return applyDslSpacing(normalizeDslTokens(trimmed)).replace(/[ \t]+$/, '');
}

function normalizeDslTokens(line: string): string {
  const segments: Array<{ text: string; kind: 'string' | 'other' }> = [];
  let index = 0;
  while (index < line.length) {
    const rest = line.slice(index);
    STRING_PATTERN.lastIndex = 0;
    const stringMatch = rest.match(STRING_PATTERN);
    if (stringMatch && stringMatch.index === 0) {
      segments.push({ text: normalizeStringToken(stringMatch[0]), kind: 'string' });
      index += stringMatch[0].length;
      continue;
    }
    const chunk = rest.match(/[^\s"']+/y);
    if (chunk && chunk.index === 0) {
      segments.push({ text: chunk[0], kind: 'other' });
      index += chunk[0].length;
      continue;
    }
    index += 1;
  }
  const rebuilt: string[] = [];
  for (const segment of segments) {
    if (segment.kind === 'string') {
      rebuilt.push(segment.text);
      continue;
    }
    const refs: string[] = [];
    const protectedText = segment.text.replace(/(@[\w\u4e00-\u9fff.-]+|\$(?:form\.)?[\w\u4e00-\u9fff.-]+)/g, (ref) => {
      refs.push(ref);
      return `\u0000${refs.length - 1}\u0000`;
    });
    rebuilt.push(protectedText
      .replace(/(===|!==|>=|<=|==|!=|->|&&|\|\||[+\-*/%<>])/g, ' $1 ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*;\s*/g, '; ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\u0000(\d+)\u0000/g, (_match, number: string) => refs[Number(number)] || '')
      .replace(/\s+/g, ' ')
      .trim());
  }
  return rebuilt.join(' ');
}

/**
 * 字符串感知的最终间距规整：去除括号内侧、逗号/分号前多余空格，
 * 并恢复一元负号（`- 5` → `-5`），全程跳过字符串字面量。
 */
function applyDslSpacing(text: string): string {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"' || char === "'") {
      const stringMatch = text.slice(index).match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/);
      if (stringMatch && stringMatch.index === 0) {
        out += stringMatch[0];
        index += stringMatch[0].length;
        continue;
      }
    }
    if (char === '(') {
      out = out.replace(/ +$/, '');
      out += '(';
      index += 1;
      while (text[index] === ' ') index += 1;
      continue;
    }
    if (char === ')' || char === ',' || char === ';') {
      out = out.replace(/ +$/, '');
      out += char;
      index += 1;
      continue;
    }
    if (char === '-') {
      const lastChar = out.trimEnd().slice(-1);
      const nextText = text.slice(index + 1).replace(/^\s+/, '');
      const unary = !lastChar || ',(;'.includes(lastChar) || '+*/%<>=!'.includes(lastChar);
      if (unary && /^\d/.test(nextText)) {
        if (!lastChar || ',(;'.includes(lastChar)) out = out.replace(/ +$/, '');
        out += '-';
        index += 1;
        while (text[index] === ' ') index += 1;
        continue;
      }
    }
    out += char;
    index += 1;
  }
  return out.trim();
}

function normalizeStringToken(token: string): string {
  if (token.startsWith('"')) return token;
  const content = token.slice(1, -1).replace(/\\'/g, "'");
  if (content.includes('"')) return token; // 含双引号则保留单引号
  return JSON.stringify(content);
}

function formatDslEdits(model: editor.ITextModel, ctx: BehaviorDslServicesContext): languages.TextEdit[] {
  const source = model.getValue();
  const formatted = normalizeBehaviorDslDocument(source);
  if (formatted === source) return [];
  const originalHasErrors = hasBehaviorDslErrors(compileBehaviorDsl(source, ctx));
  const formattedHasErrors = hasBehaviorDslErrors(compileBehaviorDsl(formatted, ctx));
  if (!originalHasErrors && formattedHasErrors) return [];
  return [{ range: model.getFullModelRange(), text: formatted }];
}

function registerFormatting(monaco: Monaco): Disposable {
  return monaco.languages.registerDocumentFormattingEditProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    provideDocumentFormattingEdits(model: editor.ITextModel) {
      return formatDslEdits(model, contextOf(model));
    },
  });
}

function registerDocumentSymbols(monaco: Monaco): Disposable {
  return monaco.languages.registerDocumentSymbolProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    provideDocumentSymbols(model: editor.ITextModel) {
      return collectDslSymbols(model.getValue()).map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind as languages.SymbolKind,
        range: new monaco.Range(symbol.startLine, 1, symbol.endLine, model.getLineMaxColumn(symbol.endLine)),
        selectionRange: new monaco.Range(symbol.startLine, 1, symbol.startLine, model.getLineMaxColumn(symbol.startLine)),
      }));
    },
  });
}

function registerFolding(monaco: Monaco): Disposable {
  return monaco.languages.registerFoldingRangeProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    provideFoldingRanges(model: editor.ITextModel) {
      return collectDslFoldingRanges(model.getValue()).map((range) => ({ start: range.start, end: range.end }));
    },
  });
}

/** 规则驱动的 DSL 内联 ghost text。 */
/** 行内补全文本（参数/引用提示）。 */
export function dslInlineCompletionText(linePrefix: string, ctx: BehaviorDslServicesContext): string {
  const bare = linePrefix.replace(/\s+/g, ' ').trim();
  const firstField = ctx.fields[0];
  const firstComponent = ctx.components[0];
  const componentRef = firstComponent ? `@${firstComponent.id}` : '@控件';
  if (!bare) {
    return `when ${firstField ? `$${firstField}` : '$字段'} == "值" -> show(${componentRef})`;
  }
  if (/^when\b/i.test(bare) && !bare.includes('->') && /(==|!=|>|<|>=|<=|contains|starts with|ends with|is empty|is not empty)/i.test(bare)) {
    return ` -> show(${componentRef})`;
  }
  if (/^(show|hide|enable|disable)\(@[^)]+\)$/i.test(bare)) {
    return firstField ? `; require($${firstField})` : '';
  }
  if (/^set\([^,]+,?\s*$/i.test(bare) && !bare.includes('=')) {
    return `${firstField ? `$${firstField}` : '表达式'})`;
  }
  return '';
}

function registerInlineCompletions(monaco: Monaco): Disposable {
  return monaco.languages.registerInlineCompletionsProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    provideInlineCompletions(model: editor.ITextModel, position: Position) {
      const linePrefix = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column));
      const insertText = dslInlineCompletionText(linePrefix, contextOf(model));
      if (!insertText) return null;
      return {
        items: [{ insertText, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }],
        commands: [],
      };
    },
    freeInlineCompletions() { /* no-op */ },
  });
}

const SEMANTIC_TOKEN_TYPES = ['field', 'component', 'action', 'operator', 'level', 'table', 'workflow', 'string', 'number', 'comment', 'keyword', 'error'];

function registerSemanticTokens(monaco: Monaco): Disposable {
  return monaco.languages.registerDocumentSemanticTokensProvider(BEHAVIOR_DSL_LANGUAGE_ID, {
    getSemanticTokensLegend() {
      return { tokenTypes: SEMANTIC_TOKEN_TYPES, tokenModifiers: [] };
    },
    provideDocumentSemanticTokens(model: editor.ITextModel) {
      const ctx = contextOf(model);
      const data: number[] = [];
      let previousLine = 0;
      let previousStart = 0;
      for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
        const line = model.getLineContent(lineNumber);
        for (const token of scanDslLine(line)) {
          let kind: DslTokenKind = token.kind;
          if (token.kind === 'string') {
            const call = callContextAt(line, token.start + 1);
            if (call?.name === 'run' && call.index === 0) kind = 'workflow';
            else if (call?.name === 'options' && call.index === 1) kind = 'table';
          }
          if (token.kind === 'field') {
            const name = token.text.replace(/^\$(form\.)?/, '');
            if (ctx.fields.length && !ctx.fields.includes(name) && name !== 'value' && name !== 'event') kind = 'error';
          }
          if (token.kind === 'component') {
            const name = token.text.replace(/^@/, '');
            const refs = componentRefSet(ctx);
            if (ctx.components.length && !refs.has(name)) kind = 'error';
          }
          const typeIndex = SEMANTIC_TOKEN_TYPES.indexOf(kind);
          if (typeIndex < 0) continue;
          const lineDelta = lineNumber - previousLine;
          const startDelta = lineDelta > 0 ? token.start : token.start - previousStart;
          data.push(lineDelta, startDelta, token.end - token.start, typeIndex, 0);
          previousLine = lineNumber;
          previousStart = token.start;
        }
      }
      return { data: Uint32Array.from(data) };
    },
  });
}

/**
 * 注册 DSL 全部语言服务。上下文按 model URI 绑定，多个编辑器实例
 * （内联/全屏/不同表单）互不串扰；Provider 本身按语言共享。
 */
/** 注册 DSL 语言服务（补全/悬停/诊断/格式化）。 */
export function registerBehaviorDslLanguageServices(
  monaco: Monaco,
  instance: editor.IStandaloneCodeEditor,
  ctx: BehaviorDslServicesContext,
): Disposable {
  const uri = instance.getModel()?.uri.toString();
  if (uri) contextByUri.set(uri, ctx);
  const acquire = acquireLanguageProviders(monaco, BEHAVIOR_DSL_LANGUAGE_ID, (monacoInstance) => [
    registerHover(monacoInstance),
    registerSignatureHelp(monacoInstance),
    registerCodeActions(monacoInstance),
    registerDocumentSymbols(monacoInstance),
    registerFolding(monacoInstance),
    registerFormatting(monacoInstance),
    registerInlineCompletions(monacoInstance),
    registerSemanticTokens(monacoInstance),
  ]);
  return {
    dispose() {
      acquire.dispose();
      if (uri) contextByUri.delete(uri);
    },
  };
}

/** 测试辅助：清空 URI 上下文。 */
/** 重置语言服务上下文（测试用）。 */
export function resetBehaviorDslContextForTest() {
  contextByUri.clear();
}
