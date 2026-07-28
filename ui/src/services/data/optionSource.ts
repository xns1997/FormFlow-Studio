import type { RangeRef } from '../../models';
import type { FormLinkageOptionsConfig } from '../../project/types';
import type { SrcTableEntry } from '../../project/types';
import { resolveRange } from './rangeResolver';

export interface OptionItem {
  label: string;
  value: unknown;
}

export interface TableOptionSourceConfig {
  mode?: 'static' | 'table' | 'range';
  tableId?: string;
  sheetName?: string;
  labelField?: string;
  valueField?: string;
  rangeRef?: RangeRef | null;
  labelColumn?: number;
  valueColumn?: number;
  unique?: boolean;
  sortOrder?: 'none' | 'asc' | 'desc';
}

export interface ResolvedOptionSource {
  mode: 'static' | 'table' | 'range';
  options: OptionItem[];
  diagnostic: string | null;
  dynamic: boolean;
}

export interface LinkedOptionConfig {
  table: string;
  filterField: string;
  filterValue?: unknown;
  labelField?: string;
  valueField?: string;
}

export function resolveLinkageOptions(config: FormLinkageOptionsConfig, tables: SrcTableEntry[]): OptionItem[] {
  if (config.mode === 'table') {
    const source = resolveSourceTable({ table: config.table, filterField: config.filterField, filterValue: config.filterValue, labelField: config.labelField, valueField: config.valueField }, tables);
    if (!source) return [];
    const { sheet } = source;
    const labelField = config.labelField || sheet.headers.find((header) => header !== config.filterField) || sheet.headers[0];
    const valueField = config.valueField || labelField;
    if (!labelField || !valueField) return [];
    const options = sheet.preview
      .filter((row) => row[config.filterField] == config.filterValue)
      .map((row) => ({ label: String(row[labelField] ?? row[valueField] ?? ''), value: row[valueField] }))
      .filter((option) => option.label !== '' || option.value !== '' && option.value != null);
    return dedupeAndSort(options, config);
  }
  if (config.mode === 'range') {
    const resolved = resolveRange(config.rangeRef, tables);
    if (!resolved) return [];
    const labelColumn = Number.isInteger(config.labelColumn) ? Number(config.labelColumn) : 0;
    const valueColumn = Number.isInteger(config.valueColumn) ? Number(config.valueColumn) : labelColumn;
    const filterColumn = Number.isInteger(config.filterColumn) ? Number(config.filterColumn) : null;
    const options = resolved.data
      .filter((row) => filterColumn == null || row[filterColumn] == config.filterValue)
      .filter((row) => row[valueColumn] !== undefined && row[valueColumn] !== null && row[valueColumn] !== '')
      .map((row) => ({ label: String(row[labelColumn] ?? row[valueColumn] ?? ''), value: row[valueColumn] }));
    return dedupeAndSort(options, config);
  }
  const key = String(config.valueRef?.value ?? '');
  return (config.mapping[key] || []).map((option) => ({ label: String(option.label), value: option.value }));
}

function staticOptions(value: unknown): OptionItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const optionValue = record.value ?? record.label ?? '';
      return { label: String(record.label ?? optionValue), value: optionValue };
    }
    return { label: String(item ?? ''), value: item };
  });
}

