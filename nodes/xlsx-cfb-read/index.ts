import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  return XLSX.CFB.read(data as ArrayBuffer | string, {
    type: (properties.type as string) || 'buffer',
    password: (properties.password as string) || undefined,
  });
};
