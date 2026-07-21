import type { ActionConfig, BehaviorRule, ConditionConfig, ConditionOperator, TriggerType } from './behaviorEngine';
import type { DesignComponent, FormLinkageAction, FormLinkageCondition, FormLinkageOperator, FormLinkageRule, SrcTableEntry, WorkflowFile } from '../../project/types';

export type BehaviorDslDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface BehaviorDslDiagnostic {
  line: number;
  column: number;
  endColumn?: number;
  severity: BehaviorDslDiagnosticSeverity;
  code: string;
  message: string;
  suggestion?: string;
}

export interface BehaviorDslCompileContext {
  fields?: string[];
  components?: DesignComponent[];
  tables?: SrcTableEntry[];
  workflows?: WorkflowFile[];
}

export interface BehaviorDslCompilation {
  rules: BehaviorRule[];
  diagnostics: BehaviorDslDiagnostic[];
  preview: string[];
}

export interface NaturalRuleTranslation { dsl: string; preview: string[]; diagnostics: string[]; }

function splitChineseList(source: string) {
  return source.split(/[、,，和及]/).map((item) => item.trim()).filter(Boolean);
}

function fieldRef(value: string) { return `$${value.trim().replace(/^\$form\.|^\$/, '')}`; }
function componentRef(value: string) { return `@${value.trim().replace(/^@/, '')}`; }

export function naturalLanguageToBehaviorDsl(source: string): NaturalRuleTranslation {
  const lines: string[] = [];
  const preview: string[] = [];
  const diagnostics: string[] = [];
  const clauses = source.split(/[；;。\n]+/).map((item) => item.trim()).filter(Boolean);
  for (const clause of clauses) {
    let match: RegExpMatchArray | null;
    if ((match = clause.match(/^(?:当)?(.+?)(?:等于|是)(.+?)时(?:，)?(显示|隐藏|启用|禁用)(.+)$/))) {
      const action = ({ 显示: 'show', 隐藏: 'hide', 启用: 'enable', 禁用: 'disable' } as const)[match[3] as '显示'];
      const targets = splitChineseList(match[4]);
      lines.push(`when ${fieldRef(match[1])} == ${JSON.stringify(match[2].trim())} -> ${action}(${targets.map(componentRef).join(', ')})`);
      preview.push(`当“${match[1].trim()}”等于“${match[2].trim()}”时，${match[3]}“${targets.join('、')}”。`);
    } else if ((match = clause.match(/^(?:当)?(.+?)为空时(?:，)?(显示|隐藏|启用|禁用)(.+)$/))) {
      const action = ({ 显示: 'show', 隐藏: 'hide', 启用: 'enable', 禁用: 'disable' } as const)[match[2] as '显示'];
      const targets = splitChineseList(match[3]);
      lines.push(`when ${fieldRef(match[1])} is empty -> ${action}(${targets.map(componentRef).join(', ')})`);
      preview.push(`当“${match[1].trim()}”为空时，${match[2]}“${targets.join('、')}”。`);
    } else if ((match = clause.match(/^提交前(?:要求)?(.+?)(?:为)?必填$/))) {
      const fields = splitChineseList(match[1]);
      lines.push(`before submit -> require(${fields.map(fieldRef).join(', ')})`);
      preview.push(`提交前校验“${fields.join('、')}”为必填。`);
    } else if ((match = clause.match(/^(.+?)变化时(?:，)?计算(.+?)(?:为|=)(.+)$/))) {
      const fields = splitChineseList(match[1]);
      lines.push(`compute ${fieldRef(match[2])} = ${match[3].trim()} watch(${fields.map(fieldRef).join(', ')})`);
      preview.push(`${fields.join('、')}变化时计算“${match[2].trim()}”。`);
    } else diagnostics.push(`无法识别：“${clause}”`);
  }
  return { dsl: lines.join('\n'), preview, diagnostics };
}

