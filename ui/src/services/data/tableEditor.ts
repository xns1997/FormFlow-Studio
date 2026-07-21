import {
  createDefaultTableConfig,
  type SrcColumnInfo,
  type SrcSheetInfo,
  type SrcTableEntry,
  type TableConfig,
} from '../../project/types';
import { applySheetKeyConfig } from './tableKeys';

type ColumnDataType = SrcColumnInfo['dataType'];

interface CreateEmptyTableInput {
  tableName: string;
  fileName?: string;
  sheetName?: string;
  columns: Array<{ name: string; dataType?: ColumnDataType }>;
}

interface AppendColumnInput {
  name: string;
  dataType?: ColumnDataType;
  defaultValue?: unknown;
}

function slugify(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeColumnName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `列${index + 1}`;
}

function toPlainRows(sheet: SrcSheetInfo) {
  return Array.isArray(sheet.preview) ? sheet.preview.map((row) => ({ ...row })) : [];
}

export function inferColumnInfo(
  name: string,
  index: number,
  data: Record<string, unknown>[],
  preferredType?: ColumnDataType,
): SrcColumnInfo {
  const values = data.map((row) => row[name]);
  const nonEmpty = values.filter((value) => value !== '' && value != null);
  const sampleValues = [...new Set(nonEmpty.map((value) => String(value)))].slice(0, 8);
  const inferredType: ColumnDataType =
    nonEmpty.length === 0
      ? preferredType || 'string'
      : nonEmpty.every((value) => typeof value === 'number')
        ? 'number'
        : nonEmpty.every((value) => typeof value === 'boolean')
          ? 'boolean'
          : nonEmpty.every((value) => !Number.isNaN(Date.parse(String(value))))
            ? 'date'
            : sampleValues.length <= 20
              ? 'enum'
              : 'string';

  return {
    name,
    index,
    dataType: preferredType && preferredType !== 'unknown' ? preferredType : inferredType,
    nullable: nonEmpty.length < values.length,
    uniqueCount: new Set(nonEmpty.map((value) => String(value))).size,
    sampleValues,
  };
}

function ensureUniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = normalizeColumnName(header, index);
    const nextCount = seen.get(base) || 0;
    seen.set(base, nextCount + 1);
    return nextCount === 0 ? base : `${base}_${nextCount + 1}`;
  });
}

function projectRowsToHeaders(rows: Record<string, unknown>[], headers: string[]) {
  return rows.map((row) =>
    Object.fromEntries(headers.map((header) => [header, row[header] ?? ''])),
  );
}

function buildColumns(
  headers: string[],
  rows: Record<string, unknown>[],
  previousColumns: SrcColumnInfo[] = [],
  overrides: Record<string, Partial<SrcColumnInfo>> = {},
) {
  const previousByName = new Map(previousColumns.map((column) => [column.name, column]));
  return headers.map((header, index) => {
    const previous = previousByName.get(header);
    const override = overrides[header] || {};
    return {
      ...inferColumnInfo(header, index, rows, override.dataType as ColumnDataType | undefined || previous?.dataType),
      ...previous,
      ...override,
      name: header,
      index,
      dataType: (override.dataType as ColumnDataType | undefined) || previous?.dataType || inferColumnInfo(header, index, rows).dataType,
    };
  });
}

function renameMapKey<T>(map: Record<string, T>, oldKey: string, newKey: string) {
  const next = { ...map };
  if (Object.prototype.hasOwnProperty.call(next, oldKey)) {
    next[newKey] = next[oldKey];
    delete next[oldKey];
  }
  return next;
}

function removeMapKey<T>(map: Record<string, T>, key: string) {
  const next = { ...map };
  delete next[key];
  return next;
}

