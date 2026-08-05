import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return (XLSX.stream as Record<string, Function>).to_csv(worksheet, {
    FS: properties.FS || ',',
    RS: properties.RS || '\n',
    dateNF: properties.dateNF || 'yyyy-mm-dd',
  });
};
