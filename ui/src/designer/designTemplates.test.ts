import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataRelation, SrcSheetInfo, SrcTableEntry, TableConfig } from '../project/types';
import { createDesignFromTemplate } from './designTemplates';

const masterSheet: SrcSheetInfo = {
  name: '订单',
  rowCount: 2,
  colCount: 4,
  headers: ['订单ID', '客户', '状态', '金额'],
  columns: [
    { name: '订单ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['O-1', 'O-2'] },
    { name: '客户', index: 1, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['甲', '乙'] },
    { name: '状态', index: 2, dataType: 'enum', nullable: false, uniqueCount: 2, sampleValues: ['新建', '已完成'] },
    { name: '金额', index: 3, dataType: 'number', nullable: false, uniqueCount: 2, sampleValues: [120, 300] },
  ],
  preview: [
    { 订单ID: 'O-1', 客户: '甲', 状态: '新建', 金额: 120 },
    { 订单ID: 'O-2', 客户: '乙', 状态: '已完成', 金额: 300 },
  ],
  config: { id: 'orders:订单', tableName: '订单', keyFields: ['订单ID'], columnWidths: {}, frozenColumns: 0, frozenRows: 0, defaultSort: null, hiddenColumns: [], lockedColumns: [], columnDescriptions: {}, columnTags: {}, headerHeight: 36, rowHeight: 28, alternateRowColor: true, showGridLines: true, showRowNumbers: true, autoFitColumns: true, filterEnabled: true, sortEnabled: true, groupByColumn: null },
};

const detailSheet: SrcSheetInfo = {
  name: '订单明细',
  rowCount: 2,
  colCount: 4,
  headers: ['明细ID', '订单ID', '商品', '数量'],
  columns: [
    { name: '明细ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['D-1', 'D-2'] },
    { name: '订单ID', index: 1, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['O-1', 'O-2'] },
    { name: '商品', index: 2, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['A', 'B'] },
    { name: '数量', index: 3, dataType: 'number', nullable: false, uniqueCount: 2, sampleValues: [2, 3] },
  ],
  preview: [
    { 明细ID: 'D-1', 订单ID: 'O-1', 商品: 'A', 数量: 2 },
    { 明细ID: 'D-2', 订单ID: 'O-2', 商品: 'B', 数量: 3 },
  ],
  config: { id: 'order_items:订单明细', tableName: '订单明细', keyFields: ['明细ID'], columnWidths: {}, frozenColumns: 0, frozenRows: 0, defaultSort: null, hiddenColumns: [], lockedColumns: [], columnDescriptions: {}, columnTags: {}, headerHeight: 36, rowHeight: 28, alternateRowColor: true, showGridLines: true, showRowNumbers: true, autoFitColumns: true, filterEnabled: true, sortEnabled: true, groupByColumn: null },
};

const masterTable: SrcTableEntry = {
  id: 'orders',
  fileName: 'orders.xlsx',
  fileSize: 1,
  fileType: 'xlsx',
  uploadedAt: '2026-07-26T00:00:00.000Z',
  sheets: [masterSheet],
  dataHash: 'orders-hash',
};

const detailTable: SrcTableEntry = {
  id: 'order_items',
  fileName: 'order_items.xlsx',
  fileSize: 1,
  fileType: 'xlsx',
  uploadedAt: '2026-07-26T00:00:00.000Z',
  sheets: [detailSheet],
  dataHash: 'order-items-hash',
};

const relation: DataRelation = {
  id: 'order_items_relation',
  name: '订单-明细',
  left: { tableId: 'orders', sheetName: '订单', fields: ['订单ID'] },
  right: { tableId: 'order_items', sheetName: '订单明细', fields: ['订单ID'] },
  cardinality: 'one-to-many',
  defaultJoinType: 'left',
  integrity: 'checked',
  onDelete: 'restrict',
};

function makeWideTable(fieldCount: number): SrcTableEntry {
  const headers = Array.from({ length: fieldCount }, (_, index) => `字段${index + 1}`);
  return {
    ...masterTable,
    id: `wide_${fieldCount}`,
    sheets: [{
      ...masterSheet,
      headers,
      columns: headers.map((name, index) => ({ name, index, dataType: index % 4 === 0 ? 'number' : 'string', nullable: index % 2 === 0, uniqueCount: 2, sampleValues: [index % 4 === 0 ? index + 1 : `值${index + 1}`] })),
      preview: [Object.fromEntries(headers.map((name, index) => [name, index % 4 === 0 ? index + 1 : `值${index + 1}`]))],
      config: { ...masterSheet.config, keyFields: ['字段1'] } as TableConfig,
      rowCount: 1,
      colCount: fieldCount,
    }],
  };
}

test('basic-entry skeleton no longer ships fake business fields and remains configurable', () => {
  const design = createDesignFromTemplate('basic-entry', 1, {
    title: '客户录入',
    subtitle: '等待字段生成',
    saveLabel: '保存客户',
    includeReset: false,
    successMessage: '客户已保存',
    previewRows: 2,
  });
  assert.equal(design.formWindow.props.title, '客户录入');
  assert.equal(design.formWindow.props.subtitle, '等待字段生成');
  assert.equal(design.components.some((component) => ['name', 'category', 'remark'].includes(String(component.fieldBinding || component.props?.name || ''))), false);
  assert.ok(design.components.some((component) => component.type === 'button' && component.props.label === '保存客户'));
  assert.equal(design.components.some((component) => component.type === 'button' && component.props.label === '重置'), false);
  assert.equal(design.templateParameters?.exactConfiguration?.copy?.successMessage, '客户已保存');
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.previewRows, 2);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.entryPolicy?.submitMode, 'upsert');
});

