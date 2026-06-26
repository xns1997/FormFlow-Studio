import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, workbook] = args;
  const wb = workbook as any;
  const sheetName = (props.sheetName as string) || wb?.SheetNames?.[0] || '';
  const ws = wb?.Sheets?.[sheetName];
  if (!ws) return { trigger: { event: 'sortDone', timestamp: Date.now() }, result: [] };
  const data = XLSX.utils.sheet_to_json(ws);
  const field = props.sortField as string;
  const asc = (props.ascending as boolean) !== false;
  data.sort((a: any, b: any) => {
    const av = a[field] ?? '';
    const bv = b[field] ?? '';
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return asc ? cmp : -cmp;
  });
  return { trigger: { event: 'sortDone', timestamp: Date.now() }, result: data };
};
