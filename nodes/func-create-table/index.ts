import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, nameOverride, rangeOverride] = args;
  const ws = worksheet as any;
  const name = (nameOverride as string) || (props.tableName as string) || 'Table1';
  const range = (rangeOverride as string) || (props.rangeAddress as string) || 'A1';
  if (!ws) return { worksheet: ws, tableName: name };

  const ref = range.includes(':') ? range : `${range}:${XLSX.utils.encode_cell({ r: 0, c: 5 })}`;
  if (!ws['!ref']) ws['!ref'] = ref;

  if (!ws['!tables']) ws['!tables'] = {};
  ws['!tables'][name] = {
    name,
    ref,
    headerRow: (props.hasHeader as boolean) !== false,
  };

  return { worksheet: ws, tableName: name };
};
