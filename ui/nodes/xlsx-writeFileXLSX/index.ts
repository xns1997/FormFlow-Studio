import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [workbook, filename] = args;
  XLSX.writeFileXLSX(workbook as XLSX.WorkBook, filename as string, {
    type: (properties.type as 'array' | 'buffer' | 'binary' | 'base64') || 'array',
    compression: properties.compression as boolean ?? false,
  });
};
