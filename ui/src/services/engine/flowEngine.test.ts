import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { CURATED_XLSX_METHODS, EXPECTED_NODE_COUNT } from '../../../nodes/registry';
import { execute as modifyRange } from '../../../nodes/func-modify-range/index';
import { editWorksheetStructure } from '../../../nodes/xlsx-worksheet-ops';
import { loadNodeRegistry } from '../../flowRegistry';
import { registerExecutor } from '../../../nodes/executor-registry';
import { executeFlow, selectUpstreamFlow, type FlowEdgeDef, type FlowNodeDef } from './flowEngine';

// Register a slow executor for timeout testing
registerExecutor('test:slow-node', async () => {
  await new Promise((r) => setTimeout(r, 5000));
  return { result: 'done' };
});

const node = (id: string, specId: string, properties: Record<string, unknown> = {}): FlowNodeDef => ({
  id,
  specId,
  position: { x: 0, y: 0 },
  data: { propertiesJson: JSON.stringify(properties) },
});

const edge = (id: string, source: string, target: string, sourcePort: string, targetPort: string): FlowEdgeDef => ({
  id,
  source,
  target,
  sourceHandle: `out:${sourcePort}`,
  targetHandle: `in:${targetPort}`,
});

test('auto-discovered registry has the expected executable nodes with unique IDs and ports', async () => {
  const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
  const packageDirs = readdirSync(join(root, 'nodes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^(func-|behavior-|generic-|ml-)/.test(entry.name))
    .filter((entry) => existsSync(join(root, 'nodes', entry.name, 'schema.json')))
    .map((entry) => entry.name);
  assert.equal(packageDirs.length, 125);
  assert.equal(new Set(packageDirs).size, packageDirs.length);
  assert.equal(CURATED_XLSX_METHODS.size, 14);

  const baseRegistry = await loadNodeRegistry();
  const packageIds = packageDirs.map((dir) => {
    const id = JSON.parse(readFileSync(join(root, 'nodes', dir, 'schema.json'), 'utf8')).id as string;
    return id.startsWith('generic-') ? `generic:${id.slice(8)}` : id.startsWith('ml-') ? `ml:${id.slice(3)}` : id;
  });
  assert.equal(new Set([...baseRegistry.specs.map((spec) => spec.id), ...packageIds]).size, EXPECTED_NODE_COUNT);
  assert.equal(baseRegistry.specs.some((spec) => (spec.kind as string) === 'excel-class'), false);
  for (const spec of baseRegistry.specs) {
    for (const port of spec.ports) {
      if (port.name === 'worksheet') assert.equal(port.type, 'worksheet', `inaccurate worksheet port: ${spec.id}`);
      if (port.name === 'workbook') assert.equal(port.type, 'workbook', `inaccurate workbook port: ${spec.id}`);
    }
  }
  const executorSource = ['generic.ts', 'behavior.ts', 'func.ts', 'ml.ts', 'scenario.ts']
    .map((file) => readFileSync(join(root, 'nodes/executors', file), 'utf8')).join('\n');
  const canonicalIds = new Set<string>();
  for (const dir of packageDirs) {
    const schemaPath = join(root, 'nodes', dir, 'schema.json');
    assert.equal(existsSync(schemaPath), true, `missing schema: ${dir}`);
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const id = schema.id.startsWith('generic-') ? `generic:${schema.id.slice(8)}` : schema.id.startsWith('ml-') ? `ml:${schema.id.slice(3)}` : schema.id;
    assert.equal(canonicalIds.has(id), false, `duplicate id: ${id}`);
    canonicalIds.add(id);
    const portKeys = (schema.ports || []).map((port: any) => `${port.direction}:${port.name}`);
    assert.equal(new Set(portKeys).size, portKeys.length, `duplicate port: ${id}`);
    for (const port of schema.ports || []) {
      if (port.name === 'worksheet') assert.equal(port.type, 'worksheet', `inaccurate worksheet port: ${id}`);
      if (port.name === 'workbook') assert.equal(port.type, 'workbook', `inaccurate workbook port: ${id}`);
    }
    if (id === 'behavior-data-query') {
      assert.equal(schema.ports.find((port: any) => port.direction === 'output' && port.name === 'data')?.type, 'json-rows');
      assert.equal(schema.ports.find((port: any) => port.direction === 'output' && port.name === 'result')?.type, 'json-rows');
    }
    const hasExecutor = executorSource.includes(`registerExecutor('${id}'`) || existsSync(join(root, 'nodes', dir, 'index.ts'));
    assert.equal(hasExecutor, true, `missing executor: ${id}`);
  }

  assert.equal(existsSync(join(root, 'nodes/excel-api-registry.ts')), false);
});

test('selectUpstreamFlow includes every transitive predecessor and excludes unrelated nodes', () => {
  const nodes = [node('root', 'generic:value-input'), node('middle', 'generic:output-display'), node('target', 'generic:output-display'), node('other', 'generic:value-input')];
  const edges = [edge('a', 'root', 'middle', 'value', 'value'), edge('b', 'middle', 'target', 'value', 'value')];
  const selected = selectUpstreamFlow(nodes, edges, 'target');
  assert.deepEqual(selected.nodes.map((item) => item.id), ['root', 'middle', 'target']);
  assert.deepEqual(selected.edges.map((item) => item.id), ['a', 'b']);
});

test('target execution starts at the first upstream node and transfers the exact named port', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('source', 'generic:value-input', { name: 'answer', valueType: 'number', value: 42 }),
    node('target', 'generic:output-display'),
    node('unrelated', 'generic:value-input', { valueType: 'string', value: 'do not run' }),
  ];
  const result = await executeFlow(nodes, [edge('value', 'source', 'target', 'value', 'value')], [], { targetNodeId: 'target' });
  assert.equal(result.success, true);
  assert.deepEqual([...result.nodeResults.keys()], ['source', 'target']);
  assert.equal(result.nodeResults.get('target')?.outputs.value, 42);
  assert.equal(result.nodeResults.has('unrelated'), false);
});

