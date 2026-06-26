import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, srcOverride, tgtOverride] = args;
  const ws = worksheet as any;
  const src = (srcOverride as string) || (props.sourceRange as string) || 'A1:C5';
  const tgt = (tgtOverride as string) || (props.targetCell as string) || 'E1';
  if (!ws) return { worksheet: ws };

  const srcRange = XLSX.utils.decode_range(src);
  const tgtCell = XLSX.utils.decode_cell(tgt);

  for (let r = srcRange.s.r; r <= srcRange.e.r; r++) {
    for (let c = srcRange.s.c; c <= srcRange.e.c; c++) {
      const srcRef = XLSX.utils.encode_cell({ r, c });
      const tgtRef = XLSX.utils.encode_cell({
        r: tgtCell.r + (r - srcRange.s.r),
        c: tgtCell.c + (c - srcRange.s.c),
      });
      if (ws[srcRef]) {
        ws[tgtRef] = JSON.parse(JSON.stringify(ws[srcRef]));
      }
    }
  }
  return { worksheet: ws };
};
