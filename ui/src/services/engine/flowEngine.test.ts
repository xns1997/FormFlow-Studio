import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { CURATED_XLSX_METHODS, EXPECTED_NODE_COUNT } from '../../nodes/registry';
import { execute as modifyRange } from '../../nodes/func-modify-range/index';
import { editWorksheetStructure } from '../../nodes/xlsx-worksheet-ops';
import { loadNodeRegistry } from '../../flowRegistry';
import { executeFlow, selectUpstreamFlow, type FlowEdgeDef, type FlowNodeDef } from './flowEngine';

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

test('auto-discovered registry has 134 executable nodes with unique IDs and ports', async () => {
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const packageDirs = readdirSync(join(root, 'nodes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^(func-|behavior-|generic-|ml-)/.test(entry.name))
    .filter((entry) => existsSync(join(root, 'nodes', entry.name, 'schema.json')))
    .map((entry) => entry.name);
  assert.equal(packageDirs.length, 103);
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
    const hasExecutor = executorSource.includes(`registerExecutor('${id}'`) || existsSync(join(root, 'nodes', dir, 'index.ts'));
    assert.equal(hasExecutor, true, `missing executor: ${id}`);
  }

  assert.equal(existsSync(join(root, 'nodes/excel-api-registry.ts')), false);
});

test('selectUpstreamFlow includes every transitive predecessor and excludes unrelated nodes', () => {
  const nodes = [node('root', 'generic:text-input'), node('middle', 'generic:output-display'), node('target', 'generic:output-display'), node('other', 'generic:text-input')];
  const edges = [edge('a', 'root', 'middle', 'value', 'value'), edge('b', 'middle', 'target', 'value', 'value')];
  const selected = selectUpstreamFlow(nodes, edges, 'target');
  assert.deepEqual(selected.nodes.map((item) => item.id), ['root', 'middle', 'target']);
  assert.deepEqual(selected.edges.map((item) => item.id), ['a', 'b']);
});

test('target execution starts at the first upstream node and transfers the exact named port', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('source', 'generic:variable-input', { varName: 'answer', varType: 'number', varValue: 42 }),
    node('target', 'generic:output-display'),
    node('unrelated', 'generic:text-input', { value: 'do not run' }),
  ];
  const result = await executeFlow(nodes, [edge('value', 'source', 'target', 'value', 'value')], [], { targetNodeId: 'target' });
  assert.equal(result.success, true);
  assert.deepEqual([...result.nodeResults.keys()], ['source', 'target']);
  assert.equal(result.nodeResults.get('target')?.outputs.value, 42);
  assert.equal(result.nodeResults.has('unrelated'), false);
});

test('external variables override matching variable-input nodes by varName', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('source', 'generic:variable-input', { varName: 'customerName', varType: 'string', varValue: '默认值' }),
    node('target', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [edge('value', 'source', 'target', 'value', 'value')], [], {
    variables: { customerName: '表单传入值' },
  });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('source')?.outputs.value, '表单传入值');
  assert.equal(result.nodeResults.get('target')?.outputs.value, '表单传入值');
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
    node('source', 'generic:text-input', { value: '来自连线' }),
    node('target', 'generic:output-display'),
  ];
  const result = await executeFlow(nodes, [edge('value', 'source', 'target', 'value', 'value')], [], {
    nodeInputs: { target: { value: '来自表单直传' } },
  });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.equal(result.nodeResults.get('target')?.outputs.value, '来自连线');
});

test('behavior js script honors dynamic input and output definitions', async () => {
  await loadNodeRegistry();
  const result = await executeFlow([
    node('amount', 'generic:variable-input', { varName: 'amount', varType: 'number', varValue: 12 }),
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
    node('rows', 'generic:variable-input', { varName: 'rows', varType: 'array', varValue: [{ name: 'Ada' }] }),
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
    node('rows', 'generic:variable-input', { varType: 'array', varValue: [{ name: 'Ada', score: 98 }, { name: 'Lin', score: 80 }, { name: 'Jo', score: 92 }] }),
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

test('merged export node supports every configured format with stable outputs', async () => {
  await loadNodeRegistry();
  for (const format of ['xlsx', 'csv', 'json', 'html']) {
    const nodes = [
      node('rows', 'generic:variable-input', { varType: 'array', varValue: [{ name: 'Ada', score: 98 }] }),
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
    node('original', 'generic:variable-input', { varType: 'object', varValue: { name: 'Ada', score: 90 } }),
    node('form', 'generic:variable-input', { varType: 'object', varValue: { name: 'Ada', score: 98 } }),
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
      node('value', 'generic:variable-input', { varType: typeof value === 'object' ? 'object' : typeof value, varValue: value }),
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
    node('left', 'generic:variable-input', { varType: 'object', varValue: left }),
    node('right', 'generic:variable-input', { varType: 'object', varValue: right }),
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
    node('worksheet', 'generic:variable-input', { varType: 'object', varValue: worksheet }),
    node('range', 'generic:range-select', { rangeMode: 'address', address: 'A1:B2,D2:E3' }),
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
  const nodes = [node('source', 'generic:text-input', { value: 'hello' }), node('target', 'generic:output-display')];
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
    node('file', 'generic:file-picker', { selectedFile: 'sample.csv' }),
    node('read', 'method:XLSX.read'),
    node('sheet', 'generic:worksheet-select', { sheetName: 'Sheet1' }),
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
    node('source', 'generic:variable-input', { varType: 'object', varValue: workbook }),
    node('select', 'generic:worksheet-select', { selectMode: 'byName', sheetName: 'Data' }),
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
