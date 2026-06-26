import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, start, count] = args;
  const options = {
    origin: properties.origin ?? -1,
    skip: properties.skip ?? 0,
  };
  XLSX.utils.sheet_insert_rows(worksheet, start as number, count as number, options);
  return worksheet;
};
