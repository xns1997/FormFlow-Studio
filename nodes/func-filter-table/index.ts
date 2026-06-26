import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, rangeAddr, col, vals] = args;
  const ws = worksheet as any;
  const addr = (rangeAddr as string) || (props.rangeAddress as string) || 'A1';
  const colIdx = (col as number) ?? (props.filterColumn as number) ?? 0;
  const filterVals = ((vals as string) || (props.filterValues as string) || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ws) return { worksheet: ws };

  const ref = addr.includes(':') ? addr : (ws['!ref'] || addr);
  ws['!autofilter'] = { ref };
  if (filterVals.length > 0) {
    ws['!autofilter'].filter = ws['!autofilter'].filter || {};
    ws['!autofilter'].filter[colIdx] = filterVals;
  }
  return { worksheet: ws };
};
