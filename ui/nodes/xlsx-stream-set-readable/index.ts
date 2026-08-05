import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [Readable] = args;
  (XLSX.stream as Record<string, Function>).set_readable(Readable as Function);
};
