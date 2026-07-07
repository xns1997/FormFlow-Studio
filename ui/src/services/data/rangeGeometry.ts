export interface RangeArea {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface CellRangeArea {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface ComplexRange {
  kind: 'complex-range';
  areas: CellRangeArea[];
  address: string;
  sheetName?: string;
  tableId?: string;
  operation?: 'selection' | 'intersection';
  bounds: CellRangeArea | null;
  areaCount: number;
  cellCount: number;
}

const cellPattern = /^\$?([A-Z]+)\$?(\d+)$/i;

function colIndex(label: string): number {
  let result = 0;
  for (const char of label.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

function colName(index: number): string {
  let result = '';
  let value = index;
  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

export function normalizeArea(area: RangeArea): RangeArea {
  return {
    startRow: Math.max(0, Math.min(area.startRow, area.endRow)),
    startCol: Math.max(0, Math.min(area.startCol, area.endCol)),
    endRow: Math.max(0, Math.max(area.startRow, area.endRow)),
    endCol: Math.max(0, Math.max(area.startCol, area.endCol)),
  };
}

function toArea(value: unknown): RangeArea | null {
  const item = value as any;
  if (item?.s && item?.e && [item.s.r, item.s.c, item.e.r, item.e.c].every(Number.isFinite)) {
    return normalizeArea({ startRow: item.s.r, startCol: item.s.c, endRow: item.e.r, endCol: item.e.c });
  }
  if (item && [item.startRow, item.startCol, item.endRow, item.endCol].every(Number.isFinite)) {
    return normalizeArea(item as RangeArea);
  }
  return null;
}

function toCellRange(area: RangeArea): CellRangeArea {
  return { s: { r: area.startRow, c: area.startCol }, e: { r: area.endRow, c: area.endCol } };
}

export function parseRangeAddress(address: string): { sheetName?: string; areas: RangeArea[] } {
  let inheritedSheet: string | undefined;
  const areas: RangeArea[] = [];
  for (const rawPart of String(address || '').split(/[,;]/).map((part) => part.trim()).filter(Boolean)) {
    let part = rawPart;
    const bang = part.lastIndexOf('!');
    if (bang >= 0) {
      inheritedSheet = part.slice(0, bang).replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
      part = part.slice(bang + 1);
    }
    const [startText, endText = startText] = part.split(':');
    const start = cellPattern.exec(startText.trim());
    const end = cellPattern.exec(endText.trim());
    if (!start || !end) continue;
    areas.push(normalizeArea({
      startRow: Number(start[2]) - 1,
      startCol: colIndex(start[1]),
      endRow: Number(end[2]) - 1,
      endCol: colIndex(end[1]),
    }));
  }
  return { sheetName: inheritedSheet, areas };
}

function quoteSheetName(sheetName: string): string {
  return /^[A-Za-z0-9_\u4e00-\u9fff]+$/.test(sheetName) ? sheetName : `'${sheetName.replace(/'/g, "''")}'`;
}

export function formatRangeAddress(areas: RangeArea[], sheetName?: string): string {
  const prefix = sheetName ? `${quoteSheetName(sheetName)}!` : '';
  return areas.map((area, index) => {
    const normalized = normalizeArea(area);
    const start = `${colName(normalized.startCol)}${normalized.startRow + 1}`;
    const end = `${colName(normalized.endCol)}${normalized.endRow + 1}`;
    return `${index === 0 ? prefix : ''}${start}${start === end ? '' : `:${end}`}`;
  }).join(',');
}

/** Convert overlapping input rectangles into an exact, non-overlapping canonical set. */
export function canonicalizeAreas(input: RangeArea[]): RangeArea[] {
  const source = input.map(normalizeArea);
  if (!source.length) return [];
  const rowBounds = [...new Set(source.flatMap((area) => [area.startRow, area.endRow + 1]))].sort((a, b) => a - b);
  const bands: RangeArea[] = [];
  for (let i = 0; i < rowBounds.length - 1; i += 1) {
    const startRow = rowBounds[i];
    const endRow = rowBounds[i + 1] - 1;
    const intervals = source
      .filter((area) => area.startRow <= startRow && area.endRow >= endRow)
      .map((area) => [area.startCol, area.endCol] as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: Array<[number, number]> = [];
    for (const interval of intervals) {
      const previous = merged[merged.length - 1];
      if (previous && interval[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
    }
    for (const [startCol, endCol] of merged) {
      const above = bands.find((area) => area.endRow + 1 === startRow && area.startCol === startCol && area.endCol === endCol);
      if (above) above.endRow = endRow;
      else bands.push({ startRow, startCol, endRow, endCol });
    }
  }
  return bands.sort((a, b) => a.startRow - b.startRow || a.startCol - b.startCol || a.endRow - b.endRow || a.endCol - b.endCol);
}

export function getRangeAreas(value: unknown): RangeArea[] {
  const range = value as any;
  if (Array.isArray(range?.areas)) return canonicalizeAreas(range.areas.map(toArea).filter(Boolean) as RangeArea[]);
  if (typeof value === 'string') return canonicalizeAreas(parseRangeAddress(value).areas);
  const single = toArea(value);
  return single ? [single] : [];
}

export function createComplexRange(areas: RangeArea[], options: Pick<ComplexRange, 'sheetName' | 'tableId' | 'operation'> = {}): ComplexRange {
  const normalized = canonicalizeAreas(areas);
  const bounds = normalized.length ? toCellRange({
    startRow: Math.min(...normalized.map((area) => area.startRow)),
    startCol: Math.min(...normalized.map((area) => area.startCol)),
    endRow: Math.max(...normalized.map((area) => area.endRow)),
    endCol: Math.max(...normalized.map((area) => area.endCol)),
  }) : null;
  return {
    kind: 'complex-range',
    areas: normalized.map(toCellRange),
    address: formatRangeAddress(normalized, options.sheetName),
    ...options,
    bounds,
    areaCount: normalized.length,
    cellCount: normalized.reduce((sum, area) => sum + (area.endRow - area.startRow + 1) * (area.endCol - area.startCol + 1), 0),
  };
}

export function intersectRangeAreas(left: RangeArea[], right: RangeArea[]): RangeArea[] {
  const intersections: RangeArea[] = [];
  for (const a of canonicalizeAreas(left)) {
    for (const b of canonicalizeAreas(right)) {
      const area = {
        startRow: Math.max(a.startRow, b.startRow),
        startCol: Math.max(a.startCol, b.startCol),
        endRow: Math.min(a.endRow, b.endRow),
        endCol: Math.min(a.endCol, b.endCol),
      };
      if (area.startRow <= area.endRow && area.startCol <= area.endCol) intersections.push(area);
    }
  }
  return canonicalizeAreas(intersections);
}

export function combineRangeAreas(input: RangeArea[], operation: 'selection' | 'intersection'): RangeArea[] {
  if (operation === 'intersection' && input.length > 1) {
    return input.slice(1).reduce((result, area) => intersectRangeAreas(result, [area]), [normalizeArea(input[0])]);
  }
  return canonicalizeAreas(input);
}

export function getEditableRangeSources(value: unknown): RangeArea[] {
  const range = value as any;
  if (range?.operation === 'intersection' && Array.isArray(range.sourceAreas) && range.sourceAreas.length > 0) {
    return range.sourceAreas.map(toArea).filter(Boolean) as RangeArea[];
  }
  return getRangeAreas(value);
}

export function intersectComplexRanges(left: unknown, right: unknown): ComplexRange {
  const a = left as any;
  const b = right as any;
  const leftSheet = a?.sheetName || parseRangeAddress(a?.address || '').sheetName;
  const rightSheet = b?.sheetName || parseRangeAddress(b?.address || '').sheetName;
  const sheetName = leftSheet || rightSheet;
  const sameSource = (!leftSheet || !rightSheet || leftSheet === rightSheet)
    && (!a?.tableId || !b?.tableId || a.tableId === b.tableId);
  return createComplexRange(sameSource ? intersectRangeAreas(getRangeAreas(left), getRangeAreas(right)) : [], {
    sheetName,
    tableId: a?.tableId || b?.tableId,
    operation: 'intersection',
  });
}
