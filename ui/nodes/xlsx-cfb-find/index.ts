import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cfb, path] = args;
  return (XLSX.CFB as Record<string, Function>).find(cfb, path as string);
};
