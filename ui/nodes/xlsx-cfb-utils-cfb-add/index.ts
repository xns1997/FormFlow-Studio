import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [cfb, name, content] = args;
  (XLSX.CFB.utils as Record<string, Function>).cfb_add(cfb, name as string, content, properties.opts || {});
  return cfb;
};