test('scaffolded lookup-edit uses configured field roles and strips runtime bindings from buttons', () => {
  const design = createDesignFromTemplate('lookup-edit', 2, {
    table: masterTable,
    sheetName: '订单',
    queryFields: ['订单ID', '客户'],
    displayFields: ['状态'],
    editableFields: ['状态', '金额'],
    title: '订单查询修改',
    subtitle: '按查询字段与编辑字段生成',
    lookupLabel: '查询订单',
    saveLabel: '提交订单修改',
    columns: 2,
    queryLimit: 3,
    autoQueryOnLoad: true,
    queryMode: 'any',
    dirtyOnly: false,
    refetchAfterSave: true,
    conflictPolicy: 'refresh-and-retry',
    previewRows: 2,
    messageField: '_查询消息',
    writeBackField: '_查询写回',
  });
  const generatedFields = design.components
    .filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'))
    .map((component) => component.fieldBinding);
  assert.deepEqual(generatedFields, ['订单ID', '客户', '状态', '金额']);
  assert.equal(design.formWindow.props.title, '订单查询修改');
  assert.equal(design.formWindow.props.subtitle, '按查询字段与编辑字段生成');
  assert.deepEqual(design.templateParameters?.queryFields, ['订单ID', '客户']);
  assert.deepEqual(design.templateParameters?.displayFields, ['状态']);
  assert.deepEqual(design.templateParameters?.editableFields, ['状态', '金额']);
  assert.deepEqual(design.templateParameters?.fieldProjection, {
    visibleFields: ['订单ID', '客户', '状态', '金额'],
    queryFields: ['订单ID', '客户'],
    displayFields: ['状态'],
    editableFields: ['状态', '金额'],
  });
  assert.equal(design.templateParameters?.layout?.sectionMode, 'by-role');
  const orderId = design.components.find((component) => component.fieldBinding === '订单ID');
  const status = design.components.find((component) => component.fieldBinding === '状态');
  const amount = design.components.find((component) => component.fieldBinding === '金额');
  assert.equal(orderId?.props.generatedRole, 'query');
  assert.equal(status?.props.generatedRole, 'display');
  assert.equal(status?.props.readonly, true);
  assert.equal(amount?.props.generatedRole, 'editable');
  assert.equal(amount?.props.disabled, true);
  assert.ok(design.components.some((component) => component.props?.content === '查询条件'));
  assert.ok(design.components.some((component) => component.props?.content === '结果展示（命中后回填）'));
  assert.ok(design.components.some((component) => component.props?.content === '编辑字段（命中后解锁）'));
  const lookupButton = design.components.find((component) => component.type === 'button' && component.props.label === '查询订单');
  assert.equal(lookupButton?.props.events, undefined);
  assert.equal(lookupButton?.props.flowTriggers, undefined);
  assert.ok(design.components.some((component) => component.type === 'button' && component.props.label === '提交订单修改'));
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.previewRows, 2);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.queryLimit, 3);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.autoQueryOnLoad, true);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.queryMode, 'any');
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.dirtyOnly, false);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.refetchAfterSave, true);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.conflictPolicy, 'refresh-and-retry');
  assert.equal(design.templateParameters?.exactConfiguration?.resultBindings?.messageField, '_查询消息');
  assert.equal(design.templateParameters?.exactConfiguration?.resultBindings?.writeBackField, '_查询写回');
});

