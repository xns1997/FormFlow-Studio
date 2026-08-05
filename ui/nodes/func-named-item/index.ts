import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [workbook, nameOverride, formulaOverride] = args;
  const wb = workbook as any;
  const name = (nameOverride as string) || (props.name as string) || 'MyRange';
  const formula = (formulaOverride as string) || (props.formula as string) || '';
  if (!wb) return { workbook: wb, name };

  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Names) wb.Workbook.Names = [];
  wb.Workbook.Names.push({ Name: name, Ref: formula });
  return { workbook: wb, name };
};
