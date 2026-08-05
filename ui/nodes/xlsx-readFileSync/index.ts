import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [filename] = args;
  return XLSX.readFileSync(filename as string, {
    type: (properties.type as string) || 'buffer',
    bookType: (properties.bookType as string) || 'xlsx',
  });
};
