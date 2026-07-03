const STRUCTURED_TYPES = new Set([
  'object', 'array', 'json', 'json-rows', 'aoa', 'headers', 'options',
  'style', 'filter', 'sort-config', 'validation-rule',
  'json-string', 'string[]', 'object[]', 'unknown[][]',
]);

const OBJECT_VALUE_EXCLUSIONS = new Set(['workbook', 'worksheet', 'range', 'cell', 'file-data']);
const ARRAY_STRUCTURED_TYPES = new Set([
  'array', 'json-rows', 'aoa', 'headers', 'options',
  'string[]', 'object[]', 'unknown[][]',
]);
const OBJECT_STRUCTURED_TYPES = new Set([
  'object', 'json', 'style', 'filter', 'sort-config', 'validation-rule',
]);
const STRING_BACKED_STRUCTURED_TYPES = new Set(['json-string']);

export function isStructuredProperty(type: string | undefined, value: unknown): boolean {
  const normalized = String(type || '').toLowerCase();
  if (STRUCTURED_TYPES.has(normalized)) return true;
  return !OBJECT_VALUE_EXCLUSIONS.has(normalized) && value !== null && typeof value === 'object';
}

export function formatStructuredProperty(value: unknown, fallback: unknown = {}, expectedType?: string): string {
  const normalized = String(expectedType || '').toLowerCase();
  const source = value === '' || value === undefined ? fallback : value;
  if (typeof source === 'string') {
    if (source === '[object Object]') return JSON.stringify(fallback && typeof fallback === 'object' ? fallback : {}, null, 2);
    if (STRING_BACKED_STRUCTURED_TYPES.has(normalized)) {
      try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return source; }
    }
    try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return source; }
  }
  return JSON.stringify(source ?? fallback ?? {}, null, 2);
}

export function parseStructuredProperty(text: string, expectedType?: string): { value?: unknown; error?: string } {
  try {
    const value = JSON.parse(text);
    const normalized = String(expectedType || '').toLowerCase();
    if (ARRAY_STRUCTURED_TYPES.has(normalized) && !Array.isArray(value)) return { error: '必须是 JSON 数组' };
    if (OBJECT_STRUCTURED_TYPES.has(normalized) && (value === null || typeof value !== 'object' || Array.isArray(value))) {
      return { error: '必须是 JSON 对象' };
    }
    if (normalized === 'string[]' && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      return { error: '必须是字符串数组' };
    }
    if (normalized === 'object[]' && (!Array.isArray(value) || value.some((item) => item === null || typeof item !== 'object' || Array.isArray(item)))) {
      return { error: '必须是对象数组' };
    }
    if (normalized === 'unknown[][]' && (!Array.isArray(value) || value.some((item) => !Array.isArray(item)))) {
      return { error: '必须是二维数组' };
    }
    if (STRING_BACKED_STRUCTURED_TYPES.has(normalized)) return { value: text };
    return { value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'JSON 格式无效' };
  }
}
