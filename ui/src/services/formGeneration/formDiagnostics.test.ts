import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { diagnoseForm, summarizeFormDiagnostics } from './formDiagnostics';

const formWindow = { x: 0, y: 0, width: 980, height: 720, props: {} };

function makeTable(overrides: Partial<SrcTableEntry> = {}): SrcTableEntry {
  return {
    id: 't1',
    fileName: '员工.xlsx',
    fileSize: 1024,
    fileType: 'xlsx',
    uploadedAt: '',
    dataHash: 'abc',
    sheets: [{
      name: '员工',
      rowCount: 3,
      colCount: 2,
      headers: ['姓名', '部门'],
      preview: [
        { 姓名: '张三', 部门: '研发' },
        { 姓名: '李四', 部门: '研发' },
        { 姓名: '王五', 部门: '销售' },
      ],
      columns: [
        { name: '姓名', dataType: 'string', nullable: false, uniqueCount: 3, sampleValues: ['张三', '李四', '王五'], width: 80, visible: true } as any,
        { name: '部门', dataType: 'string', nullable: true, uniqueCount: 2, sampleValues: ['研发', '销售'], width: 80, visible: true } as any,
      ],
      config: {
        id: 'cfg-1',
        tableName: '员工',
        keyFields: [],
        columnWidths: {},
        frozenColumns: 0,
        frozenRows: 0,
        defaultSort: null,
        hiddenColumns: [],
        lockedColumns: [],
        columnDescriptions: {},
        columnTags: {},
        headerHeight: 28,
        rowHeight: 28,
        alternateRowColor: false,
        showGridLines: true,
        showRowNumbers: false,
        autoFitColumns: true,
        filterEnabled: true,
        sortEnabled: true,
        groupByColumn: null,
      } as any,
    }],
    ...overrides,
  };
}

const components: DesignComponent[] = [
  { id: 'name', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名', required: true } },
  { id: 'name-copy', type: 'input', x: 0, y: 80, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } },
  { id: 'save', type: 'button', x: 0, y: 160, width: 120, height: 48, props: { name: 'save', label: '保存' } },
];

test('form diagnostics expose actionable binding, duplicate, hint, and button issues', () => {
  const diagnostics = diagnoseForm(components);
  assert.ok(diagnostics.some((item) => item.id === 'unbound:name' && item.quickFix?.props?.dataBinding));
  assert.ok(diagnostics.some((item) => item.id === 'required-hint:name' && item.quickFix?.props?.placeholder === '请输入姓名'));
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

test('every emitted diagnostic carries an actionable quick fix', () => {
  const components = [
    { id: 'missing', type: 'input', x: 0, y: 0, width: 200, height: 60, props: { label: '姓名' } },
    { id: 'dup-a', type: 'input', x: 0, y: 60, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } },
    { id: 'dup-b', type: 'input', x: 0, y: 120, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } },
    { id: 'options', type: 'select', x: 0, y: 180, width: 200, height: 60, fieldBinding: '部门', props: { name: '部门', options: [] } },
    { id: 'outside', type: 'input', x: -40, y: 240, width: 200, height: 60, fieldBinding: '备注', props: { name: '备注' } },
    { id: 'btn', type: 'button', x: 0, y: 300, width: 120, height: 48, props: { name: 'btn', events: {} } },
  ] as DesignComponent[];
  const workflow = { id: 'wf', name: '坏流程', description: '', nodes: [], edges: [{ id: 'e1', source: 'missing-node', target: 'n2' }], createdAt: '', updatedAt: '' };
  const diagnostics = diagnoseForm(components, [makeTable()], [workflow], formWindow);
  assert.ok(diagnostics.length >= 6);
  for (const item of diagnostics) {
    assert.ok(item.quickFix, `diagnostic ${item.id} should carry a quickFix`);
    assert.ok(item.quickFix!.label.length > 0);
  }
});

test('missing names and duplicates get rename quick fixes', () => {
  const missing = diagnoseForm([{ id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, props: { label: '姓名' } }]).find((item) => item.id === 'missing-name:a');
  assert.ok(missing?.quickFix?.kind === 'component-field');
  assert.equal(missing?.quickFix?.field, '姓名');

  const duplicate = diagnoseForm([
    { id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } },
    { id: 'b', type: 'input', x: 0, y: 60, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } },
  ]).find((item) => item.id === 'duplicate:b');
  assert.ok(duplicate?.quickFix?.kind === 'component-field');
  assert.equal(duplicate?.quickFix?.field, '姓名_2');
});

test('diagnoses empty forms, empty options, off-canvas controls and missing keys', () => {
  const empty = diagnoseForm([], [makeTable()], [], formWindow);
  assert.ok(empty.some((item) => item.id === 'empty-form' && item.quickFix?.kind === 'add-component'));

  const options = diagnoseForm([{ id: 'c', type: 'select', x: 0, y: 0, width: 200, height: 60, fieldBinding: '部门', props: { name: '部门', options: [] } }], [makeTable()]).find((item) => item.id === 'select-no-options:c');
  assert.ok(options?.quickFix?.props?.options);
  assert.ok((options?.quickFix?.props?.options as Array<{ label: string }>).some((option) => option.label === '研发'));

  const offCanvas = diagnoseForm([{ id: 'x', type: 'input', x: -40, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } }], [makeTable()], [], formWindow).find((item) => item.id === 'off-canvas:x');
  assert.ok(offCanvas?.quickFix?.kind === 'component-geometry');
  assert.equal(offCanvas?.quickFix?.geometry?.x, 0);

  const missingKey = diagnoseForm([{ id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } }], [makeTable()]).find((item) => item.id === 'missing-key:t1:员工');
  assert.ok(missingKey?.quickFix?.kind === 'table-config');
});

test('diagnostics tolerate partially generated workflows without node or edge arrays', () => {
  assert.doesNotThrow(() => diagnoseForm([], [], [{ id: 'partial', name: '未完成流程' } as any]));
});
