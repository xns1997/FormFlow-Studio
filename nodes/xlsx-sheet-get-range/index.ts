import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [worksheet, range] = args;
  return XLSX.utils.sheet_get_range(worksheet, range as string | XLSX.Range);
};
