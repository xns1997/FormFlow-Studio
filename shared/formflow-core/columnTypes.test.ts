import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLUMN_TYPE_ALIASES,
  columnDataTypeToControlType,
  columnDataTypeToFieldType,
  columnSelectOptions,
  normalizeColumnType,
} from './columnTypes';

test('normalizeColumnType maps aliases and passes unknown values through', () => {
  assert.equal(COLUMN_TYPE_ALIASES.integer, 'number');
  assert.equal(COLUMN_TYPE_ALIASES.datetime, 'date');
  assert.equal(normalizeColumnType('Integer'), 'number');
  assert.equal(normalizeColumnType('TEXT'), 'string');
  assert.equal(normalizeColumnType('enum'), 'enum');
  assert.equal(normalizeColumnType('weird'), 'weird');
});

test('columnDataTypeToFieldType covers the DSL type set', () => {
  assert.equal(columnDataTypeToFieldType('number'), 'number');
  assert.equal(columnDataTypeToFieldType('bool'), 'boolean');
  assert.equal(columnDataTypeToFieldType('datetime'), 'date');
  assert.equal(columnDataTypeToFieldType('enum'), 'string');
  assert.equal(columnDataTypeToFieldType('text'), 'string');
  assert.equal(columnDataTypeToFieldType('anything-else'), 'unknown');
});

test('columnDataTypeToControlType maps data types and degrades enum without options', () => {
  assert.equal(columnDataTypeToControlType('number'), 'number');
  assert.equal(columnDataTypeToControlType('date'), 'datePicker');
  assert.equal(columnDataTypeToControlType('boolean'), 'switch');
  assert.equal(columnDataTypeToControlType('enum'), 'select');
  assert.equal(columnDataTypeToControlType('enum', { noSelectOptions: true }), 'input');
  assert.equal(columnDataTypeToControlType('string'), 'input');
});

test('columnSelectOptions deduplicates enum and sample values', () => {
  assert.deepEqual(columnSelectOptions({ enum: ['a', 'b'], sampleValues: ['b', 'c'] }), ['a', 'b', 'c']);
  assert.deepEqual(columnSelectOptions(undefined), []);
});
