import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [workbook, worksheet, name] = args;
  XLSX.utils.book_append_sheet(workbook as XLSX.WorkBook, worksheet as XLSX.WorkSheet, name as string | undefined);
  return workbook;
};
