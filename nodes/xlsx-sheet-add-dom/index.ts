import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, table] = args;
  const options = {
    origin: properties.origin ?? -1,
    skipHeader: properties.skipHeader ?? false,
    cellDates: properties.cellDates ?? false,
  };
  XLSX.utils.sheet_add_dom(worksheet, table as HTMLTableElement, options);
  return worksheet;
};
