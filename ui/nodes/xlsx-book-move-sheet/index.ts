import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args) => {
  const [workbook, names] = args;
  XLSX.utils.book_move_sheet(workbook as XLSX.WorkBook, names as string[]);
  return workbook;
};
