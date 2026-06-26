import * as XLSX from 'xlsx';
import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook, filename] = args;
  return new Promise((resolve, reject) => {
    XLSX.writeFileAsync(
      workbook as XLSX.WorkBook,
      filename as string,
      {
        bookType: (properties.bookType as string) || 'xlsx',
        type: (properties.type as string) || 'array',
        ...((properties.opts as object) || {}),
      },
      (err: Error | null) => {
        if (err) reject(err);
        else resolve(undefined);
      },
    );
  });
};
