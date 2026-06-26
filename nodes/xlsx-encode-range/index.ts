import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [range] = args;
  return XLSX.utils.encode_range(range as XLSX.Range);
};
