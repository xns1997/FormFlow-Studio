import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options: XLSX.Sheet2JSONOpts = {
    header: properties.header?.length ? properties.header : undefined,
    range: properties.range || undefined,
    skipHidden: properties.skipHidden ?? false,
    raw: properties.raw ?? true,
    defval: properties.defval ?? '',
    blankrows: properties.blankrows ?? true,
    sheetRows: properties.sheetRows || 0,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    headerRow: properties.headerRow ?? -1,
  };
  return XLSX.utils.sheet_to_json(worksheet, options);
};
