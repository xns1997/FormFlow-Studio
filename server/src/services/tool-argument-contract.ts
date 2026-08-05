import { createHash } from 'node:crypto';

export type ToolArgumentNormalization = { path: string; action: string; from?: unknown; to?: unknown; reason?: string };
export type ToolArgumentIssue = { path: string; code: string; message: string; expected: string; received: string };
export type ToolPreflightError = {
  code: string;
  message: string;
  path?: string;
  expectedShape: unknown;
  receivedShape: unknown;
  suggestedArguments?: Record<string, any>;
  normalizationsApplied?: ToolArgumentNormalization[];
  issues?: ToolArgumentIssue[];
  correctionInstruction?: string;
};
export type ToolPipelineResult =
  | { ok: true; arguments: Record<string, any>; normalizations: ToolArgumentNormalization[] }
  | { ok: false; arguments: Record<string, any>; normalizations: ToolArgumentNormalization[]; error: ToolPreflightError };

/** The schema compiler always returns detailed issues plus a repair instruction. */
export type ToolSchemaContractError = ToolPreflightError & { issues: ToolArgumentIssue[]; correctionInstruction: string };
export type ToolSchemaContractResult =
  | { ok: true; arguments: Record<string, any>; normalizations: ToolArgumentNormalization[] }
  | { ok: false; arguments: Record<string, any>; normalizations: ToolArgumentNormalization[]; error: ToolSchemaContractError };

export interface ToolDomainHooks {
  /** Domain normalization runs after schema compilation; return undefined for no-op. */
  normalize?: (name: string, args: Record<string, any>) => { arguments: Record<string, any>; normalizations: ToolArgumentNormalization[] } | undefined;
  /** Domain validation runs after normalization; return an error to fail the tool call. */
  validate?: (name: string, args: Record<string, any>, normalizations: ToolArgumentNormalization[]) => ToolPreflightError | undefined;
}

const valueShape = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? `array(${value.length})` : typeof value === 'object' ? 'object' : `${typeof value}${typeof value === 'string' ? `(${value.length})` : ''}`;
const clone = (value: Record<string, any>) => structuredClone(value);

/** 参数形态归一化（类型补全/去未知键）。 */
export function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, shape(entry)]));
  return typeof value;
}

function exactAlias(key: string, properties: Record<string, any>) {
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase(); const matches = Object.keys(properties).filter((candidate) => candidate.replace(/[-_\s]/g, '').toLowerCase() === normalized);
  return matches.length === 1 ? matches[0] : undefined;
}

