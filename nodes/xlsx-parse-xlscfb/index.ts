import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [cfb] = args;
  return (XLSX as Record<string, Function>).parse_xlscfb(cfb, properties.opts || {});
};
