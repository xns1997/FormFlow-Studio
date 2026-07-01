import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from './structuredProperties';

test('all object-like schema types and runtime objects use the structured editor', () => {
  for (const type of ['object', 'array', 'json', 'json-rows', 'aoa', 'headers', 'options', 'style', 'filter', 'sort-config', 'validation-rule', 'json-string', 'string[]', 'object[]', 'unknown[][]']) {
    assert.equal(isStructuredProperty(type, ''), true, type);
  }
  assert.equal(isStructuredProperty('any', { field: 'value' }), true);
  assert.equal(isStructuredProperty('range', { address: 'A1' }), false);
  assert.equal(isStructuredProperty('string', 'plain'), false);
});

test('structured JSON formatting and parsing preserve object values', () => {
  assert.equal(formatStructuredProperty({ employeeId: '员工编号' }), '{\n  "employeeId": "员工编号"\n}');
  assert.equal(formatStructuredProperty('[object Object]', {}, 'json'), '{}');
  assert.equal(formatStructuredProperty('{"active":true}', {}, 'json-string'), '{\n  "active": true\n}');
  assert.deepEqual(parseStructuredProperty('{"name":"姓名"}', 'json'), { value: { name: '姓名' } });
  assert.deepEqual(parseStructuredProperty('{"name":"姓名"}', 'json-string'), { value: '{"name":"姓名"}' });
  assert.deepEqual(parseStructuredProperty('["姓名"]', 'string[]'), { value: ['姓名'] });
  assert.equal(parseStructuredProperty('[{"name":"姓名"}]', 'object[]').error, undefined);
  assert.equal(parseStructuredProperty('[["姓名"]]', 'unknown[][]').error, undefined);
  assert.match(parseStructuredProperty('{', 'json').error || '', /JSON|Expected|property|position/i);
  assert.equal(parseStructuredProperty('{}', 'array').error, '必须是 JSON 数组');
  assert.equal(parseStructuredProperty('["姓名",1]', 'string[]').error, '必须是字符串数组');
});
