import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook, sheet, vis] = args;
  XLSX.utils.book_set_sheet_visibility(
    workbook as XLSX.WorkBook,
    sheet as string | number,
    (vis as number) ?? (Number(properties.vis) || 0),
  );
  return workbook;
};
