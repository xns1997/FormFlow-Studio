import { API_BASE, request } from '../io/api';

export type PreviewRow = Record<string, unknown> & { __rowKey: string; __rowIndex: number; __isNew?: boolean };
export type PreviewQuery = {
  page: number;
  pageSize: number;
  search: string;
  keySearch: string;
  sortModel: Array<{ colId?: string; sort?: 'asc' | 'desc' }>;
  filterModel: Record<string, unknown>;
};
export type CellChange = { oldValue: unknown; newValue: unknown };
export type RowChanges = Record<string, CellChange>;

export type PreviewPageResult = {
  headers: string[];
  rows: PreviewRow[];
  total: number;
  queryTotal: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dataVersion: string;
};

export type PreviewBatch = {
  projectId: string;
  tableId: string;
  sheetName: string;
  baseVersion: string;
  adds: Record<string, unknown>[];
  updates: Array<{ rowKey: string; changes: Record<string, unknown> }>;
  deletes: string[];
};

export const defaultPreviewQuery = (): PreviewQuery => ({
  page: 1,
  pageSize: 100,
  search: '',
  keySearch: '',
  sortModel: [],
  filterModel: {},
});

export function countCellChanges(changes: Map<string, RowChanges>) {
  return [...changes.values()].reduce((total, row) => total + Object.keys(row).length, 0);
}

export function serializeUpdates(changes: Map<string, RowChanges>) {
  return [...changes.entries()].map(([rowKey, fields]) => ({
    rowKey,
    changes: Object.fromEntries(Object.entries(fields).map(([field, change]) => [field, change.newValue])),
  }));
}

export function validateCellValue(value: unknown, dataType: string): string | null {
  if (value == null || value === '') return null;
  if (dataType === 'number' && (typeof value === 'boolean' || Number.isNaN(Number(value)))) return '请输入有效数字';
  if (dataType === 'boolean' && ![true, false, 'true', 'false', 1, 0, '1', '0'].includes(value as never)) return '请输入布尔值';
  if (dataType === 'date' && Number.isNaN(Date.parse(String(value)))) return '请输入有效日期';
  return null;
}

export function validateChanges(
  changes: Map<string, RowChanges>,
  additions: PreviewRow[],
  columns: Array<{ name: string; dataType: string }>,
) {
  const errors = new Map<string, string>();
  const typeByField = new Map(columns.map((column) => [column.name, column.dataType]));
  for (const [rowKey, fields] of changes) {
    for (const [field, change] of Object.entries(fields)) {
      const error = validateCellValue(change.newValue, typeByField.get(field) || 'string');
      if (error) errors.set(`${rowKey}:${field}`, error);
    }
  }
  for (const row of additions) {
    for (const column of columns) {
      const error = validateCellValue(row[column.name], column.dataType);
      if (error) errors.set(`${row.__rowKey}:${column.name}`, error);
    }
  }
  return errors;
}

export const dataPreviewApi = {
  page: (input: { projectId: string; tableId: string; sheetName: string } & PreviewQuery) =>
    request('/data/paginated', { method: 'POST', body: JSON.stringify(input) }) as Promise<PreviewPageResult>,
  batch: (input: PreviewBatch) =>
    request('/data/batch', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ total: number; dataVersion: string }>,
  exportQuery: async (input: Record<string, unknown>, fileName: string) => {
    const response = await fetch(`${API_BASE}/data/export-query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, fileName, format: 'xlsx' }) });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || '导出失败');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
