import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [workbook, filename] = args;
  const options = {
    bookType: properties.bookType || 'xlsx',
    type: properties.type || 'array',
    compression: properties.compression ?? false,
  };
  XLSX.writeFile(workbook, filename as string, options);
};
