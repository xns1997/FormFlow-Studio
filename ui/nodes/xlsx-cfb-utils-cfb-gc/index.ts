import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cfb] = args;
  (XLSX.CFB.utils as Record<string, Function>).cfb_gc(cfb);
  return cfb;
};
