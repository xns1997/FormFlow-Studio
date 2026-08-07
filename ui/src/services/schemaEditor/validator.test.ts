import assert from 'node:assert/strict';
import test from 'node:test';
import { validateJsonSchema, type JsonSchema } from './validator';

test('validator enforces primitive types and type unions', () => {
  assert.deepEqual(validateJsonSchema(1, { type: 'string' }), [{ path: '$', message: '类型必须为 string，实际为 number' }]);
  assert.deepEqual(validateJsonSchema(null, { type: ['object', 'null'] }), []);
  assert.deepEqual(validateJsonSchema({}, { type: ['object', 'null'] }), []);
});

test('validator checks required, enum, pattern and numeric bounds', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 2 },
      mode: { enum: ['a', 'b'] },
      count: { type: 'number', minimum: 0, maximum: 10 },
    },
    additionalProperties: false,
  };
  const violations = validateJsonSchema({ mode: 'c', count: 12, extra: 1 }, schema);
  const messages = violations.map((v) => `${v.path}:${v.message}`).join('|');
  assert.match(messages, /缺少必填字段 "id"/);
  assert.match(messages, /枚举值之一/);
  assert.match(messages, /不能大于 10/);
  assert.match(messages, /未知字段 "extra"/);
});

test('validator checks array items and min/max length', () => {
  assert.deepEqual(
    validateJsonSchema([1, 'x'], { type: 'array', items: { type: 'number' } }),
    [{ path: '$[1]', message: '类型必须为 number，实际为 string' }],
  );
  assert.deepEqual(validateJsonSchema('ab', { type: 'string', maxLength: 1 }), [{ path: '$', message: '长度不能大于 1' }]);
});

test('validator accepts empty schema (any value)', () => {
  assert.deepEqual(validateJsonSchema({ anything: [1, 2] }, {}), []);
});
