import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, table] = args;
  const options = {
    origin: properties.origin ?? -1,
    skipHeader: properties.skipHeader ?? false,
    cellDates: properties.cellDates ?? false,
  };
  XLSX.utils.sheet_add_dom(worksheet, table as HTMLTableElement, options);
  return worksheet;
};
