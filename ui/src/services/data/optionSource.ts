import type { SrcTableEntry } from '../../project/types';

export interface TableOptionSourceConfig {
  mode?: 'static' | 'table';
  tableId?: string;
  sheetName?: string;
  labelField?: string;
  valueField?: string;
  unique?: boolean;
  sortOrder?: 'none' | 'asc' | 'desc';
}

export interface ResolvedOptionSource {
  options: Array<{ label: string; value: unknown }>;
  diagnostic: string | null;
  dynamic: boolean;
}

function staticOptions(value: unknown): Array<{ label: string; value: unknown }> {
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

export function normalizeOptionSource(value: unknown): TableOptionSourceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { mode: 'static', unique: true, sortOrder: 'none' };
  const source = value as TableOptionSourceConfig;
  return {
    mode: source.mode === 'table' ? 'table' : 'static',
    tableId: source.tableId,
    sheetName: source.sheetName,
    labelField: source.labelField,
    valueField: source.valueField,
    unique: source.unique !== false,
    sortOrder: source.sortOrder === 'asc' || source.sortOrder === 'desc' ? source.sortOrder : 'none',
  };
}

export function resolveOptionSource(
  configuredOptions: unknown,
  configuredSource: unknown,
  tables: SrcTableEntry[],
): ResolvedOptionSource {
  const source = normalizeOptionSource(configuredSource);
  if (source.mode !== 'table') return { options: staticOptions(configuredOptions), diagnostic: null, dynamic: false };
  const table = tables.find((item) => item.id === source.tableId);
  if (!table) return { options: [], diagnostic: '选项数据源不存在', dynamic: true };
  const sheet = table.sheets.find((item) => item.name === source.sheetName);
  if (!sheet) return { options: [], diagnostic: '选项工作表不存在', dynamic: true };
  if (!source.labelField || !sheet.headers.includes(source.labelField)) return { options: [], diagnostic: '显示字段不存在', dynamic: true };
  const valueField = source.valueField || source.labelField;
  if (!sheet.headers.includes(valueField)) return { options: [], diagnostic: '值字段不存在', dynamic: true };

  let options = sheet.preview
    .filter((row) => row[valueField] !== undefined && row[valueField] !== null && row[valueField] !== '')
    .map((row) => ({ label: String(row[source.labelField!] ?? row[valueField]), value: row[valueField] }));
  if (source.unique !== false) {
    const seen = new Set<string>();
    options = options.filter((option) => {
      const key = String(option.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (source.sortOrder !== 'none') {
    const direction = source.sortOrder === 'desc' ? -1 : 1;
    options = [...options].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN') * direction);
  }
  return { options, diagnostic: null, dynamic: true };
}
