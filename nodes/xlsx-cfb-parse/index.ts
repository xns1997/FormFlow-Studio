import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  return (XLSX.CFB as Record<string, Function>).parse(data, {
    type: (properties.type as string) || 'buffer',
  });
};