test('blank template can enter field-driven generation without sample fields', () => {
  const design = createDesignFromTemplate('blank', 3, {
    table: masterTable,
    sheetName: '订单',
    selectedFields: ['客户', '金额'],
    title: '空白生成',
  });
  const generatedFields = design.components
    .filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'))
    .map((component) => component.fieldBinding);
  assert.deepEqual(generatedFields, ['客户', '金额']);
  assert.equal(design.components.some((component) => component.type === 'button'), false);
  assert.equal(design.formWindow.props.title, '空白生成');
});

test('blank template keeps a true zero-field draft with configurable title/subtitle', () => {
  const design = createDesignFromTemplate('blank', 5, {
    title: '空白草稿',
    subtitle: '尚未选择任何字段',
    previewRows: 0,
    pageSize: 1,
  });
  const generatedFields = design.components
    .filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'))
    .map((component) => component.fieldBinding);
  assert.deepEqual(generatedFields, []);
  assert.equal(design.components.some((component) => component.type === 'button'), false);
  assert.equal(design.formWindow.props.title, '空白草稿');
  assert.equal(design.formWindow.props.subtitle, '尚未选择任何字段');
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.presentationPolicy?.publishGuard, 'design-only-until-fields-selected');
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.previewRows, 0);
});

test('blank template reflects 1/12/13 field layout bands in template parameters and generated presentation', () => {
  const oneFieldTable = makeWideTable(1);
  const twelveFieldTable = makeWideTable(12);
  const thirteenFieldTable = makeWideTable(13);

  const oneField = createDesignFromTemplate('blank', 7, {
    table: oneFieldTable,
    sheetName: '订单',
    selectedFields: ['字段1'],
  });
  assert.deepEqual(oneField.templateParameters?.fieldProjection?.visibleFields, ['字段1']);
  assert.equal(oneField.templateParameters?.layout?.generatedPages, 1);
  assert.equal(oneField.templateParameters?.layout?.generatedSections, 0);
  assert.equal(oneField.components.some((component) => component.type === 'tabs'), false);

  const twelveField = createDesignFromTemplate('blank', 8, {
    table: twelveFieldTable,
    sheetName: '订单',
    selectedFields: Array.from({ length: 12 }, (_, index) => `字段${index + 1}`),
  });
  const twelveFields = twelveField.components.filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'));
  assert.equal(twelveField.templateParameters?.layout?.generatedPages, 1);
  assert.equal(twelveField.templateParameters?.layout?.generatedSections, 0);
  assert.equal(twelveField.components.some((component) => component.type === 'tabs'), false);
  assert.equal(new Set(twelveFields.map((component) => component.width)).size, 1);

  const thirteenField = createDesignFromTemplate('blank', 9, {
    table: thirteenFieldTable,
    sheetName: '订单',
    selectedFields: Array.from({ length: 13 }, (_, index) => `字段${index + 1}`),
  });
  assert.equal(thirteenField.templateParameters?.layout?.generatedSections, 2);
  assert.equal(thirteenField.templateParameters?.layout?.sectionMode, 'generated-sections');
  assert.ok(thirteenField.components.some((component) => component.props?.generatedSection === true));
});

