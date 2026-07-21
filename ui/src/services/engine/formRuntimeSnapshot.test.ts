import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticRuntimeSnapshot, maskRuntimeValues } from './formRuntimeSnapshot';

test('runtime snapshots mask sensitive values by field name', () => {
  const masked = maskRuntimeValues({ 姓名: '张三', 手机号: '13800138000', apiToken: 'secret', 数量: 3 });
  assert.equal(masked.姓名, '张三');
  assert.deepEqual(masked.手机号, { masked: true, type: 'string', length: 11, present: true });
  assert.equal((masked.apiToken as any).masked, true);
  assert.equal(masked.数量, 3);
});

test('synthetic snapshots are derived from form defaults without side effects', () => {
  const snapshot = createSyntheticRuntimeSnapshot('form-a', [{ id: 'name', type: 'input', x: 0, y: 0, width: 100, height: 40, fieldBinding: '姓名', props: { defaultValue: '李雷', required: true } }], []);
  assert.equal(snapshot.source, 'synthetic');
  assert.equal(snapshot.values.姓名, '李雷');
  assert.equal(snapshot.componentStates.name.required, true);
});
