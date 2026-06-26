import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return (XLSX.stream as Record<string, Function>).to_csv(worksheet, {
    FS: properties.FS || ',',
    RS: properties.RS || '\n',
    dateNF: properties.dateNF || 'yyyy-mm-dd',
  });
};
