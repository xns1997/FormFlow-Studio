import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [Readable] = args;
  (XLSX.stream as Record<string, Function>).set_readable(Readable as Function);
};
