import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [workbook, name] = args;
  XLSX.utils.book_remove_sheet(workbook as XLSX.WorkBook, name as string);
  return workbook;
};
