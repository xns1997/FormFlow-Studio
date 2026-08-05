import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [worksheet, range, formula] = args;
  XLSX.utils.sheet_set_array_formula(
    worksheet as XLSX.WorkSheet,
    range as string,
    formula as string,
  );
  return worksheet;
};
