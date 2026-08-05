import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [data] = args;
  const options = {
    header: properties.header?.length ? properties.header : undefined,
    skipHeader: properties.skipHeader ?? false,
    origin: properties.origin || 'A1',
    dateNF: properties.dateNF || 'yyyy-mm-dd',
    cellDates: properties.cellDates ?? false,
    fieldDates: properties.fieldDates ?? false,
  };
  return XLSX.utils.json_to_sheet(data as object[], options);
};
