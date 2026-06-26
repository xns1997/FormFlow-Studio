import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [cell] = args;
  return XLSX.utils.format_cell(cell as XLSX.CellObject, undefined, {
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    cellStyles: properties.cellStyles as boolean ?? false,
  });
};
