import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook, filename] = args;
  const options = {
    bookType: properties.bookType || 'xlsx',
    type: properties.type || 'array',
    compression: properties.compression ?? false,
  };
  XLSX.writeFile(workbook, filename as string, options);
};
