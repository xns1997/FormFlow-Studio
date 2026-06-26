import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cell] = args;
  return XLSX.utils.encode_cell(cell as { r: number; c: number });
};
