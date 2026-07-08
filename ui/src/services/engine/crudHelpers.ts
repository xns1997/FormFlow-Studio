import type { SrcTableEntry, SrcSheetInfo } from '../../project/types';

export interface FindRowsOptions {
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  pickFields?: string[];
}

export interface FindRowOptions extends FindRowsOptions {
  strictUnique?: boolean;
}

export interface NextSequenceOptions {
  start?: number;
  step?: number;
}

export interface FillFormOptions {
  originalFieldMap?: Record<string, string>;
  enableComponentIds?: string[];
  skipUndefined?: boolean;
}

export interface FillFormResult {
  patch: Record<string, unknown>;
  originalPatch: Record<string, unknown>;
  appliedFields: string[];
  enableComponentIds: string[];
}

export interface RequireFieldsOptions {
  focus?: boolean;
  level?: 'info' | 'success' | 'warning' | 'error';
  messageTemplate?: string;
}

export interface RequireFieldsResult {
  valid: boolean;
  firstMissingField?: string;
  missingFields: string[];
  message: string;
}

export interface ResetFormOptions {
  clearFields?: string[];
  defaults?: Record<string, unknown>;
  preserveFields?: string[];
  message?: string;
  focusField?: string;
}

export interface ResetFormResult {
  patch: Record<string, unknown>;
  clearedFields: string[];
  preservedFields: string[];
  focusedField?: string;
  message?: string;
}

function resolveSheet(
  tables: SrcTableEntry[],
  sheetId: string,
  preferred?: { tableId?: string; sheetName?: string },
): SrcSheetInfo | undefined {
  if (preferred?.tableId) {
    const table = tables.find((item) => item.id === preferred.tableId);
    if (!table) return undefined;
    if (preferred.sheetName) return table.sheets.find((item) => item.name === preferred.sheetName);
    return table.sheets[0];
  }
  for (const table of tables) {
    for (const sheet of table.sheets) {
      const fullId = `${table.id}:${sheet.name}`;
      if (fullId === sheetId || sheet.name === sheetId || table.id === sheetId) {
        return sheet;
      }
    }
  }
  return undefined;
}

