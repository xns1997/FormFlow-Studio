import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  const options = {
    type: properties.type || 'array',
    cellFormula: properties.cellFormula ?? true,
    cellHTML: properties.cellHTML ?? true,
    cellDates: properties.cellDates ?? false,
    sheetRows: properties.sheetRows || 0,
    bookSheets: properties.bookSheets ?? false,
    bookType: properties.bookType,
    raw: properties.raw ?? false,
    dense: properties.dense ?? false,
  };
  return XLSX.read(data, options);
};
