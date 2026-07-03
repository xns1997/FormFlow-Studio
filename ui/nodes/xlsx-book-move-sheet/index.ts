import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [workbook, names] = args;
  XLSX.utils.book_move_sheet(workbook as XLSX.WorkBook, names as string[]);
  return workbook;
};
