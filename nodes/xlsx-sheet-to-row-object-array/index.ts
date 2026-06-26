import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return XLSX.utils.sheet_to_row_object_array(worksheet as XLSX.WorkSheet, {
    header: properties.header,
    defval: properties.defval ?? '',
    blankrows: properties.blankrows ?? true,
  });
};