test('external variables override matching value-input nodes by name', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('source', 'generic:value-input', { name: 'customerName', valueType: 'string', value: '默认值' }),
    node('target', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [edge('value', 'source', 'target', 'value', 'value')], [], {
    variables: { customerName: '表单传入值' },
  });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('source')?.outputs.value, '表单传入值');
  assert.equal(result.nodeResults.get('target')?.outputs.value, '表单传入值');
});

test('choice-input normalizes static options and exposes both single and collection outputs', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('choice', 'generic:choice-input', {
      selectionMode: 'single',
      displayMode: 'select',
      optionsSource: 'static',
      options: [
        { label: '通过', value: 'approved' },
        { label: '驳回', value: 'rejected' },
      ],
      defaultValue: 'approved',
    }),
  ], []);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('choice')?.outputs.value, 'approved');
  assert.deepEqual(result.nodeResults.get('choice')?.outputs.values, ['approved']);
  assert.deepEqual(result.nodeResults.get('choice')?.outputs.selectedOption, { label: '通过', value: 'approved' });
  assert.deepEqual(result.nodeResults.get('choice')?.outputs.selectedOptions, [{ label: '通过', value: 'approved' }]);
});

test('removed workflow nodes fail explicitly instead of executing legacy logic', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('legacy', 'generic:variable-input', { varName: 'customerName', varType: 'string', varValue: '旧值' }),
  ], []);
  assert.equal(result.success, false);
  assert.match(result.errors.join('\n'), /节点已移除，不可执行: generic:variable-input/);
});

test('behavior-row-lookup returns patches for unique hit and warnings for miss or multiple hits', async () => {
  await loadNodeRegistry();
  const table = {
    id: 'product_catalog',
    fileName: '商品档案.json',
    fileSize: 1,
    fileType: 'json' as const,
    uploadedAt: '2026-07-02T00:00:00.000Z',
    dataHash: 'lookup-test',
    sheets: [{
      name: '商品档案',
      rowCount: 3,
      colCount: 3,
      headers: ['商品编号', '商品名称', '状态'],
      columns: [],
      preview: [
        { 商品编号: 'P-1', 商品名称: '鼠标', 状态: '上架' },
        { 商品编号: 'P-2', 商品名称: '键盘', 状态: '上架' },
        { 商品编号: 'P-3', 商品名称: '键盘', 状态: '下架' },
      ],
    }],
  };

  const hit = await executeFlow([
    node('lookup', 'behavior-row-lookup', {
      tableId: 'product_catalog',
      sheetName: '商品档案',
      loadedFieldName: 'loadedProductId',
      loadedColumn: '商品编号',
      enableComponentId: 'save_button',
      fieldMap: { 商品编号: 'productId', 商品名称: 'productName' },
      originalFieldMap: { 商品名称: 'originalProductName' },
    }),
  ], [], [table], {
    nodeInputs: { lookup: { filter: { 商品编号: 'P-1', 商品名称: '鼠标' } } },
  });
  assert.equal(hit.success, true, hit.errors.join('\n'));
  assert.equal(hit.nodeResults.get('lookup')?.outputs.matched, true);
  assert.equal(hit.sideEffects.some((effect) => effect.kind === 'set-component-disabled' && effect.componentId === 'save_button' && effect.disabled === false), true);
  assert.equal(hit.sideEffects.some((effect) => effect.kind === 'set-form-value' && effect.field === 'loadedProductId' && effect.value === 'P-1'), true);

  const miss = await executeFlow([
    node('lookup', 'behavior-row-lookup', {
      tableId: 'product_catalog',
      sheetName: '商品档案',
      loadedFieldName: 'loadedProductId',
      loadedColumn: '商品编号',
      enableComponentId: 'save_button',
    }),
  ], [], [table], {
    nodeInputs: { lookup: { filter: { 商品编号: 'P-404', 商品名称: '不存在' } } },
  });
  assert.equal(miss.success, true, miss.errors.join('\n'));
  assert.equal(miss.nodeResults.get('lookup')?.outputs.matched, false);
  assert.equal(miss.nodeResults.get('lookup')?.outputs.message, '未找到匹配记录');
  assert.equal(miss.sideEffects.some((effect) => effect.kind === 'set-component-disabled' && effect.disabled === true), true);

  const multiple = await executeFlow([
    node('lookup', 'behavior-row-lookup', {
      tableId: 'product_catalog',
      sheetName: '商品档案',
      loadedFieldName: 'loadedProductId',
      loadedColumn: '商品编号',
    }),
  ], [], [table], {
    nodeInputs: { lookup: { filter: { 商品名称: '键盘' } } },
  });
  assert.equal(multiple.success, true, multiple.errors.join('\n'));
  assert.equal(multiple.nodeResults.get('lookup')?.outputs.matched, false);
  assert.equal(multiple.nodeResults.get('lookup')?.outputs.message, '匹配到多条记录，请收窄条件');
});

