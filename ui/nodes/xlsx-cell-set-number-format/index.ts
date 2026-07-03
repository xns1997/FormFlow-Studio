import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args) => {
  const [cell, fmt] = args;
  XLSX.utils.cell_set_number_format(cell as XLSX.CellObject, fmt as string);
  return cell;
};
