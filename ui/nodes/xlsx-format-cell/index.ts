import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [cell] = args;
  return XLSX.utils.format_cell(cell as XLSX.CellObject, undefined, {
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    cellStyles: properties.cellStyles as boolean ?? false,
  });
};