test('master-detail template can build a relation-backed preview from real tables', () => {
  const design = createDesignFromTemplate('master-detail', 4, {
    table: masterTable,
    tables: [masterTable, detailTable],
    sheetName: '订单',
    relation,
    masterFields: ['订单ID', '客户'],
    detailTableId: 'order_items',
    detailFields: ['商品', '数量'],
    detailTitle: '订单商品明细',
    detailRows: 3,
    detailEditableMode: 'editable',
    allowEmptyDetails: false,
    title: '订单主从预览',
    subtitle: '基于真实关系生成',
    saveLabel: '保存订单详情',
    duplicateDetailPolicy: 'skip',
    defaultExpanded: false,
    pageSize: 4,
    statusField: '_主从状态',
    changeLogField: '_主从差异',
  });
  assert.equal(design.formWindow.props.title, '订单主从预览');
  assert.equal(design.formWindow.props.subtitle, '基于真实关系生成');
  assert.equal(design.templateParameters?.relationId, relation.id);
  assert.deepEqual(design.templateParameters?.masterFields, ['订单ID', '客户']);
  const masterGrid = design.components.find((component) => component.id === 'table_master');
  const detailGrid = design.components.find((component) => component.id === 'table_detail');
  assert.deepEqual(masterGrid?.props.columns, ['订单ID', '客户']);
  assert.deepEqual(detailGrid?.props.columns, ['商品', '数量']);
  assert.equal(detailGrid?.props.label, '订单商品明细');
  assert.equal(detailGrid?.props.rows, 3);
  assert.equal(detailGrid?.props.editable, true);
  assert.equal(detailGrid?.props.addable, true);
  assert.equal(detailGrid?.props.removable, true);
  assert.equal(detailGrid?.props.emptyStateText, '至少保留一条明细后再保存');
  assert.equal((detailGrid?.props.data as Array<Record<string, unknown>>)[0]?.商品, 'A');
  const saveButton = design.components.find((component) => component.type === 'button' && component.props.label === '保存订单详情');
  assert.ok(saveButton);
  assert.equal(saveButton?.props.disabled, false);
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.detailRows, 3);
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.pageSize, 4);
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.defaultExpanded, false);
  assert.equal(design.templateParameters?.exactConfiguration?.policy?.detailPolicy?.duplicateDetailPolicy, 'skip');
  assert.equal(design.templateParameters?.exactConfiguration?.resultBindings?.statusField, '_主从状态');
  assert.equal(design.templateParameters?.exactConfiguration?.resultBindings?.changeLogField, '_主从差异');
});

test('blank template with wide field selection keeps generated tabs/pages semantics from scaffold', () => {
  const wideHeaders = Array.from({ length: 25 }, (_, index) => `字段${index + 1}`);
  const wideTable = makeWideTable(25);
  const design = createDesignFromTemplate('blank', 6, {
    table: wideTable,
    sheetName: '订单',
    selectedFields: wideHeaders,
  });
  const tabs = design.components.find((component) => component.type === 'tabs');
  assert.ok(tabs);
  assert.equal((tabs?.props.tabs as string[]).length, 3);
  assert.equal(design.templateParameters?.layout?.generatedPages, 3);
  const generatedFields = design.components.filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'));
  assert.equal(generatedFields.length, 25);
});

