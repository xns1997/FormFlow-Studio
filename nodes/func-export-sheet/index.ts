import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, fmtOverride] = args;
  const ws = worksheet as any;
  const format = (fmtOverride as string) || (props.format as string) || 'csv';
  if (!ws) return { text: '' };

  switch (format) {
    case 'csv':
      return { text: XLSX.utils.sheet_to_csv(ws, { FS: (props.delimiter as string) || ',' }) };
    case 'json':
      return { text: JSON.stringify(XLSX.utils.sheet_to_json(ws), null, 2) };
    case 'html':
      return { text: XLSX.utils.sheet_to_html(ws) };
    case 'txt':
      return { text: XLSX.utils.sheet_to_txt(ws) };
    default:
      return { text: XLSX.utils.sheet_to_csv(ws) };
  }
};
