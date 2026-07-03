import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [bufs] = args;
  return (XLSX.CFB.utils as Record<string, Function>).bconcat(bufs);
};