test('behavior submit falls back to sheet single-key config when writeBackKeyField is omitted', async () => {
  await loadNodeRegistry();
  const table = {
    id: 'product_catalog',
    fileName: '商品档案.json',
    fileSize: 1,
    fileType: 'json' as const,
    uploadedAt: '2026-07-02T00:00:00.000Z',
    dataHash: 'submit-key-test',
    sheets: [{
      name: '商品档案',
      rowCount: 1,
      colCount: 3,
      headers: ['商品编号', '商品名称', '状态'],
      columns: [],
      preview: [
        { 商品编号: 'P-1', 商品名称: '鼠标', 状态: '上架' },
      ],
      config: {
        id: 'product_catalog:商品档案',
        tableName: '商品档案',
        keyFields: ['商品编号'],
        columnWidths: {},
        frozenColumns: 0,
        frozenRows: 0,
        defaultSort: null,
        hiddenColumns: [],
        lockedColumns: [],
        columnDescriptions: {},
        columnTags: {},
        headerHeight: 36,
        rowHeight: 28,
        alternateRowColor: true,
        showGridLines: true,
        autoFitColumns: true,
        filterEnabled: true,
        sortEnabled: true,
        groupByColumn: null,
      },
    }],
  };
  const result = await executeFlow([
    node('submit', 'behavior:submit', {
      writeBackMode: 'upsert',
      writeBackTableId: 'product_catalog',
      writeBackSheetName: '商品档案',
      writeBackKeyFormField: 'productId',
      writeBackFieldMap: {
        productId: '商品编号',
        productName: '商品名称',
      },
    }),
  ], [], [table], {
    nodeInputs: {
      submit: {
        formData: { productId: 'P-1', productName: '鼠标 Pro' },
        originalData: { productId: 'P-1', productName: '鼠标' },
      },
    },
  });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('submit')?.outputs.writeBack, {
    kind: 'upsert-table-row',
    tableId: 'product_catalog',
    sheetName: '商品档案',
    keyField: '商品编号',
    keyValue: 'P-1',
    row: { 商品编号: 'P-1', 商品名称: '鼠标 Pro' },
  });
});

test('connected inputs take precedence over direct external port injection', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('source', 'generic:value-input', { valueType: 'string', value: '来自连线' }),
    node('target', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [edge('value', 'source', 'target', 'value', 'value')], [], {
    nodeInputs: { target: { value: '来自表单直传' } },
  });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('target')?.outputs.value, '来自连线');
});

test('property input overrides feed unconnected ports but still yield to connected edges', async () => {
  await loadNodeRegistry();
  const direct = await executeFlow([
    node('display', 'generic:output-display', { __inputOverrides: { value: '来自输入覆盖' } }),
  ], []);
  assert.equal(direct.success, true, direct.errors.join('\n'));
  assert.equal(direct.nodeResults.get('display')?.outputs.value, '来自输入覆盖');

  const connected = await executeFlow([
    node('source', 'generic:value-input', { valueType: 'string', value: '来自连线' }),
    node('display', 'generic:output-display', { __inputOverrides: { value: '来自输入覆盖' } }),
  ], [
    edge('display-value', 'source', 'display', 'value', 'value'),
  ]);
  assert.equal(connected.success, true, connected.errors.join('\n'));
  assert.equal(connected.nodeResults.get('display')?.outputs.value, '来自连线');
});

test('multiple upstream edges on one input port honor the configured selected edge id', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('left', 'generic:value-input', { valueType: 'string', value: '来自左侧' }),
    node('right', 'generic:value-input', { valueType: 'string', value: '来自右侧' }),
    node('target', 'generic:output-display', { __inputSelections: { value: 'edge-left' } }),
  ], [
    edge('edge-left', 'left', 'target', 'value', 'value'),
    edge('edge-right', 'right', 'target', 'value', 'value'),
  ]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('target')?.outputs.value, '来自左侧');
});

test('behavior js script honors dynamic input and output definitions', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('amount', 'generic:value-input', { name: 'amount', valueType: 'number', value: 12 }),
    node('script', 'behavior-js-script', {
      inputPorts: { amount: 'number' },
      outputPorts: { doubled: 'number' },
      script: 'return { doubled: inputs.amount * 2 };',
    }),
  ], [
    edge('amount-script', 'amount', 'script', 'value', 'amount'),
  ]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('script')?.outputs.doubled, 24);
});

test('behavior js script maps primitive returns to the first dynamic output', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('script', 'behavior-js-script', {
      outputPorts: { total: 'number' },
      script: 'return 7;',
    }),
  ], []);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('script')?.outputs.total, 7);
});

test('XLSX methods publish results under their declared output port name', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('rows', 'generic:value-input', { name: 'rows', valueType: 'array', value: [{ name: 'Ada' }] }),
    node('sheet', 'method:XLSX.utils.json_to_sheet'),
  ];
  const result = await executeFlow(nodes, [edge('data', 'rows', 'sheet', 'value', 'data')]);
  assert.equal(result.success, true);
  assert.equal(typeof result.nodeResults.get('sheet')?.outputs.worksheet, 'object');
  assert.equal((result.nodeResults.get('sheet')?.outputs.worksheet as any)['!ref'], 'A1:A2');
});

