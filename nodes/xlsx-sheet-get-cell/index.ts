import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [worksheet, address] = args;
  return XLSX.utils.sheet_get_cell(worksheet, address as string | { r: number; c: number });
};
