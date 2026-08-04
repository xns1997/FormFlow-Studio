import type {
  BehaviorRule, BehaviorDslCompileContext, BehaviorDslDiagnostic, ConditionConfig, FieldType,
} from './types';
import { findPropertyDependencyCycles } from '../propertyExpression';
import { diagnostic, normalizeReference } from './parserRegex';

/**
 * 静态属性前置（Phase 2）：
 * - FFR304 跨规则回写/计算环（error）
 * - FFR305 compute 表达式依赖未在 watch(...) 中声明（error）
 * - FFR306 表达式类型错误（error；字段类型未知时跳过，零误报）
 * - FFR309 条件不可满足（warning）
 */

function lineOf(rule: BehaviorRule): number {
  return Number(rule.id.match(/^dsl_(\d+)/)?.[1] || 1);
}

function expressionRefs(expression: string | undefined): string[] {
  if (!expression) return [];
  return [...expression.matchAll(/\$(?:form\.)?([\w一-鿿.-]+)/g)].map((match) => match[1]);
}

function isWriteAction(action: { type: string; targetField?: string }): boolean {
  return (action.type === 'setValue' || action.type === 'clearValue') && !!action.targetField;
}

// ---------------------------------------------------------------------------
// FFR304 跨规则回写/计算环
// ---------------------------------------------------------------------------

