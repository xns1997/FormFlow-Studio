import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, rangeMode, address, rIdx, cIdx, rCnt, cCnt] = args;
  const ws = worksheet as Record<string, unknown>;
  if (!ws) return { range: null, address: '', values: [], rowCount: 0, colCount: 0 };

  const mode = (rangeMode as string) || (properties.rangeMode as string) || 'usedRange';
  const addr = (address as string) || (properties.address as string) || '';
  const ri = ((rIdx as number) ?? (properties.rowIndex as number) ?? 1) - 1;
  const ci = ((cIdx as number) ?? (properties.colIndex as number) ?? 1) - 1;
  const rc = (rCnt as number) ?? (properties.rowCount as number) ?? 1;
  const cc = (cCnt as number) ?? (properties.colCount as number) ?? 1;

  const XLSXUtils = (ws as any)['!ref'] !== undefined ? null : null;

  let ref = '';
  if (mode === 'address' && addr) {
    ref = addr;
  } else if (mode === 'entireSheet') {
    ref = 'A1:Z100';
  } else if (mode === 'row') {
    ref = `A${ri + 1}:Z${ri + rc}`;
  } else if (mode === 'column') {
    const col = String.fromCharCode(65 + ci);
    ref = `${col}1:${col}${rc}`;
  } else if (mode === 'custom') {
    const startCol = String.fromCharCode(65 + ci);
    ref = `${startCol}${ri + 1}:${startCol}${ri + rc}`;
  } else {
    ref = (ws as any)['!ref'] || 'A1';
  }

  const values: unknown[][] = [];
  if (ref) {
    const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (match) {
      const [, sc, sr, ec, er] = match;
      const startR = parseInt(sr) - 1;
      const endR = parseInt(er) - 1;
      for (let r = startR; r <= endR; r++) {
        const row: unknown[] = [];
        for (let c = 0; c < 26; c++) {
          const cellRef = String.fromCharCode(65 + c) + (r + 1);
          const cell = (ws as any)[cellRef];
          row.push(cell?.v ?? cell?.w ?? '');
        }
        values.push(row);
      }
    }
  }

  const actualRows = values.length;
  const actualCols = values[0]?.length || 0;

  return { range: ws, address: ref, values, rowCount: actualRows, colCount: actualCols };
};
