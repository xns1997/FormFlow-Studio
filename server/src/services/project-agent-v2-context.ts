const DEFAULT_TOOL_RESULT_MAX_CHARS = 32_000;

function jsonChars(value: unknown) {
  try { return JSON.stringify(value).length; } catch { return Number.POSITIVE_INFINITY; }
}

function previewValue(value: unknown, depth: number, arrayLimit: number): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  if (depth >= 6) return Array.isArray(value) ? `[数组，共 ${value.length} 项]` : '[对象已压缩]';
  if (Array.isArray(value)) {
    const items = value.slice(0, arrayLimit).map((item) => previewValue(item, depth + 1, arrayLimit));
    if (value.length > arrayLimit) items.push({ __truncatedItems: value.length - arrayLimit });
    return items;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 60).map(([key, item]) => [key, previewValue(item, depth + 1, arrayLimit)]));
  }
  return String(value);
}

/** Keep persisted events and provider checkpoints bounded without hiding that data was omitted. */
export function compactAgentToolResult<T>(value: T, maxChars = DEFAULT_TOOL_RESULT_MAX_CHARS): T | Record<string, unknown> {
  const originalChars = jsonChars(value);
  if (originalChars <= maxChars) return value;
  for (const arrayLimit of [20, 10, 5, 2]) {
    const preview = previewValue(value, 0, arrayLimit);
    const compacted = { __formflowTruncated: true, originalChars, maxChars, preview };
    if (jsonChars(compacted) <= maxChars) return compacted;
  }
  const serialized = (() => { try { return JSON.stringify(value); } catch { return String(value); } })();
  let previewChars = Math.max(0, maxChars - 256);
  while (previewChars > 0) {
    const compacted = { __formflowTruncated: true, originalChars, maxChars, previewText: serialized.slice(0, previewChars) };
    if (jsonChars(compacted) <= maxChars) return compacted;
    previewChars = Math.floor(previewChars * 0.75);
  }
  return { __formflowTruncated: true, originalChars, maxChars };
}
