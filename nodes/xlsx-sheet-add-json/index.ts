import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, data] = args;
  const options = {
    header: properties.header?.length ? properties.header : undefined,
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin ?? -1,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    cellDates: properties.cellDates ?? false,
  };
  XLSX.utils.sheet_add_json(worksheet, data as object[], options);
  return worksheet;
};
