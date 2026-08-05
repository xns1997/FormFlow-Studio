import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  const options = {
    type: properties.type || 'array',
    cellFormula: properties.cellFormula ?? true,
    cellHTML: properties.cellHTML ?? true,
    cellDates: properties.cellDates ?? false,
    sheetRows: properties.sheetRows || 0,
    bookSheets: properties.bookSheets ?? false,
    bookType: properties.bookType,
    raw: properties.raw ?? false,
    dense: properties.dense ?? false,
  };
  return XLSX.read(data, options);
};
