import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet, data] = args;
  const options = {
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin ?? -1,
    cellDates: properties.cellDates ?? false,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
  };
  XLSX.utils.sheet_add_aoa(worksheet, data as unknown[][], options);
  return worksheet;
};