test('basic-entry field-driven scaffold preserves configurable projection, layout and button configuration', () => {
  const table = makeWideTable(12);
  const selectedFields = ['字段1', '字段2', '字段3', '字段4', '字段5', '字段6', '字段7', '字段8', '字段9', '字段10', '字段11', '字段12'];
  const design = createDesignFromTemplate('basic-entry', 10, {
    table,
    sheetName: '订单',
    selectedFields,
    title: '批量基础录入',
    subtitle: '12 字段录入布局',
    saveLabel: '提交基础录入',
    includeReset: true,
    columns: 3,
    labelWidth: 140,
    density: 'compact',
    hiddenFields: ['字段12'],
    readonlyFields: ['字段1'],
    previewRows: 5,
    statusField: '_录入状态',
  });
  assert.equal(design.formWindow.props.title, '批量基础录入');
  assert.equal(design.formWindow.props.subtitle, '12 字段录入布局');
  assert.deepEqual(design.templateParameters?.fieldProjection?.visibleFields, selectedFields);
  assert.equal(design.templateParameters?.layout?.columns, 3);
  assert.equal(design.templateParameters?.layout?.generatedPages, 1);
  assert.equal(design.templateParameters?.layout?.generatedSections, 0);
  assert.equal(design.templateParameters?.exactConfiguration?.layout?.labelWidth, 140);
  assert.equal(design.templateParameters?.exactConfiguration?.layout?.density, 'compact');
  assert.deepEqual(design.templateParameters?.exactConfiguration?.fieldProjection?.hiddenFields, ['字段12']);
  assert.deepEqual(design.templateParameters?.exactConfiguration?.fieldProjection?.readonlyFields, ['字段1']);
  assert.equal(design.templateParameters?.exactConfiguration?.previewControls?.previewRows, 5);
  assert.equal(design.templateParameters?.exactConfiguration?.resultBindings?.statusField, '_录入状态');
  assert.match(String(design.templateParameters?.exactConfiguration?.runtime?.ruleCode || ''), /before submit -> require/);
  assert.deepEqual(design.templateParameters?.exactConfiguration?.runtime?.workflows?.[0]?.specIds, ['workflow:import', 'behavior:submit', 'workflow:export']);
  assert.equal(design.templateParameters?.exactConfiguration?.runtime?.behaviors?.[0]?.event, 'onFormLoad');
  const fields = design.components.filter((component) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'));
  assert.equal(fields.length, 12);
  assert.ok(design.components.some((component) => component.type === 'button' && component.props.label === '提交基础录入'));
  assert.ok(design.components.some((component) => component.type === 'button' && component.props.label === '重置'));
});

test('design templates expose exact configuration defaults and explicit overrides for previewable verification', () => {
  const lookupDefault = createDesignFromTemplate('lookup-edit', 11, {
    table: masterTable,
    sheetName: '订单',
    queryFields: ['订单ID'],
    editableFields: ['金额'],
  });
  const lookupConfigured = createDesignFromTemplate('lookup-edit', 12, {
    table: masterTable,
    sheetName: '订单',
    queryFields: ['订单ID'],
    editableFields: ['金额'],
    queryLimit: 2,
    autoQueryOnLoad: true,
    queryMode: 'any',
    dirtyOnly: false,
    refetchAfterSave: true,
    conflictPolicy: 'refresh-and-retry',
    previewRows: 2,
    pageSize: 3,
  });
  assert.equal(lookupDefault.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.queryLimit, 1);
  assert.equal(lookupConfigured.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.queryLimit, 2);
  assert.equal(lookupDefault.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.autoQueryOnLoad, false);
  assert.equal(lookupConfigured.templateParameters?.exactConfiguration?.policy?.lookupPolicy?.autoQueryOnLoad, true);
  assert.equal(lookupDefault.templateParameters?.exactConfiguration?.previewControls?.pageSize, 1);
  assert.equal(lookupConfigured.templateParameters?.exactConfiguration?.previewControls?.pageSize, 3);
  assert.match(String(lookupConfigured.templateParameters?.exactConfiguration?.runtime?.ruleCode || ''), /before submit -> require/);
  assert.doesNotMatch(String(lookupConfigured.templateParameters?.exactConfiguration?.runtime?.ruleCode || ''), /on submit -> run/);
  assert.deepEqual(lookupConfigured.templateParameters?.exactConfiguration?.runtime?.workflows?.[0]?.specIds, ['workflow:import', 'behavior:submit', 'workflow:export']);
  assert.equal(Array.isArray(lookupConfigured.templateParameters?.exactConfiguration?.runtime?.behaviors), true);

  const blankDefault = createDesignFromTemplate('blank', 13, {});
  const blankConfigured = createDesignFromTemplate('blank', 14, {
    title: '精确预览空白稿',
    subtitle: '显式改参',
    previewRows: 4,
    density: 'compact',
    statusField: '_空白状态',
  });
  assert.equal(blankDefault.templateParameters?.exactConfiguration?.previewControls?.previewRows, 0);
  assert.equal(blankConfigured.templateParameters?.exactConfiguration?.previewControls?.previewRows, 4);
  assert.equal(blankDefault.templateParameters?.exactConfiguration?.layout?.density, undefined);
  assert.equal(blankConfigured.templateParameters?.exactConfiguration?.layout?.density, 'compact');
  assert.equal(blankConfigured.templateParameters?.exactConfiguration?.resultBindings?.statusField, '_空白状态');
  assert.equal(blankConfigured.templateParameters?.exactConfiguration?.runtime?.workflows?.length, 0);
  assert.match(String(blankConfigured.templateParameters?.exactConfiguration?.runtime?.diagnostics?.[0] || ''), /设计态/);
});

test('master-detail and skeleton templates expose runtime preview guidance even before binding live actions', () => {
  const masterDetail = createDesignFromTemplate('master-detail', 15, {
    table: masterTable,
    tables: [masterTable, detailTable],
    sheetName: '订单',
    relation,
    masterFields: ['订单ID', '客户'],
    detailFields: ['商品', '数量'],
  });
  assert.equal(masterDetail.templateParameters?.exactConfiguration?.runtime?.workflows?.length, 0);
  assert.match(String(masterDetail.templateParameters?.exactConfiguration?.runtime?.diagnostics?.[0] || ''), /真实关系/);

  const lookupSkeleton = createDesignFromTemplate('lookup-edit', 16, {
    queryFields: ['订单ID'],
    editableFields: ['金额'],
  });
  assert.equal(lookupSkeleton.templateParameters?.exactConfiguration?.runtime?.workflows?.length, 0);
  assert.match(String(lookupSkeleton.templateParameters?.exactConfiguration?.runtime?.diagnostics?.[0] || ''), /查询字段/);
});
