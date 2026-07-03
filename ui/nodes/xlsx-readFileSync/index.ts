import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [filename] = args;
  return XLSX.readFileSync(filename as string, {
    type: (properties.type as string) || 'buffer',
    bookType: (properties.bookType as string) || 'xlsx',
  });
};
