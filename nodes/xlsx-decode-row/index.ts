import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [label] = args;
  return XLSX.utils.decode_row(label as string);
};
