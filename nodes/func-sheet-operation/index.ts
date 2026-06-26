import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [workbook, opOverride, nameOverride, newNameOverride] = args;
  const wb = workbook as any;
  const op = (opOverride as string) || (props.operation as string) || 'create';
  const sheetName = (nameOverride as string) || (props.sheetName as string) || 'Sheet2';
  const newName = (newNameOverride as string) || (props.newName as string) || '';
  if (!wb) return { workbook: wb, sheetNames: [] };

  switch (op) {
    case 'create': {
      const ws = XLSX.utils.aoa_to_sheet([[]]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      break;
    }
    case 'rename': {
      const idx = wb.SheetNames.indexOf(sheetName);
      if (idx >= 0 && newName) wb.SheetNames[idx] = newName;
      break;
    }
    case 'delete': {
      const idx = wb.SheetNames.indexOf(sheetName);
      if (idx >= 0) {
        wb.SheetNames.splice(idx, 1);
        delete wb.Sheets[sheetName];
      }
      break;
    }
    case 'copy': {
      const srcIdx = wb.SheetNames.indexOf(sheetName);
      if (srcIdx >= 0) {
        const copyName = newName || `${sheetName}_Copy`;
        const copy = JSON.parse(JSON.stringify(wb.Sheets[sheetName]));
        XLSX.utils.book_append_sheet(wb, copy, copyName);
      }
      break;
    }
    case 'move': {
      const idx = wb.SheetNames.indexOf(sheetName);
      if (idx >= 0) {
        const [moved] = wb.SheetNames.splice(idx, 1);
        const pos = (props.position as number) ?? -1;
        if (pos < 0) wb.SheetNames.push(moved);
        else wb.SheetNames.splice(pos, 0, moved);
      }
      break;
    }
  }
  return { workbook: wb, sheetNames: [...wb.SheetNames] };
};
