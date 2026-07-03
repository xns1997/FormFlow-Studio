import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [fmt] = args;
  return (XLSX.SSF as Record<string, Function>).is_date(fmt as string);
};
