import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, workbook, sheetOverride] = args;
  const wb = workbook as any;
  const qType = (props.queryType as string) || 'getCellValue';
  const sheetName = (sheetOverride as string) || (props.sheetName as string) || wb?.SheetNames?.[0] || '';
  const ws = wb?.Sheets?.[sheetName];
  if (!ws) return { trigger: { event: 'queryDone', timestamp: Date.now() }, result: null };
  let result: unknown = null;
  switch (qType) {
    case 'getCellValue':
      result = ws[props.cellAddress as string || 'A1']?.v;
      break;
    case 'getColumnValues': {
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const colIdx = 0;
      result = data.map((row: any) => row[colIdx]);
      break;
    }
    case 'findRows': {
      const data = XLSX.utils.sheet_to_json(ws);
      const field = props.filterField as string;
      const val = props.filterValue as string;
      result = data.filter((row: any) => field && row[field] == val);
      break;
    }
    case 'countRows': {
      const data = XLSX.utils.sheet_to_json(ws);
      result = data.length;
      break;
    }
    case 'getSheetNames':
      result = wb?.SheetNames || [];
      break;
  }
  return { trigger: { event: 'queryDone', queryType: qType, timestamp: Date.now() }, result };
};
