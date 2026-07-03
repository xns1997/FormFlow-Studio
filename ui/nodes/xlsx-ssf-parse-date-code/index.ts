import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [num] = args;
  return (XLSX.SSF as Record<string, Function>).parse_date_code(num as number, {
    dateNF: properties.dateNF as string,
  });
};
