import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, start, count] = args;
  const options = {
    origin: properties.origin ?? -1,
    skip: properties.skip ?? 0,
  };
  XLSX.utils.sheet_insert_rows(worksheet, start as number, count as number, options);
  return worksheet;
};
