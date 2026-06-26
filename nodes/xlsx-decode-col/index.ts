import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [letter] = args;
  return XLSX.utils.decode_col(letter as string);
};
