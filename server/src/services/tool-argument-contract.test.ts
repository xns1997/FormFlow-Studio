import assert from 'node:assert/strict';
import test from 'node:test';
import { compileToolArguments, parameterFailureFingerprint, toolContractSummary } from './tool-argument-contract';

const schema = { type: 'object', required: ['projectId', 'item'], additionalProperties: false, properties: { projectId: { type: 'string' }, enabled: { type: 'boolean' }, count: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } }, item: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, mode: { type: 'string', enum: ['create', 'edit'] } } } } };

test('generic argument contract safely fixes exact aliases and primitive types', () => {
  const result = compileToolArguments('example.update', { project_id: 42, enabled: 'false', count: '3', tags: 'a', item: { id: 9, mode: 'edit' } }, schema);
  assert.equal(result.ok, true); assert.deepEqual(result.arguments, { projectId: '42', enabled: false, count: 3, tags: ['a'], item: { id: '9', mode: 'edit' } }); assert.ok(result.normalizations.length >= 5);
});

test('generic argument contract returns precise repair feedback without inventing values', () => {
  const result = compileToolArguments('example.update', { projectId: 'p', item: { mode: 'wrong' }, extra: true }, schema);
  assert.equal(result.ok, false); if (result.ok) return;
  assert.ok(result.error.issues.some((item) => item.path === 'extra' && item.code === 'UNKNOWN_ARGUMENT'));
  assert.ok(result.error.issues.some((item) => item.path === 'item.id' && item.code === 'REQUIRED_ARGUMENT'));
  assert.ok(result.error.issues.some((item) => item.path === 'item.mode' && item.code === 'INVALID_ARGUMENT_ENUM'));
  assert.match(result.error.correctionInstruction, /不要重启任务/);
});

test('contract summaries and failure fingerprints are concise and stable by shape', () => {
  assert.match(toolContractSummary(schema), /projectId/); const one = parameterFailureFingerprint('x', { code: 'BAD', path: 'item.id' }, { item: { id: 1 } }); const two = parameterFailureFingerprint('x', { code: 'BAD', path: 'item.id' }, { item: { id: 9 } }); assert.equal(one, two);
});

test('generic argument contract enforces numeric bounds and conditional requirements', () => {
  const contract = {
    type: 'object',
    additionalProperties: false,
    properties: {
      scope: { type: 'string', enum: ['global', 'form'] },
      formId: { type: 'string', minLength: 1 },
      pageSize: { type: 'number', minimum: 1, maximum: 500 },
    },
    allOf: [{ if: { properties: { scope: { const: 'form' } } }, then: { required: ['formId'] } }],
  };
  const result = compileToolArguments('example.read', { scope: 'form', pageSize: 501 }, contract);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error.issues.some((item) => item.code === 'CONDITIONAL_REQUIRED_ARGUMENT' && item.path === 'formId'));
  assert.ok(result.error.issues.some((item) => item.code === 'NUMBER_TOO_LARGE' && item.path === 'pageSize'));
});