test('merged filter and sort nodes expose stable result ports', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('rows', 'generic:value-input', { valueType: 'array', value: [{ name: 'Ada', score: 98 }, { name: 'Lin', score: 80 }, { name: 'Jo', score: 92 }] }),
    node('filter', 'generic:filter', { field: 'score', operator: '>', value: 85 }),
    node('sort', 'generic:sort', { field: 'score', order: 'desc' }),
  ];
  const result = await executeFlow(nodes, [
    edge('filter-input', 'rows', 'filter', 'value', 'data'),
    edge('sort-input', 'filter', 'sort', 'result', 'data'),
  ]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('sort')?.outputs.rows, [{ name: 'Ada', score: 98 }, { name: 'Jo', score: 92 }]);
  assert.equal(result.nodeResults.get('sort')?.outputs.count, 2);
});

test('criteria-filter supports multi-condition filtering and ignores disabled rules', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('rows', 'generic:value-input', { valueType: 'array', value: [
      { 型号: 'A', 介质: '清水', PN: 16, 连接方式: '法兰' },
      { 型号: 'B', 介质: '清水', PN: 25, 连接方式: '法兰' },
      { 型号: 'C', 介质: '蒸汽', PN: 25, 连接方式: '对夹' },
    ] }),
    node('criteria', 'generic:criteria-filter', {
      criteria: [
        { field: '介质', operator: '==', value: '清水' },
        { field: 'PN', operator: '>=', value: 16 },
        { field: '连接方式', operator: '==', value: '法兰', enabled: false },
      ],
    }),
  ];
  const result = await executeFlow(nodes, [edge('criteria-input', 'rows', 'criteria', 'value', 'data')]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('criteria')?.outputs.rows, [
    { 型号: 'A', 介质: '清水', PN: 16, 连接方式: '法兰' },
    { 型号: 'B', 介质: '清水', PN: 25, 连接方式: '法兰' },
  ]);
  assert.equal(result.nodeResults.get('criteria')?.outputs.count, 2);
});

test('pick-record sorts by multiple fields and returns first plus topN rows', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('rows', 'generic:value-input', { valueType: 'array', value: [
      { 型号: 'A', 推荐优先级: 2, 成本档位: 2, 交期档位: 1 },
      { 型号: 'B', 推荐优先级: 1, 成本档位: 3, 交期档位: 2 },
      { 型号: 'C', 推荐优先级: 1, 成本档位: 1, 交期档位: 3 },
    ] }),
    node('pick', 'generic:pick-record', {
      pickMode: 'topN',
      topN: 2,
      sorts: [
        { field: '推荐优先级', order: 'asc' },
        { field: '成本档位', order: 'asc' },
        { field: '交期档位', order: 'asc' },
      ],
    }),
  ];
  const result = await executeFlow(nodes, [edge('pick-input', 'rows', 'pick', 'value', 'data')]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal((result.nodeResults.get('pick')?.outputs.first as Record<string, unknown>).型号, 'C');
  assert.deepEqual((result.nodeResults.get('pick')?.outputs.rows as Array<Record<string, unknown>>).map((row) => row.型号), ['C', 'B']);
  assert.equal(result.nodeResults.get('pick')?.outputs.count, 3);
});

test('set-values produces multiple form patches and supports empty patch fallback', async () => {
  await loadNodeRegistry();
  const hit = await executeFlow([
    node('record', 'generic:value-input', { valueType: 'object', value: { 型号: 'CV100', 推荐说明: '优先推荐' } }),
    node('records', 'generic:value-input', { valueType: 'array', value: [{ 型号: 'CV100' }, { 型号: 'CV120' }] }),
    node('count', 'generic:value-input', { valueType: 'number', value: 2 }),
    node('patch', 'behavior-set-values', {
      staticPatch: { 无结果提示: '' },
      fieldMap: {
        推荐主型号: ['$record.推荐主型号', '$record.型号'],
        推荐说明: '$record.推荐说明',
        候选清单: '$records',
        匹配数量: '$count',
      },
      emptyPatch: { 无结果提示: '无匹配结果' },
    }),
  ], [
    edge('record-input', 'record', 'patch', 'value', 'record'),
    edge('records-input', 'records', 'patch', 'value', 'records'),
    edge('count-input', 'count', 'patch', 'value', 'count'),
  ]);
  assert.equal(hit.success, true, hit.errors.join('\n'));
  assert.equal(hit.sideEffects.filter((effect) => effect.kind === 'set-form-value').length, 5);

  const miss = await executeFlow([
    node('patch', 'behavior-set-values', {
      staticPatch: { 推荐主型号: '' },
      emptyPatch: { 无结果提示: '无匹配结果', 匹配数量: 0 },
    }),
  ], []);
  assert.equal(miss.success, true, miss.errors.join('\n'));
  assert.equal(miss.sideEffects.some((effect) => effect.kind === 'set-form-value' && effect.field === '无结果提示' && effect.value === '无匹配结果'), true);
});

