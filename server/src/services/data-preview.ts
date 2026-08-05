import { createHash } from 'node:crypto';
import { dataIndexManager, DataIndexManager } from './data-index-cache.js';

export type DataRow = Record<string, unknown>;
export type SortRule = { colId?: string; field?: string; sort?: 'asc' | 'desc' };
export type FilterRule = {
  filterType?: string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  values?: unknown[];
  operator?: 'AND' | 'OR';
  condition1?: FilterRule;
  condition2?: FilterRule;
};

export type KeyedRow = DataRow & { __rowKey: string; __rowIndex: number };

export type BatchChange = {
  adds?: DataRow[];
  updates?: Array<{ rowKey: string; changes: DataRow }>;
  deletes?: string[];
};

export function dataVersion(rows: DataRow[]): string {
  return createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
}

function encodeKeyPart(value: unknown) {
  return encodeURIComponent(value == null ? '' : String(value));
}

export function buildRowKeys(rows: DataRow[], keyFields: string[] = []): string[] {
  const candidates = keyFields.length
    ? rows.map((row) => keyFields.map((field) => encodeKeyPart(row[field])).join('|'))
    : [];
  const useBusinessKey = candidates.length === rows.length
    && candidates.every(Boolean)
    && new Set(candidates).size === candidates.length;
  return rows.map((_, index) => useBusinessKey ? `key:${candidates[index]}` : `idx:${index}`);
}

function compare(left: unknown, right: unknown) {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function contains(value: unknown, expected: unknown) {
  return String(value ?? '').toLocaleLowerCase().includes(String(expected ?? '').toLocaleLowerCase());
}

function matchesSimpleFilter(value: unknown, rule: FilterRule): boolean {
  const type = rule.type || 'contains';
  const expected = rule.filter;
  if (rule.values) return rule.values.map(String).includes(String(value ?? ''));
  if (type === 'blank') return value == null || value === '';
  if (type === 'notBlank') return value != null && value !== '';
  if (type === 'equals') return String(value ?? '') === String(expected ?? '');
  if (type === 'notEqual') return String(value ?? '') !== String(expected ?? '');
  if (type === 'startsWith') return String(value ?? '').toLocaleLowerCase().startsWith(String(expected ?? '').toLocaleLowerCase());
  if (type === 'endsWith') return String(value ?? '').toLocaleLowerCase().endsWith(String(expected ?? '').toLocaleLowerCase());
  if (type === 'notContains') return !contains(value, expected);
  if (type === 'greaterThan') return Number(value) > Number(expected);
  if (type === 'greaterThanOrEqual') return Number(value) >= Number(expected);
  if (type === 'lessThan') return Number(value) < Number(expected);
  if (type === 'lessThanOrEqual') return Number(value) <= Number(expected);
  if (type === 'inRange') return Number(value) >= Number(expected) && Number(value) <= Number(rule.filterTo);
  return contains(value, expected);
}

function matchesFilter(value: unknown, rule: FilterRule): boolean {
  if (rule.condition1 && rule.condition2) {
    const values = [matchesFilter(value, rule.condition1), matchesFilter(value, rule.condition2)];
    return rule.operator === 'OR' ? values.some(Boolean) : values.every(Boolean);
  }
  return matchesSimpleFilter(value, rule);
}

export function queryRows(input: {
  rows: DataRow[];
  headers: string[];
  keyFields?: string[];
  /** 自定义行顺序（稳定 rowKey 数组）；仅无排序时生效，未匹配行按原相对顺序排在末尾 */
  rowOrder?: string[];
  page?: number;
  pageSize?: number;
  search?: string;
  keySearch?: string;
  sortModel?: SortRule[];
  filterModel?: Record<string, FilterRule>;
  maxPageSize?: number;
  /** Optional: file/sheet key for index cache */
  indexKey?: string;
}) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(input.maxPageSize || 500, Math.max(1, Number(input.pageSize) || 100));

  // Check cache for repeated queries
  const cacheKey = input.indexKey
    ? DataIndexManager.makeCacheKey(
        input.indexKey, '', page, pageSize,
        input.search || '', input.keySearch || '',
        input.sortModel || [], input.filterModel || {},
      )
    : null;

  if (cacheKey) {
    const cached = dataIndexManager.getCachedResult(cacheKey);
    if (cached) {
      return {
        rows: cached.rows,
        total: cached.total,
        queryTotal: cached.queryTotal,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(cached.queryTotal / pageSize)),
        hasMore: (page - 1) * pageSize + pageSize < cached.queryTotal,
        dataVersion: cached.dataVersion,
      };
    }
  }

  const keys = buildRowKeys(input.rows, input.keyFields);
  let keyed = input.rows.map((row, index) => ({ ...row, __rowKey: keys[index], __rowIndex: index })) as KeyedRow[];

  // Custom row order (only when no sort is active; unmatched rows keep original relative order at the end)
  const rowOrder = input.rowOrder?.length && !(input.sortModel || []).some((rule) => rule.sort)
    ? input.rowOrder
    : undefined;
  if (rowOrder) {
    const orderIndex = new Map(rowOrder.map((key, index) => [key, index]));
    keyed = [...keyed].sort((left, right) => {
      const leftIndex = orderIndex.get(left.__rowKey);
      const rightIndex = orderIndex.get(right.__rowKey);
      if (leftIndex == null && rightIndex == null) return left.__rowIndex - right.__rowIndex;
      if (leftIndex == null) return 1;
      if (rightIndex == null) return -1;
      return leftIndex - rightIndex;
    });
  }

  // Key search
  const keySearch = input.keySearch?.trim().toLocaleLowerCase();
  if (keySearch) keyed = keyed.filter((row) => row.__rowKey.toLocaleLowerCase().includes(encodeURIComponent(keySearch).toLocaleLowerCase()) || (input.keyFields || []).some((field) => contains(row[field], keySearch)));

  // Full-text search
  const search = input.search?.trim().toLocaleLowerCase();
  if (search) keyed = keyed.filter((row) => input.headers.some((header) => contains(row[header], search)));

  // Column filters - use index for large datasets
  const filterEntries = Object.entries(input.filterModel || {});
  const useIndex = input.indexKey && input.rows.length > 10000 && filterEntries.length > 0;

  if (useIndex) {
    const index = dataIndexManager.getIndex(input.indexKey!, input.rows, input.headers);
    // Apply indexed filters to narrow down candidates
    let candidateIndices: Set<number> | null = null;

    for (const [field, rule] of filterEntries) {
      const filterType = rule.type || 'contains';
      const filterValue = rule.filter;
      const filterValue2 = rule.filterTo;
      const indexedResult = index.filter(field, filterType, filterValue, filterValue2);

      if (indexedResult) {
        if (candidateIndices === null) {
          candidateIndices = indexedResult;
        } else {
          // AND intersection
          const intersection = new Set<number>();
          for (const i of candidateIndices) {
            if (indexedResult.has(i)) intersection.add(i);
          }
          candidateIndices = intersection;
        }
      }
    }

    // Apply candidate filter + remaining non-indexed filters
    if (candidateIndices) {
      keyed = keyed.filter((row) => {
        if (!candidateIndices!.has(row.__rowIndex)) return false;
        // Verify with full filter (for compound/complex filters)
        for (const [field, rule] of filterEntries) {
          if (!matchesFilter(row[field], rule)) return false;
        }
        return true;
      });
    } else {
      // No index results, fall back to full scan
      for (const [field, rule] of filterEntries) {
        keyed = keyed.filter((row) => matchesFilter(row[field], rule));
      }
    }
  } else {
    // Small dataset, use simple filter
    for (const [field, rule] of filterEntries) {
      keyed = keyed.filter((row) => matchesFilter(row[field], rule));
    }
  }

  // Sorting
  const sortModel = (input.sortModel || []).filter((rule) => (rule.colId || rule.field) && rule.sort);
  if (sortModel.length) {
    keyed.sort((left, right) => {
      for (const rule of sortModel) {
        const field = String(rule.colId || rule.field);
        const result = compare(left[field], right[field]);
        if (result) return rule.sort === 'desc' ? -result : result;
      }
      return left.__rowIndex - right.__rowIndex;
    });
  }

  const queryTotal = keyed.length;
  const start = (page - 1) * pageSize;
  const result = {
    rows: keyed.slice(start, start + pageSize),
    total: input.rows.length,
    queryTotal,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(queryTotal / pageSize)),
    hasMore: start + pageSize < queryTotal,
    dataVersion: dataVersion(input.rows),
  };

  // Cache the result
  if (cacheKey) {
    dataIndexManager.cacheResult(cacheKey, {
      rows: result.rows,
      total: result.total,
      queryTotal: result.queryTotal,
      dataVersion: result.dataVersion,
    });
  }

  return result;
}

