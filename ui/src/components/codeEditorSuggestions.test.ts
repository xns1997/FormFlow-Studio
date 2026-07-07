import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowFile } from '../project/types';
import { createEventContextExtraLib, createEventContextSuggestions, createFlowParameterSuggestions } from './codeEditorSuggestions';

const workflow: WorkflowFile = {
  id: 'flow-1', name: '客户审批', description: '',
  nodes: [{
    id: 'input', type: 'flow-node', specId: 'generic:variable-input', position: { x: 0, y: 0 },
    data: { propertiesJson: JSON.stringify({ varName: 'customerName' }) },
  }],
  edges: [], createdAt: '', updatedAt: '',
};

test('event suggestions are generated from current fields, event and workflows', () => {
  const suggestions = createEventContextSuggestions({
    fields: [{ name: 'customerName', type: 'string' }, { name: 'active', type: 'boolean' }],
    workflows: [workflow],
    eventName: 'onChange',
    currentField: 'active',
  });
  assert.ok(suggestions.some((item) => item.label === 'ctx.values.customerName'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.value' && item.detail?.includes('boolean')));
  assert.ok(suggestions.some((item) => item.label === 'ctx.values.active' && item.detail?.includes('boolean')));
  assert.ok(suggestions.some((item) => item.label === '运行流程 客户审批' && item.insertText?.includes('flow-1')));
  assert.ok(suggestions.some((item) => item.label === 'typed async callback' && item.insertText?.includes('FormEventContext')));
  assert.ok(suggestions.some((item) => item.label === 'ctx.previousValue'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.detail.previousValue'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.controls'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.controls.customerName.value'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.controls.active.disabled'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.setValues'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.setFieldState'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.focusField'));
  assert.ok(suggestions.some((item) => item.label === 'ctx.switchTab'));
  assert.ok(suggestions.some((item) => item.label === '批量赋值模板'));
});

test('flow parameter suggestions include declared variables and current form fields', () => {
  const suggestions = createFlowParameterSuggestions(workflow, ['customerName', 'address']);
  assert.ok(suggestions.some((item) => item.label === 'customerName' && item.scope === 'json-object-key'));
  assert.ok(suggestions.some((item) => item.label === '$form.address' && JSON.stringify(item.scope).includes('json-string-value')));
  assert.ok(suggestions.some((item) => item.label === '节点参数 input.port'));
  assert.ok(suggestions.some((item) => item.label === '$value' && JSON.stringify(item.scope).includes('json-object-value')));
  assert.ok(suggestions.some((item) => item.label === '$component'));
  assert.ok(suggestions.some((item) => item.label === '参数 customerName' && JSON.stringify(item.scope).includes('top-level')));
});

test('event extra lib carries current field and value typing', () => {
  const lib = createEventContextExtraLib({
    filePath: 'inmemory://model/test-event.d.ts',
    fields: [{ name: 'active', type: 'boolean' }, { name: 'employeeId', type: 'string' }],
    currentField: 'active',
    eventName: 'onChange',
  });
  assert.equal(lib.filePath, 'inmemory://model/test-event.d.ts');
  assert.match(lib.content, /type CurrentEventValue = boolean;/);
  assert.match(lib.content, /value: CurrentEventValue;/);
  assert.match(lib.content, /"active"\?: boolean;/);
  assert.match(lib.content, /setValue<K extends EventFieldName>/);
  assert.match(lib.content, /getValues<K extends EventFieldName>/);
  assert.match(lib.content, /setValues\(patch:/);
  assert.match(lib.content, /toggleVisible\(componentId: string\): Promise<boolean>;/);
  assert.match(lib.content, /focusField<K extends EventFieldName>/);
  assert.match(lib.content, /switchTab\(tabIdOrIndex: string \| number\): Promise<void>;/);
  assert.match(lib.content, /detail: \{ previousValue: CurrentEventValue;/);
  assert.match(lib.content, /changedFields: EventFieldName\[\]/);
  assert.match(lib.content, /interface FormEventControlHandle/);
  assert.match(lib.content, /controls: Record<string, FormEventControlHandle>;/);
});

test('event-specific suggestions follow the selected behavior event', () => {
  const tab = createEventContextSuggestions({ eventName: 'onTabChange' });
  assert.ok(tab.some((item) => item.label === 'ctx.detail.index'));
  assert.ok(tab.some((item) => item.label === 'ctx.detail.previousIndex'));
  assert.ok(!tab.some((item) => item.label === 'ctx.detail.files'));
  const drop = createEventContextSuggestions({ eventName: 'onDrop' });
  assert.ok(drop.some((item) => item.label === 'ctx.detail.files'));
});
