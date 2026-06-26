import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook] = args;
  return XLSX.writeXLSX(workbook as XLSX.WorkBook, {
    type: (properties.type as string) || 'array',
    compression: properties.compression as boolean ?? false,
  });
};
