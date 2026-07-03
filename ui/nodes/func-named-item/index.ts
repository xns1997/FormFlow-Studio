import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

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
