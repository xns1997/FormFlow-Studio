import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return (XLSX.stream as Record<string, Function>).to_json(worksheet, {
    header: properties.header,
    raw: properties.raw ?? true,
    defval: properties.defval ?? '',
    blankrows: properties.blankrows ?? true,
  });
};
