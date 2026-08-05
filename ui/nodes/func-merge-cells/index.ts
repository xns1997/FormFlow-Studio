import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [worksheet, addrOverride, mergeOverride] = args;
  const ws = worksheet as XLSX.WorkSheet;
  const addr = (addrOverride as string) || (props.rangeAddress as string) || 'A1:C1';
  const doMerge = (mergeOverride as boolean) ?? (props.merge as boolean) ?? true;
  if (!ws) return { worksheet: ws };

  if (!ws['!merges']) ws['!merges'] = [];
  if (doMerge) {
    const range = XLSX.utils.decode_range(addr);
    ws['!merges']!.push(range);
  } else {
    const range = XLSX.utils.decode_range(addr);
    ws['!merges'] = ws['!merges']!.filter((m) =>
      !(m.s.r === range.s.r && m.s.c === range.s.c && m.e.r === range.e.r && m.e.c === range.e.c)
    );
  }
  return { worksheet: ws };
};
