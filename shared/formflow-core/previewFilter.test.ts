import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FILTER_TYPE_LABELS,
  FILTER_TYPES_BY_DATA_TYPE,
  filterTypesForDataType,
  matchesFilterRule,
  matchesSimpleFilter,
} from './previewFilter';

test('filter vocabulary covers every label and per-type set', () => {
  for (const types of Object.values(FILTER_TYPES_BY_DATA_TYPE)) {
    for (const type of types) assert.ok(FILTER_TYPE_LABELS[type], `missing label for ${type}`);
  }
  assert.deepEqual(filterTypesForDataType('number'), FILTER_TYPES_BY_DATA_TYPE.number);
  assert.deepEqual(filterTypesForDataType('weird'), FILTER_TYPES_BY_DATA_TYPE.unknown);
});

test('matchesSimpleFilter implements equality, range, and blank semantics', () => {
  assert.equal(matchesSimpleFilter('abc', { type: 'contains', filter: 'b' }), true);
  assert.equal(matchesSimpleFilter('x', { type: 'equals', filter: 'x' }), true);
  assert.equal(matchesSimpleFilter(5, { type: 'greaterThan', filter: 4 }), true);
  assert.equal(matchesSimpleFilter('', { type: 'blank' }), true);
  assert.equal(matchesSimpleFilter(null, { type: 'blank' }), true);
  assert.equal(matchesSimpleFilter('a', { type: 'notBlank' }), true);
});

test('matchesFilterRule composes conditions with AND/OR', () => {
  const rule: { condition1: { type: string; filter: number }; condition2: { type: string; filter: number }; operator: 'AND' | 'OR' } = {
    operator: 'AND',
    condition1: { type: 'greaterThan', filter: 3 },
    condition2: { type: 'lessThan', filter: 10 },
  };
  assert.equal(matchesFilterRule(5, rule), true);
  assert.equal(matchesFilterRule(12, rule), false);
});
