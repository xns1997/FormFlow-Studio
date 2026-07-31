import assert from 'node:assert/strict';
import test from 'node:test';
import {
  safeSync,
  safeJsonParse,
  safeJsonStringify,
} from './safeUtils';

test('safeSync returns result on success', () => {
  const result = safeSync(() => 42, 0);
  assert.equal(result, 42);
});

test('safeSync returns fallback on throw', () => {
  const result = safeSync(() => { throw new Error('boom'); }, 99);
  assert.equal(result, 99);
});

test('safeJsonParse parses valid JSON', () => {
  const result = safeJsonParse('{"a":1}', {});
  assert.deepEqual(result, { a: 1 });
});

test('safeJsonParse returns fallback on invalid JSON', () => {
  const result = safeJsonParse('not json', { default: true });
  assert.deepEqual(result, { default: true });
});

test('safeJsonStringify serializes objects', () => {
  const result = safeJsonStringify({ x: 1 });
  assert.equal(result, '{"x":1}');
});

test('safeJsonStringify returns fallback on circular ref', () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const result = safeJsonStringify(circular, '{}');
  assert.equal(result, '{}');
});
