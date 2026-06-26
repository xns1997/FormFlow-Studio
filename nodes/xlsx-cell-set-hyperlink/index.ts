import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cell, target, tooltip] = args;
  XLSX.utils.cell_set_hyperlink(cell as XLSX.CellObject, target as string, tooltip as string | undefined);
  return cell;
};
