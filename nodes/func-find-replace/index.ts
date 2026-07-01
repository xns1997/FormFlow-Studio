import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, findOverride, replaceOverride] = args;
  const ws = worksheet as any;
  const findText = (findOverride as string) || (props.findText as string) || '';
  const replaceText = (replaceOverride as string) || (props.replaceText as string) || '';
  if (!ws || !findText) return { worksheet: ws, replacedCount: 0 };

  let count = 0;
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (cell && cell.w && cell.w.includes(findText)) {
        cell.w = cell.w.split(findText).join(replaceText);
        if (cell.v && String(cell.v).includes(findText)) {
          cell.v = String(cell.v).split(findText).join(replaceText);
        }
        count++;
      }
    }
  }
  return { worksheet: ws, replacedCount: count };
};
