import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cell, range, tooltip] = args;
  XLSX.utils.cell_set_internal_link(cell as XLSX.CellObject, range as string, tooltip as string | undefined);
  return cell;
};
