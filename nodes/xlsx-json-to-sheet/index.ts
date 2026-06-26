import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  const options = {
    header: properties.header?.length ? properties.header : undefined,
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin || 'A1',
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    cellDates: properties.cellDates ?? false,
    fieldDates: properties.fieldDates ?? false,
  };
  return XLSX.utils.json_to_sheet(data as object[], options);
};