export function applyBatchChanges(rows: DataRow[], keyFields: string[], changes: BatchChange) {
  const keys = buildRowKeys(rows, keyFields);
  const indexByKey = new Map(keys.map((key, index) => [key, index]));
  const updateMap = new Map((changes.updates || []).map((entry) => [entry.rowKey, entry.changes]));
  const deleteSet = new Set(changes.deletes || []);
  const unknownKeys = [...updateMap.keys(), ...deleteSet].filter((key) => !indexByKey.has(key));
  if (unknownKeys.length) throw new Error(`记录已不存在或已发生变化: ${unknownKeys.slice(0, 3).join(', ')}`);
  const next = rows
    .map((row, index) => updateMap.has(keys[index]) ? { ...row, ...updateMap.get(keys[index]) } : { ...row })
    .filter((_, index) => !deleteSet.has(keys[index]));
  for (const row of changes.adds || []) next.push({ ...row });
  return next;
}

export function validateConfiguredKeys(rows: DataRow[], keyFields: string[]) {
  if (!keyFields.length) return;
  const values = rows.map((row) => keyFields.map((field) => String(row[field] ?? '')).join('\u001f'));
  const hasBlank = rows.some((row) => keyFields.some((field) => row[field] == null || row[field] === ''));
  if (hasBlank) throw new Error(`Key 字段不能为空：${keyFields.join('、')}`);
  if (new Set(values).size !== values.length) throw new Error(`Key 字段组合存在重复值：${keyFields.join('、')}`);
}
