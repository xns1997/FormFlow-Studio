import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [worksheet, range, formula] = args;
  XLSX.utils.sheet_set_array_formula(
    worksheet as XLSX.WorkSheet,
    range as string,
    formula as string,
  );
  return worksheet;
};
