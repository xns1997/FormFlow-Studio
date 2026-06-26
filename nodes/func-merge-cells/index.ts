import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, addrOverride, mergeOverride] = args;
  const ws = worksheet as any;
  const addr = (addrOverride as string) || (props.rangeAddress as string) || 'A1:C1';
  const doMerge = (mergeOverride as boolean) ?? (props.merge as boolean) ?? true;
  if (!ws) return { worksheet: ws };

  if (!ws['!merges']) ws['!merges'] = [];
  if (doMerge) {
    const range = XLSX.utils.decode_range(addr);
    ws['!merges'].push(range);
  } else {
    const range = XLSX.utils.decode_range(addr);
    ws['!merges'] = ws['!merges'].filter((m: any) =>
      !(m.s.r === range.s.r && m.s.c === range.s.c && m.e.r === range.e.r && m.e.c === range.e.c)
    );
  }
  return { worksheet: ws };
};