test('crud helper behavior nodes cover query sequence fill validation and reset', async () => {
  await loadNodeRegistry();
  const table = {
    id: 'employees',
    fileName: 'employees.json',
    fileSize: 1,
    fileType: 'json' as const,
    uploadedAt: '2026-07-02T00:00:00.000Z',
    dataHash: 'crud-test',
    sheets: [{
      name: '员工信息',
      rowCount: 3,
      colCount: 3,
      headers: ['员工ID', '姓名', '部门'],
      columns: [],
      preview: [
        { 员工ID: 1001, 姓名: '张三', 部门: '技术部' },
        { 员工ID: 1002, 姓名: '李四', 部门: '技术部' },
        { 员工ID: 1003, 姓名: '王五', 部门: '销售部' }
      ],
    }],
  };
  const query = await executeFlow([
    node('query', 'behavior-query-list', {
      tableId: 'employees',
      sheetName: '员工信息',
      resultField: '员工列表',
      messageField: '处理提示',
      successMessage: '已加载 {count} 条记录',
    }),
  ], [], [table], {
    nodeInputs: { query: { criteria: { 部门: '技术部' } } },
  });
  assert.equal(query.success, true, query.errors.join('\n'));
  assert.equal(query.nodeResults.get('query')?.outputs.count, 2);
  assert.equal(query.sideEffects.some((effect) => effect.kind === 'set-form-value' && effect.field === '员工列表'), true);

  const next = await executeFlow([
    node('seq', 'behavior-next-sequence', {
      tableId: 'employees',
      sheetName: '员工信息',
      column: '员工ID',
      targetField: '员工ID',
      start: 1000,
      step: 5,
    }),
  ], [], [table]);
  assert.equal(next.success, true, next.errors.join('\n'));
  assert.equal(next.nodeResults.get('seq')?.outputs.value, 1008);

  const duplicateSheetTables = [
    {
      id: 'employees_a',
      fileName: 'employees-a.json',
      fileSize: 1,
      fileType: 'json' as const,
      uploadedAt: '2026-07-02T00:00:00.000Z',
      dataHash: 'employees_a',
      sheets: [{
        name: '员工信息',
        rowCount: 1,
        colCount: 1,
        headers: ['来源'],
        columns: [],
        preview: [{ 来源: 'A' }],
      }],
    },
    {
      id: 'employees_b',
      fileName: 'employees-b.json',
      fileSize: 1,
      fileType: 'json' as const,
      uploadedAt: '2026-07-02T00:00:00.000Z',
      dataHash: 'employees_b',
      sheets: [{
        name: '员工信息',
        rowCount: 1,
        colCount: 1,
        headers: ['来源'],
        columns: [],
        preview: [{ 来源: 'B' }],
      }],
    },
  ];
  const preciseQuery = await executeFlow([
    node('query-sheet', 'behavior-data-query', {
      tableId: 'employees_b',
      sheetName: '员工信息',
    }),
  ], [], duplicateSheetTables);
  assert.equal(preciseQuery.success, true, preciseQuery.errors.join('\n'));
  assert.deepEqual(preciseQuery.nodeResults.get('query-sheet')?.outputs.data, [{ 来源: 'B' }]);
  assert.deepEqual(preciseQuery.nodeResults.get('query-sheet')?.outputs.result, [{ 来源: 'B' }]);
  assert.equal(preciseQuery.nodeResults.get('query-sheet')?.outputs.tableId, 'employees_b');

  const fill = await executeFlow([
    node('record', 'generic:value-input', { valueType: 'object', value: { 姓名: '李四', 部门: '技术部' } }),
    node('fill', 'behavior-fill-form', {
      fieldMap: { 姓名: '姓名', 部门: '部门' },
      originalFieldMap: { 姓名: '原始姓名' },
      enableComponentIds: ['save_button'],
      messageField: '处理提示',
    }),
  ], [
    edge('fill-record', 'record', 'fill', 'value', 'record'),
  ]);
  assert.equal(fill.success, true, fill.errors.join('\n'));
  assert.equal(fill.nodeResults.get('fill')?.outputs.matched, true);
  assert.equal(fill.sideEffects.some((effect) => effect.kind === 'set-component-disabled' && effect.componentId === 'save_button' && effect.disabled === false), true);

  const requireCheck = await executeFlow([
    node('check', 'behavior-require-fields', {
      fields: ['姓名', '手机号'],
      messageTemplate: '缺少：{fields}',
    }),
  ], [], [], {
    nodeInputs: { check: { formData: { 姓名: '张三', 手机号: '' } } },
  });
  assert.equal(requireCheck.success, true, requireCheck.errors.join('\n'));
  assert.equal(requireCheck.nodeResults.get('check')?.outputs.valid, false);
  assert.deepEqual(requireCheck.nodeResults.get('check')?.outputs.missingFields, ['手机号']);

  const reset = await executeFlow([
    node('reset', 'behavior-reset-form', {
      clearFields: ['姓名', '手机号'],
      defaults: { 状态: '草稿', 员工ID: 1008 },
      preserveFields: ['部门'],
      message: '表单已重置，可继续录入。',
    }),
  ], [], [], {
    nodeInputs: { reset: { formData: { 姓名: '张三', 手机号: '13800000000', 部门: '技术部' } } },
  });
  assert.equal(reset.success, true, reset.errors.join('\n'));
  assert.equal(reset.sideEffects.some((effect) => effect.kind === 'set-form-value' && effect.field === '状态' && effect.value === '草稿'), true);
  assert.equal(reset.sideEffects.some((effect) => effect.kind === 'show-message' && effect.message === '表单已重置，可继续录入。'), true);
});

