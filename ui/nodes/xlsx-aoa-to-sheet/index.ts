import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  const options = {
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin || 'A1',
    cellDates: properties.cellDates ?? false,
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    sheetStubs: properties.sheetStubs ?? false,
  };
  return XLSX.utils.aoa_to_sheet(data as unknown[][], options);
};
