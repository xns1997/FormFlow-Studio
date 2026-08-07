import assert from 'node:assert/strict';
import test from 'node:test';
import { nodePropertiesToJsonSchema, propDefToJsonSchema, schemaPropertyToJsonSchema } from './converters';

test('nodePropertiesToJsonSchema maps required props, enums and numeric bounds', () => {
  const schema = nodePropertiesToJsonSchema([
    { name: 'url', label: 'URL', type: 'string', required: true, description: 'url' },
    { name: 'method', label: '方法', type: 'enum', enum: ['GET', 'POST'], description: 'm' },
    { name: 'retries', label: '重试', type: 'number', min: 0, max: 5, description: 'r' },
  ]);
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['url']);
  assert.equal(schema.properties!.url.type, 'string');
  assert.deepEqual(schema.properties!.method.enum, ['GET', 'POST']);
  assert.deepEqual(schema.properties!.retries, { type: 'number', minimum: 0, maximum: 5 });
});

test('schemaPropertyToJsonSchema maps structured port types', () => {
  assert.deepEqual(schemaPropertyToJsonSchema({ type: 'json-rows' }), { type: 'array', items: { type: 'object' } });
  assert.deepEqual(schemaPropertyToJsonSchema({ type: 'object' }), { type: 'object' });
  assert.deepEqual(schemaPropertyToJsonSchema({ type: 'string[]' }), { type: 'array', items: { type: 'string' } });
  assert.deepEqual(schemaPropertyToJsonSchema({ type: 'any' }), {});
});

test('propDefToJsonSchema maps composite editors to per-key schemas', () => {
  const schema = propDefToJsonSchema({
    kind: 'composite',
    key: 'tabs',
    keys: ['tabs'],
    label: '标签页',
    editor: 'tabs',
  });
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['tabs']);
  assert.deepEqual(schema.properties!.tabs, { type: 'array' });
});

test('propDefToJsonSchema maps array/object/json primitive types', () => {
  assert.deepEqual(propDefToJsonSchema({ key: 'opts', label: '选项', type: 'array' }), { type: 'array' });
  assert.deepEqual(propDefToJsonSchema({ key: 'data', label: '数据', type: 'json' }), { type: 'object' });
  assert.deepEqual(propDefToJsonSchema({ key: 'names', label: '名称', type: 'string[]' }), { type: 'array', items: { type: 'string' } });
});
