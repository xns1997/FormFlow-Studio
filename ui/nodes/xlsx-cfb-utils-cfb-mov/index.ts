import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cfb, oldName, newName] = args;
  (XLSX.CFB.utils as Record<string, Function>).cfb_mov(cfb, oldName as string, newName as string);
  return cfb;
};
