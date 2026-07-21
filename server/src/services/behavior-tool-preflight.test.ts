import assert from 'node:assert/strict';
import test from 'node:test';
import { compileBehaviorToolArguments } from './behavior-tool-preflight';

const base = { projectId: 'behavior-project', scope: 'form', formId: 'inspection-form', baseRevision: 'revision-1', idempotencyKey: 'behavior-operation' };

test('behavior preflight rejects the empty setValue shape found in the failure report', () => {
  const result = compileBehaviorToolArguments('behavior.upsert', { ...base, behavior: { id: 'device_auto_fill', name: '设备自动带出', trigger: { type: 'fieldChange', fieldName: '设备编号' }, conditions: [], actions: [{ type: 'setValue', targetField: '设备名称', expression: '' }] } });
  assert.equal(result.ok, false); if (result.ok) return;
  assert.equal(result.error.code, 'BEHAVIOR_SET_VALUE_EMPTY');
  assert.equal(result.error.path, 'behavior.actions[0].expression');
  assert.ok(result.error.suggestedArguments);
});

test('behavior preflight accepts complete structured actions and exact scopes', () => {
  const valid = compileBehaviorToolArguments('behavior.upsert', { ...base, behavior: { id: 'status_message', name: '状态提示', trigger: { type: 'fieldChange', fieldName: '状态' }, conditions: [], actions: [{ type: 'showMessage', message: '状态已变化', messageType: 'info' }] } });
  assert.equal(valid.ok, true);
  const missingForm = compileBehaviorToolArguments('behavior.list', { projectId: 'behavior-project', scope: 'form' });
  assert.equal(missingForm.ok, false); if (!missingForm.ok) assert.equal(missingForm.error.code, 'BEHAVIOR_FORM_REQUIRED');
  const badOptions = compileBehaviorToolArguments('behavior.upsert', { ...base, behavior: { id: 'options', name: '选项', trigger: { type: 'fieldChange', fieldName: '设备编号' }, conditions: [], actions: [{ type: 'setOptions', targetField: '设备名称', optionsConfig: { table: 'equipment' } }] } });
  assert.equal(badOptions.ok, false); if (!badOptions.ok) assert.equal(badOptions.error.code, 'BEHAVIOR_OPTIONS_CONFIG_INVALID');
});

test('behavior delete requires an exact target identity', () => {
  const result = compileBehaviorToolArguments('behavior.delete', { projectId: 'behavior-project', scope: 'global' });
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'BEHAVIOR_ID_REQUIRED');
});

test('behavior preflight rejects frozen-v2 unknown fields with a corrected shape', () => {
  const result = compileBehaviorToolArguments('behavior.upsert', { ...base, behavior: { id: 'lookup', name: '设备带出', description: '非冻结字段', trigger: { type: 'fieldChange', fieldName: '设备编号' }, conditions: [], actions: [{ type: 'setValue', targetField: '设备名称', expression: '$设备编号' }] } });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'BEHAVIOR_UNKNOWN_FIELD');
  assert.equal((result.error.suggestedArguments as any)?.behavior?.description, undefined);
});

test('behavior preflight refuses unsupported table lookup expressions', () => {
  const result = compileBehaviorToolArguments('behavior.upsert', { ...base, behavior: { id: 'lookup', name: '设备带出', trigger: { type: 'fieldChange', fieldName: '设备编号' }, conditions: [], actions: [{ type: 'setValue', targetField: '设备名称', expression: 'equipment[设备编号=$设备编号].设备名称' }] } });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'BEHAVIOR_EXPRESSION_UNSUPPORTED');
});
