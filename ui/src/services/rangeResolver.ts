import type { RangeRef, RangeValue } from '../models';
import type { SrcTableEntry } from '../project/types';
import { formatRangeAddress, getRangeAreas, type RangeArea } from './rangeGeometry';

export function rangeToAddress(ref: RangeRef): string {
  return formatRangeAddress(getRangeAreas(ref), ref.sheetName);
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

  const resolveArea = (area: RangeArea) => {
    const rawRows: unknown[][] = [];
    for (let r = area.startRow; r <= area.endRow; r++) {
      const row: unknown[] = [];
      const rowData = sheet.preview[r];
      for (let c = area.startCol; c <= area.endCol; c++) {
        const column = sheet.headers[c];
        row.push(rowData ? rowData[column] : undefined);
      }
      rawRows.push(row);
    }

    let headers: string[];
    let data: unknown[][];

    if (ref.firstRowIsHeader === true || (ref.firstRowIsHeader === undefined && rawRows.length >= 2 && looksLikeHeaderRow(rawRows[0], rawRows.slice(1)))) {
      headers = rawRows[0].map(v => String(v ?? ''));
      data = rawRows.slice(1);
    } else {
      headers = [];
      for (let c = area.startCol; c <= area.endCol; c++) {
        headers.push(sheet.headers[c] || `Col${c + 1}`);
      }
      data = rawRows;
    }
    return { area, rawRows, headers, data };
  };

  const areaResults = getRangeAreas(ref).map(resolveArea);
  if (!areaResults.length) return null;
  const rawRows = areaResults.flatMap((result) => result.rawRows);
  const data = areaResults.flatMap((result) => result.data);
  const headers = areaResults[0].headers;
  const address = rangeToAddress(ref);
  const cellCount = areaResults.reduce((sum, result) => sum + result.rawRows.reduce((rowSum, row) => rowSum + row.length, 0), 0);
  const singleValue = cellCount === 1 ? rawRows[0]?.[0] : undefined;

  return {
    address,
    rows: data.length,
    cols: Math.max(0, ...areaResults.map((result) => result.area.endCol - result.area.startCol + 1)),
    headers,
    data,
    singleValue,
    areas: areaResults.map((result) => ({
      address: formatRangeAddress([result.area]),
      rows: result.data.length,
      cols: result.area.endCol - result.area.startCol + 1,
      data: result.data,
    })),
    areaCount: areaResults.length,
    cellCount,
  };
}

export function getRangePreview(ref: RangeRef, tables: SrcTableEntry[], maxRows = 5): string[][] {
  const resolved = resolveRange(ref, tables);
  if (!resolved) return [];
  return resolved.data.slice(0, maxRows).map(row => row.map(cell => cell == null ? '' : String(cell)));
}
