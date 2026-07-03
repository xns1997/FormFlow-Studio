import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  const options = {
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin || 'A1',
    cellDates: properties.cellDates ?? false,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    sheetStubs: properties.sheetStubs ?? false,
  };
  return XLSX.utils.aoa_to_sheet(data as unknown[][], options);
};