function compareValues(left: unknown, right: unknown) {
  if (left === right) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function matchesCriteria(row: Record<string, unknown>, criteria: Record<string, unknown>) {
  return Object.entries(criteria).every(([key, value]) => row[key] === value);
}

function applyPickFields(rows: Record<string, unknown>[], pickFields?: string[]) {
  if (!Array.isArray(pickFields) || pickFields.length === 0) return rows;
  return rows.map((row) => Object.fromEntries(pickFields.map((field) => [field, row[field]])));
}

function isBlankValue(value: unknown) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function querySheetRows(
  tables: SrcTableEntry[],
  sheetId: string,
  filter?: Record<string, unknown>,
  preferred?: { tableId?: string; sheetName?: string },
): Record<string, unknown>[] {
  const sheet = resolveSheet(tables, sheetId, preferred);
  if (!sheet) return [];
  const rows = sheet.preview as Record<string, unknown>[];
  if (!filter || typeof filter !== 'object' || Object.keys(filter).length === 0) return rows;
  return rows.filter((row) => matchesCriteria(row, filter));
}

export function findRowsInTables(
  tables: SrcTableEntry[],
  sheetId: string,
  criteria: Record<string, unknown> = {},
  options: FindRowsOptions = {},
  preferred?: { tableId?: string; sheetName?: string },
): Record<string, unknown>[] {
  let rows = querySheetRows(tables, sheetId, criteria, preferred);
  if (options.sortBy) {
    const direction = options.sortOrder === 'desc' ? -1 : 1;
    rows = [...rows].sort((left, right) => compareValues(left[options.sortBy!], right[options.sortBy!]) * direction);
  }
  if (typeof options.limit === 'number' && options.limit >= 0) {
    rows = rows.slice(0, options.limit);
  }
  return applyPickFields(rows, options.pickFields);
}

export function findRowInTables(
  tables: SrcTableEntry[],
  sheetId: string,
  criteria: Record<string, unknown>,
  options: FindRowOptions = {},
  preferred?: { tableId?: string; sheetName?: string },
): Record<string, unknown> | null {
  const rows = findRowsInTables(tables, sheetId, criteria, options, preferred);
  if (rows.length === 0) return null;
  if ((options.strictUnique ?? true) && rows.length > 1) {
    throw new Error(`查找到多条记录，请收窄条件: ${sheetId}`);
  }
  return rows[0] || null;
}

export function nextSequenceInTables(
  tables: SrcTableEntry[],
  sheetId: string,
  column: string,
  options: NextSequenceOptions = {},
  preferred?: { tableId?: string; sheetName?: string },
): number {
  const start = Number.isFinite(options.start) ? Number(options.start) : 1;
  const step = Number.isFinite(options.step) && Number(options.step) > 0 ? Number(options.step) : 1;
  const rows = querySheetRows(tables, sheetId, undefined, preferred);
  const maxValue = rows.reduce((max, row) => {
    const next = Number(row?.[column]);
    return Number.isFinite(next) ? Math.max(max, next) : max;
  }, start - step);
  return maxValue + step;
}

export function buildFillFormPatch(
  record: Record<string, unknown> | null | undefined,
  fieldMap?: Record<string, string>,
  options: FillFormOptions = {},
): FillFormResult {
  const source = record && typeof record === 'object' && !Array.isArray(record) ? record : null;
  const skipUndefined = options.skipUndefined !== false;
  const patch: Record<string, unknown> = {};
  const originalPatch: Record<string, unknown> = {};

  if (source) {
    const mappingEntries = fieldMap && Object.keys(fieldMap).length > 0
      ? Object.entries(fieldMap)
      : Object.keys(source).map((key) => [key, key] as const);
    for (const [column, field] of mappingEntries) {
      if (!field) continue;
      const value = source[column];
      if (value === undefined && skipUndefined) continue;
      patch[field] = value;
    }
    for (const [column, field] of Object.entries(options.originalFieldMap || {})) {
      if (!field) continue;
      const value = source[column];
      if (value === undefined && skipUndefined) continue;
      originalPatch[field] = value;
    }
  }

  const combined = { ...patch, ...originalPatch };
  return {
    patch,
    originalPatch,
    appliedFields: Object.keys(combined),
    enableComponentIds: [...new Set((options.enableComponentIds || []).filter(Boolean))],
  };
}

export function validateRequiredFields(
  values: Record<string, unknown>,
  fields: string[],
  options: RequireFieldsOptions = {},
): RequireFieldsResult {
  const missingFields = fields.filter((field) => isBlankValue(values[field]));
  const firstMissingField = missingFields[0];
  const valid = missingFields.length === 0;
  const message = valid
    ? ''
    : (options.messageTemplate || '请填写以下字段：{fields}').replace('{fields}', missingFields.join('、'));
  return { valid, firstMissingField, missingFields, message };
}

export function buildResetFormPatch(
  currentValues: Record<string, unknown>,
  options: ResetFormOptions = {},
): ResetFormResult {
  const preserveFields = [...new Set((options.preserveFields || []).filter(Boolean))];
  const clearFields = [...new Set((options.clearFields || []).filter(Boolean))];
  const preserved = new Set(preserveFields);
  const patch: Record<string, unknown> = {};

  for (const field of clearFields) {
    if (preserved.has(field)) continue;
    patch[field] = '';
  }
  for (const [field, value] of Object.entries(options.defaults || {})) {
    if (preserved.has(field)) continue;
    patch[field] = value;
  }

  const existingKeys = Object.keys(currentValues);
  for (const field of preserveFields) {
    if (!existingKeys.includes(field)) continue;
    patch[field] = currentValues[field];
  }

  return {
    patch,
    clearedFields: clearFields.filter((field) => !preserved.has(field)),
    preservedFields: preserveFields,
    focusedField: options.focusField,
    message: options.message,
  };
}
