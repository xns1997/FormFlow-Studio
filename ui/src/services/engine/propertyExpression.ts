import { extractPropertyReferences, findPropertyDependencyCycles } from './propertyDependencies';

export interface PropertyExpressionContext {
  form?: Record<string, unknown>;
  original?: Record<string, unknown>;
  component?: Record<string, unknown>;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExpressionResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
}

type Token = { type: 'number' | 'string' | 'identifier' | 'operator' | 'punctuation' | 'eof'; value: string; position: number };

const OPERATORS = ['===', '!==', '>=', '<=', '==', '!=', '&&', '||', '??', '+', '-', '*', '/', '%', '>', '<', '!'];
const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1, '??': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4,
  '>': 5, '>=': 5, '<': 5, '<=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7,
};

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }
    if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] || ''))) {
      const start = index;
      while (/\d/.test(source[index] || '')) index++;
      if (source[index] === '.') { index++; while (/\d/.test(source[index] || '')) index++; }
      tokens.push({ type: 'number', value: source.slice(start, index), position: start });
      continue;
    }
    if (char === '"' || char === "'") {
      const start = index++;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const next = source[index++];
        if (next === char) { closed = true; break; }
        if (next === '\\') {
          const escaped = source[index++];
          value += ({ n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" } as Record<string, string>)[escaped] ?? escaped;
        } else value += next;
      }
      if (!closed) throw new Error(`字符串未闭合（位置 ${start + 1}）`);
      tokens.push({ type: 'string', value, position: start });
      continue;
    }
    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index));
    if (operator) { tokens.push({ type: 'operator', value: operator, position: index }); index += operator.length; continue; }
    if (/[A-Za-z_$\u4e00-\u9fff]/.test(char)) {
      const start = index++;
      while (/[\w$\u4e00-\u9fff]/.test(source[index] || '')) index++;
      tokens.push({ type: 'identifier', value: source.slice(start, index), position: start });
      continue;
    }
    if ('().,[]'.includes(char)) { tokens.push({ type: 'punctuation', value: char, position: index++ }); continue; }
    throw new Error(`不支持的字符“${char}”（位置 ${index + 1}）`);
  }
  tokens.push({ type: 'eof', value: '', position: source.length });
  return tokens;
}

const FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  len: (value) => Array.isArray(value) || typeof value === 'string' ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0,
  upper: (value) => String(value ?? '').toUpperCase(),
  lower: (value) => String(value ?? '').toLowerCase(),
  trim: (value) => String(value ?? '').trim(),
  contains: (value, search) => Array.isArray(value) ? value.includes(search) : String(value ?? '').includes(String(search ?? '')),
  startsWith: (value, search) => String(value ?? '').startsWith(String(search ?? '')),
  endsWith: (value, search) => String(value ?? '').endsWith(String(search ?? '')),
  coalesce: (...values) => values.find((value) => value !== null && value !== undefined && value !== ''),
  round: (value, digits = 0) => Number(Number(value ?? 0).toFixed(Number(digits))),
  min: (...values) => Math.min(...values.map(Number)),
  max: (...values) => Math.max(...values.map(Number)),
  abs: (value) => Math.abs(Number(value)),
  now: () => new Date().toISOString(),
  date: (value) => {
    const parsed = new Date(String(value ?? ''));
    if (Number.isNaN(parsed.getTime())) throw new Error('date() 收到无效日期');
    return parsed.toISOString();
  },
};

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[], private readonly context: PropertyExpressionContext) {}

  parse() {
    const value = this.binary(0);
    if (this.peek().type !== 'eof') throw new Error(`意外内容“${this.peek().value}”（位置 ${this.peek().position + 1}）`);
    return value;
  }

  private peek() { return this.tokens[this.index]; }
  private take() { return this.tokens[this.index++]; }
  private accept(value: string) { if (this.peek().value === value) { this.index++; return true; } return false; }
  private expect(value: string) { if (!this.accept(value)) throw new Error(`缺少“${value}”（位置 ${this.peek().position + 1}）`); }

  private binary(minPrecedence: number): unknown {
    let left = this.unary();
    while (true) {
      const operator = this.peek().value;
      const precedence = BINARY_PRECEDENCE[operator];
      if (precedence === undefined || precedence < minPrecedence) break;
      this.take();
      const right = this.binary(precedence + 1);
      left = this.applyBinary(operator, left, right);
    }
    return left;
  }

  private unary(): unknown {
    if (this.accept('!')) return !this.unary();
    if (this.accept('-')) return -Number(this.unary());
    if (this.accept('+')) return Number(this.unary());
    return this.primary();
  }

  private primary(): unknown {
    const token = this.take();
    if (token.type === 'number') return Number(token.value);
    if (token.type === 'string') return token.value;
    if (token.value === '(') { const value = this.binary(0); this.expect(')'); return value; }
    if (token.type !== 'identifier') throw new Error(`缺少值（位置 ${token.position + 1}）`);
    if (token.value === 'true') return true;
    if (token.value === 'false') return false;
    if (token.value === 'null') return null;
    if (token.value === 'undefined') return undefined;
    if (this.accept('(')) {
      const fn = FUNCTIONS[token.value];
      if (!fn) throw new Error(`函数“${token.value}”不在允许列表中`);
      const args: unknown[] = [];
      if (!this.accept(')')) {
        do { args.push(this.binary(0)); } while (this.accept(','));
        this.expect(')');
      }
      return fn(...args);
    }
    const path = [token.value];
    while (true) {
      if (this.accept('.')) {
        const segment = this.take();
        if (segment.type !== 'identifier') throw new Error(`路径字段无效（位置 ${segment.position + 1}）`);
        path.push(segment.value);
      } else if (this.accept('[')) {
        const segment = this.take();
        if (!['string', 'number', 'identifier'].includes(segment.type)) throw new Error(`索引无效（位置 ${segment.position + 1}）`);
        path.push(segment.value);
        this.expect(']');
      } else break;
    }
    let value: unknown = this.context;
    for (const segment of path) {
      if (value === null || value === undefined || typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[segment];
    }
    return value;
  }

  private applyBinary(operator: string, left: unknown, right: unknown): unknown {
    switch (operator) {
      case '||': return left || right;
      case '??': return left ?? right;
      case '&&': return left && right;
      case '==': return left == right; // DSL intentionally provides loose equality for imported data.
      case '!=': return left != right;
      case '===': return left === right;
      case '!==': return left !== right;
      case '>': return Number(left) > Number(right);
      case '>=': return Number(left) >= Number(right);
      case '<': return Number(left) < Number(right);
      case '<=': return Number(left) <= Number(right);
      case '+': return typeof left === 'string' || typeof right === 'string' ? String(left ?? '') + String(right ?? '') : Number(left) + Number(right);
      case '-': return Number(left) - Number(right);
      case '*': return Number(left) * Number(right);
      case '/': if (Number(right) === 0) throw new Error('不能除以 0'); return Number(left) / Number(right);
      case '%': if (Number(right) === 0) throw new Error('不能对 0 取余'); return Number(left) % Number(right);
      default: throw new Error(`不支持运算符“${operator}”`);
    }
  }
}

