import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options = {
    header: properties.header ?? -1,
    editable: properties.editable ?? false,
    headerRows: properties.headerRows ?? 1,
    skipHidden: properties.skipHidden ?? false,
  };
  return XLSX.utils.sheet_to_dom(worksheet, options);
};
