import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [fmt, value] = args;
  return XLSX.SSF.format(fmt as string, value as number, {
    dateNF: properties.dateNF as string,
  });
};
