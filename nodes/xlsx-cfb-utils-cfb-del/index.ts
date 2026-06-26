import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cfb, name] = args;
  (XLSX.CFB.utils as Record<string, Function>).cfb_del(cfb, name as string);
  return cfb;
};
