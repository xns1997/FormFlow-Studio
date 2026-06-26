import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [col] = args;
  return XLSX.utils.encode_col(col as number);
};
