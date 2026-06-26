import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, values, addrOverride] = args;
  const ws = worksheet as any;
  const addr = (addrOverride as string) || (props.address as string) || 'A1';
  if (!ws || !values) return { worksheet: ws };

  const range = XLSX.utils.decode_range(addr);
  const data = values as unknown[][];
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const ref = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
      ws[ref] = { t: typeof data[r][c] === 'number' ? 'n' : 's', v: data[r][c] };
    }
  }
  return { worksheet: ws };
};
