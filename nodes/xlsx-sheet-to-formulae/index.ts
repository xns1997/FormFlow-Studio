import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options = {
    dataEditable: properties.dataEditable ?? false,
    formulae: properties.formulae ?? false,
    range: properties.range || undefined,
    skipHidden: properties.skipHidden ?? false,
  };
  return XLSX.utils.sheet_to_formulae(worksheet, options);
};
