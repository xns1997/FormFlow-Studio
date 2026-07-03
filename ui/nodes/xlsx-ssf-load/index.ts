import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [table] = args;
  XLSX.SSF.load(table as string);
};