export function evaluatePropertyExpression(expression: string, context: PropertyExpressionContext): ExpressionResult {
  const source = expression.trim();
  if (!source) return { ok: true, value: undefined };
  try {
    return { ok: true, value: new Parser(tokenize(source), context).parse() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function interpolatePropertyTemplate(template: string, context: PropertyExpressionContext): ExpressionResult<string> {
  let error: string | undefined;
  const value = template.replace(/\{\{([\s\S]*?)\}\}/g, (_match, expression: string) => {
    const result = evaluatePropertyExpression(expression, context);
    if (!result.ok) { error ||= result.error; return `{{${expression}}}`; }
    return result.value === null || result.value === undefined ? '' : String(result.value);
  });
  return error ? { ok: false, value, error } : { ok: true, value };
}

export const PROPERTY_EXPRESSION_FUNCTIONS = Object.keys(FUNCTIONS);
export const PROPERTY_EXPRESSION_FUNCTION_DETAILS: Record<string, string> = {
  len: 'len(value) → 长度', upper: 'upper(value) → 大写文本', lower: 'lower(value) → 小写文本', trim: 'trim(value) → 去除首尾空格',
  contains: 'contains(value, search) → 是否包含', startsWith: 'startsWith(value, search) → 是否以文本开头', endsWith: 'endsWith(value, search) → 是否以文本结尾',
  coalesce: 'coalesce(a, b, ...) → 第一个非空值', round: 'round(value, digits) → 四舍五入', min: 'min(a, b, ...) → 最小值', max: 'max(a, b, ...) → 最大值',
  abs: 'abs(value) → 绝对值', now: 'now() → 当前时间', date: 'date(value) → ISO 日期时间',
};

export interface RuntimePropertyResult {
  value: unknown;
  visible: boolean;
  disabled: boolean;
  required: boolean;
  props: Record<string, unknown>;
  diagnostics: string[];
}

export function resolveRuntimeProperties(
  props: Record<string, unknown>,
  value: unknown,
  context: PropertyExpressionContext,
): RuntimePropertyResult {
  const diagnostics: string[] = [];
  const evaluate = (key: string, fallback: unknown) => {
    const expression = String(props[key] || '').trim();
    if (!expression) return fallback;
    const result = evaluatePropertyExpression(expression, context);
    if (!result.ok) { diagnostics.push(`${key}: ${result.error}`); return fallback; }
    return result.value;
  };
  const nextProps = { ...props };
  if (props.contentTemplate) {
    const result = interpolatePropertyTemplate(String(props.contentTemplate), context);
    if (result.ok) nextProps.content = result.value;
    else diagnostics.push(`contentTemplate: ${result.error}`);
  }
  return {
    value: evaluate('valueExpression', value),
    visible: !!evaluate('visibleExpression', true),
    disabled: !!evaluate('disabledExpression', false),
    required: !!evaluate('requiredExpression', !!props.required),
    props: nextProps,
    diagnostics,
  };
}

export function resolveExpressionValues(
  entries: Array<{ field: string; props: Record<string, unknown> }>,
  values: Record<string, unknown>,
  original: Record<string, unknown> = {},
) {
  const resolved = { ...values };
  const diagnostics: Record<string, string[]> = {};
  const byField = new Map(entries.map((entry) => [entry.field, entry]));
  const graph = new Map(entries.map((entry) => [entry.field, extractPropertyReferences(String(entry.props.valueExpression || ''))]));
  const cycles = findPropertyDependencyCycles(graph);
  const cyclicFields = new Set(cycles.flatMap((cycle) => cycle.slice(0, -1)));
  for (const cycle of cycles) {
    const message = `循环依赖：${cycle.join(' → ')}`;
    for (const field of cycle.slice(0, -1)) diagnostics[field] = [...(diagnostics[field] || []), message];
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visit = (field: string) => {
    if (visited.has(field) || cyclicFields.has(field)) return;
    visited.add(field);
    for (const dependency of graph.get(field) || []) if (byField.has(dependency)) visit(dependency);
    ordered.push(field);
  };
  for (const field of byField.keys()) visit(field);
  for (const field of ordered) {
    const entry = byField.get(field)!;
    if (!entry.props.valueExpression) continue;
    const result = resolveRuntimeProperties(entry.props, resolved[field], { form: resolved, original, component: entry.props });
    resolved[field] = result.value;
    if (result.diagnostics.length) diagnostics[field] = [...(diagnostics[field] || []), ...result.diagnostics];
  }
  return { values: resolved, diagnostics };
}
