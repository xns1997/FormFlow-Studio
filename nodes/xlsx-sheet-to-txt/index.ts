import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return XLSX.utils.sheet_to_txt(worksheet, {
    FS: properties.FS || '\t',
    dateNF: properties.dateNF || 'yyyy-mm-dd',
  });
};
