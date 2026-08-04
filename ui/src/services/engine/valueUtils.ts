/** Deep equality check: fast path via Object.is, then JSON fallback. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

/**
 * 条件/守卫比较的统一可比化：数字保持数字，日期字符串解析为时间戳，
 * 其余转字符串。formLinkage 与 behaviorEngine 共用，参考语义在
 * shared/formflow-core/behaviorDsl/referenceSemantics.ts 有同逻辑镜像。
 */
export function comparableValue(value: unknown): number | string | unknown {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!text) return value;
  const numeric = Number(text);
  if (!Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(text)) return numeric;
  const date = Date.parse(text);
  if (!Number.isNaN(date)) return date;
  return text;
}
