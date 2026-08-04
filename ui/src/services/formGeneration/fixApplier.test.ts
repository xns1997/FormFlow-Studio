import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { diagnoseForm } from './formDiagnostics';
import { applyDiagnosticFix, applyDiagnosticFixes, type FixOperations } from './fixApplier';

const formWindow = { x: 0, y: 0, width: 980, height: 720, props: {} };

function makeTable(keyFields: string[] = []): SrcTableEntry {
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
        keyFields,
        keyValidation: keyFields.length ? { hasNulls: false, duplicateCount: 0, valid: false, checkedAt: '2026-01-01T00:00:00Z' } : undefined,
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
  };
}

interface Calls {
  props: Array<[string, Record<string, unknown>]>;
  field: Array<[string, string]>;
  geometry: Array<[string, Record<string, unknown>]>;
  add: Array<[string, { x?: number; y?: number } | undefined]>;
  workflow: Array<[string, Record<string, unknown>]>;
  table: Array<[string, string, Record<string, unknown>]>;
  navigate: string[];
}

function makeOps(overrides: Partial<FixOperations> = {}) {
  const calls: Calls = { props: [], field: [], geometry: [], add: [], workflow: [], table: [], navigate: [] };
  const ops: FixOperations = {
    updateComponentProps: (id, patch) => { calls.props.push([id, patch]); },
    updateComponentField: (id, field) => { calls.field.push([id, field]); },
    updateComponentGeometry: (id, geometry) => { calls.geometry.push([id, geometry]); },
    addComponent: (type, position) => { calls.add.push([type, position]); return `new-${type}`; },
    updateWorkflow: (id, patch) => { calls.workflow.push([id, patch]); },
    updateTableSheetConfig: (id, sheet, patch) => { calls.table.push([id, sheet, patch]); },
    navigateTo: (target) => { calls.navigate.push(target); },
    ...overrides,
  };
  return { ops, calls };
}

test('component-props quick fix applies props through the designer operation', () => {
  const components = [{ id: 'name', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } }] as DesignComponent[];
  const [unbound] = diagnoseForm(components);
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(unbound, { components, tables: [], workflows: [] }, ops);
  assert.equal(outcome.ok, true);
  assert.equal(calls.props[0][0], 'name');
  assert.ok(calls.props[0][1].dataBinding);
});

test('component-field quick fix renames the component field', () => {
  const components = [{ id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, props: { label: '姓名' } }] as DesignComponent[];
  const [missing] = diagnoseForm(components);
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(missing, { components, tables: [], workflows: [] }, ops);
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls.field[0], ['a', '姓名']);
});

test('workflow-patch quick fix removes broken edges', () => {
  const workflow = { id: 'wf', name: '流程', description: '', nodes: [{ id: 'n1', type: 'x', specId: 's', position: { x: 0, y: 0 }, data: {} }], edges: [{ id: 'e1', source: 'missing', target: 'n1' }], createdAt: '', updatedAt: '' };
  const broken = diagnoseForm([], [], [workflow]).find((item) => item.id.startsWith('broken-edge:'));
  assert.ok(broken);
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(broken!, { components: [], tables: [], workflows: [workflow] }, ops);
  assert.equal(outcome.ok, true);
  assert.equal(calls.workflow[0][0], 'wf');
  assert.deepEqual((calls.workflow[0][1] as any).edges, []);
});

test('table-config quick fix auto-picks a unique non-null key column', () => {
  const components = [{ id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } }] as DesignComponent[];
  const table = makeTable();
  const missing = diagnoseForm(components, [table]).find((item) => item.id === 'missing-key:t1:员工');
  assert.ok(missing);
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(missing!, { components, tables: [table], workflows: [] }, ops);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.kind, 'applied');
  assert.equal(calls.table[0][0], 't1');
  assert.deepEqual((calls.table[0][2] as any).keyFields, ['姓名']);
  assert.equal((calls.table[0][2] as any).keyValidation.valid, true);
});

test('table-config quick fix revalidates an invalid key against current preview', () => {
  const components = [{ id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } }] as DesignComponent[];
  const table = makeTable(['姓名']);
  const invalid = diagnoseForm(components, [table]).find((item) => item.id === 'invalid-key:t1:员工');
  assert.ok(invalid);
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(invalid!, { components, tables: [table], workflows: [] }, ops);
  assert.equal(outcome.ok, true);
  assert.equal((calls.table[0][2] as any).keyValidation.valid, true);
});

test('table-config quick fix navigates to data workspace when no unique key exists', () => {
  const dupTable = makeTable(['姓名']);
  dupTable.sheets[0].preview = [
    { 姓名: '张三', 部门: '研发' },
    { 姓名: '张三', 部门: '研发' },
    { 姓名: '李四', 部门: '销售' },
  ];
  const components = [{ id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } }] as DesignComponent[];
  const invalid = diagnoseForm(components, [dupTable]).find((item) => item.id === 'invalid-key:t1:员工');
  assert.ok(invalid);
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(invalid!, { components, tables: [dupTable], workflows: [] }, ops);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.kind, 'navigated');
  assert.deepEqual(calls.navigate, ['data']);
});

test('one-click fix-all rechecks between fixes and resolves cascading issues', () => {
  const components = [{ id: 'btn', type: 'button', x: 0, y: 0, width: 120, height: 48, props: { name: 'btn', flowTriggers: { onClick: { enabled: true } } } }] as DesignComponent[];
  const current = [...components];
  const { ops } = makeOps({
    updateComponentProps: (id, patch) => {
      const index = current.findIndex((item) => item.id === id);
      current[index] = { ...current[index], props: { ...current[index].props, ...patch } };
    },
  });
  const initial = diagnoseForm(current);
  assert.ok(initial.some((item) => item.id === 'invalid-flow:btn:onClick'));
  const summary = applyDiagnosticFixes(initial, { components: current, tables: [], workflows: [] }, ops, {
    recheck: () => diagnoseForm(current),
  });
  assert.ok(summary.applied >= 2, `expected invalid-flow + button-action fixes, got ${JSON.stringify(summary)}`);
  assert.deepEqual(diagnoseForm(current), []);
});

test('add-component quick fix inserts a default control', () => {
  const [empty] = diagnoseForm([], [], [], formWindow);
  assert.equal(empty.id, 'empty-form');
  const { ops, calls } = makeOps();
  const outcome = applyDiagnosticFix(empty, { components: [], tables: [], workflows: [] }, ops);
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls.add[0][0], 'input');
  assert.equal(calls.add[0][1]?.x, 16);
});

test('navigate-only quick fixes are excluded from fix-all but work individually', () => {
  const component = { id: 'a', type: 'input', x: 0, y: 0, width: 200, height: 60, fieldBinding: '姓名', props: { name: '姓名' } } as DesignComponent;
  const diagnostic = {
    id: 'invalid-key:t1:员工',
    severity: 'error' as const,
    title: '主键不可用',
    detail: '',
    quickFix: { label: '前往数据工作区', kind: 'navigate' as const, navigateTo: 'data' as const, auto: false },
  };
  const { ops, calls } = makeOps();
  const single = applyDiagnosticFix(diagnostic, { components: [component], tables: [], workflows: [] }, ops);
  assert.equal(single.ok, true);
  assert.deepEqual(calls.navigate, ['data']);

  calls.navigate.length = 0;
  const summary = applyDiagnosticFixes([diagnostic], { components: [component], tables: [], workflows: [] }, ops);
  assert.equal(summary.applied, 0);
  assert.equal(summary.remainingCount, 1);
  assert.deepEqual(calls.navigate, []);
});