function dedupeAndSort(options: OptionItem[], source: Pick<TableOptionSourceConfig, 'unique' | 'sortOrder'>) {
  let next = options;
  if (source.unique !== false) {
    const seen = new Set<string>();
    next = next.filter((option) => {
      const key = String(option.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (source.sortOrder !== 'none') {
    const direction = source.sortOrder === 'desc' ? -1 : 1;
    next = [...next].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN') * direction);
  }
  return next;
}

export function normalizeOptionSource(value: unknown): TableOptionSourceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { mode: 'static', unique: true, sortOrder: 'none' };
  const source = value as TableOptionSourceConfig;
  return {
    mode: source.mode === 'table' || source.mode === 'range' ? source.mode : 'static',
    tableId: source.tableId,
    sheetName: source.sheetName,
    labelField: source.labelField,
    valueField: source.valueField,
    rangeRef: source.rangeRef || null,
    labelColumn: Number.isInteger(source.labelColumn) ? Number(source.labelColumn) : 0,
    valueColumn: Number.isInteger(source.valueColumn) ? Number(source.valueColumn) : Number.isInteger(source.labelColumn) ? Number(source.labelColumn) : 0,
    unique: source.unique !== false,
    sortOrder: source.sortOrder === 'asc' || source.sortOrder === 'desc' ? source.sortOrder : 'none',
  };
}

function resolveSourceTable(config: LinkedOptionConfig, tables: SrcTableEntry[]) {
  return tables
    .flatMap((table) => table.sheets.map((sheet) => ({ table, sheet })))
    .find(({ table, sheet }) => [table.id, table.fileName, sheet.name, `${table.id}:${sheet.name}`].includes(config.table));
}

export function resolveLinkedOptions(config: LinkedOptionConfig, tables: SrcTableEntry[]): OptionItem[] {
  const source = resolveSourceTable(config, tables);
  if (!source) return [];
  const { sheet } = source;
  const labelField = config.labelField || sheet.headers.find((header) => header !== config.filterField) || sheet.headers[0];
  const valueField = config.valueField || labelField;
  if (!labelField || !valueField) return [];
  return sheet.preview
    .filter((row) => row[config.filterField] == config.filterValue)
    .map((row) => ({ label: String(row[labelField] ?? ''), value: row[valueField] }))
    .filter((option) => option.label !== '' || option.value !== '' && option.value != null);
}

function optionKey(value: unknown) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number' || typeof value === 'boolean') return `${typeof value}:${String(value)}`;
  try {
    return `json:${JSON.stringify(value)}`;
  } catch {
    return `other:${String(value)}`;
  }
}

export function syncOptionValue(
  value: unknown,
  options: OptionItem[],
  multiple = false,
): { value: unknown; changed: boolean } {
  const valid = new Set(options.map((option) => optionKey(option.value)));
  if (multiple) {
    const current = Array.isArray(value) ? value : [];
    const next = current.filter((item) => valid.has(optionKey(item)));
    return { value: next, changed: next.length !== current.length };
  }
  if (value == null || value === '') return { value: '', changed: value !== '' };
  if (valid.has(optionKey(value))) return { value, changed: false };
  return { value: '', changed: true };
}

export function resolveOptionSource(
  configuredOptions: unknown,
  configuredSource: unknown,
  tables: SrcTableEntry[],
): ResolvedOptionSource {
  const source = normalizeOptionSource(configuredSource);
  if (source.mode === 'static') return { mode: 'static', options: staticOptions(configuredOptions), diagnostic: null, dynamic: false };
  if (source.mode === 'range') {
    if (!source.rangeRef?.tableId || !source.rangeRef?.sheetName) return { mode: 'range', options: [], diagnostic: '选项范围不存在', dynamic: true };
    const resolved = resolveRange(source.rangeRef, tables);
    if (!resolved) return { mode: 'range', options: [], diagnostic: '选项范围不存在', dynamic: true };
    const labelColumn = Number.isInteger(source.labelColumn) ? Number(source.labelColumn) : 0;
    const valueColumn = Number.isInteger(source.valueColumn) ? Number(source.valueColumn) : labelColumn;
    if (labelColumn < 0 || labelColumn >= resolved.cols) return { mode: 'range', options: [], diagnostic: '显示列不存在', dynamic: true };
    if (valueColumn < 0 || valueColumn >= resolved.cols) return { mode: 'range', options: [], diagnostic: '值列不存在', dynamic: true };
    const options = resolved.data
      .filter((row) => row[valueColumn] !== undefined && row[valueColumn] !== null && row[valueColumn] !== '')
      .map((row) => ({ label: String(row[labelColumn] ?? row[valueColumn] ?? ''), value: row[valueColumn] }));
    return { mode: 'range', options: dedupeAndSort(options, source), diagnostic: null, dynamic: true };
  }
  const table = tables.find((item) => item.id === source.tableId);
  if (!table) return { mode: 'table', options: [], diagnostic: '选项数据源不存在', dynamic: true };
  const sheet = table.sheets.find((item) => item.name === source.sheetName);
  if (!sheet) return { mode: 'table', options: [], diagnostic: '选项工作表不存在', dynamic: true };
  if (!source.labelField || !sheet.headers.includes(source.labelField)) return { mode: 'table', options: [], diagnostic: '显示字段不存在', dynamic: true };
  const valueField = source.valueField || source.labelField;
  if (!sheet.headers.includes(valueField)) return { mode: 'table', options: [], diagnostic: '值字段不存在', dynamic: true };

  let options = sheet.preview
    .filter((row) => row[valueField] !== undefined && row[valueField] !== null && row[valueField] !== '')
    .map((row) => ({ label: String(row[source.labelField!] ?? row[valueField]), value: row[valueField] }));
  return { mode: 'table', options: dedupeAndSort(options, source), diagnostic: null, dynamic: true };
}
