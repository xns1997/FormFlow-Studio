import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [table] = args;
  const options = {
    skipHeader: properties.skipHeader ?? false,
    cellDates: properties.cellDates ?? false,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
  };
  return XLSX.utils.table_to_sheet(table as HTMLTableElement, options);
};
