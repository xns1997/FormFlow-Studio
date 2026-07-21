import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent } from '../../project/types';
import { diagnoseForm, summarizeFormDiagnostics } from './formDiagnostics';

const components: DesignComponent[] = [
  { id: 'name', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名', required: true } },
  { id: 'name-copy', type: 'input', x: 0, y: 80, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } },
  { id: 'save', type: 'button', x: 0, y: 160, width: 120, height: 48, props: { name: 'save', label: '保存' } },
];

test('form diagnostics expose actionable binding, duplicate, hint, and button issues', () => {
  const diagnostics = diagnoseForm(components);
  assert.ok(diagnostics.some((item) => item.id === 'unbound:name' && item.quickFix?.props.dataBinding));
  assert.ok(diagnostics.some((item) => item.id === 'required-hint:name' && item.quickFix?.props.placeholder === '请输入姓名'));
  assert.ok(diagnostics.some((item) => item.id === 'duplicate:name-copy'));
  assert.ok(diagnostics.some((item) => item.id === 'button-action:save'));
  const summary = summarizeFormDiagnostics(diagnostics);
  assert.equal(summary.ready, false);
  assert.ok(summary.score < 100);
});

test('valid bound field and wired button pass core diagnostics', () => {
  const valid: DesignComponent[] = [
    { id: 'name', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名', placeholder: '请输入姓名', dataBinding: { version: 1, source: { kind: 'formField', path: '姓名' }, direction: 'twoWay' } } },
    { id: 'save', type: 'button', x: 0, y: 80, width: 120, height: 48, props: { name: 'save', events: { onClick: 'ctx.submit();' } } },
  ];
  assert.deepEqual(diagnoseForm(valid), []);
});

test('button diagnostics reject empty handlers and invalid workflow triggers', () => {
  const button = (props: Record<string, unknown>): DesignComponent => ({ id: 'query', type: 'button', x: 0, y: 0, width: 120, height: 48, props });
  assert.ok(diagnoseForm([button({ events: {} })]).some((item) => item.id === 'button-action:query'));
  assert.ok(diagnoseForm([button({ events: { onClick: '   ' } })]).some((item) => item.id === 'button-action:query'));
  assert.ok(diagnoseForm([button({ flowTriggers: { onClick: { enabled: true } } })]).some((item) => item.id === 'invalid-flow:query:onClick'));
  assert.ok(diagnoseForm([button({ flowTriggers: { onClick: { enabled: true, workflowId: 'missing' } } })]).some((item) => item.id === 'missing-flow:query:onClick'));
  assert.deepEqual(diagnoseForm([button({ flowTriggers: { onClick: { enabled: true, workflowId: 'query-workflow' } } })], [], [{ id: 'query-workflow', name: '查询', nodes: [], edges: [] } as any]), []);
});

test('diagnostics detect linkage cycles, conflicting writes and broken workflow edges', () => {
  const linked = [
    { id: 'a', type: 'input', x: 0, y: 0, width: 100, height: 40, fieldBinding: 'A', props: { name: 'A', dataBinding: { version: 1, source: { kind: 'formField', path: 'A' }, direction: 'twoWay' }, linkageRules: { onChange: [{ actions: [{ type: 'setValue', targetField: 'B', value: 1 }, { type: 'setValue', targetField: 'B', value: 2 }] }] } } },
    { id: 'b', type: 'input', x: 0, y: 50, width: 100, height: 40, fieldBinding: 'B', props: { name: 'B', dataBinding: { version: 1, source: { kind: 'formField', path: 'B' }, direction: 'twoWay' }, linkageRules: { onChange: [{ actions: [{ type: 'setValue', targetField: 'A', value: 1 }] }] } } },
  ] as DesignComponent[];
  const workflow = { id: 'wf', name: '坏流程', description: '', nodes: [], edges: [{ id: 'e', source: 'missing-a', target: 'missing-b' }], createdAt: '', updatedAt: '' };
  const ids = diagnoseForm(linked, [], [workflow]).map((item) => item.id);
  assert.ok(ids.some((id) => id.startsWith('write-conflict:')));
  assert.ok(ids.some((id) => id.startsWith('linkage-cycle:')));
  assert.ok(ids.some((id) => id.startsWith('broken-edge:')));
});

test('diagnostics tolerate partially generated workflows without node or edge arrays', () => {
  assert.doesNotThrow(() => diagnoseForm([], [], [{ id: 'partial', name: '未完成流程' } as any]));
});
