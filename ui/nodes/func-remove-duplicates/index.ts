import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, colsOverride] = args;
  const ws = worksheet as any;
  const colsStr = (colsOverride as string) || (props.columns as string) || '';
  const hasHeader = (props.hasHeader as boolean) !== false;
  if (!ws || !ws['!ref']) return { worksheet: ws, removedCount: 0 };

  const range = XLSX.utils.decode_range(ws['!ref']);
  const colIndices = colsStr ? colsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
  const startRow = hasHeader ? range.s.r + 1 : range.s.r;
  const seen = new Set<string>();
  let removed = 0;

  for (let r = startRow; r <= range.e.r; r++) {
    const key = colIndices.length > 0
      ? colIndices.map(c => {
          const ref = XLSX.utils.encode_cell({ r, c });
          return ws[ref]?.v ?? '';
        }).join('||')
      : (() => {
          let k = '';
          for (let c = range.s.c; c <= range.e.c; c++) {
            k += (ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '') + '||';
          }
          return k;
        })();

    if (seen.has(key)) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        delete ws[XLSX.utils.encode_cell({ r, c })];
      }
      removed++;
    } else {
      seen.add(key);
    }
  }
  return { worksheet: ws, removedCount: removed };
};
