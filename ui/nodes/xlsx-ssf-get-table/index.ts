import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = () => {
  return (XLSX.SSF as Record<string, Function>).get_table();
};
