import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [filename] = args;
  return XLSX.readFile(filename as string, {
    type: (properties.type as 'buffer' | 'array' | 'binary' | 'string' | 'base64') || 'buffer',
    bookType: (properties.bookType as string) || 'xlsx',
    cellFormula: properties.cellFormula as boolean ?? true,
    cellDates: properties.cellDates as boolean ?? false,
    sheetRows: (properties.sheetRows as number) || 0,
    raw: properties.raw as boolean ?? false,
  });
};
