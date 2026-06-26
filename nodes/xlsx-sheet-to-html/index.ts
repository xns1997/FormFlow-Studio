import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options: XLSX.Sheet2HTMLOpts = {
    header: properties.header ?? -1,
    id: properties.id || '',
    editable: properties.editable ?? false,
    headerRows: properties.headerRows ?? 1,
    footerRows: properties.footerRows ?? 0,
    skipHidden: properties.skipHidden ?? false,
    bodyOnly: properties.body ?? false,
  };
  return XLSX.utils.sheet_to_html(worksheet, options);
};
