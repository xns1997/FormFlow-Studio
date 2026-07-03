import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [row] = args;
  return XLSX.utils.encode_row(row as number);
};
