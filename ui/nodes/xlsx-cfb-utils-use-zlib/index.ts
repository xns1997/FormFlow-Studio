import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [zlib] = args;
  (XLSX.CFB.utils as Record<string, Function>).use_zlib(zlib);
};
