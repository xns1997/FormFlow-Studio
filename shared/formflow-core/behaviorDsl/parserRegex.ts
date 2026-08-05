import type {
  TriggerType, ConditionOperator, ConditionConfig, ActionConfig, BehaviorRule,
  BehaviorDslDiagnosticSeverity, BehaviorDslDiagnostic, BehaviorDslCompileContext, BehaviorDslCompilation,
} from './types';

/** 条件运算符文本 → 枚举的匹配表（按优先级顺序尝试）。 */
export const OPERATOR_MAP: Array<[RegExp, ConditionOperator]> = [
  [/\s+is\s+not\s+empty\s*$/i, 'isNotEmpty'], [/\s+is\s+empty\s*$/i, 'isEmpty'],
  [/\s+not\s+starts\s+with\s+/i, 'notStartsWith'], [/\s+starts\s+with\s+/i, 'startsWith'],
  [/\s+not\s+ends\s+with\s+/i, 'notEndsWith'], [/\s+ends\s+with\s+/i, 'endsWith'],
  [/\s+not\s+contains\s+/i, 'notContains'], [/\s+contains\s+/i, 'contains'],
  [/\s*>=\s*/, '>='], [/\s*<=\s*/, '<='], [/\s*!=\s*/, '!='], [/\s*==\s*/, '=='], [/\s*>\s*/, '>'], [/\s*<\s*/, '<'],
];

/** 运算符 → 其逻辑逆运算（用于取反条件与互补性验证）。 */
export const INVERSE_OPERATOR: Partial<Record<ConditionOperator, ConditionOperator>> = {
  '==': '!=', '!=': '==', '>': '<=', '<': '>=', '>=': '<', '<=': '>', contains: 'notContains', notContains: 'contains',
  startsWith: 'notStartsWith', notStartsWith: 'startsWith', endsWith: 'notEndsWith', notEndsWith: 'endsWith', isEmpty: 'isNotEmpty', isNotEmpty: 'isEmpty',
};

