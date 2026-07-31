import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJson, parseJsonOrNull, parseJsonStrict, stringifyJson, cloneJson } from './safeJson';

test('parseJson parses valid JSON normally', () => {
  assert.deepEqual(parseJson('{"a":1}', {}), { a: 1 });
});

test('parseJson returns fallback on empty input', () => {
  assert.deepEqual(parseJson('', { x: 1 }), { x: 1 });
});

test('parseJson returns fallback on non-string', () => {
  assert.deepEqual(parseJson(null as any, []), []);
});

test('parseJson repairs trailing comma', () => {
  const result = parseJson<{ a: number; b: number }>('{"a":1,"b":2,}', {});
  assert.equal(result.a, 1);
  assert.equal(result.b, 2);
});

test('parseJson repairs single quotes', () => {
  const result = parseJson<{ name: string }>("{'name':'hello'}", {});
  assert.equal(result.name, 'hello');
});

test('parseJson repairs unquoted keys', () => {
  const result = parseJson<{ name: string }>('{"name":hello}', {});
  assert.equal(result.name, 'hello');
});

test('parseJson repairs missing quotes on string values', () => {
  const result = parseJson<{ key: string }>('{"key": value}', {});
  assert.equal(result.key, 'value');
});

test('parseJson returns fallback on completely unrepairable input', () => {
  assert.deepEqual(parseJson('not json at all {{{', { default: true }), { default: true });
});

test('parseJsonOrNull returns null on total failure', () => {
  // 'bad' gets repaired to "bad" by jsonrepair, so use something truly unrepairable
  assert.equal(parseJsonOrNull('{{{'), null);
});

test('parseJsonOrNull returns parsed value on success', () => {
  assert.deepEqual(parseJsonOrNull('{"x":1}'), { x: 1 });
});

test('parseJsonStrict throws on empty input', () => {
  assert.throws(() => parseJsonStrict('', 'test'), /输入为空/);
});

test('parseJsonStrict throws on unrepairable input', () => {
  assert.throws(() => parseJsonStrict('{{{bad', 'test'), /解析失败/);
});

test('parseJsonStrict parses valid JSON', () => {
  assert.deepEqual(parseJsonStrict('[1,2,3]'), [1, 2, 3]);
});

test('parseJsonStrict repairs and parses', () => {
  const result = parseJsonStrict<{ a: number }>('[1,2,3] // comment');
  assert.ok(Array.isArray(result));
});

test('stringifyJson serializes objects', () => {
  assert.equal(stringifyJson({ x: 1 }), '{"x":1}');
});

test('stringifyJson handles circular refs', () => {
  const obj: Record<string, unknown> = {};
  obj.self = obj;
  assert.equal(stringifyJson(obj), '{}');
});

test('cloneJson deep clones objects', () => {
  const original = { a: 1, b: { c: 2 } };
  const cloned = cloneJson(original);
  assert.deepEqual(cloned, original);
  cloned.b.c = 99;
  assert.equal(original.b.c, 2); // original not affected
});

test('cloneJson returns original on undefined', () => {
  assert.equal(cloneJson(undefined), undefined);
});

test('cloneJson handles circular refs gracefully', () => {
  const obj: Record<string, unknown> = {};
  obj.self = obj;
  // Should not throw, returns original
  const result = cloneJson(obj);
  assert.equal(result, obj);
});
