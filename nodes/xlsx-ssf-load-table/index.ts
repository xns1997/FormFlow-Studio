import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [str] = args;
  return (XLSX.SSF as Record<string, Function>).load_table(str as string);
};