/** 去除行尾注释（字符串内的 `#`/`//` 不受影响）。 */
export function stripComment(source: string) {
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

/** 按顶层分隔符拆分（忽略括号/引号内的分隔符）。 */
export function splitTopLevel(source: string, separators = ',') {
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

/** 解析字面量：数字、加引号字符串、布尔/null/undefined 或原样返回。 */
export function literal(source: string): unknown {
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

/** 规范化字段/组件引用：去掉 `$form.` 前缀与多余空白。 */
export function normalizeReference(source: string) {
  const value = literal(source);
  return String(value ?? '').trim().replace(/^\$form\.|^[\$@]/, '');
}

/** 判断引用是否为字段引用（`$` 前缀）。 */
export function isFieldReference(source: string) {
  return /^\$(?:form\.)?/.test(String(source || '').trim());
}

/** 构造规范字段引用（`$field`）。 */
export function fieldRef(value: string) { return `$${value.trim().replace(/^\$form\.|^\$/, '')}`; }
/** 构造规范组件引用（`@component`）。 */
export function componentRef(value: string) { return `@${value.trim().replace(/^@/, '')}`; }

/** 解析单个条件子句（`字段 运算符 值`），失败返回 null。 */
export function parseCondition(source: string): ConditionConfig | null {
  for (const [pattern, operator] of OPERATOR_MAP) {
    const match = source.match(pattern);
    if (!match || match.index === undefined) continue;
    const fieldName = normalizeReference(source.slice(0, match.index));
    const right = source.slice(match.index + match[0].length).trim();
    if (!fieldName || (!right && operator !== 'isEmpty' && operator !== 'isNotEmpty')) return null;
    return {
      fieldName,
      operator,
      value: operator === 'isEmpty' || operator === 'isNotEmpty' ? undefined : literal(right),
      sourceField: operator === 'isEmpty' || operator === 'isNotEmpty' || !isFieldReference(right) ? undefined : normalizeReference(right),
      logic: 'AND',
    };
  }
  return null;
}

/** 解析引用列表：按顶层分隔符拆分并规范化、去空。 */
export function parseRefs(source: string) { return splitTopLevel(source).map(normalizeReference).filter(Boolean); }

/** 动作解析结果：规范化动作列表 + 诊断。 */
export interface ParsedActions { actions: ActionConfig[]; diagnostics: Array<{ message: string; code: string; severity: BehaviorDslDiagnosticSeverity; suggestion?: string }>; }

/** 解析函数式动作调用（如 `show(@c)` / `require($f)`），非函数式返回 null。 */
export function parseCanonicalAction(phrase: string, mode: 'default' | 'guard' = 'default'): ActionConfig[] | null {
  const call = phrase.match(/^([a-z]+)\s*\((.*)\)$/i);
  if (!call) return null;
  const name = call[1].toLowerCase();
  const args = splitTopLevel(call[2]);
  if (mode === 'guard') {
    if (name === 'require' && args.length) return [{ type: 'assertRequired', fields: args.map(normalizeReference) }];
    if (name === 'requireany' && args.length) return [{ type: 'assertAny', fields: args.map(normalizeReference) }];
    if (name === 'requiredirty' && args.length) return [{ type: 'assertDirty', fields: args.map(normalizeReference) }];
    if (name === 'keepreadonly' && args.length) return [{ type: 'assertReadonly', fields: args.map(normalizeReference) }];
    if (name === 'validate' && args.length === 2) {
      const targetField = normalizeReference(args[0]);
      const validatorRaw = String(args[1] || '').trim();
      const pattern = validatorRaw.match(/^pattern\s*\((["'])(.*?)\1\)$/i);
      return [{ type: 'assertValidator', targetField, validator: pattern ? 'pattern' : normalizeReference(validatorRaw), pattern: pattern?.[2] }];
    }
    if (name === 'range' && args.length === 3) return [{
      type: 'assertRange',
      targetField: normalizeReference(args[0]),
      min: literal(args[1]) == null ? null : Number(literal(args[1])),
      max: literal(args[2]) == null ? null : Number(literal(args[2])),
    }];
    if (name === 'length' && args.length === 3) return [{
      type: 'assertLength',
      targetField: normalizeReference(args[0]),
      min: literal(args[1]) == null ? null : Number(literal(args[1])),
      max: literal(args[2]) == null ? null : Number(literal(args[2])),
    }];
    if (name === 'compare' && args.length === 3) return [{
      type: 'assertCompare',
      targetField: normalizeReference(args[0]),
      operator: String(literal(args[1]) ?? args[1]).trim() as ActionConfig['operator'],
      value: isFieldReference(args[2]) ? undefined : literal(args[2]),
      valueSource: isFieldReference(args[2]) ? 'field' : 'static',
      sourceField: isFieldReference(args[2]) ? normalizeReference(args[2]) : undefined,
    }];
  }
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
  if (name === 'options' && args.length === 4) return [{ type: 'setOptions', targetField: normalizeReference(args[0]), optionsConfig: { mode: 'table', table: normalizeReference(args[1]), filterField: normalizeReference(args[2]), filterValue: literal(args[3]), filterValueRef: { source: 'static', value: literal(args[3]) } } }];
  return null;
}

/** 解析旧式动作语法（`show x` / `set x = y` 等），返回动作与改写建议。 */
export function parseLegacyAction(phrase: string): { actions: ActionConfig[]; suggestion?: string } | null {
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
  if ((match = phrase.match(/^options\s+(.+?)\s+from\s+([\w:.-]+)\s+where\s+(.+?)\s*=\s*(.+)$/i))) return { actions: [{ type: 'setOptions', targetField: normalizeReference(match[1]), optionsConfig: { mode: 'table', table: match[2], filterField: normalizeReference(match[3]), filterValue: literal(match[4]), filterValueRef: { source: 'static', value: literal(match[4]) } } }], suggestion: `options(${fieldRef(match[1])}, ${JSON.stringify(match[2])}, ${JSON.stringify(normalizeReference(match[3]))}, ${match[4].trim()})` };
  if (/^(save|submit)(?:\s+.*)?$/i.test(phrase)) return { actions: [{ type: 'submitData' }], suggestion: 'run()' };
  return null;
}

/** 解析动作列表：先试函数式，再退回旧式语法，无法识别时产出 FFR002。 */
export function parseActions(source: string, mode: 'default' | 'guard' = 'default'): ParsedActions {
  const actions: ActionConfig[] = [];
  const diagnostics: ParsedActions['diagnostics'] = [];
  let phrases = splitTopLevel(source, ';');
  if (phrases.length === 1 && !parseCanonicalAction(phrases[0], mode)) phrases = splitTopLevel(source, ',;');
  for (const phrase of phrases) {
    const canonical = parseCanonicalAction(phrase, mode);
    if (canonical) { actions.push(...canonical); continue; }
    const legacy = parseLegacyAction(phrase);
    if (legacy) {
      actions.push(...legacy.actions);
      diagnostics.push({ severity: 'warning', code: 'FFR101', message: `旧式动作语法"${phrase}"仍可读取，建议改为函数式动作。`, suggestion: legacy.suggestion });
    } else diagnostics.push({ severity: 'error', code: 'FFR002', message: `不支持的动作"${phrase}。` });
  }
  return { actions, diagnostics };
}

/** 取反条件：运算符有逆运算时替换，否则用 customExpression=false 恒假。 */
export function inverseCondition(condition: ConditionConfig): ConditionConfig { return { ...condition, operator: INVERSE_OPERATOR[condition.operator] || 'custom', customExpression: INVERSE_OPERATOR[condition.operator] ? undefined : 'false' }; }
/** 构造一条默认启用的规则（优先级 20）。 */
export function createRule(id: string, name: string, trigger: BehaviorRule['trigger'], conditions: ConditionConfig[], actions: ActionConfig[]): BehaviorRule { return { id, name, enabled: true, priority: 20, trigger, conditions, actions, sideEffects: [] }; }
/** 构造一条诊断记录（默认 error 级、第 1 列）。 */
export function diagnostic(line: number, code: string, message: string, severity: BehaviorDslDiagnosticSeverity = 'error', column = 1, suggestion?: string): BehaviorDslDiagnostic { return { line, column, severity, code, message, suggestion }; }

/**
 * 行内括号深度（字符串外的 `(`/`)` 计数）。用于 FFR106 结构诊断与
 * 编辑器的「补全右括号」快速修复；返回 0 表示平衡。
 */
export function parenBalance(source: string): number {
  let depth = 0;
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
  }
  return depth;
}

/**
 * 结构诊断（FFR105 缺 `->`、FFR106 括号不闭合）。
 * FFR106 对每一行做字符串感知的括号平衡检查（放在 parseLine 之前，
 * 因为多余右括号会被语法正文捕获而绕过 parseLine 的失败分支）；
 * FFR105 只在 parseLine 判定该行不可解析时调用，避免与既有 FFR000/FFR001 重复。
 */
export function unbalancedParenDiagnostics(lineNumber: number, line: string): BehaviorDslDiagnostic[] {
  const depth = parenBalance(line);
  if (depth > 0) {
    return [diagnostic(lineNumber, 'FFR106', `括号未闭合，还缺少 ${depth} 个右括号。`, 'error', line.length + 1, `${line}${')'.repeat(depth)}`)];
  }
  if (depth < 0) {
    return [diagnostic(lineNumber, 'FFR106', `存在 ${-depth} 个多余的右括号。`, 'error', 1, line.replace(/\)+$/, ''))];
  }
  return [];
}

/** 结构诊断（FFR105：规则行缺少 `->` 动作分隔符）。 */
export function structuralDiagnostics(lineNumber: number, line: string): BehaviorDslDiagnostic[] {
  const hasArrow = line.includes('->');
  const statementStart = /^(when|else|otherwise|on|before)\b/i;
  if (!hasArrow && !/^compute\b/i.test(line) && statementStart.test(line)) {
    return [diagnostic(lineNumber, 'FFR105', '规则缺少 -> 动作分隔符。', 'error', 1, `${line} -> <动作>`)];
  }
  return [];
}

/**
 * 正则实现的行为 DSL 编译入口（与 Chevrotain 文法实现差分对拍）：
 * 逐行编译为规则，追加括号/结构诊断与 FFR 静态检查。
 */
export function compileBehaviorDslRegex(source: string, context: BehaviorDslCompileContext = {}): BehaviorDslCompilation {
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
      if (condition && parsed.actions.length) { const trigger = { type: 'fieldChange' as TriggerType, fieldName: condition.fieldName }; rules.push(createRule(`dsl_${lineNumber}`, `当 ${match[1]}`, trigger, [condition], parsed.actions)); previousConditional = { condition, trigger, line: lineNumber }; preview.push(`字段"${condition.fieldName}"变化且条件成立时，执行 ${parsed.actions.length} 个动作。`); }
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
      if (fields.length) preview.push(`${[...new Set(fields)].join('、')}变化时，重新计算"${target}"。`);
      previousConditional = null; return;
    }
    if ((match = line.match(/^on\s+change\s*\((.+)\)\s*->\s*(.+)$/i)) || (match = line.match(/^on\s+(.+?)\s+change\s*->\s*(.+)$/i))) {
      const legacy = !/^on\s+change\s*\(/i.test(line); const field = normalizeReference(match[1]); const parsed = parseActions(match[2]);
      if (legacy) diagnostics.push(diagnostic(lineNumber, 'FFR104', '字段变化触发器应写为 on change($字段)。', 'warning', 1, `on change(${fieldRef(field)}) -> ${match[2]}`));
      parsed.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
      if (parsed.actions.length) rules.push(createRule(`dsl_${lineNumber}`, `${field}变化`, { type: 'fieldChange', fieldName: field }, [], parsed.actions));
      previousConditional = null; return;
    }
    if ((match = line.match(/^before\s+click\s*\((["'])(.*?)\1\)\s*->\s*(.+)$/i))) {
      const parsed = parseActions(match[3], 'guard');
      parsed.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
      if (parsed.actions.length) rules.push(createRule(`dsl_${lineNumber}`, `before click(${match[2]})`, { type: 'buttonClick', buttonName: normalizeReference(match[2]) }, [], parsed.actions));
      previousConditional = null; return;
    }
    if ((match = line.match(/^(before\s+submit|on\s+load|on\s+submit)\s*->\s*(.+)$/i))) {
      const event = match[1].toLowerCase() === 'before submit' ? 'beforeSubmit' : match[1].toLowerCase() === 'on load' ? 'formLoad' : 'submit'; const parsed = parseActions(match[2], event === 'beforeSubmit' ? 'guard' : 'default');
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

/** 编译结果是否含 error 级诊断。 */
export function hasBehaviorDslErrors(compilation: Pick<BehaviorDslCompilation, 'diagnostics'>) { return compilation.diagnostics.some((item) => item.severity === 'error'); }

/** 将规则集转回中文自然语言描述。 */
export function behaviorRulesToNaturalLanguage(rules: BehaviorRule[]) {
  return rules.map((rule) => { const trigger = rule.trigger.fieldName ? `${rule.trigger.fieldName}发生${rule.trigger.type}` : `发生${rule.trigger.type}`; const condition = rule.conditions.length ? `，满足 ${rule.conditions.map((item) => `${item.fieldName} ${item.operator} ${String(item.value ?? '')}`).join(' 且 ')}` : ''; return `${trigger}${condition}，执行 ${rule.actions.map((action) => action.type).join('、')}。`; });
}

/** 对已编译规则执行静态属性分析（跨规则环、watch 覆盖、类型错误、不可满足条件）。 */
export function lintRules(rules: BehaviorRule[], context: BehaviorDslCompileContext, sourceLines: string[]): BehaviorDslDiagnostic[] {
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
      if (action.expression) for (const match of action.expression.matchAll(/\$(?:form\.)?([\w一-鿿.-]+)/g)) referencedFields.add(match[1]);
      if (action.targetComponent && componentRefs.size && !componentRefs.has(action.targetComponent)) result.push(diagnostic(line, 'FFR203', `找不到控件"${action.targetComponent}"。`, 'error'));
      if (action.type === 'setOptions' && action.optionsConfig?.mode === 'table' && action.optionsConfig.table && tableRefs.size && !tableRefs.has(action.optionsConfig.table)) result.push(diagnostic(line, 'FFR204', `找不到数据表"${action.optionsConfig.table}"。`, 'error'));
      if (action.type === 'runWorkflow' && action.workflowId && workflowRefs.size && !workflowRefs.has(action.workflowId)) result.push(diagnostic(line, 'FFR205', `找不到流程"${action.workflowId}"。`, 'error'));
      if (rule.trigger.fieldName && action.targetField === rule.trigger.fieldName) result.push(diagnostic(line, 'FFR302', `动作会写回触发字段"${action.targetField}"，可能形成循环。`, 'warning'));
    }
    if (fields.size) for (const field of referencedFields) if (!fields.has(field) && field !== 'value' && field !== 'event') result.push(diagnostic(line, 'FFR202', `字段"${field}"不在当前表单中。`, 'warning'));
    if (/^on\s+submit/i.test(sourceLines[line - 1] || '') && rule.actions.some((action) => action.type === 'submitData')) result.push(diagnostic(line, 'FFR303', 'on submit 中不能再次提交表单，否则会形成递归。', 'error'));
  }
  return result;
}
