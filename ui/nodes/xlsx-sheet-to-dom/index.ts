import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options = {
    header: properties.header ?? -1,
    editable: properties.editable ?? false,
    headerRows: properties.headerRows ?? 1,
    skipHidden: properties.skipHidden ?? false,
  };
  return XLSX.utils.sheet_to_dom(worksheet, options);
};
