import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [worksheet] = args;
  const options: XLSX.Sheet2HTMLOpts = {
    header: properties.header ?? -1,
    id: properties.id || '',
    editable: properties.editable ?? false,
    headerRows: properties.headerRows ?? 1,
    footerRows: properties.footerRows ?? 0,
    skipHidden: properties.skipHidden ?? false,
    bodyOnly: properties.body ?? false,
  };
  return XLSX.utils.sheet_to_html(worksheet, options);
};
