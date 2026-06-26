import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [blob, offset] = args;
  return (XLSX.CFB.utils as Record<string, Function>).prep_blob(blob, offset ?? 0);
};
