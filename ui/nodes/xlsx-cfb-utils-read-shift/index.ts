import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [sz, type] = args;
  return (XLSX.CFB.utils as Record<string, Function>).ReadShift(sz as number, type as string | undefined);
};
