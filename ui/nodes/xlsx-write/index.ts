import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook] = args;
  const options = {
    bookType: properties.bookType || 'xlsx',
    type: properties.type || 'array',
    sheet: properties.sheet || undefined,
    compression: properties.compression ?? false,
    ignoreEC: properties.ignoreEC ?? true,
    bookSheets: properties.bookSheets ?? false,
    cellDates: properties.cellDates ?? false,
  };
  return XLSX.write(workbook, options);
};