function rebuildSheet(
  sheet: SrcSheetInfo,
  headers: string[],
  preview: Record<string, unknown>[],
  configPatch?: Partial<TableConfig>,
  columnOverrides?: Record<string, Partial<SrcColumnInfo>>,
) {
  const nextHeaders = ensureUniqueHeaders(headers);
  const nextPreview = projectRowsToHeaders(preview, nextHeaders);
  const nextColumns = buildColumns(nextHeaders, nextPreview, sheet.columns, columnOverrides);
  const baseConfig = {
    ...createDefaultTableConfig(
      sheet.config?.id || `${sheet.name}:${nextHeaders.join('_')}`,
      sheet.config?.tableName || sheet.name,
    ),
    ...(sheet.config || {}),
    ...(configPatch || {}),
  };
  const nextSheet: SrcSheetInfo = {
    ...sheet,
    headers: nextHeaders,
    columns: nextColumns,
    preview: nextPreview,
    rowCount: nextPreview.length,
    colCount: nextHeaders.length,
    config: baseConfig,
  };
  nextSheet.config = {
    ...baseConfig,
    ...applySheetKeyConfig(nextSheet, baseConfig.keyFields),
  };
  return nextSheet;
}

function updateSheet(
  table: SrcTableEntry,
  sheetName: string,
  updater: (sheet: SrcSheetInfo) => SrcSheetInfo,
) {
  return {
    ...table,
    sheets: table.sheets.map((sheet) => (sheet.name === sheetName ? updater(sheet) : sheet)),
  };
}

export function createEmptyTableEntry(input: CreateEmptyTableInput): SrcTableEntry {
  const now = new Date().toISOString();
  const baseName = input.tableName.trim() || '新建数据表';
  const fileName = (input.fileName || `${baseName}.json`).trim() || `${baseName}.json`;
  const sheetName = (input.sheetName || 'Sheet1').trim() || 'Sheet1';
  const headers = ensureUniqueHeaders(
    input.columns.length > 0
      ? input.columns.map((column, index) => normalizeColumnName(column.name, index))
      : ['列1'],
  );
  const columnOverrides = Object.fromEntries(
    headers.map((header, index) => [header, { dataType: input.columns[index]?.dataType || 'string' }]),
  );
  const sheet = rebuildSheet(
    {
      name: sheetName,
      rowCount: 0,
      colCount: headers.length,
      headers,
      columns: [],
      preview: [],
      config: createDefaultTableConfig(`${Date.now()}:${sheetName}`, `${fileName} / ${sheetName}`),
    },
    headers,
    [],
    {
      id: `${Date.now()}:${sheetName}`,
      tableName: `${fileName} / ${sheetName}`,
    },
    columnOverrides,
  );

  return {
    id: `tbl_${Date.now()}_${slugify(baseName) || 'table'}`,
    fileName,
    fileSize: 0,
    fileType: 'json',
    uploadedAt: now,
    sheets: [sheet],
    dataHash: `manual_${Date.now()}`,
  };
}

export function appendColumnToSheet(table: SrcTableEntry, sheetName: string, input: AppendColumnInput): SrcTableEntry {
  return updateSheet(table, sheetName, (sheet) => {
    const nextHeader = normalizeColumnName(input.name, sheet.headers.length);
    const nextPreview = toPlainRows(sheet).map((row) => ({
      ...row,
      [nextHeader]: input.defaultValue ?? '',
    }));
    return rebuildSheet(
      sheet,
      [...sheet.headers, nextHeader],
      nextPreview,
      {
        columnDescriptions: sheet.config?.columnDescriptions || {},
        columnTags: sheet.config?.columnTags || {},
      },
      {
        [nextHeader]: { dataType: input.dataType || 'string' },
      },
    );
  });
}

