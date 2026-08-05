import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  return XLSX.utils.sheet_to_row_object_array(worksheet as XLSX.WorkSheet, {
    header: properties.header,
    defval: properties.defval ?? '',
    blankrows: properties.blankrows ?? true,
  });
};