test('criteria-filter, pick-record and set-values compose into a recommendation flow', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('rows', 'generic:value-input', { valueType: 'array', value: [
      { 型号: 'CV100', 介质: '清水', PN: 16, 推荐优先级: 2, 成本档位: 2 },
      { 型号: 'CV120', 介质: '清水', PN: 25, 推荐优先级: 1, 成本档位: 1 },
      { 型号: 'CV200', 介质: '蒸汽', PN: 25, 推荐优先级: 1, 成本档位: 3 },
    ] }),
    node('filter', 'generic:criteria-filter', {
      criteria: [
        { field: '介质', operator: '==', value: '清水' },
        { field: 'PN', operator: '>=', value: 16 },
      ],
    }),
    node('pick', 'generic:pick-record', {
      pickMode: 'topN',
      topN: 2,
      sorts: [
        { field: '推荐优先级', order: 'asc' },
        { field: '成本档位', order: 'asc' },
      ],
    }),
    node('set', 'behavior-set-values', {
      staticPatch: { 无结果提示: '' },
      fieldMap: {
        推荐主型号: '$record.型号',
        候选清单: '$records',
        匹配数量: '$count',
      },
      emptyPatch: { 推荐主型号: '', 候选清单: [], 匹配数量: 0, 无结果提示: '无匹配结果' },
    }),
  ];
  const result = await executeFlow(nodes, [
    edge('filter-input', 'rows', 'filter', 'value', 'data'),
    edge('pick-input', 'filter', 'pick', 'rows', 'data'),
    edge('set-record', 'pick', 'set', 'first', 'record'),
    edge('set-records', 'pick', 'set', 'rows', 'records'),
    edge('set-count', 'pick', 'set', 'count', 'count'),
  ]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.sideEffects.some((effect) => effect.kind === 'set-form-value' && effect.field === '推荐主型号' && effect.value === 'CV120'), true);
});

test('json-rows input accepts project sheet wrapper and normalizes to preview rows', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('filter', 'generic:criteria-filter', {
      __inputOverrides: {
        data: {
          __fromProject: true,
          tableId: 'table-1',
          sheetName: 'Sheet1',
          headers: ['name', 'score'],
          preview: [
            { name: 'Ada', score: 98 },
            { name: 'Lin', score: 95 },
          ],
          rowCount: 2,
          colCount: 2,
        },
      },
      criteria: [{ field: 'score', operator: '>=', value: 96 }],
    }),
  ], []);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('filter')?.outputs.rows, [{ name: 'Ada', score: 98 }]);
});

test('merged export node supports every configured format with stable outputs', async () => {
  await loadNodeRegistry();
  for (const format of ['xlsx', 'csv', 'json', 'html']) {
    const nodes = [
      node('rows', 'generic:value-input', { valueType: 'array', value: [{ name: 'Ada', score: 98 }] }),
      node('export', 'generic:export', { format, fileName: 'report' }),
    ];
    const result = await executeFlow(nodes, [edge('export-input', 'rows', 'export', 'value', 'data')]);
    assert.equal(result.success, true, `${format}: ${result.errors.join('\n')}`);
    assert.equal(result.nodeResults.get('export')?.outputs.fileName, `report.${format}`);
    assert.equal(typeof result.nodeResults.get('export')?.outputs.mimeType, 'string');
    assert.notEqual(result.nodeResults.get('export')?.outputs.result, undefined);
  }
});

test('merged submit node produces success and a field-level change log', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('original', 'generic:value-input', { valueType: 'object', value: { name: 'Ada', score: 90 } }),
    node('form', 'generic:value-input', { valueType: 'object', value: { name: 'Ada', score: 98 } }),
    node('submit', 'behavior:submit'),
  ];
  const result = await executeFlow(nodes, [
    edge('original-input', 'original', 'submit', 'value', 'originalData'),
    edge('form-input', 'form', 'submit', 'value', 'formData'),
  ]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('submit')?.outputs.changeLog, { score: { oldValue: 90, newValue: 98 } });
  assert.equal((result.nodeResults.get('submit')?.outputs.success as any).event, 'submitSuccess');
});

test('address toolkit covers retained cell, range, row and column operations', async () => {
  await loadNodeRegistry();
  const cases: Array<[string, unknown, unknown]> = [
    ['decodeCell', 'C4', { c: 2, r: 3 }],
    ['encodeCell', { c: 2, r: 3 }, 'C4'],
    ['decodeColumn', 'C', 2],
    ['encodeRow', 3, '4'],
  ];
  for (const [operation, value, expected] of cases) {
    const nodes = [
      node('value', 'generic:value-input', { valueType: typeof value === 'object' ? 'object' : typeof value, value }),
      node('toolkit', 'scenario:cell-address-toolkit', { operation }),
    ];
    const result = await executeFlow(nodes, [edge('toolkit-input', 'value', 'toolkit', 'value', 'value')]);
    assert.equal(result.success, true, `${operation}: ${result.errors.join('\n')}`);
    assert.deepEqual(result.nodeResults.get('toolkit')?.outputs.result, expected);
  }
});

test('range intersection node returns a complex range with disjoint areas', async () => {
  await loadNodeRegistry();
  const left = {
    kind: 'complex-range',
    areas: [
      { s: { r: 0, c: 0 }, e: { r: 2, c: 1 } },
      { s: { r: 0, c: 3 }, e: { r: 2, c: 4 } },
    ],
    address: 'Data!A1:B3,D1:E3',
    sheetName: 'Data',
  };
  const right = { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } };
  const result = await executeFlow([
    node('left', 'generic:value-input', { valueType: 'object', value: left }),
    node('right', 'generic:value-input', { valueType: 'object', value: right }),
    node('intersection', 'generic:range-intersection'),
  ], [
    edge('left-range', 'left', 'intersection', 'value', 'left'),
    edge('right-range', 'right', 'intersection', 'value', 'right'),
  ]);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('intersection')?.outputs.areaCount, 2);
  assert.equal(result.nodeResults.get('intersection')?.outputs.cellCount, 4);
  assert.equal(result.nodeResults.get('intersection')?.outputs.address, 'Data!A2:B2,D2:E2');
});

