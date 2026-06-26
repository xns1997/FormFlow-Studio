import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  return (XLSX.CFB.utils as Record<string, Function>).cfb_new(properties.opts || {});
};
