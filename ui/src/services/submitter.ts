import * as XLSX from 'xlsx';
import type { RuntimeState, SubmitResult, ChangeLogEntry } from '../models';
import { getChanges, submitForm } from './runtime';

export function generateChangeLog(state: RuntimeState): ChangeLogEntry[] {
  const changes = getChanges(state);
  return Object.entries(changes).map(([field, change]) => ({
    sheet: state.currentSheet,
    rowIndex: state.currentRow,
    field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    timestamp: Date.now(),
  }));
}

export function generateChangeLogJson(state: RuntimeState): object {
  return {
    exportedAt: new Date().toISOString(),
    sheet: state.currentSheet,
    rowIndex: state.currentRow,
    changes: getChanges(state),
  };
}

export function generateNewExcel(
  originalData: Record<string, unknown>[],
  changes: Record<string, unknown>,
  rowIndex: number,
  sheetName: string = 'Sheet1',
): ArrayBuffer {
  const data = originalData.map((row, i) => {
    if (i === rowIndex) return { ...row, ...changes };
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

export function generateChangeLogCsv(state: RuntimeState): string {
  const changes = getChanges(state);
  const rows = Object.entries(changes).map(([field, change]) => ({
    字段: field,
    原始值: String(change.oldValue),
    新值: String(change.newValue),
    Sheet: state.currentSheet,
    行号: state.currentRow + 1,
    时间: new Date().toISOString(),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(ws);
}

export function downloadExcel(data: ArrayBuffer, filename: string): void {
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