test('range selector node returns exact complex areas and grouped values', async () => {
  await loadNodeRegistry();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['A1', 'B1', 'C1', 'D1', 'E1'],
    ['A2', 'B2', 'C2', 'D2', 'E2'],
    ['A3', 'B3', 'C3', 'D3', 'E3'],
  ]);
  const result = await executeFlow([
    node('worksheet', 'generic:value-input', { valueType: 'object', value: worksheet }),
    node('range', 'generic:sheet-source', { sourceMode: 'range', rangeMode: 'address', address: 'A1:B2,D2:E3' }),
  ], [edge('worksheet-range', 'worksheet', 'range', 'value', 'worksheet')]);
  assert.equal(result.success, true, result.errors.join('\n'));
  const outputs = result.nodeResults.get('range')?.outputs;
  assert.equal(outputs?.areaCount, 2);
  assert.equal(outputs?.cellCount, 8);
  assert.equal(outputs?.address, 'A1:B2,D2:E3');
  assert.deepEqual(outputs?.areaValues, [
    [['A1', 'B1'], ['A2', 'B2']],
    [['D2', 'E2'], ['D3', 'E3']],
  ]);
  assert.equal((outputs?.range as any)?.kind, 'complex-range');
});

test('a missing named source port fails explicitly instead of silently using another value', async () => {
  await loadNodeRegistry();
  const nodes = [node('source', 'generic:value-input', { valueType: 'string', value: 'hello' }), node('target', 'generic:output-display')];
  const result = await executeFlow(nodes, [edge('bad', 'source', 'target', 'missing', 'value')]);
  assert.equal(result.success, false);
  assert.match(result.nodeResults.get('target')?.error || '', /没有输出端口 "missing"/);
});

test('cycles are rejected before any node executes', async () => {
  const nodes = [node('a', 'generic:output-display'), node('b', 'generic:output-display')];
  const result = await executeFlow(nodes, [edge('ab', 'a', 'b', 'value', 'value'), edge('ba', 'b', 'a', 'value', 'value')]);
  assert.equal(result.success, false);
  assert.equal(result.nodeResults.size, 0);
  assert.match(result.errors[0], /环路/);
});

test('the default project-data chain executes end to end through every declared port', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('file', 'generic:file-source', { selectedFile: 'sample.csv' }),
    node('read', 'method:XLSX.read'),
    node('sheet', 'generic:sheet-source', { sourceMode: 'worksheet', worksheetMode: 'byName', sheetName: 'Sheet1' }),
    node('json', 'method:XLSX.utils.sheet_to_json'),
  ];
  const edges = [
    edge('file-read', 'file', 'read', 'data', 'data'),
    edge('read-sheet', 'read', 'sheet', 'workbook', 'workbook'),
    edge('sheet-json', 'sheet', 'json', 'worksheet', 'worksheet'),
  ];
  const tables = [{
    id: 'table-1', fileName: 'sample.csv', fileSize: 10, fileType: 'csv' as const,
    uploadedAt: new Date(0).toISOString(), dataHash: 'hash',
    sheets: [{
      name: 'Sheet1', rowCount: 2, colCount: 2, headers: ['name', 'score'],
      columns: [], preview: [{ name: 'Ada', score: 98 }, { name: 'Lin', score: 95 }],
    }],
  }];
  const result = await executeFlow(nodes, edges, tables);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('json')?.outputs.headers, ['name', 'score']);
  assert.deepEqual(result.nodeResults.get('json')?.outputs.rows, [{ name: 'Ada', score: 98 }, { name: 'Lin', score: 95 }]);
});

test('row and column structure operations preserve cells, formulas and merged ranges', () => {
  const worksheet: any = XLSX.utils.aoa_to_sheet([
    ['A', 'B', 'Total'],
    [1, 2],
    [3, 4],
  ]);
  worksheet.C2 = { t: 'n', f: 'A2+B2', v: 3 };
  worksheet['!merges'] = [XLSX.utils.decode_range('A3:B3')];

  const insertedRows = editWorksheetStructure(worksheet, 'row', 'insert', 2, 1).worksheet;
  assert.equal(insertedRows.A3.v, 1);
  assert.equal(insertedRows.C3.f, 'A3+B3');
  assert.equal(XLSX.utils.encode_range(insertedRows['!merges'][0]), 'A4:B4');

  const deletedRows = editWorksheetStructure(insertedRows, 'row', 'delete', 2, 1).worksheet;
  assert.equal(deletedRows.A2.v, 1);
  assert.equal(deletedRows.C2.f, 'A2+B2');

  const insertedColumns = editWorksheetStructure(deletedRows, 'column', 'insert', 2, 1).worksheet;
  assert.equal(insertedColumns.C2.v, 2);
  assert.equal(insertedColumns.D2.f, 'A2+C2');

  const deletedColumns = editWorksheetStructure(insertedColumns, 'column', 'delete', 2, 1).worksheet;
  assert.equal(deletedColumns.B2.v, 2);
  assert.equal(deletedColumns.C2.f, 'A2+B2');
});

