import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, colOverride, ascOverride] = args;
  const ws = worksheet as any;
  const colIdx = (colOverride as number) ?? (props.sortColumn as number) ?? 0;
  const asc = (ascOverride as boolean) ?? (props.ascending as boolean) ?? true;
  const hasHeader = (props.hasHeader as boolean) !== false;
  if (!ws || !ws['!ref']) return { worksheet: ws };

  const range = XLSX.utils.decode_range(ws['!ref']);
  const startRow = hasHeader ? range.s.r + 1 : range.s.r;
  const rows: any[][] = [];
  for (let r = startRow; r <= range.e.r; r++) {
    const row: any[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(ws[XLSX.utils.encode_cell({ r, c })]);
    }
    rows.push(row);
  }
  rows.sort((a, b) => {
    const av = a[colIdx]?.v ?? '';
    const bv = b[colIdx]?.v ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return asc ? cmp : -cmp;
  });
  for (let r = startRow; r <= range.e.r; r++) {
    const rowData = rows[r - startRow];
    for (let c = range.s.c; c <= range.e.c; c++) {
      ws[XLSX.utils.encode_cell({ r, c })] = rowData[c - range.s.c];
    }
  }
  return { worksheet: ws };
};
