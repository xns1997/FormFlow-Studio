import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook, worksheet, name] = args;
  XLSX.utils.book_append_sheet(workbook as XLSX.WorkBook, worksheet as XLSX.WorkSheet, name as string | undefined);
  return workbook;
};
