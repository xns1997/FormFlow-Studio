import * as XLSX from 'xlsx';

type Axis = 'row' | 'column';
type Action = 'insert' | 'delete';
type CellRange = { s: { r: number; c: number }; e: { r: number; c: number } };

const cellKeyPattern = /^[A-Z]+\d+$/;

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function toEditableWorksheet(worksheet: any): any {
  if (!worksheet?.__fromProject) return worksheet;
  const headers: string[] = worksheet.headers || [];
  const rows: Record<string, unknown>[] = worksheet.preview || [];
  const converted = XLSX.utils.json_to_sheet(rows, { header: headers.length ? headers : undefined });
  Object.defineProperty(converted, '__sourceSheetName', {
    value: worksheet.sheetName || '', configurable: true, enumerable: false, writable: true,
  });
  return converted;
}

function transformCoordinate(value: number, index: number, count: number, action: Action): number | null {
  if (action === 'insert') return value >= index ? value + count : value;
  const end = index + count - 1;
  if (value < index) return value;
  if (value <= end) return null;
  return value - count;
}

function transformInterval(start: number, end: number, index: number, count: number, action: Action): [number, number] | null {
  if (action === 'insert') {
    if (index <= start) return [start + count, end + count];
    if (index <= end) return [start, end + count];
    return [start, end];
  }
  const deletedEnd = index + count - 1;
  if (end < index) return [start, end];
  if (start > deletedEnd) return [start - count, end - count];
  const keptBefore = Math.max(0, index - start);
  const keptAfter = Math.max(0, end - deletedEnd);
  if (keptBefore + keptAfter === 0) return null;
  const nextStart = start < index ? start : index;
  return [nextStart, nextStart + keptBefore + keptAfter - 1];
}

function transformRange(range: CellRange, axis: Axis, index: number, count: number, action: Action): CellRange | null {
  const interval = axis === 'row'
    ? transformInterval(range.s.r, range.e.r, index, count, action)
    : transformInterval(range.s.c, range.e.c, index, count, action);
  if (!interval) return null;
  return axis === 'row'
    ? { s: { ...range.s, r: interval[0] }, e: { ...range.e, r: interval[1] } }
    : { s: { ...range.s, c: interval[0] }, e: { ...range.e, c: interval[1] } };
}

function shiftFormula(formula: string, axis: Axis, index: number, count: number, action: Action): string {
  return formula.replace(/(^|[^A-Z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Z0-9_])/gi, (match, prefix, colAbs, col, rowAbs, rowText) => {
    const cell = XLSX.utils.decode_cell(`${col}${rowText}`);
    const coordinate = axis === 'row' ? cell.r : cell.c;
    const shifted = transformCoordinate(coordinate, index, count, action);
    if (shifted === null) return `${prefix}#REF!`;
    if (axis === 'row') cell.r = shifted; else cell.c = shifted;
    const encoded = XLSX.utils.encode_cell(cell);
    const parsed = /^([A-Z]+)(\d+)$/.exec(encoded)!;
    return `${prefix}${colAbs}${parsed[1]}${rowAbs}${parsed[2]}`;
  });
}

function recalculateRef(worksheet: any) {
  const cells = Object.keys(worksheet).filter((key) => cellKeyPattern.test(key)).map((key) => XLSX.utils.decode_cell(key));
  if (!cells.length) { worksheet['!ref'] = 'A1'; return; }
  worksheet['!ref'] = XLSX.utils.encode_range({
    s: { r: Math.min(...cells.map((cell) => cell.r)), c: Math.min(...cells.map((cell) => cell.c)) },
    e: { r: Math.max(...cells.map((cell) => cell.r)), c: Math.max(...cells.map((cell) => cell.c)) },
  });
}

export function editWorksheetStructure(worksheet: any, axis: Axis, action: Action, start: unknown, amount: unknown) {
  const editable = toEditableWorksheet(worksheet);
  if (!editable || typeof editable !== 'object') throw new Error('缺少 worksheet 输入');
  const index = positiveInteger(start, 1) - 1;
  const count = positiveInteger(amount, 1);
  const entries = Object.keys(editable)
    .filter((key) => cellKeyPattern.test(key))
    .map((key) => ({ key, cell: editable[key], position: XLSX.utils.decode_cell(key) }));

  for (const { key } of entries) delete editable[key];
  for (const entry of entries) {
    const coordinate = axis === 'row' ? entry.position.r : entry.position.c;
    const shifted = transformCoordinate(coordinate, index, count, action);
    if (shifted === null) continue;
    if (axis === 'row') entry.position.r = shifted; else entry.position.c = shifted;
    if (typeof entry.cell?.f === 'string') entry.cell.f = shiftFormula(entry.cell.f, axis, index, count, action);
    editable[XLSX.utils.encode_cell(entry.position)] = entry.cell;
  }

  if (Array.isArray(editable['!merges'])) {
    editable['!merges'] = editable['!merges']
      .map((range: CellRange) => transformRange(range, axis, index, count, action))
      .filter(Boolean);
  }
  if (typeof editable['!autofilter']?.ref === 'string') {
    const transformed = transformRange(XLSX.utils.decode_range(editable['!autofilter'].ref), axis, index, count, action);
    if (transformed) editable['!autofilter'].ref = XLSX.utils.encode_range(transformed);
    else delete editable['!autofilter'];
  }
  const dimensionKey = axis === 'row' ? '!rows' : '!cols';
  if (Array.isArray(editable[dimensionKey])) {
    if (action === 'insert') editable[dimensionKey].splice(index, 0, ...Array.from({ length: count }, () => undefined));
    else editable[dimensionKey].splice(index, count);
  }
  recalculateRef(editable);
  const range = XLSX.utils.decode_range(editable['!ref'] || 'A1');
  return {
    worksheet: editable,
    affectedCount: count,
    rowCount: range.e.r - range.s.r + 1,
    colCount: range.e.c - range.s.c + 1,
  };
}

export function writeWorksheetRange(worksheet: any, values: unknown, address: string) {
  const editable = toEditableWorksheet(worksheet);
  if (!editable || !Array.isArray(values)) throw new Error('缺少 worksheet 或 values 输入');
  const rows = Array.isArray(values[0]) ? values as unknown[][] : [values as unknown[]];
  XLSX.utils.sheet_add_aoa(editable, rows, { origin: address || 'A1' });
  recalculateRef(editable);
  return editable;
}
