import { request, requestRaw } from '../io/api';
import type { FilterRule, SortRule } from '../../../../shared/formflow-core/previewFilter';

export type PreviewRow = Record<string, unknown> & { __rowKey: string; __rowIndex: number; __isNew?: boolean };
export type PreviewQuery = {
  page: number;
  pageSize: number;
  search: string;
  keySearch: string;
  sortModel: SortRule[];
  filterModel: Record<string, FilterRule>;
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

export type DataTransactionTarget = {
  tableId: string;
  sheetName: string;
  keyField: string;
  baseVersion?: string;
  mutations: Array<{ mode: 'insert' | 'update' | 'upsert' | 'delete'; keyValue: unknown; row?: Record<string, unknown> }>;
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

/**
 * 解析剪贴板文本为二维表格。
 * 优先按 Tab 分隔（TSV），否则按带引号转义的 CSV 解析。
 */
export function parseClipboardTable(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.trim() === '') return [];
  if (normalized.includes('\t')) {
    const lines = normalized.split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.map((line) => line.split('\t'));
  }
  if (!normalized.includes(',')) {
    const lines = normalized.split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.map((line) => [line]);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.length > 1 || field !== '') rows.push(row);
  return rows;
}

/**
 * 按目标列类型归一化粘贴/批量填写的值：
 * 数字转 number、布尔按常见写法转 boolean，其余保留文本（去除首尾空白）。
 */
export function normalizeCellForType(value: string, dataType: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return value;
  if (dataType === 'number') {
    const number = Number(trimmed);
    return Number.isNaN(number) ? value : number;
  }
  if (dataType === 'boolean') {
    if (['true', 'TRUE', '1'].includes(trimmed)) return true;
    if (['false', 'FALSE', '0'].includes(trimmed)) return false;
    return value;
  }
  if (dataType === 'date' && !Number.isNaN(Date.parse(trimmed))) return trimmed;
  return trimmed;
}

export type CellUndoChange = { rowKey: string; field: string; oldValue: unknown; newValue: unknown };

/**
 * 一次可撤销的编辑记录。`committed` 表示该修改已经保存到服务端，
 * 撤销时需要反向提交 batch；否则只需回滚本地 pending 状态。
 */
export type UndoEntry = {
  changes: CellUndoChange[];
  addedRows: PreviewRow[];
  deletedRows: PreviewRow[];
  rowOrderBefore?: string[];
  rowOrderAfter?: string[];
  committed: boolean;
};

export function emptyUndoEntry(): UndoEntry {
  return { changes: [], addedRows: [], deletedRows: [], committed: false };
}

/** 生成撤销的逆操作（撤销/重做共用）。 */
export function invertUndoEntry(entry: UndoEntry): UndoEntry {
  return {
    changes: entry.changes.map((change) => ({
      rowKey: change.rowKey,
      field: change.field,
      oldValue: change.newValue,
      newValue: change.oldValue,
    })),
    addedRows: entry.deletedRows,
    deletedRows: entry.addedRows,
    rowOrderBefore: entry.rowOrderAfter,
    rowOrderAfter: entry.rowOrderBefore,
    committed: entry.committed,
  };
}

/** 与服务端一致的稳定行键：`key:<编码后的主键值>`；无有效主键时返回 null。 */
export function buildRowKeyForSnapshot(row: Record<string, unknown>, keyFields: string[]): string | null {
  if (!keyFields.length) return null;
  const parts = keyFields.map((field) => encodeURIComponent(row[field] == null ? '' : String(row[field])));
  if (parts.some((part) => part === '')) return null;
  return `key:${parts.join('|')}`;
}

export type UndoBatchPayload = {
  adds: Record<string, unknown>[];
  updates: Array<{ rowKey: string; changes: Record<string, unknown> }>;
  deletes: string[];
  unresolved: string[];
};

/** 把已提交修改的撤销转成服务端 batch 载荷；无法映射稳定行键的项进入 unresolved。 */
export function undoEntryToBatchPayload(entry: UndoEntry, keyFields: string[]): UndoBatchPayload {
  const byRow = new Map<string, Record<string, unknown>>();
  for (const change of entry.changes) {
    const current = byRow.get(change.rowKey) || {};
    current[change.field] = change.oldValue;
    byRow.set(change.rowKey, current);
  }
  const updates = [...byRow.entries()].map(([rowKey, changes]) => ({ rowKey, changes }));
  const deletes: string[] = [];
  const unresolved: string[] = [];
  for (const added of entry.addedRows) {
    const key = buildRowKeyForSnapshot(added, keyFields);
    if (key) deletes.push(key);
    else unresolved.push('新增行（缺少有效主键）');
  }
  const adds = entry.deletedRows.map((row) => {
    const { __rowKey: _rowKey, __rowIndex: _rowIndex, __isNew: _isNew, ...clean } = row;
    return clean;
  });
  return { adds, updates, deletes, unresolved };
}

export const dataPreviewApi = {
  page: (input: { projectId: string; tableId: string; sheetName: string } & PreviewQuery) =>
    request('/data/paginated', { method: 'POST', body: JSON.stringify(input) }) as Promise<PreviewPageResult>,
  batch: (input: PreviewBatch) =>
    request('/data/batch', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ total: number; dataVersion: string }>,
  transaction: (input: { projectId: string; targets: DataTransactionTarget[] }) =>
    request('/data/transaction', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ committed: boolean; applied: number; targets?: Array<{ tableId: string; sheetName: string; dataVersion: string }> }>,
  exportQuery: async (input: Record<string, unknown>, fileName: string) => {
    const response = await requestRaw('/data/export-query', { method: 'POST', body: JSON.stringify({ ...input, fileName, format: 'xlsx' }) });
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
