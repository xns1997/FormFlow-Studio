import type { RangeRef, RangeValue } from '../models';
import type { SrcTableEntry } from '../project/types';

export function rangeToAddress(ref: RangeRef): string {
  const colName = (i: number) => { let s = ''; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
  const start = `${colName(ref.startCol)}${ref.startRow + 1}`;
  const end = ref.startRow === ref.endRow && ref.startCol === ref.endCol ? '' : `${colName(ref.endCol)}${ref.endRow + 1}`;
  return `${ref.sheetName}!${start}${end ? ':' + end : ''}`;
}

function looksLikeHeaderRow(firstRow: unknown[], restRows: unknown[][]): boolean {
  if (restRows.length === 0) return false;
  for (let c = 0; c < firstRow.length; c++) {
    const headerVal = firstRow[c];
    if (headerVal === null || headerVal === undefined) continue;
    // 首行该列是纯文本，但后续行同列是数字 → 该列首行是标题
    const isText = isNaN(Number(headerVal)) || headerVal === '';
    const restAreNumeric = restRows.slice(0, Math.min(5, restRows.length))
      .filter(r => r[c] !== null && r[c] !== undefined && r[c] !== '')
      .every(r => !isNaN(Number(r[c])));
    if (isText && restAreNumeric) return true;
  }
  return false;
}

export function resolveRange(ref: RangeRef, tables: SrcTableEntry[]): RangeValue | null {
  const table = tables.find(t => t.id === ref.tableId);
  if (!table) return null;
  const sheet = table.sheets.find(s => s.name === ref.sheetName);
  if (!sheet) return null;

  const cols = ref.endCol - ref.startCol + 1;

  // 读取原始行数据
  const rawRows: unknown[][] = [];
  for (let r = ref.startRow; r <= ref.endRow; r++) {
    const row: unknown[] = [];
    const rowData = sheet.preview[r];
    for (let c = ref.startCol; c <= ref.endCol; c++) {
      const colName = sheet.headers[c];
      row.push(rowData ? rowData[colName] : undefined);
    }
    rawRows.push(row);
  }

  let headers: string[];
  let data: unknown[][];

  if (ref.firstRowIsHeader === true) {
    // 明确指定首行为标题
    headers = rawRows.length > 0 ? rawRows[0].map(v => String(v ?? '')) : [];
    data = rawRows.slice(1);
  } else if (ref.firstRowIsHeader === false) {
    // 明确指定首行不是标题
    headers = [];
    for (let c = ref.startCol; c <= ref.endCol; c++) {
      headers.push(sheet.headers[c] || `Col${c + 1}`);
    }
    data = rawRows;
  } else {
    // 未指定 → 自动检测
    if (rawRows.length >= 2 && looksLikeHeaderRow(rawRows[0], rawRows.slice(1))) {
      headers = rawRows[0].map(v => String(v ?? ''));
      data = rawRows.slice(1);
    } else {
      headers = [];
      for (let c = ref.startCol; c <= ref.endCol; c++) {
        headers.push(sheet.headers[c] || `Col${c + 1}`);
      }
      data = rawRows;
    }
  }

  const address = rangeToAddress(ref);
  const singleValue = rawRows.length === 1 && cols === 1 ? rawRows[0]?.[0] : undefined;

  return { address, rows: data.length, cols, headers, data, singleValue };
}

export function getRangePreview(ref: RangeRef, tables: SrcTableEntry[], maxRows = 5): string[][] {
  const resolved = resolveRange(ref, tables);
  if (!resolved) return [];
  return resolved.data.slice(0, maxRows).map(row => row.map(cell => cell == null ? '' : String(cell)));
}
