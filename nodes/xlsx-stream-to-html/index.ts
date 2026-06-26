import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return (XLSX.stream as Record<string, Function>).to_html(worksheet, {
    header: properties.header ?? -1,
    footer: properties.footer ?? -1,
  });
};
