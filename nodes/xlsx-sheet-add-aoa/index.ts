import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, data] = args;
  const options = {
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin ?? -1,
    cellDates: properties.cellDates ?? false,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
  };
  XLSX.utils.sheet_add_aoa(worksheet, data as unknown[][], options);
  return worksheet;
};
