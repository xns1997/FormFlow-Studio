import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, addrOverride] = args;
  const ws = worksheet as any;
  const addr = (addrOverride as string) || (props.address as string) || 'A1';
  if (!ws) return { range: null, values: [], address: '', rowCount: 0, colCount: 0 };

  const ref = addr.includes(':') ? addr : (ws['!ref'] || addr);
  const range = XLSX.utils.decode_range(ref);
  const values: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell?.v ?? cell?.w ?? '');
    }
    values.push(row);
  }
  return { range: ws, values, address: ref, rowCount: values.length, colCount: values[0]?.length || 0 };
};