const OPERATOR_MAP: Array<[RegExp, ConditionOperator]> = [
  [/\s+is\s+not\s+empty\s*$/i, 'isNotEmpty'], [/\s+is\s+empty\s*$/i, 'isEmpty'],
  [/\s+not\s+starts\s+with\s+/i, 'notStartsWith'], [/\s+starts\s+with\s+/i, 'startsWith'],
  [/\s+not\s+ends\s+with\s+/i, 'notEndsWith'], [/\s+ends\s+with\s+/i, 'endsWith'],
  [/\s+not\s+contains\s+/i, 'notContains'], [/\s+contains\s+/i, 'contains'],
  [/\s*>=\s*/, '>='], [/\s*<=\s*/, '<='], [/\s*!=\s*/, '!='], [/\s*==\s*/, '=='], [/\s*>\s*/, '>'], [/\s*<\s*/, '<'],
];

function stripComment(source: string) {
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '#') return source.slice(0, index);
  }
  return source;
}

function splitTopLevel(source: string, separators = ',') {
  const result: string[] = [];
  let start = 0; let depth = 0; let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (depth === 0 && separators.includes(char)) { result.push(source.slice(start, index).trim()); start = index + 1; }
  }
  result.push(source.slice(start).trim());
  return result.filter(Boolean);
}

