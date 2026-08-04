import { splitTopLevel, literal } from './parserRegex';

/**
 * 动作签名表（单一事实来源）。
 *
 * 每个规范动作名声明其参数槽类型（字段 / 控件 / 字符串 / 数字 / 级别 /
 * 流程 / 数据表 / 运算符 / 任意），供 FFR307 做“参数引用种类”校验：
 * 例如 `show($x)`（字段引用传入控件槽）、`run($x)`（字段引用传入流程 ID 槽）
 * 会被拒绝；普通裸文本参数沿用旧实现语义（normalizeReference 可接受），
 * 不产生误报。
 */

export type ActionArgKind =
  | 'field'       // 期待 $字段
  | 'component'   // 期待 @控件
  | 'string'      // 期待字符串字面量（非 $/@ 引用）
  | 'number'      // 期待数字字面量
  | 'level'       // message 级别：info/success/warning/error
  | 'workflow'    // 流程 ID 字符串
  | 'table'       // 数据表 ID 字符串
  | 'operator'    // compare 运算符：== != > < >= <=
  | 'validator'   // 校验器名或 pattern(...)
  | 'any';

export interface ActionSignature {
  name: string;
  /** 该动作可用的上下文（FFR308 语境矩阵） */
  contexts: Array<'normal' | 'guard'>;
  args: ActionArgKind[];
  /** 末尾参数是否可重复（show(@a, @b, ...)） */
  variadic?: boolean;
}

export const ACTION_SIGNATURES: ActionSignature[] = [
  // 常规动作（10.1）
  { name: 'show', contexts: ['normal'], args: ['component'], variadic: true },
  { name: 'hide', contexts: ['normal'], args: ['component'], variadic: true },
  { name: 'enable', contexts: ['normal'], args: ['component'], variadic: true },
  { name: 'disable', contexts: ['normal'], args: ['component'], variadic: true },
  { name: 'require', contexts: ['normal', 'guard'], args: ['field'], variadic: true },
  { name: 'optional', contexts: ['normal'], args: ['field'], variadic: true },
  { name: 'clear', contexts: ['normal', 'guard'], args: ['field'], variadic: true },
  { name: 'set', contexts: ['normal', 'guard'], args: ['field', 'any'] },
  { name: 'message', contexts: ['normal', 'guard'], args: ['string', 'level'] },
  { name: 'run', contexts: ['normal', 'guard'], args: ['workflow'] },
  { name: 'options', contexts: ['normal'], args: ['field', 'table', 'field', 'any'] },
  // 守卫动作（10.2）
  { name: 'requireany', contexts: ['guard'], args: ['field'], variadic: true },
  { name: 'requiredirty', contexts: ['guard'], args: ['field'], variadic: true },
  { name: 'keepreadonly', contexts: ['guard'], args: ['field'], variadic: true },
  { name: 'validate', contexts: ['guard'], args: ['field', 'validator'] },
  { name: 'range', contexts: ['guard'], args: ['field', 'number', 'number'] },
  { name: 'length', contexts: ['guard'], args: ['field', 'number', 'number'] },
  { name: 'compare', contexts: ['guard'], args: ['field', 'operator', 'any'] },
];

const SIGNATURE_BY_NAME = new Map(ACTION_SIGNATURES.map((signature) => [signature.name, signature]));

const MESSAGE_LEVELS = new Set(['info', 'success', 'warning', 'error']);
const COMPARE_OPERATORS = new Set(['==', '!=', '>', '<', '>=', '<=']);

function kindMismatch(arg: string, expected: ActionArgKind): string | null {
  const trimmed = arg.trim();
  if (!trimmed) return null;
  const isField = /^\$(?:form\.)?/.test(trimmed);
  const isComponent = /^@/.test(trimmed);
  switch (expected) {
    case 'field':
      if (isComponent) return '应使用 $字段 引用';
      return null; // 裸文本沿用旧语义
    case 'component':
      if (isField) return '应使用 @控件 引用';
      return null;
    case 'string':
    case 'workflow':
    case 'table':
      if (isField || isComponent) return '应使用字符串字面量';
      return null;
    case 'number': {
      const value = literal(trimmed);
      if (typeof value === 'number' && Number.isFinite(value)) return null;
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return null; // "18" 兼容
      if (value === null || value === undefined) return '应使用数字字面量';
      return '应使用数字字面量';
    }
    case 'level': {
      const value = String(literal(trimmed) ?? '');
      return MESSAGE_LEVELS.has(value) ? null : `消息级别必须是 ${[...MESSAGE_LEVELS].join(' / ')}`;
    }
    case 'operator': {
      const value = String(literal(trimmed) ?? '');
      return COMPARE_OPERATORS.has(value) ? null : `比较运算符必须是 ${[...COMPARE_OPERATORS].join(' / ')}`;
    }
    case 'validator': {
      if (/^pattern\s*\((["']).*?\1\)$/i.test(trimmed)) return null;
      if (/^pattern\s*\(/i.test(trimmed)) return 'pattern(...) 必须使用引号包裹正则';
      return null; // email 等校验器名不在此枚举
    }
    default:
      return null;
  }
}

/**
 * 校验规范动作调用（`name(args...)`）的参数槽类型与上下文合法性。
 * 返回 FFR307 / FFR308 诊断消息；通过返回空数组。
 */
export function validateActionCall(
  phrase: string,
  mode: 'default' | 'guard',
): Array<{ code: 'FFR307' | 'FFR308'; message: string }> {
  const call = phrase.match(/^([a-z]+)\s*\((.*)\)$/i);
  if (!call) return [];
  const name = call[1].toLowerCase();
  const signature = SIGNATURE_BY_NAME.get(name);
  if (!signature) return [];
  const results: Array<{ code: 'FFR307' | 'FFR308'; message: string }> = [];
  const context = mode === 'guard' ? 'guard' : 'normal';
  if (!signature.contexts.includes(context)) {
    results.push({ code: 'FFR308', message: `动作 ${name} 不允许出现在 ${context === 'guard' ? '守卫' : '常规'} 语境。` });
  }
  const args = splitTopLevel(call[2]);
  for (let index = 0; index < args.length; index += 1) {
    const expected = signature.args[Math.min(index, signature.args.length - 1)];
    if (!expected) continue;
    const mismatch = kindMismatch(args[index], expected);
    if (mismatch) results.push({ code: 'FFR307', message: `动作 ${name} 的第 ${index + 1} 个参数${mismatch}。` });
  }
  return results;
}

export function isGuardOnlyAction(name: string): boolean {
  const signature = SIGNATURE_BY_NAME.get(name.toLowerCase());
  return !!signature && signature.contexts.length === 1 && signature.contexts[0] === 'guard';
}

export function getActionSignature(name: string): ActionSignature | undefined {
  return SIGNATURE_BY_NAME.get(name.toLowerCase());
}
