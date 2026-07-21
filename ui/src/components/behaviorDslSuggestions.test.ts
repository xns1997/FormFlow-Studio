import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { createBehaviorDslSuggestions, resolveBehaviorDslCompletionContext } from './behaviorDslSuggestions';

test('behavior DSL suggestions combine syntax and project context', () => {
  const component = { id: 'tech-stack', type: 'input', props: { label: '技术栈' } } as DesignComponent;
  const table = { id: 'employees', fileName: '员工表.xlsx', sheets: [] } as unknown as SrcTableEntry;
  const workflow = { id: 'approval', name: '审批流程', nodes: [], edges: [] } as unknown as WorkflowFile;
  const suggestions = createBehaviorDslSuggestions({ fields: ['部门', '数量'], components: [component], tables: [table], workflows: [workflow] });
  assert.ok(suggestions.some((item) => item.label.startsWith('when $字段')));
  assert.ok(suggestions.some((item) => item.label === '$部门' && item.insertText === '$部门'));
  assert.ok(suggestions.some((item) => item.label === '@技术栈' && item.insertText === '@tech-stack' && item.scope === 'action-component'));
  assert.ok(suggestions.some((item) => item.label === '员工表.xlsx' && item.insertText === '"employees"' && item.scope === 'action-table'));
  assert.ok(suggestions.some((item) => item.label === '审批流程' && item.insertText === '"approval"' && item.scope === 'action-workflow'));
});

test('behavior DSL completion context follows grammar positions', () => {
  const resolve = (linePrefix: string) => resolveBehaviorDslCompletionContext({ fullPrefix: linePrefix, linePrefix, completionPrefix: linePrefix });
  assert.equal(resolve('when '), 'condition-field');
  assert.equal(resolve('when $部门 '), 'condition-operator');
  assert.equal(resolve('when $部门 == '), 'condition-value');
  assert.equal(resolve('when $部门 == "技术部" -> '), 'action');
  assert.equal(resolve('when $部门 == "技术部" -> show('), 'action-component');
  assert.equal(resolve('on change($'), 'condition-field');
  assert.equal(resolve('on change($省份) -> options($城市, '), 'action-table');
});