export function findCrossRuleCycles(rules: BehaviorRule[]): BehaviorDslDiagnostic[] {
  const diagnostics: BehaviorDslDiagnostic[] = [];
  const graph = new Map<string, string[]>();
  const edgeLine = new Map<string, number>();
  for (const rule of rules) {
    if (rule.trigger.type !== 'fieldChange' || !rule.trigger.fieldName) continue;
    const from = rule.trigger.fieldName;
    for (const action of rule.actions) {
      if (!isWriteAction(action) || !action.targetField) continue;
      const to = action.targetField;
      const key = `${from}→${to}`;
      if (!graph.has(from)) graph.set(from, []);
      if (!graph.get(from)!.includes(to)) graph.get(from)!.push(to);
      if (!edgeLine.has(key)) edgeLine.set(key, lineOf(rule));
    }
  }
  const seen = new Set<string>();
  for (const cycle of findPropertyDependencyCycles(graph)) {
    const fields = cycle.slice(0, -1);
    if (fields.length < 2) continue; // 单字段自写环仍由 FFR302 warning 提示
    const signature = [...fields].sort().join('→');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const path = [...fields, fields[0]].join(' → ');
    const lines: number[] = [];
    for (let index = 0; index < fields.length; index += 1) {
      const key = `${fields[index]}→${fields[(index + 1) % fields.length]}`;
      const line = edgeLine.get(key);
      if (line) lines.push(line);
    }
    const anchor = Math.min(...lines);
    diagnostics.push(diagnostic(anchor, 'FFR304', `检测到跨规则回写环：${path}，事件触发可能无限循环。`, 'error'));
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// FFR305 compute watch 覆盖
// ---------------------------------------------------------------------------

export function findWatchCoverageViolations(rules: BehaviorRule[]): BehaviorDslDiagnostic[] {
  const diagnostics: BehaviorDslDiagnostic[] = [];
  const groups = new Map<number, BehaviorRule[]>();
  for (const rule of rules) {
    const match = rule.id.match(/^dsl_(\d+)_\d+$/);
    if (!match) continue;
    const line = Number(match[1]);
    if (!groups.has(line)) groups.set(line, []);
    groups.get(line)!.push(rule);
  }
  for (const [line, group] of groups) {
    const watch = new Set(group.map((rule) => rule.trigger.fieldName).filter(Boolean));
    const expressions = group.flatMap((rule) => rule.actions.map((action) => action.expression));
    const missing: string[] = [];
    for (const expression of expressions) {
      for (const ref of expressionRefs(expression)) {
        if (!watch.has(ref) && ref !== 'value' && ref !== 'event') missing.push(ref);
      }
    }
    if (missing.length) {
      diagnostics.push(diagnostic(line, 'FFR305', `compute 表达式依赖字段 ${[...new Set(missing)].join('、')} 未在 watch(...) 中声明，这些字段变化不会触发重算。`, 'error'));
    }
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// FFR306 表达式类型检查
// ---------------------------------------------------------------------------

type ExprType = 'string' | 'number' | 'boolean' | 'unknown';

interface ExprToken { type: 'number' | 'string' | 'ident' | 'op' | 'punct'; value: string; }

const EXPR_OPS = ['===', '!==', '>=', '<=', '==', '!=', '&&', '||', '??', '+', '-', '*', '/', '%', '>', '<', '!'];
const EXPR_PRECEDENCE: Record<string, number> = {
  '||': 1, '??': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4,
  '>': 5, '>=': 5, '<': 5, '<=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7,
};

const FUNCTION_SIGNATURES: Record<string, { args: ExprType[]; result: ExprType; checkNumeric?: boolean; checkString?: boolean }> = {
  len: { args: ['unknown'], result: 'number' },
  upper: { args: ['string'], result: 'string' },
  lower: { args: ['string'], result: 'string' },
  trim: { args: ['string'], result: 'string' },
  contains: { args: ['string', 'unknown'], result: 'boolean', checkNumeric: true },
  startsWith: { args: ['string', 'unknown'], result: 'boolean', checkNumeric: true },
  endsWith: { args: ['string', 'unknown'], result: 'boolean', checkNumeric: true },
  coalesce: { args: [], result: 'unknown' },
  round: { args: ['number', 'number'], result: 'number', checkNumeric: true },
  min: { args: ['number'], result: 'number' },
  max: { args: ['number'], result: 'number' },
  abs: { args: ['number'], result: 'number', checkNumeric: true },
  now: { args: [], result: 'string' },
  date: { args: ['string'], result: 'string' },
  dateDiff: { args: ['string', 'string', 'string'], result: 'number' },
  formatDate: { args: ['string', 'string'], result: 'string' },
  sum: { args: ['unknown'], result: 'number' },
  unique: { args: ['unknown'], result: 'unknown' },
  lookup: { args: ['unknown', 'unknown', 'unknown'], result: 'unknown' },
  match: { args: [], result: 'unknown' },
};

function tokenizeExpression(source: string): ExprToken[] | null {
  const tokens: ExprToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }
    if (/\d/.test(char)) {
      const start = index;
      while (/\d/.test(source[index] || '')) index++;
      if (source[index] === '.') { index++; while (/\d/.test(source[index] || '')) index++; }
      tokens.push({ type: 'number', value: source.slice(start, index) });
      continue;
    }
    if (char === '"' || char === "'") {
      const start = index++;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const next = source[index++];
        if (next === char) { closed = true; break; }
        if (next === '\\') { value += source[index++] ?? ''; } else value += next;
      }
      if (!closed) return null;
      tokens.push({ type: 'string', value });
      continue;
    }
    const operator = EXPR_OPS.find((candidate) => source.startsWith(candidate, index));
    if (operator) { tokens.push({ type: 'op', value: operator }); index += operator.length; continue; }
    if (/[A-Za-z_$@一-鿿]/.test(char)) {
      const start = index++;
      while (/[\w$@一-鿿]/.test(source[index] || '')) index++;
      tokens.push({ type: 'ident', value: source.slice(start, index) });
      continue;
    }
    if ('().,[]'.includes(char)) { tokens.push({ type: 'punct', value: char }); index++; continue; }
    return null;
  }
  return tokens;
}

class ExpressionTypeChecker {
  private index = 0;
  constructor(private readonly tokens: ExprToken[], private readonly fieldTypes: Record<string, FieldType>, private readonly errors: string[]) {}

  check(): void {
    if (this.tokens.length === 0) return;
    this.binary(0);
  }

  private peek() { return this.tokens[this.index]; }
  private take() { return this.tokens[this.index++]; }

  private binary(minPrecedence: number): ExprType {
    let left = this.unary();
    while (true) {
      const token = this.peek();
      if (!token || token.type !== 'op') break;
      const precedence = EXPR_PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.take();
      const right = this.unary();
      left = this.applyBinary(token.value, left, right);
    }
    return left;
  }

  private unary(): ExprType {
    const token = this.peek();
    if (token && token.type === 'op' && token.value === '!') { this.take(); this.unary(); return 'boolean'; }
    if (token && token.type === 'op' && (token.value === '-' || token.value === '+')) {
      this.take();
      const operand = this.unary();
      if (operand === 'string') this.errors.push('一元正负号需要数值操作数。');
      return 'number';
    }
    return this.primary();
  }

  private primary(): ExprType {
    const token = this.take();
    if (!token) { this.errors.push('表达式不完整。'); return 'unknown'; }
    if (token.type === 'number') return 'number';
    if (token.type === 'string') return 'string';
    if (token.type === 'punct') {
      if (token.value === '(') {
        const inner = this.binary(0);
        const close = this.take();
        if (!close || close.value !== ')') this.errors.push('表达式括号未闭合。');
        return inner;
      }
      this.errors.push(`表达式包含意外符号"${token.value}"。`);
      return 'unknown';
    }
    // ident：字段引用 / 字面量 / 函数调用 / 路径访问
    if (token.value === 'true' || token.value === 'false') return 'boolean';
    if (token.value === 'null' || token.value === 'undefined') return 'unknown';
    if (token.value === '@today' || token.value === '@now') return 'string';
    if (this.peek()?.value === '(') {
      this.take(); // (
      const args: ExprType[] = [];
      if (this.peek()?.value !== ')') {
        do { args.push(this.binary(0)); } while (this.take()?.value === ',');
      } else {
        this.take();
      }
      const signature = FUNCTION_SIGNATURES[token.value];
      if (!signature) {
        this.errors.push(`函数"${token.value}"不在允许列表中。`);
        return 'unknown';
      }
      if (signature.checkNumeric && args[0] === 'number') {
        // contains/startsWith/endsWith 对数字字段无意义
        this.errors.push(`函数 ${token.value} 的第一个参数应为文本或数组。`);
      }
      return signature.result;
    }
    // $字段 或裸标识符或路径
    const raw = token.value.replace(/^[$@]/, '');
    if (token.value.startsWith('$') && !['form', 'row', 'table', 'flow', 'event', 'user'].includes(raw)) {
      const type = this.fieldTypes[raw];
      if (type && type !== 'unknown') return type === 'date' ? 'string' : type;
      return 'unknown';
    }
    // 路径访问（form.x / x['k']）→ unknown
    while (this.peek() && (this.peek().value === '.' || this.peek().value === '[')) {
      this.take();
      if (this.peek()?.value === '[') {
        // '[' 已经被取走
      }
      if (this.take()) { /* consume segment */ }
    }
    return 'unknown';
  }

  private applyBinary(operator: string, left: ExprType, right: ExprType): ExprType {
    switch (operator) {
      case '+': return left === 'string' || right === 'string' ? 'string' : left === 'number' && right === 'number' ? 'number' : 'unknown';
      case '-': case '*': case '/': case '%': {
        if (left === 'string') this.errors.push(`算术运算符 ${operator} 需要数值左操作数。`);
        if (right === 'string') this.errors.push(`算术运算符 ${operator} 需要数值右操作数。`);
        return 'number';
      }
      case '>': case '>=': case '<': case '<=': {
        if (left === 'number' && right === 'string') this.errors.push('数值与文本比较无意义。');
        if (left === 'string' && right === 'number') this.errors.push('文本与数值比较无意义。');
        if (left === 'boolean' || right === 'boolean') this.errors.push('布尔值不支持大小比较。');
        return 'boolean';
      }
      default:
        return 'boolean';
    }
  }
}

export function checkExpressionTypes(
  expression: string,
  fieldTypes: Record<string, FieldType>,
): string[] {
  const tokens = tokenizeExpression(expression);
  if (!tokens) return []; // 语法无法静态解析时交给运行时 evaluatePropertyExpression
  const errors: string[] = [];
  new ExpressionTypeChecker(tokens, fieldTypes, errors).check();
  return errors;
}

export function findExpressionTypeErrors(rules: BehaviorRule[], context: BehaviorDslCompileContext): BehaviorDslDiagnostic[] {
  const diagnostics: BehaviorDslDiagnostic[] = [];
  const fieldTypes = context.fieldTypes || {};
  for (const rule of rules) {
    for (const action of rule.actions) {
      if (!action.expression) continue;
      const errors = checkExpressionTypes(action.expression, fieldTypes);
      for (const message of errors) {
        diagnostics.push(diagnostic(lineOf(rule), 'FFR306', `表达式类型错误：${message}`, 'error'));
      }
    }
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// FFR309 条件可满足性（数值区间 + 相等冲突；保守近似，不产生误报）
// ---------------------------------------------------------------------------

function intervalOf(operator: ConditionConfig['operator'], value: unknown): { low: number; high: number } | null {
  if (typeof value !== 'number') return null;
  switch (operator) {
    case '>': return { low: value, high: Infinity };
    case '>=': return { low: value, high: Infinity };
    case '<': return { low: -Infinity, high: value };
    case '<=': return { low: -Infinity, high: value };
    default: return null;
  }
}

export function findUnsatConditions(rules: BehaviorRule[]): BehaviorDslDiagnostic[] {
  const diagnostics: BehaviorDslDiagnostic[] = [];
  for (const rule of rules) {
    if (!rule.conditions.length) continue;
    const byField = new Map<string, ConditionConfig[]>();
    for (const condition of rule.conditions) {
      if (!condition.fieldName) continue;
      if (!byField.has(condition.fieldName)) byField.set(condition.fieldName, []);
      byField.get(condition.fieldName)!.push(condition);
    }
    for (const [field, conditions] of byField) {
      const intervals: Array<{ low: number; high: number }> = [];
      const equals = new Set<unknown>();
      for (const condition of conditions) {
        if (condition.operator === '==' && condition.sourceField === undefined) equals.add(condition.value);
        const interval = intervalOf(condition.operator, condition.value);
        if (interval) intervals.push(interval);
      }
      if (equals.size > 1) {
        diagnostics.push(diagnostic(lineOf(rule), 'FFR309', `条件不可满足：字段"${field}"不可能同时等于 ${[...equals].map((value) => JSON.stringify(value)).join(' 和 ')}。`, 'warning'));
        continue;
      }
      if (intervals.length > 1) {
        const low = Math.max(...intervals.map((item) => item.low));
        const high = Math.min(...intervals.map((item) => item.high));
        if (low > high) {
          diagnostics.push(diagnostic(lineOf(rule), 'FFR309', `条件不可满足：字段"${field}"的数值区间为空（下界 ${low} 大于上界 ${high}）。`, 'warning'));
        }
      }
    }
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

export function runStaticAnalysis(rules: BehaviorRule[], context: BehaviorDslCompileContext): BehaviorDslDiagnostic[] {
  return [
    ...findCrossRuleCycles(rules),
    ...findWatchCoverageViolations(rules),
    ...findExpressionTypeErrors(rules, context),
    ...findUnsatConditions(rules),
  ];
}
