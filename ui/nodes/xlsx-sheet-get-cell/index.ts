import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [worksheet, address] = args;
  return XLSX.utils.sheet_get_cell(worksheet, address as string | { r: number; c: number });
};
