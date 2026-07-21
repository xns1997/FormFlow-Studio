import assert from 'node:assert/strict';
import test from 'node:test';
import { vectorLiteral } from './vector-store';

test('vectorLiteral serializes finite vectors for pgvector', () => {
  assert.equal(vectorLiteral([1, -0.25, 0]), '[1,-0.25,0]');
});

test('vectorLiteral rejects empty and non-finite vectors', () => {
  assert.throws(() => vectorLiteral([]), /不能为空/);
  assert.throws(() => vectorLiteral([Number.NaN]), /有限数值/);
  assert.throws(() => vectorLiteral([Number.POSITIVE_INFINITY]), /有限数值/);
});
