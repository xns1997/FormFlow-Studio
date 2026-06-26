// ── 端口类型系统 ──────────────────────────────────────────
// 每种类型都有独立的标识符和校验器，确保数据传递的严谨性

export type PortType =
  // 基础类型
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'any'
  // Excel 数据类型
  | 'workbook'
  | 'worksheet'
  | 'cell'
  | 'range'
  | 'address'
  | 'cell-ref'
  // 数据集合类型
  | 'json-rows'
  | 'aoa'
  | 'headers'
  | 'options'
  | 'file-data'
  // 格式类型
  | 'csv-string'
  | 'html-string'
  | 'json-string'
  // 配置类型
  | 'filter'
  | 'sort-config'
  | 'style'
  | 'validation-rule'
  // 流程类型
  | 'trigger';

export interface TypeCheckResult {
  valid: boolean;
  error?: string;
  normalized?: unknown;
}

export type TypeChecker = (value: unknown) => TypeCheckResult;

// ── 类型校验器 ──────────────────────────────────────────

const checkers = new Map<string, TypeChecker>();

function reg(type: string, checker: TypeChecker) {
  checkers.set(type, checker);
}

// 基础类型
reg('string', (v) => {
  if (v === null || v === undefined) return { valid: true, normalized: '' };
  return { valid: true, normalized: String(v) };
});

reg('number', (v) => {
  if (v === null || v === undefined || v === '') return { valid: true, normalized: 0 };
  const n = Number(v);
  if (isNaN(n)) return { valid: false, error: `期望数字，实际: ${typeof v}(${String(v)})` };
  return { valid: true, normalized: n };
});

reg('boolean', (v) => {
  if (v === null || v === undefined) return { valid: true, normalized: false };
  if (typeof v === 'boolean') return { valid: true, normalized: v };
  if (v === 'true' || v === '1' || v === 1) return { valid: true, normalized: true };
  if (v === 'false' || v === '0' || v === 0) return { valid: true, normalized: false };
  return { valid: false, error: `期望布尔值，实际: ${typeof v}(${String(v)})` };
});

reg('enum', (v) => {
  if (v === null || v === undefined) return { valid: true, normalized: '' };
  return { valid: true, normalized: String(v) };
});

reg('color', (v) => {
  const s = String(v || '');
  if (s === '') return { valid: true, normalized: '#000000' };
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return { valid: true, normalized: s };
  if (/^(rgb|hsl)a?\(/.test(s)) return { valid: true, normalized: s };
  return { valid: false, error: `期望颜色值，实际: ${s}` };
});

reg('any', (v) => ({ valid: true, normalized: v }));

// Excel 数据类型
reg('workbook', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'workbook 为空' };
  const wb = v as any;
  if (wb.SheetNames && wb.Sheets) return { valid: true, normalized: v };
  if (wb.__fromProject) return { valid: true, normalized: v };
  return { valid: false, error: `期望 workbook 对象（需含 SheetNames/Sheets），实际: ${typeof v}` };
});

reg('worksheet', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'worksheet 为空' };
  const ws = v as any;
  // XLSX worksheet: has !ref or cell addresses
  if (ws['!ref'] || ws['!cols'] || ws['!rows']) return { valid: true, normalized: v };
  // Project worksheet wrapper
  if (ws.__fromProject && ws.headers && ws.preview) return { valid: true, normalized: v };
  // Worksheet-like object with cell data
  if (typeof ws === 'object' && !Array.isArray(ws)) return { valid: true, normalized: v };
  return { valid: false, error: `期望 worksheet 对象，实际: ${Array.isArray(ws) ? 'array' : typeof v}` };
});

reg('cell', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'cell 坐标为空' };
  const c = v as any;
  if (typeof c.r === 'number' && typeof c.c === 'number') return { valid: true, normalized: { r: c.r, c: c.c } };
  if (typeof c.row === 'number' && typeof c.col === 'number') return { valid: true, normalized: { r: c.row, c: c.col } };
  return { valid: false, error: `期望 cell 坐标 {r, c}，实际: ${JSON.stringify(v)}` };
});

reg('range', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'range 为空' };
  const r = v as any;
  if (r.s && r.e && typeof r.s.r === 'number' && typeof r.s.c === 'number') return { valid: true, normalized: v };
  if (r.startRow !== undefined && r.startCol !== undefined && r.endRow !== undefined && r.endCol !== undefined) {
    return { valid: true, normalized: { s: { r: r.startRow, c: r.startCol }, e: { r: r.endRow, c: r.endCol } } };
  }
  return { valid: false, error: `期望 range 对象 {s:{r,c}, e:{r,c}}，实际: ${JSON.stringify(v).slice(0, 100)}` };
});

reg('address', (v) => {
  const s = String(v || '');
  if (s === '') return { valid: true, normalized: '' };
  // A1 format: Sheet1!A1:C10 or A1:C10 or A1
  if (/^([^!]+!)?[A-Z]+\d+(:[A-Z]+\d+)?$/.test(s)) return { valid: true, normalized: s };
  return { valid: false, error: `期望 A1 格式地址，实际: ${s}` };
});

reg('cell-ref', (v) => {
  const s = String(v || '');
  if (s === '') return { valid: true, normalized: '' };
  if (/^[A-Z]+\d+$/.test(s)) return { valid: true, normalized: s };
  return { valid: false, error: `期望单元格引用如 A1，实际: ${s}` };
});

