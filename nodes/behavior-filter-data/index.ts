import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, workbook] = args;
  const wb = workbook as any;
  const sheetName = (props.sheetName as string) || wb?.SheetNames?.[0] || '';
  const ws = wb?.Sheets?.[sheetName];
  if (!ws) return { trigger: { event: 'filterDone', timestamp: Date.now() }, result: [] };
  const data = XLSX.utils.sheet_to_json(ws);
  const field = props.filterField as string;
  const op = (props.filterOperator as string) || '==';
  const val = props.filterValue as string;
  const filtered = data.filter((row: any) => {
    const v = row[field];
    switch (op) {
      case '==': return v == val;
      case '!=': return v != val;
      case 'contains': return String(v).includes(val);
      case '>': return Number(v) > Number(val);
      case '<': return Number(v) < Number(val);
      default: return true;
    }
  });
  return { trigger: { event: 'filterDone', count: filtered.length, timestamp: Date.now() }, result: filtered };
};
