import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options: XLSX.Sheet2CSVOpts = {
    FS: properties.FS || ',',
    RS: properties.RS || '\n',
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    skipHidden: properties.skipHidden ?? false,
    blankrows: properties.blankrows ?? true,
    header: properties.header ?? -1,
  };
  return XLSX.utils.sheet_to_csv(worksheet, options);
};
