import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options = {
    range: properties.range || undefined,
    raw: properties.raw ?? true,
    header: properties.header ?? -1,
  };
  return XLSX.utils.sheet_to_aoa(worksheet, options);
};
