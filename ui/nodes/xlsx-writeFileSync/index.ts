import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook, filename] = args;
  XLSX.writeFileSync(workbook as XLSX.WorkBook, filename as string, {
    bookType: (properties.bookType as string) || 'xlsx',
    type: (properties.type as string) || 'array',
  });
};