// 数据集合类型
reg('json-rows', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'json-rows 为空' };
  if (!Array.isArray(v)) return { valid: false, error: `期望 JSON 行数组，实际: ${typeof v}` };
  if (v.length === 0) return { valid: true, normalized: v };
  if (typeof v[0] === 'object' && !Array.isArray(v[0])) return { valid: true, normalized: v };
  return { valid: false, error: `期望 Record<string, unknown>[]，实际元素类型: ${typeof v[0]}` };
});

reg('aoa', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'aoa 为空' };
  if (!Array.isArray(v)) return { valid: false, error: `期望二维数组，实际: ${typeof v}` };
  if (v.length === 0) return { valid: true, normalized: v };
  if (Array.isArray(v[0])) return { valid: true, normalized: v };
  return { valid: false, error: `期望 unknown[][]，实际首元素: ${typeof v[0]}` };
});

reg('headers', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'headers 为空' };
  if (!Array.isArray(v)) return { valid: false, error: `期望字符串数组，实际: ${typeof v}` };
  const allStrings = v.every((item) => typeof item === 'string');
  if (allStrings) return { valid: true, normalized: v };
  return { valid: false, error: `期望 string[]，含非字符串元素` };
});

reg('options', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'options 为空' };
  if (!Array.isArray(v)) return { valid: false, error: `期望选项数组，实际: ${typeof v}` };
  if (v.length === 0) return { valid: true, normalized: v };
  const first = v[0] as any;
  if (first && typeof first === 'object' && ('label' in first || 'value' in first)) return { valid: true, normalized: v };
  // 允许简单字符串数组作为选项
  if (typeof first === 'string') return { valid: true, normalized: v.map(s => ({ label: s, value: s })) };
  return { valid: false, error: `期望 {label, value}[] 或 string[]` };
});

reg('file-data', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'file-data 为空' };
  if (v instanceof ArrayBuffer) return { valid: true, normalized: v };
  if (v instanceof Uint8Array) return { valid: true, normalized: v };
  if (typeof v === 'string' && v.length > 0) return { valid: true, normalized: v };
  // Blob check
  if (typeof Blob !== 'undefined' && v instanceof Blob) return { valid: true, normalized: v };
  return { valid: false, error: `期望 ArrayBuffer | Uint8Array | string，实际: ${typeof v}` };
});

// 格式类型
reg('csv-string', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'csv-string 为空' };
  const s = String(v);
  // Basic CSV check: contains commas or newlines
  return { valid: true, normalized: s };
});

reg('html-string', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'html-string 为空' };
  const s = String(v);
  return { valid: true, normalized: s };
});

reg('json-string', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'json-string 为空' };
  const s = String(v);
  try { JSON.parse(s); return { valid: true, normalized: s }; }
  catch { return { valid: false, error: `期望有效 JSON 字符串` }; }
});

// 配置类型
reg('filter', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'filter 为空' };
  const f = v as any;
  if (typeof f === 'object' && ('field' in f || 'operator' in f || 'value' in f)) return { valid: true, normalized: v };
  return { valid: false, error: '期望 {field, operator, value} 配置' };
});

reg('sort-config', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'sort-config 为空' };
  const s = v as any;
  if (typeof s === 'object' && 'field' in s) return { valid: true, normalized: { field: s.field, order: s.order || 'asc' } };
  return { valid: false, error: `期望 {field, order} 配置` };
});

reg('style', (v) => {
  if (v === null || v === undefined) return { valid: true, normalized: {} };
  if (typeof v === 'object' && !Array.isArray(v)) return { valid: true, normalized: v };
  return { valid: false, error: `期望样式对象 Record<string, unknown>` };
});

reg('validation-rule', (v) => {
  if (v === null || v === undefined) return { valid: false, error: 'validation-rule 为空' };
  const r = v as any;
  if (typeof r === 'object' && 'type' in r) return { valid: true, normalized: v };
  return { valid: false, error: `期望 {type, ...} 校验规则` };
});

// 流程类型
reg('trigger', (v) => ({ valid: true, normalized: v ?? true }));

// ── 公开 API ──────────────────────────────────────────

export function checkPortType(type: string, value: unknown): TypeCheckResult {
  const checker = checkers.get(type);
  if (!checker) return { valid: true, normalized: value };
  return checker(value);
}

export function getRegisteredTypes(): string[] {
  return [...checkers.keys()];
}

export function isTypeRegistered(type: string): boolean {
  return checkers.has(type);
}

/**
 * 校验并规范化端口值，失败时抛出错误
 */
export function assertPortType(type: string, value: unknown, portName?: string): unknown {
  const result = checkPortType(type, value);
  if (!result.valid) {
    const prefix = portName ? `端口 "${portName}"` : '';
    throw new Error(`${prefix}类型校验失败: ${result.error}`);
  }
  return result.normalized;
}

/**
 * 批量校验多个端口值
 */
export function checkPortValues(
  ports: Array<{ name: string; type: string; value: unknown; required?: boolean }>,
): { valid: boolean; errors: Record<string, string>; normalized: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  const normalized: Record<string, unknown> = {};

  for (const port of ports) {
    if (port.value === null || port.value === undefined) {
      if (port.required) {
        errors[port.name] = `端口 "${port.name}" 为必填项`;
      }
      continue;
    }
    const result = checkPortType(port.type, port.value);
    if (!result.valid) {
      errors[port.name] = result.error!;
    } else {
      normalized[port.name] = result.normalized;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, normalized };
}
