import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [cfb] = args;
  (XLSX.CFB.utils as Record<string, Function>).cfb_gc(cfb);
  return cfb;
};
