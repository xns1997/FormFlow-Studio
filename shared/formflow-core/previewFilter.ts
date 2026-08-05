/**
 * Single filter vocabulary across the client/server seam: rule and sort
 * shapes, per-data-type filter sets, labels, and matching semantics. Both the
 * browser workbench and the server query engine consume this module.
 */

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

export const FILTER_TYPE_LABELS: Record<string, string> = {
  contains: '包含',
  notContains: '不包含',
  equals: '等于',
  notEqual: '不等于',
  startsWith: '开头是',
  endsWith: '结尾是',
  blank: '为空',
  notBlank: '不为空',
  greaterThan: '大于',
  greaterThanOrEqual: '大于等于',
  lessThan: '小于',
  lessThanOrEqual: '小于等于',
  inRange: '区间内',
};

export const FILTER_TYPES_BY_DATA_TYPE: Record<string, string[]> = {
  string: ['contains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'notContains', 'blank', 'notBlank'],
  number: ['equals', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'inRange', 'blank', 'notBlank'],
  date: ['equals', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'inRange', 'blank', 'notBlank'],
  boolean: ['equals', 'blank', 'notBlank'],
  enum: ['equals', 'notEqual', 'blank', 'notBlank'],
  unknown: ['contains', 'equals', 'notEqual', 'blank', 'notBlank'],
};

export function filterTypesForDataType(dataType?: string): string[] {
  return FILTER_TYPES_BY_DATA_TYPE[dataType || 'unknown'] || FILTER_TYPES_BY_DATA_TYPE.unknown;
}

function contains(value: unknown, expected: unknown) {
  return String(value ?? '').toLocaleLowerCase().includes(String(expected ?? '').toLocaleLowerCase());
}

export function matchesSimpleFilter(value: unknown, rule: FilterRule): boolean {
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

export function matchesFilterRule(value: unknown, rule: FilterRule): boolean {
  if (rule.condition1 && rule.condition2) {
    const values = [matchesFilterRule(value, rule.condition1), matchesFilterRule(value, rule.condition2)];
    return rule.operator === 'OR' ? values.some(Boolean) : values.every(Boolean);
  }
  return matchesSimpleFilter(value, rule);
}
