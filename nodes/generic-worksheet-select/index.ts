import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [workbook, selectMode, sheetName, sheetIndex] = args;
  const wb = workbook as { SheetNames: string[]; Sheets: Record<string, unknown> };
  if (!wb?.SheetNames) return { worksheet: null, sheetNames: [], selectedIndex: -1 };

  const mode = (selectMode as string) || (properties.selectMode as string) || 'active';
  const nameArg = (sheetName as string) || (properties.sheetName as string) || '';
  const indexArg = (sheetIndex as number) ?? (properties.sheetIndex as number) ?? 0;

  let selectedIndex = 0;
  if (mode === 'byName' && nameArg) {
    selectedIndex = wb.SheetNames.indexOf(nameArg);
    if (selectedIndex === -1) selectedIndex = 0;
  } else if (mode === 'byIndex') {
    selectedIndex = Math.min(indexArg, wb.SheetNames.length - 1);
  } else if (mode === 'first') {
    selectedIndex = 0;
  } else if (mode === 'all') {
    return { worksheet: wb.Sheets, sheetNames: wb.SheetNames, selectedIndex: -1 };
  }

  const worksheet = wb.Sheets[wb.SheetNames[selectedIndex]];
  return { worksheet, sheetNames: wb.SheetNames, selectedIndex };
};
