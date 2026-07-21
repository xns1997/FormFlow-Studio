import assert from 'node:assert/strict';
import test from 'node:test';
import { renameFieldReferences } from './fieldSynchronization';

test('field rename synchronizes bindings, linkage targets and workflow field maps without rewriting prose', () => {
  const components = [{ id: 'a', type: 'input', x: 0, y: 0, width: 1, height: 1, fieldBinding: '旧字段', props: { name: '旧字段', label: '旧字段说明', dataBinding: { source: { kind: 'formField', path: '旧字段' } }, linkageRules: { onChange: [{ actions: [{ targetField: '旧字段' }] }] } } }] as any;
  const workflows = [{ id: 'wf', name: 'wf', description: '', nodes: [{ id: 'n', type: 'x', specId: 'form:save', position: { x: 0, y: 0 }, data: { propertiesJson: JSON.stringify({ keyField: '旧字段', fieldMap: { 旧字段: '旧字段' } }) } }], edges: [], createdAt: '', updatedAt: '' }] as any;
  const result = renameFieldReferences(components, workflows, '旧字段', '新字段');
  assert.equal(result.components[0].fieldBinding, '新字段');
  assert.equal(result.components[0].props.label, '旧字段说明');
  assert.equal(result.components[0].props.linkageRules.onChange[0].actions[0].targetField, '新字段');
  const props = JSON.parse(result.workflows[0].nodes[0].data.propertiesJson);
  assert.deepEqual(props.fieldMap, { 新字段: '新字段' });
});