function coercePrimitive(value: unknown, schema: any) {
  if (schema?.type === 'string' && ['number', 'boolean'].includes(typeof value)) return String(value);
  if (schema?.type === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  if (schema?.type === 'boolean' && typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === 'true';
  if (schema?.type === 'array' && !Array.isArray(value) && value !== undefined && value !== null && schema.items && typeof value !== 'object') return [value];
  return value;
}

function inspect(value: any, schema: any, path: string, normalizations: ToolArgumentNormalization[], issues: ToolArgumentIssue[]) {
  if (!schema) return value;
  const coerced = coercePrimitive(value, schema);
  if (coerced !== value) normalizations.push({ path: path || '$', action: '安全类型转换', from: value, to: coerced });
  value = coerced;
  const typeOk = schema.type === undefined
    || (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value))
    || (schema.type === 'array' && Array.isArray(value))
    || (schema.type === 'string' && typeof value === 'string')
    || (schema.type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (schema.type === 'boolean' && typeof value === 'boolean');
  if (!typeOk) { issues.push({ path: path || '$', code: 'INVALID_ARGUMENT_TYPE', message: `${path || '参数'}类型不正确`, expected: String(schema.type || '符合 Schema'), received: valueShape(value) }); return value; }
  if (schema.enum && !schema.enum.includes(value)) issues.push({ path: path || '$', code: 'INVALID_ARGUMENT_ENUM', message: `${path || '参数'}必须是允许值之一`, expected: schema.enum.join(' | '), received: JSON.stringify(value) });
  if (schema.const !== undefined && value !== schema.const) issues.push({ path: path || '$', code: 'INVALID_ARGUMENT_CONST', message: `${path || '参数'}必须是固定值`, expected: JSON.stringify(schema.const), received: JSON.stringify(value) });
  if (typeof value === 'string' && schema.minLength != null && value.length < schema.minLength) issues.push({ path: path || '$', code: 'STRING_TOO_SHORT', message: `${path || '参数'}不能为空或过短`, expected: `minLength=${schema.minLength}`, received: `string(${value.length})` });
  if (typeof value === 'number' && schema.minimum != null && value < schema.minimum) issues.push({ path: path || '$', code: 'NUMBER_TOO_SMALL', message: `${path || '参数'}不能小于 ${schema.minimum}`, expected: `minimum=${schema.minimum}`, received: String(value) });
  if (typeof value === 'number' && schema.maximum != null && value > schema.maximum) issues.push({ path: path || '$', code: 'NUMBER_TOO_LARGE', message: `${path || '参数'}不能大于 ${schema.maximum}`, expected: `maximum=${schema.maximum}`, received: String(value) });
  if (schema.type === 'object' && value) {
    const properties = schema.properties || {};
    for (const key of Object.keys(value)) {
      if (properties[key]) continue; const alias = exactAlias(key, properties);
      if (alias && value[alias] === undefined) { value[alias] = value[key]; delete value[key]; normalizations.push({ path: path ? `${path}.${key}` : key, action: `字段名规范化为 ${alias}`, from: key, to: alias }); }
      else if (schema.additionalProperties === false) issues.push({ path: path ? `${path}.${key}` : key, code: 'UNKNOWN_ARGUMENT', message: `不支持参数 ${key}`, expected: `允许字段：${Object.keys(properties).join('、')}`, received: key });
    }
    for (const required of schema.required || []) if (value[required] === undefined || value[required] === '') issues.push({ path: path ? `${path}.${required}` : required, code: 'REQUIRED_ARGUMENT', message: `缺少参数 ${required}`, expected: properties[required]?.type || '必填值', received: 'missing' });
    for (const conditional of schema.allOf || []) {
      const conditions = conditional?.if?.properties || {};
      const matches = Object.entries(conditions).every(([key, rule]: [string, any]) => rule?.const === undefined || value[key] === rule.const);
      if (!matches) continue;
      for (const required of conditional?.then?.required || []) if (value[required] === undefined || value[required] === '') issues.push({ path: path ? `${path}.${required}` : required, code: 'CONDITIONAL_REQUIRED_ARGUMENT', message: `当前参数组合要求提供 ${required}`, expected: properties[required]?.type || '必填值', received: 'missing' });
    }
    for (const [key, child] of Object.entries(properties)) if (value[key] !== undefined) value[key] = inspect(value[key], child, path ? `${path}.${key}` : key, normalizations, issues);
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) issues.push({ path: path || '$', code: 'ARRAY_TOO_SHORT', message: `${path || '数组'}至少需要 ${schema.minItems} 项`, expected: `minItems=${schema.minItems}`, received: `array(${value.length})` });
    if (schema.maxItems != null && value.length > schema.maxItems) issues.push({ path: path || '$', code: 'ARRAY_TOO_LONG', message: `${path || '数组'}最多允许 ${schema.maxItems} 项`, expected: `maxItems=${schema.maxItems}`, received: `array(${value.length})` });
    if (schema.items) value = value.map((item, index) => inspect(item, schema.items, `${path}[${index}]`, normalizations, issues));
  }
  return value;
}

/** 按 schema 编译工具参数。 */
export function compileToolArguments(toolName: string, original: Record<string, any>, schema: Record<string, any>): ToolSchemaContractResult {
  const normalizations: ToolArgumentNormalization[] = []; const issues: ToolArgumentIssue[] = []; const argumentsValue = inspect(clone(original), schema, '', normalizations, issues);
  const first = issues[0];
  return first ? { ok: false as const, arguments: argumentsValue, normalizations, error: {
    code: first.code, message: first.message, path: first.path, expectedShape: first.expected, receivedShape: first.received,
    issues: issues.slice(0, 12), suggestedArguments: argumentsValue, correctionInstruction: '只修正本次工具参数，不要重启任务。按 issues 逐项修改；缺少业务值时先调用对应 list/get 工具读取真实值，禁止猜测 ID。',
  } } : { ok: true as const, arguments: argumentsValue, normalizations };
}

/**
 * One argument-compilation pipeline: schema contract first, then domain
 * normalization hooks, then domain validation hooks. The registry crosses a
 * single interface instead of three parallel compilers.
 */
export function compileToolArgumentsPipeline(toolName: string, original: Record<string, any>, schema: Record<string, any> | undefined, hooks: ToolDomainHooks = {}): ToolPipelineResult {
  const normalizations: ToolArgumentNormalization[] = [];
  let current = clone(original);
  if (schema) {
    const contract = compileToolArguments(toolName, current, schema);
    if (!contract.ok) return contract;
    normalizations.push(...contract.normalizations);
    current = contract.arguments;
  }
  if (hooks.normalize) {
    const normalized = hooks.normalize(toolName, current);
    if (normalized) {
      normalizations.push(...normalized.normalizations);
      current = normalized.arguments;
    }
  }
  if (hooks.validate) {
    const error = hooks.validate(toolName, current, normalizations);
    if (error) return { ok: false, arguments: current, normalizations, error };
  }
  return { ok: true, arguments: current, normalizations };
}

/** 工具契约摘要。 */
export function toolContractSummary(schema: Record<string, any>) {
  const required = (schema.required || []).join('、') || '无'; const properties = Object.entries(schema.properties || {}).slice(0, 24).map(([key, value]: [string, any]) => `${key}:${value.type || 'any'}${value.enum ? `[${value.enum.join('|')}]` : ''}`);
  return `参数契约：必填 ${required}；字段 ${properties.join('，') || '无'}`;
}

/** 参数失败指纹（幂等诊断）。 */
export function parameterFailureFingerprint(toolName: string, error: any, argumentsValue: unknown) {
  const shape = (value: any): any => Array.isArray(value) ? value.slice(0, 8).map(shape) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])])) : typeof value;
  return createHash('sha256').update(JSON.stringify({ toolName, code: error?.code, path: error?.path, shape: shape(argumentsValue) })).digest('hex').slice(0, 20);
}