test('modified worksheet is committed into the original workbook and saved with other sheets intact', async () => {
  await loadNodeRegistry();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Name', 'Score'], ['Ada', 1], ['Bob', 2]]), 'Data');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Keep'], ['untouched']]), 'Other');

  const flowNodes = [
    node('source', 'generic:value-input', { valueType: 'object', value: workbook }),
    node('select', 'generic:sheet-source', { sourceMode: 'worksheet', worksheetMode: 'byName', sheetName: 'Data' }),
    node('insert', 'generic:insert-rows', { index: 2, count: 1 }),
    node('commit', 'generic:worksheet-commit'),
    node('save', 'generic:workbook-save', { fileName: 'changed', bookType: 'xlsx' }),
  ];
  const flowEdges = [
    edge('source-select', 'source', 'select', 'value', 'workbook'),
    edge('select-insert', 'select', 'insert', 'worksheet', 'worksheet'),
    edge('select-commit-workbook', 'select', 'commit', 'workbook', 'workbook'),
    edge('insert-commit-sheet', 'insert', 'commit', 'worksheet', 'worksheet'),
    edge('select-commit-name', 'select', 'commit', 'sheetName', 'sheetName'),
    edge('commit-save', 'commit', 'save', 'workbook', 'workbook'),
  ];
  const result = await executeFlow(flowNodes, flowEdges);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('save')?.outputs.fileName, 'changed.xlsx');

  const fileData = result.nodeResults.get('save')?.outputs.fileData as ArrayBuffer;
  const saved = XLSX.read(fileData, { type: 'array' });
  assert.deepEqual(saved.SheetNames, ['Data', 'Other']);
  assert.deepEqual(XLSX.utils.sheet_to_json(saved.Sheets.Other, { header: 1 }), [['Keep'], ['untouched']]);
  assert.deepEqual(XLSX.utils.sheet_to_json(saved.Sheets.Data, { header: 1, defval: null }), [
    ['Name', 'Score'],
    [null, null],
    ['Ada', 1],
    ['Bob', 2],
  ]);
});

test('modify range node converts project-backed data into a real editable worksheet', () => {
  const projectWorksheet = {
    __fromProject: true,
    sheetName: 'Data',
    headers: ['Name', 'Score'],
    preview: [{ Name: 'Ada', Score: 1 }],
  };
  const worksheet = (modifyRange([projectWorksheet, [[99]], 'B2'], {}) as any).worksheet;
  assert.equal(worksheet.B2.v, 99);
  assert.equal(worksheet.__fromProject, undefined);
  assert.equal((worksheet as any).__sourceSheetName, 'Data');
});

test('onNodeFailure skip allows downstream nodes to execute', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('input', 'generic:value-input', { valueType: 'number', value: 10 }),
    node('fail', 'generic:custom-js', { code: 'throw new Error("forced failure")' }),
    node('output', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [
    edge('e1', 'input', 'fail', 'value', '_args'),
    edge('e2', 'fail', 'output', 'value', 'value'),
  ], [], { onNodeFailure: 'skip' });
  assert.equal(result.success, false);
  assert.equal(result.nodeResults.get('fail')?.success, false);
  assert.equal(result.nodeResults.has('output'), true);
});

test('timeoutMs aborts flow after specified duration', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('slow', 'test:slow-node'),
  ];
  const result = await executeFlow(nodes, [], [], { timeoutMs: 100 });
  assert.equal(result.success, false);
  assert.match(result.errors[0] || '', /执行超时/);
});

test('nodeTimeoutMs aborts a slow node after specified duration', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('slow', 'test:slow-node'),
  ];
  const result = await executeFlow(nodes, [], [], { nodeTimeoutMs: 100 });
  assert.equal(result.success, false);
  assert.match(result.nodeResults.get('slow')?.error || '', /执行超时/);
});

test('timeoutMs allows fast flow to complete', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('input', 'generic:value-input', { valueType: 'number', value: 42 }),
    node('output', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [edge('e1', 'input', 'output', 'value', 'value')], [], { timeoutMs: 5000 });
  assert.equal(result.success, true);
  assert.equal(result.nodeResults.get('output')?.outputs.value, 42);
});

test('nodeTimeoutMs allows fast node to complete', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('input', 'generic:value-input', { valueType: 'number', value: 42 }),
    node('output', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [edge('e1', 'input', 'output', 'value', 'value')], [], { nodeTimeoutMs: 5000 });
  assert.equal(result.success, true);
  assert.equal(result.nodeResults.get('output')?.outputs.value, 42);
});

test('condition-branch routes to true or false output', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('input', 'generic:value-input', { valueType: 'number', value: 15 }),
    node('branch', 'generic:condition-branch', { expression: 'value > 10' }),
    node('true-out', 'generic:output-display'),
    node('false-out', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [
    edge('e1', 'input', 'branch', 'value', 'value'),
    edge('e2-true', 'branch', 'true-out', 'trueBranch', 'value'),
    edge('e2-false', 'branch', 'false-out', 'falseBranch', 'value'),
  ]);
  assert.equal(result.success, true);
  assert.equal(result.nodeResults.get('branch')?.outputs.result, true);
  assert.equal(result.nodeResults.get('true-out')?.outputs.value, 15);
});
