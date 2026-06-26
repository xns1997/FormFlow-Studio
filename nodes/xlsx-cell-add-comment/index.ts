import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cell, comment] = args;
  XLSX.utils.cell_add_comment(cell as XLSX.CellObject, comment as string);
  return cell;
};
