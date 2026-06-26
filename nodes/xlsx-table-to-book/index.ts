import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [table] = args;
  const options = {
    skipHeader: properties.skipHeader ?? false,
    sheet: properties.sheet || 'Sheet1',
    cellDates: properties.cellDates ?? false,
  };
  return XLSX.utils.table_to_book(table as HTMLTableElement, options);
};
