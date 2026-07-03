import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = () => {
  return XLSX.utils.book_new();
};
