import * as XLSX from 'xlsx';

export interface OutputPreviewTable {
  headers: string[];
  rows: unknown[][];
}

export interface FilteredPreviewRow {
  sourceIndex: number;
  row: unknown[];
}

export function filterPreviewRows(rows: unknown[][], query: string): FilteredPreviewRow[] {
  const normalized = query.trim().toLocaleLowerCase();
  return rows.flatMap((row, sourceIndex) => {
    if (!normalized || row.some((cell) => String(cell ?? '').toLocaleLowerCase().includes(normalized))) {
      return [{ sourceIndex, row }];
    }
    return [];
  });
}

function objectRowsToTable(rows: Record<string, unknown>[]): OutputPreviewTable {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) { seen.add(key); headers.push(key); }
    }
  }
  return { headers, rows: rows.map((row) => headers.map((header) => row?.[header])) };
}

function aoaToTable(rows: unknown[][]): OutputPreviewTable {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return { headers: Array.from({ length: width }, (_, index) => columnName(index)), rows };
}

function columnName(index: number): string {
  let result = '';
  let value = index;
  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function getWorkbookSheetNames(value: unknown): string[] {
  const workbook = value as any;
  return Array.isArray(workbook?.SheetNames) ? workbook.SheetNames.map(String) : [];
}

function worksheetToTable(worksheet: any): OutputPreviewTable | null {
  if (!worksheet || typeof worksheet !== 'object') return null;
  if (worksheet.__fromProject) {
    const headers: string[] = worksheet.headers || [];
    return { headers, rows: (worksheet.preview || []).map((row: Record<string, unknown>) => headers.map((header) => row[header])) };
  }
  if (worksheet['!ref'] || Object.keys(worksheet).some((key) => /^[A-Z]+\d+$/.test(key))) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
    return aoaToTable(rows);
  }
  return null;
}

export function outputToPreviewTable(type: string, value: unknown, sheetName?: string): OutputPreviewTable | null {
  if (type === 'workbook') {
    const workbook = value as any;
    const name = sheetName || getWorkbookSheetNames(workbook)[0];
    return name ? worksheetToTable(workbook?.Sheets?.[name]) : null;
  }
  if (type === 'worksheet') return worksheetToTable(value);
  if (type === 'json-rows' && Array.isArray(value)) return objectRowsToTable(value as Record<string, unknown>[]);
  if (type === 'aoa' && Array.isArray(value)) return aoaToTable(value as unknown[][]);
  if (type === 'headers' && Array.isArray(value)) return { headers: ['序号', '字段'], rows: value.map((item, index) => [index + 1, item]) };
  if (type === 'options' && Array.isArray(value)) {
    return objectRowsToTable(value.map((item) => typeof item === 'object' && item !== null ? item : { label: item, value: item }) as Record<string, unknown>[]);
  }
  if (type === 'csv-string') {
    const rows = parseCsvRows(String(value ?? ''));
    const headers = rows.shift() || [];
    return { headers, rows };
  }
  if (type === 'range') {
    const range = value as any;
    const areas = Array.isArray(range?.areas) ? range.areas : range?.s && range?.e ? [range] : [];
    return {
      headers: ['区域', '起始行', '起始列', '结束行', '结束列', '单元格数'],
      rows: areas.map((area: any, index: number) => [
        index + 1, area.s.r + 1, columnName(area.s.c), area.e.r + 1, columnName(area.e.c),
        (area.e.r - area.s.r + 1) * (area.e.c - area.s.c + 1),
      ]),
    };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { headers: [], rows: [] };
    if (Array.isArray(value[0])) return aoaToTable(value as unknown[][]);
    if (typeof value[0] === 'object' && value[0] !== null) return objectRowsToTable(value as Record<string, unknown>[]);
    return { headers: ['序号', '值'], rows: value.map((item, index) => [index + 1, item]) };
  }
  return null;
}

export function stringifyPreviewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength} bytes)`;
  if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.byteLength} bytes)`;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return `Blob(${value.size} bytes, ${value.type || 'unknown'})`;
  try {
    return JSON.stringify(value, (_key, item) => {
      if (item instanceof ArrayBuffer) return `[ArrayBuffer ${item.byteLength} bytes]`;
      if (ArrayBuffer.isView(item)) return `[${item.constructor.name} ${item.byteLength} bytes]`;
      return item;
    }, 2);
  } catch { return String(value); }
}

export function formatOutputPreviewText(type: string, value: unknown): string {
  if (type === 'json-string' && typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  return stringifyPreviewValue(value);
}

export function isBinaryPreviewValue(value: unknown): boolean {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value) || (typeof Blob !== 'undefined' && value instanceof Blob);
}

export type OutputPreviewMode = 'table' | 'html' | 'binary' | 'text';

export function getOutputPreviewMode(type: string, value: unknown, sheetName?: string): OutputPreviewMode {
  if (type === 'html-string') return 'html';
  if (outputToPreviewTable(type, value, sheetName)) return 'table';
  if (isBinaryPreviewValue(value)) return 'binary';
  return 'text';
}
