import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [address] = args;
  return XLSX.utils.decode_cell(address as string);
};
