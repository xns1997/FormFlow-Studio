import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [cfb] = args;
  return XLSX.CFB.write(cfb as object, {
    type: (properties.type as string) || 'buffer',
  });
};