export function renameColumnInSheet(table: SrcTableEntry, sheetName: string, oldName: string, newName: string): SrcTableEntry {
  return updateSheet(table, sheetName, (sheet) => {
    const nextName = normalizeColumnName(newName, sheet.headers.indexOf(oldName));
    const nextHeaders = sheet.headers.map((header) => (header === oldName ? nextName : header));
    const nextPreview = toPlainRows(sheet).map((row) => {
      const value = row[oldName];
      const { [oldName]: _removed, ...rest } = row;
      return { ...rest, [nextName]: value ?? '' };
    });
    const previousColumn = sheet.columns.find((column) => column.name === oldName);
    const nextConfig = {
      columnWidths: renameMapKey(sheet.config?.columnWidths || {}, oldName, nextName),
      columnDescriptions: renameMapKey(sheet.config?.columnDescriptions || {}, oldName, nextName),
      columnTags: renameMapKey(sheet.config?.columnTags || {}, oldName, nextName),
      hiddenColumns: (sheet.config?.hiddenColumns || []).map((header) => (header === oldName ? nextName : header)),
      lockedColumns: (sheet.config?.lockedColumns || []).map((header) => (header === oldName ? nextName : header)),
      keyFields: (sheet.config?.keyFields || []).map((header) => (header === oldName ? nextName : header)),
      defaultSort:
        sheet.config?.defaultSort?.column === oldName
          ? { ...sheet.config.defaultSort, column: nextName }
          : sheet.config?.defaultSort || null,
      groupByColumn:
        sheet.config?.groupByColumn != null
          ? nextHeaders.indexOf(sheet.headers[sheet.config.groupByColumn] || '')
          : null,
    };
    return rebuildSheet(
      sheet,
      nextHeaders,
      nextPreview,
      nextConfig,
      {
        [nextName]: {
          ...previousColumn,
          name: nextName,
        },
      },
    );
  });
}

export function removeColumnFromSheet(table: SrcTableEntry, sheetName: string, columnName: string): SrcTableEntry {
  return updateSheet(table, sheetName, (sheet) => {
    const nextHeaders = sheet.headers.filter((header) => header !== columnName);
    const nextPreview = toPlainRows(sheet).map((row) => {
      const { [columnName]: _removed, ...rest } = row;
      return rest;
    });
    const groupByHeader = sheet.config?.groupByColumn != null ? sheet.headers[sheet.config.groupByColumn] : null;
    return rebuildSheet(
      sheet,
      nextHeaders,
      nextPreview,
      {
        columnWidths: removeMapKey(sheet.config?.columnWidths || {}, columnName),
        columnDescriptions: removeMapKey(sheet.config?.columnDescriptions || {}, columnName),
        columnTags: removeMapKey(sheet.config?.columnTags || {}, columnName),
        hiddenColumns: (sheet.config?.hiddenColumns || []).filter((header) => header !== columnName),
        lockedColumns: (sheet.config?.lockedColumns || []).filter((header) => header !== columnName),
        keyFields: (sheet.config?.keyFields || []).filter((header) => header !== columnName),
        defaultSort:
          sheet.config?.defaultSort?.column === columnName ? null : sheet.config?.defaultSort || null,
        groupByColumn: groupByHeader ? nextHeaders.indexOf(groupByHeader) : null,
      },
    );
  });
}

export function reorderColumnsInSheet(
  table: SrcTableEntry,
  sheetName: string,
  columnName: string,
  direction: 'up' | 'down',
): SrcTableEntry {
  return updateSheet(table, sheetName, (sheet) => {
    const currentIndex = sheet.headers.indexOf(columnName);
    if (currentIndex === -1) return sheet;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sheet.headers.length) return sheet;
    const nextHeaders = [...sheet.headers];
    const [moved] = nextHeaders.splice(currentIndex, 1);
    nextHeaders.splice(targetIndex, 0, moved);
    const groupByHeader = sheet.config?.groupByColumn != null ? sheet.headers[sheet.config.groupByColumn] : null;
    return rebuildSheet(
      sheet,
      nextHeaders,
      toPlainRows(sheet),
      {
        groupByColumn: groupByHeader ? nextHeaders.indexOf(groupByHeader) : null,
      },
    );
  });
}