function literal(source: string): unknown {
  const trimmed = source.trim();
  if (!trimmed) return undefined;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try { return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed.slice(1, -1).replace(/\\'/g, "'"); } catch { return trimmed.slice(1, -1); }
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (!Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function normalizeReference(source: string) {
  const value = literal(source);
  return String(value ?? '').trim().replace(/^\$form\.|^[\$@]/, '');
}

function parseCondition(source: string): ConditionConfig | null {
  for (const [pattern, operator] of OPERATOR_MAP) {
    const match = source.match(pattern);
    if (!match || match.index === undefined) continue;
    const fieldName = normalizeReference(source.slice(0, match.index));
    const right = source.slice(match.index + match[0].length).trim();
    if (!fieldName || (!right && operator !== 'isEmpty' && operator !== 'isNotEmpty')) return null;
    return { fieldName, operator, value: operator === 'isEmpty' || operator === 'isNotEmpty' ? undefined : literal(right), logic: 'AND' };
  }
  return null;
}

function parseRefs(source: string) { return splitTopLevel(source).map(normalizeReference).filter(Boolean); }

interface ParsedActions { actions: ActionConfig[]; diagnostics: Array<{ message: string; code: string; severity: BehaviorDslDiagnosticSeverity; suggestion?: string }>; }

function parseCanonicalAction(phrase: string): ActionConfig[] | null {
  const call = phrase.match(/^([a-z]+)\s*\((.*)\)$/i);
  if (!call) return null;
  const name = call[1].toLowerCase();
  const args = splitTopLevel(call[2]);
  if (['show', 'hide', 'enable', 'disable'].includes(name) && args.length) {
    const type = ({ show: 'setVisible', hide: 'setHidden', enable: 'setEnabled', disable: 'setDisabled' } as const)[name as 'show'];
    return args.map((targetComponent) => ({ type, targetComponent: normalizeReference(targetComponent) }));
  }
  if (['require', 'optional', 'clear'].includes(name) && args.length) {
    const type = ({ require: 'setRequired', optional: 'setOptional', clear: 'clearValue' } as const)[name as 'require'];
    return args.map((targetField) => ({ type, targetField: normalizeReference(targetField) }));
  }
  if (name === 'set' && args.length === 2) return [{ type: 'setValue', targetField: normalizeReference(args[0]), expression: args[1].trim() }];
  if (name === 'message' && (args.length === 1 || args.length === 2)) {
    const level = normalizeReference(args[1] || 'info');
    if (!['info', 'success', 'warning', 'error'].includes(level)) return null;
    return [{ type: 'showMessage', message: String(literal(args[0]) ?? ''), messageType: level as ActionConfig['messageType'] }];
  }
  if (name === 'run' && args.length <= 1) return [{ type: 'runWorkflow', workflowId: args[0] ? normalizeReference(args[0]) : undefined }];
  if (name === 'options' && args.length === 4) return [{ type: 'setOptions', targetField: normalizeReference(args[0]), optionsConfig: { table: normalizeReference(args[1]), filterField: normalizeReference(args[2]), filterValue: literal(args[3]) } }];
  return null;
}

function parseLegacyAction(phrase: string): { actions: ActionConfig[]; suggestion?: string } | null {
  let match: RegExpMatchArray | null;
  if ((match = phrase.match(/^(show|hide|enable|disable)\s+(.+)$/i))) {
    const name = match[1].toLowerCase();
    const type = ({ show: 'setVisible', hide: 'setHidden', enable: 'setEnabled', disable: 'setDisabled' } as const)[name as 'show'];
    const refs = parseRefs(match[2]);
    return { actions: refs.map((targetComponent) => ({ type, targetComponent })), suggestion: `${name}(${refs.map(componentRef).join(', ')})` };
  }
  if ((match = phrase.match(/^(require|optional|clear)\s*(\(.+\)|.+)$/i))) {
    const name = match[1].toLowerCase();
    const type = ({ require: 'setRequired', optional: 'setOptional', clear: 'clearValue' } as const)[name as 'require'];
    const refs = parseRefs(match[2].replace(/^\(|\)$/g, ''));
    return { actions: refs.map((targetField) => ({ type, targetField })), suggestion: `${name}(${refs.map(fieldRef).join(', ')})` };
  }
  if ((match = phrase.match(/^set\s+([^=]+?)\s*=\s*(.+)$/i))) return { actions: [{ type: 'setValue', targetField: normalizeReference(match[1]), expression: match[2].trim() }], suggestion: `set(${fieldRef(match[1])}, ${match[2].trim()})` };
  if ((match = phrase.match(/^message\s+(["'])(.*?)\1(?:\s+(info|success|warning|error))?$/i))) return { actions: [{ type: 'showMessage', message: match[2], messageType: (match[3] || 'info') as ActionConfig['messageType'] }], suggestion: `message(${JSON.stringify(match[2])}, ${match[3] || 'info'})` };
  if ((match = phrase.match(/^run\s+([\w:.-]+)$/i))) return { actions: [{ type: 'runWorkflow', workflowId: match[1] }], suggestion: `run(${JSON.stringify(match[1])})` };
  if ((match = phrase.match(/^options\s+(.+?)\s+from\s+([\w:.-]+)\s+where\s+(.+?)\s*=\s*(.+)$/i))) return { actions: [{ type: 'setOptions', targetField: normalizeReference(match[1]), optionsConfig: { table: match[2], filterField: normalizeReference(match[3]), filterValue: literal(match[4]) } }], suggestion: `options(${fieldRef(match[1])}, ${JSON.stringify(match[2])}, ${JSON.stringify(normalizeReference(match[3]))}, ${match[4].trim()})` };
  if (/^(save|submit)(?:\s+.*)?$/i.test(phrase)) return { actions: [{ type: 'submitData' }], suggestion: 'run()' };
  return null;
}

function parseActions(source: string): ParsedActions {
  const actions: ActionConfig[] = [];
  const diagnostics: ParsedActions['diagnostics'] = [];
  let phrases = splitTopLevel(source, ';');
  if (phrases.length === 1 && !parseCanonicalAction(phrases[0])) phrases = splitTopLevel(source, ',;');
  for (const phrase of phrases) {
    const canonical = parseCanonicalAction(phrase);
    if (canonical) { actions.push(...canonical); continue; }
    const legacy = parseLegacyAction(phrase);
    if (legacy) {
      actions.push(...legacy.actions);
      diagnostics.push({ severity: 'warning', code: 'FFR101', message: `旧式动作语法“${phrase}”仍可读取，建议改为函数式动作。`, suggestion: legacy.suggestion });
    } else diagnostics.push({ severity: 'error', code: 'FFR002', message: `不支持的动作“${phrase}”。` });
  }
  return { actions, diagnostics };
}

const INVERSE_OPERATOR: Partial<Record<ConditionOperator, ConditionOperator>> = {
  '==': '!=', '!=': '==', '>': '<=', '<': '>=', '>=': '<', '<=': '>', contains: 'notContains', notContains: 'contains',
  startsWith: 'notStartsWith', notStartsWith: 'startsWith', endsWith: 'notEndsWith', notEndsWith: 'endsWith', isEmpty: 'isNotEmpty', isNotEmpty: 'isEmpty',
};

function inverseCondition(condition: ConditionConfig): ConditionConfig { return { ...condition, operator: INVERSE_OPERATOR[condition.operator] || 'custom', customExpression: INVERSE_OPERATOR[condition.operator] ? undefined : 'false' }; }
function createRule(id: string, name: string, trigger: BehaviorRule['trigger'], conditions: ConditionConfig[], actions: ActionConfig[]): BehaviorRule { return { id, name, enabled: true, priority: 20, trigger, conditions, actions, sideEffects: [] }; }
function diagnostic(line: number, code: string, message: string, severity: BehaviorDslDiagnosticSeverity = 'error', column = 1, suggestion?: string): BehaviorDslDiagnostic { return { line, column, severity, code, message, suggestion }; }

function lintRules(rules: BehaviorRule[], context: BehaviorDslCompileContext, sourceLines: string[]): BehaviorDslDiagnostic[] {
  const result: BehaviorDslDiagnostic[] = [];
  const fields = new Set(context.fields || []);
  const componentRefs = new Set((context.components || []).flatMap((component) => [component.id, component.fieldBinding, component.props?.name, component.props?.label].filter(Boolean).map(String)));
  const tableRefs = new Set((context.tables || []).flatMap((table) => [table.id, table.fileName].filter(Boolean).map(String)));
  const workflowRefs = new Set((context.workflows || []).flatMap((workflow) => [workflow.id, workflow.name].filter(Boolean).map(String)));
  const hasContext = fields.size || componentRefs.size || tableRefs.size || workflowRefs.size;
  if (!hasContext) return result;
  for (const rule of rules) {
    const line = Number(rule.id.match(/^dsl_(\d+)/)?.[1] || 1);
    const referencedFields = new Set<string>();
    if (rule.trigger.fieldName) referencedFields.add(rule.trigger.fieldName);
    rule.conditions.forEach((item) => referencedFields.add(item.fieldName));
    for (const action of rule.actions) {
      if (action.targetField) referencedFields.add(action.targetField);
      if (action.expression) for (const match of action.expression.matchAll(/\$(?:form\.)?([\w\u4e00-\u9fff.-]+)/g)) referencedFields.add(match[1]);
      if (action.targetComponent && componentRefs.size && !componentRefs.has(action.targetComponent)) result.push(diagnostic(line, 'FFR203', `找不到控件“${action.targetComponent}”。`, 'error'));
      if (action.type === 'setOptions' && action.optionsConfig?.table && tableRefs.size && !tableRefs.has(action.optionsConfig.table)) result.push(diagnostic(line, 'FFR204', `找不到数据表“${action.optionsConfig.table}”。`, 'error'));
      if (action.type === 'runWorkflow' && action.workflowId && workflowRefs.size && !workflowRefs.has(action.workflowId)) result.push(diagnostic(line, 'FFR205', `找不到流程“${action.workflowId}”。`, 'error'));
      if (rule.trigger.fieldName && action.targetField === rule.trigger.fieldName) result.push(diagnostic(line, 'FFR302', `动作会写回触发字段“${action.targetField}”，可能形成循环。`, 'warning'));
    }
    if (fields.size) for (const field of referencedFields) if (!fields.has(field) && field !== 'value' && field !== 'event') result.push(diagnostic(line, 'FFR202', `字段“${field}”不在当前表单中。`, 'warning'));
    if (/^on\s+submit/i.test(sourceLines[line - 1] || '') && rule.actions.some((action) => action.type === 'submitData')) result.push(diagnostic(line, 'FFR303', 'on submit 中不能再次提交表单，否则会形成递归。', 'error'));
  }
  return result;
}

export function compileBehaviorDsl(source: string, context: BehaviorDslCompileContext = {}): BehaviorDslCompilation {
  const rules: BehaviorRule[] = [];
  const diagnostics: BehaviorDslDiagnostic[] = [];
  const preview: string[] = [];
  let previousConditional: { condition: ConditionConfig; trigger: BehaviorRule['trigger']; line: number } | null = null;
  const lines = source.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    let line = stripComment(raw).trim();
    if (!line) return;
    let match: RegExpMatchArray | null;
    if ((match = line.match(/^otherwise\s*->/i))) {
      diagnostics.push(diagnostic(lineNumber, 'FFR100', 'otherwise 是旧写法，请改用 else。', 'warning', 1, line.replace(/^otherwise/i, 'else')));
      line = line.replace(/^otherwise/i, 'else');
    }
    if ((match = line.match(/^when\s+(.+?)\s*->\s*(.+)$/i))) {
      const condition = parseCondition(match[1]); const parsed = parseActions(match[2]);
      if (!condition) diagnostics.push(diagnostic(lineNumber, 'FFR001', '条件格式无效；条件必须以字段引用开头，并使用受支持的运算符。'));
      parsed.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, line.indexOf('->') + 3, item.suggestion)));
      if (!/^\$(?:form\.)?/.test(match[1].trim())) diagnostics.push(diagnostic(lineNumber, 'FFR102', '条件字段应使用 $字段 引用。', 'warning', 6, condition ? `when ${fieldRef(condition.fieldName)}${match[1].slice(match[1].search(/\s/))} -> ${match[2]}` : undefined));
      if (condition && parsed.actions.length) { const trigger = { type: 'fieldChange' as TriggerType, fieldName: condition.fieldName }; rules.push(createRule(`dsl_${lineNumber}`, `当 ${match[1]}`, trigger, [condition], parsed.actions)); previousConditional = { condition, trigger, line: lineNumber }; preview.push(`字段“${condition.fieldName}”变化且条件成立时，执行 ${parsed.actions.length} 个动作。`); }
      return;
    }
    if ((match = line.match(/^else\s*->\s*(.+)$/i))) {
      const parsed = parseActions(match[1]);
      if (!previousConditional) diagnostics.push(diagnostic(lineNumber, 'FFR003', 'else 前需要一条相邻的 when 规则。'));
      parsed.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
      if (previousConditional && parsed.actions.length) { rules.push(createRule(`dsl_${lineNumber}`, `否则（对应第 ${previousConditional.line} 行）`, previousConditional.trigger, [inverseCondition(previousConditional.condition)], parsed.actions)); preview.push(`否则执行 ${parsed.actions.length} 个动作。`); }
      return;
    }
    if ((match = line.match(/^compute\s+(.+?)\s*=\s*(.+?)\s+(watch|on\s+change)\s*\((.+)\)\s*$/i))) {
      const target = normalizeReference(match[1]); const fields = parseRefs(match[4]);
      if (match[3].toLowerCase() !== 'watch') diagnostics.push(diagnostic(lineNumber, 'FFR103', 'compute 的旧式 on change 已改为 watch。', 'warning', 1, `compute ${fieldRef(target)} = ${match[2].trim()} watch(${fields.map(fieldRef).join(', ')})`));
      if (!fields.length) diagnostics.push(diagnostic(lineNumber, 'FFR004', 'compute 至少需要一个监听字段。'));
      if (new Set(fields).size !== fields.length) diagnostics.push(diagnostic(lineNumber, 'FFR301', 'watch 中存在重复字段，编译时只会监听一次。', 'warning'));
      if (!/^\$/.test(match[1].trim()) || fields.some((field) => !match![4].includes(`$${field}`))) diagnostics.push(diagnostic(lineNumber, 'FFR102', 'compute 目标和 watch 字段应使用 $字段 引用。', 'warning'));
      [...new Set(fields)].forEach((fieldName, fieldIndex) => rules.push(createRule(`dsl_${lineNumber}_${fieldIndex}`, `计算 ${target}`, { type: 'fieldChange', fieldName }, [], [{ type: 'setValue', targetField: target, expression: match![2].trim() }])));
      if (fields.length) preview.push(`${[...new Set(fields)].join('、')}变化时，重新计算“${target}”。`);
      previousConditional = null; return;
    }
    if ((match = line.match(/^on\s+change\s*\((.+)\)\s*->\s*(.+)$/i)) || (match = line.match(/^on\s+(.+?)\s+change\s*->\s*(.+)$/i))) {
      const legacy = !/^on\s+change\s*\(/i.test(line); const field = normalizeReference(match[1]); const parsed = parseActions(match[2]);
      if (legacy) diagnostics.push(diagnostic(lineNumber, 'FFR104', '字段变化触发器应写为 on change($字段)。', 'warning', 1, `on change(${fieldRef(field)}) -> ${match[2]}`));
      parsed.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
      if (parsed.actions.length) rules.push(createRule(`dsl_${lineNumber}`, `${field}变化`, { type: 'fieldChange', fieldName: field }, [], parsed.actions));
      previousConditional = null; return;
    }
    if ((match = line.match(/^(before\s+submit|on\s+load|on\s+submit)\s*->\s*(.+)$/i))) {
      const event = match[1].toLowerCase() === 'before submit' ? 'beforeSubmit' : match[1].toLowerCase() === 'on load' ? 'formLoad' : 'submit'; const parsed = parseActions(match[2]);
      parsed.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
      if (parsed.actions.length) rules.push(createRule(`dsl_${lineNumber}`, match[1], { type: event as TriggerType }, [], parsed.actions));
      previousConditional = null; return;
    }
    diagnostics.push(diagnostic(lineNumber, 'FFR000', '无法识别这条规则。'));
    previousConditional = null;
  });
  diagnostics.push(...lintRules(rules, context, lines));
  return { rules, diagnostics, preview };
}

export function hasBehaviorDslErrors(compilation: Pick<BehaviorDslCompilation, 'diagnostics'>) { return compilation.diagnostics.some((item) => item.severity === 'error'); }

export function behaviorRulesToNaturalLanguage(rules: BehaviorRule[]) {
  return rules.map((rule) => { const trigger = rule.trigger.fieldName ? `${rule.trigger.fieldName}发生${rule.trigger.type}` : `发生${rule.trigger.type}`; const condition = rule.conditions.length ? `，满足 ${rule.conditions.map((item) => `${item.fieldName} ${item.operator} ${String(item.value ?? '')}`).join(' 且 ')}` : ''; return `${trigger}${condition}，执行 ${rule.actions.map((action) => action.type).join('、')}。`; });
}

const LINKAGE_OPERATOR: Partial<Record<ConditionOperator, FormLinkageOperator>> = {
  '==': 'equals', '!=': 'notEquals', '>': 'greaterThan', '<': 'lessThan', '>=': 'greaterOrEqual', '<=': 'lessOrEqual',
  contains: 'contains', notContains: 'notContains', startsWith: 'startsWith', notStartsWith: 'notStartsWith', endsWith: 'endsWith', notEndsWith: 'notEndsWith', isEmpty: 'isEmpty', isNotEmpty: 'isNotEmpty',
};

function toLinkageAction(action: ActionConfig, index: number): FormLinkageAction | null {
  const id = `action_${index}`;
  switch (action.type) {
    case 'setValue': return { id, type: 'setValue', targetField: action.targetField, value: action.value, expression: action.expression };
    case 'clearValue': return { id, type: 'setValue', targetField: action.targetField, value: '' };
    case 'setVisible': return { id, type: 'setVisible', targetComponentId: action.targetComponent, visible: true };
    case 'setHidden': return { id, type: 'setVisible', targetComponentId: action.targetComponent, visible: false };
    case 'setEnabled': return { id, type: 'setDisabled', targetComponentId: action.targetComponent, disabled: false };
    case 'setDisabled': return { id, type: 'setDisabled', targetComponentId: action.targetComponent, disabled: true };
    case 'setRequired': return { id, type: 'setRequired', targetField: action.targetField, required: true };
    case 'setOptional': return { id, type: 'setRequired', targetField: action.targetField, required: false };
    case 'showMessage': return { id, type: 'showMessage', message: action.message, level: action.messageType };
    case 'runWorkflow': return { id, type: 'runWorkflow', workflowId: action.workflowId, parameters: action.workflowParameters };
    case 'setOptions': return { id, type: 'setOptions', targetField: action.targetField, optionsConfig: action.optionsConfig };
    case 'submitData': return { id, type: 'runWorkflow' };
    default: return null;
  }
}

function triggerEventName(trigger: BehaviorRule['trigger']) { if (trigger.type === 'fieldChange' || trigger.type === 'valueChange') return 'onChange'; if (trigger.type === 'formLoad') return 'onLoad'; if (trigger.type === 'beforeSubmit') return 'onBeforeSubmit'; if (trigger.type === 'submit') return 'onSubmit'; if (trigger.type === 'buttonClick') return 'onClick'; return `on${trigger.type.charAt(0).toUpperCase()}${trigger.type.slice(1)}`; }

export function behaviorRuleToLinkageRule(rule: BehaviorRule): FormLinkageRule {
  const conditions = rule.conditions.map((condition, index): FormLinkageCondition | null => { const operator = LINKAGE_OPERATOR[condition.operator]; return operator ? { id: `condition_${index}`, field: condition.fieldName, operator, value: condition.value } : null; }).filter(Boolean) as FormLinkageCondition[];
  const actions = rule.actions.map(toLinkageAction).filter(Boolean) as FormLinkageAction[];
  return { id: rule.id, name: rule.name, trigger: { eventName: triggerEventName(rule.trigger), sourceField: rule.trigger.fieldName }, conditions, conditionMode: rule.conditions.some((condition) => condition.logic === 'OR') ? 'any' : 'all', actions, scope: rule.trigger.fieldName ? 'target-fields' : 'current-form', enabled: rule.enabled, priority: rule.priority };
}

export function applyBehaviorDslToComponents(components: DesignComponent[], source: string) {
  const fields = components.map((component) => String(component.fieldBinding || component.props?.name || '')).filter(Boolean);
  const compilation = compileBehaviorDsl(source, { fields, components });
  const unapplied: string[] = [];
  const patches = new Map<string, Record<string, FormLinkageRule[]>>();
  for (const rule of compilation.rules) {
    const field = rule.trigger.fieldName;
    const target = field ? components.find((component) => String(component.fieldBinding || component.props?.name || '') === field) : components.find((component) => component.type === 'form');
    if (!target) { unapplied.push(field ? `找不到触发字段：${field}` : `找不到表单容器：${rule.name}`); continue; }
    let missingActionTarget = false;
    const normalizedActions = rule.actions.map((action) => {
      if (!action.targetComponent) return action;
      const actionTarget = components.find((component) => component.id === action.targetComponent || String(component.fieldBinding || '') === action.targetComponent || String(component.props?.name || '') === action.targetComponent || String(component.props?.label || '') === action.targetComponent);
      if (!actionTarget) { unapplied.push(`找不到动作控件：${action.targetComponent}（${rule.name}）`); missingActionTarget = true; return action; }
      return { ...action, targetComponent: actionTarget.id };
    });
    if (missingActionTarget) continue;
    const linkage = behaviorRuleToLinkageRule({ ...rule, actions: normalizedActions }); const eventName = linkage.trigger.eventName;
    const current = patches.get(target.id) || { ...((target.props?.linkageRules || {}) as Record<string, FormLinkageRule[]>) };
    const existing = (current[eventName] || []).filter((item) => item.id !== linkage.id); current[eventName] = [...existing, linkage]; patches.set(target.id, current);
  }
  return { ...compilation, components: components.map((component) => patches.has(component.id) ? { ...component, props: { ...component.props, linkageRules: patches.get(component.id) } } : component), unapplied };
}
