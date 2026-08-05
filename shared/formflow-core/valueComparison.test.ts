import assert from 'node:assert/strict';
import test from 'node:test';
import { comparableValue, sameValue } from './valueComparison';

test('comparableValue keeps numbers numeric and date strings comparable', () => {
  assert.equal(comparableValue(5), 5);
  assert.equal(comparableValue(' 3 '), 3);
  assert.equal(comparableValue('2024-01-02'), new Date('2024-01-02').getTime());
  assert.equal(comparableValue(new Date('2024-06-01T00:00:00Z')), new Date('2024-06-01T00:00:00Z').getTime());
  assert.equal(comparableValue('abc'), 'abc');
  assert.equal(comparableValue(''), '');
  assert.equal(comparableValue(undefined), undefined);
  assert.equal(comparableValue(null), null);
});

test('sameValue uses deep equality with a JSON fallback', () => {
  assert.equal(sameValue(1, 1), true);
  assert.equal(sameValue({ a: 1 }, { a: 1 }), true);
  assert.equal(sameValue({ a: 1 }, { a: 2 }), false);
  assert.equal(sameValue(NaN, NaN), true);
  assert.equal(sameValue('x', 'y'), false);
});
