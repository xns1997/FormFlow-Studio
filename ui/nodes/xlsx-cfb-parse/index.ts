import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  return (XLSX.CFB as Record<string, Function>).parse(data, {
    type: (properties.type as string) || 'buffer',
  });
};
