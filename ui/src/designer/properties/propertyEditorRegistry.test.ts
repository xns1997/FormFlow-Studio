import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluatePropCondition, getPropertyEditor, getPropertyEditorDescriptor, mergeCompositePatch, registerPropertyEditor, resolvePropertyEditorKind,
} from './propertyEditorRegistry';

test('属性编辑器支持注册、查询与类型回退', () => {
  const editor = (() => null) as any;
  registerPropertyEditor('test-editor', editor);
  assert.equal(getPropertyEditor('test-editor'), editor);
  assert.equal(resolvePropertyEditorKind({ key: 'enabled', label: '启用', type: 'boolean' }), 'switch');
  assert.equal(resolvePropertyEditorKind({ key: 'config', label: '配置', type: 'object' }), 'json');
  assert.equal(resolvePropertyEditorKind({ key: 'pattern', label: '正则', type: 'string', editor: 'regex' }), 'regex');
});

test('编辑器描述符支持按需加载且不破坏旧注册 API', async () => {
  const editor = (() => null) as any;
  registerPropertyEditor({ kind: 'lazy-test', load: async () => ({ default: editor }), supportsSource: true, contextNeeds: ['fields'] });
  const descriptor = getPropertyEditorDescriptor('lazy-test');
  assert.equal(descriptor?.supportsSource, true);
  assert.deepEqual(descriptor?.contextNeeds, ['fields']);
  assert.equal((await descriptor?.load?.())?.default, editor);
  assert.equal(getPropertyEditor('lazy-test'), undefined);
});

test('条件元数据和 Composite patch 合并保持可序列化', () => {
  const values = { validator: 'pattern', enabled: true, mode: 'advanced' };
  assert.equal(evaluatePropCondition({ key: 'validator', value: 'pattern' }, values), true);
  assert.equal(evaluatePropCondition([{ key: 'enabled', operator: 'truthy' }, { key: 'mode', values: ['advanced'], operator: 'in' }], values), true);
  assert.deepEqual(mergeCompositePatch(['min', 'max'], { min: 1, max: 8, ignored: 10 }), { min: 1, max: 8 });
});
