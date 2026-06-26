import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cfb, filename] = args;
  (XLSX.CFB as Record<string, Function>).writeFile(cfb, filename as string);
};
