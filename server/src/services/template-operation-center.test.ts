import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OPERATION_TEMPLATES, analyzeOperationTemplate, applyDataRowsTransaction, applyOperationPlan, deleteTemplateInstanceResources,
  inspectTemplateInstanceDrift, planOperationTemplate, queryRelationRows, recommendOperationTemplates, regenerateTemplateInstance, suggestDataRelations, validateRelation,
  type DataRelation,
} from './template-operation-center';

function project(): any {
  const now = '2026-07-22T00:00:00.000Z';
  return {
    config: { id: 'template_demo', name: '模板演示', description: '', version: '1.0.0', createdAt: now, updatedAt: now, author: 'test', tags: [] },
    release: { mode: 'design', allowDesigner: true, allowBehaviorEditor: true, allowWorkflowEditor: true },
    srcTable: [
      { id: 'teachers', fileName: 'teachers.json', fileType: 'json', sheets: [{ name: '教师', rowCount: 40, headers: ['教师ID', '姓名', '科目ID', '工资', '绩效', '入职日期'], columns: [{ name: '教师ID', dataType: 'string' }, { name: '姓名', dataType: 'string' }, { name: '科目ID', dataType: 'string' }, { name: '工资', dataType: 'number' }, { name: '绩效', dataType: 'number' }, { name: '入职日期', dataType: 'date' }], preview: [{ 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' }], config: { keyFields: ['教师ID'], readOnly: false } }] },
      { id: 'subjects', fileName: 'subjects.json', fileType: 'json', sheets: [{ name: '科目', rowCount: 2, headers: ['科目ID', '科目名'], columns: [{ name: '科目ID', dataType: 'string' }, { name: '科目名', dataType: 'string' }], preview: [{ 科目ID: 'S1', 科目名: '劳动课' }], config: { keyFields: ['科目ID'], readOnly: false } }] },
    ],
    forms: [], workflows: [], globalBehaviors: [], sheetBehaviors: [], outputs: [], testing: { profiles: [], suites: [], fixtures: [], runs: [] }, relations: [],
  };
}

test('template catalog has stable unique identifiers and all four product categories remain representable', () => {
  assert.ok(OPERATION_TEMPLATES.length >= 10);
  assert.equal(new Set(OPERATION_TEMPLATES.map((item) => item.id)).size, OPERATION_TEMPLATES.length);
  assert.ok(OPERATION_TEMPLATES.some((item) => item.category === 'entry'));
  assert.ok(OPERATION_TEMPLATES.some((item) => item.category === 'cross-table'));
  assert.ok(OPERATION_TEMPLATES.some((item) => item.category === 'analysis'));
  assert.ok(OPERATION_TEMPLATES.some((item) => item.category === 'prediction'));
});

test('template schemas expose configurable layout, copy and preview controls', () => {
  const entry = OPERATION_TEMPLATES.find((item) => item.id === 'single-table-entry')!;
  const entryProperties = entry.parameterSchema.properties || {};
  assert.ok(entryProperties.title);
  assert.ok(entryProperties.subtitle);
  assert.ok(entryProperties.columns);
  assert.ok(entryProperties.layoutMode);
  assert.ok(entryProperties.sectionMode);
  assert.ok(entryProperties.denseLayout);
  assert.ok(entryProperties.saveLabel);
  assert.ok(entryProperties.resetLabel);
  assert.ok(entryProperties.successMessage);
  assert.ok(entryProperties.keyStrategy);
  assert.ok(entryProperties.duplicatePolicy);
  assert.ok(entryProperties.submitMode);
  assert.ok(entryProperties.defaultValues);
  assert.ok(entryProperties.computedExpressions);
  assert.ok(entryProperties.linkageDsl);
  assert.ok(entryProperties.resultField);
  assert.ok(entryProperties.changeLogField);
  assert.ok(entryProperties.writeBackField);

  const lookup = OPERATION_TEMPLATES.find((item) => item.id === 'single-table-lookup-edit')!;
  const lookupProperties = lookup.parameterSchema.properties || {};
  assert.ok(lookupProperties.displayFields);
  assert.ok(lookupProperties.autoQueryOnLoad);
  assert.ok(lookupProperties.queryMode);
  assert.ok(lookupProperties.queryLimit);
  assert.ok(lookupProperties.dirtyOnly);
  assert.ok(lookupProperties.refetchAfterSave);
  assert.ok(lookupProperties.conflictPolicy);
  assert.ok(lookupProperties.emptyResultMessage);
  assert.ok(lookupProperties.successMessage);
  assert.ok(lookupProperties.multipleResultMessage);

  const analysis = OPERATION_TEMPLATES.find((item) => item.id === 'kpi-dashboard')!;
  const analysisProperties = analysis.parameterSchema.properties || {};
  assert.ok(analysisProperties.previewRows);
  assert.ok(analysisProperties.detailRows);
  assert.ok(analysisProperties.sampleRows);
  assert.ok(analysisProperties.chartLimit);

  const parallel = OPERATION_TEMPLATES.find((item) => item.id === 'parallel-cross-table-entry')!;
  const parallelProperties = parallel.parameterSchema.properties || {};
  assert.ok(parallelProperties.title);
  assert.ok(parallelProperties.subtitle);
  assert.ok(parallelProperties.previewRows);
  assert.ok(parallelProperties.detailRows);
  assert.ok(parallelProperties.tableOrder);
  assert.ok(parallelProperties.tableTitles);
  assert.ok(parallelProperties.fieldsByTable);
  assert.ok(parallelProperties.sectionMode);
  assert.ok(parallelProperties.existingPolicy);
  assert.ok(parallelProperties.statusField);
  assert.ok(parallelProperties.diffField);
  assert.ok(parallelProperties.successMessage);
  assert.ok(parallelProperties.failureMessage);
  assert.ok(parallelProperties.showDiffPreview);
  assert.ok(parallelProperties.submitLabel);

  const multiBatch = OPERATION_TEMPLATES.find((item) => item.id === 'multi-table-batch-update')!;
  const multiBatchProperties = multiBatch.parameterSchema.properties || {};
  assert.ok(multiBatchProperties.maxChanges);
  assert.ok(multiBatchProperties.previewRows);
  assert.ok(multiBatchProperties.detailRows);
  assert.ok(multiBatchProperties.tableOrder);
  assert.ok(multiBatchProperties.fieldsByTable);
  assert.ok(multiBatchProperties.editableFieldsByTable);
  assert.ok(multiBatchProperties.showOnlyDirty);
  assert.ok(multiBatchProperties.statusField);
  assert.ok(multiBatchProperties.changeLogField);
  assert.ok(multiBatchProperties.successMessage);
  assert.ok(multiBatchProperties.submitLabel);

  const joinUpdate = OPERATION_TEMPLATES.find((item) => item.id === 'join-query-update')!;
  const joinProperties = joinUpdate.parameterSchema.properties || {};
  assert.ok(joinProperties.joinType);
  assert.ok(joinProperties.queryFields);
  assert.ok(joinProperties.displayFields);
  assert.ok(joinProperties.editableFieldsLeft);
  assert.ok(joinProperties.editableFieldsRight);
  assert.ok(joinProperties.queryLimit);
  assert.ok(joinProperties.conflictPolicy);
  assert.ok(joinProperties.statusField);
  assert.ok(joinProperties.resultField);
  assert.ok(joinProperties.ambiguousResultMessage);
  assert.ok(joinProperties.messageField);
});

test('every built-in template produces a bounded, semantically usable form and an applicable project', () => {
  const value = project() as any;
  const teacherSubject: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  const subjectTeachers: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [teacherSubject, subjectTeachers];
  const single = (fields: string[]) => ({ tableId: 'teachers', tableIds: ['teachers'], sheetName: '教师', fields });
  const cases: Record<string, { selection: any; parameters: any }> = {
    'single-table-entry': { selection: single(['教师ID', '姓名', '工资']), parameters: { formId: 'audit_entry', name: '教师录入', selectedFields: ['教师ID', '姓名', '工资'] } },
    'single-table-lookup-edit': { selection: single(['教师ID', '姓名', '工资']), parameters: { formId: 'audit_lookup', queryFields: ['教师ID'], editableFields: ['姓名', '工资'] } },
    'single-table-batch-update': { selection: single(['教师ID', '姓名', '工资']), parameters: { formId: 'audit_batch', maxChanges: 100 } },
    'parallel-cross-table-entry': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师' }, parameters: { formId: 'audit_parallel', atomic: true, existingPolicy: 'error' } },
    'master-detail-entry': { selection: { tableId: 'subjects', tableIds: ['subjects', 'teachers'], sheetName: '科目', relationIds: [subjectTeachers.id] }, parameters: { formId: 'audit_master_entry', relationId: subjectTeachers.id } },
    'master-detail-view': { selection: { tableId: 'subjects', tableIds: ['subjects', 'teachers'], sheetName: '科目', relationIds: [subjectTeachers.id] }, parameters: { formId: 'audit_master_view', relationId: subjectTeachers.id } },
    'join-query-update': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [teacherSubject.id] }, parameters: { formId: 'audit_join', relationId: teacherSubject.id, atomic: true, queryFields: ['teachers.教师ID'], displayFields: ['teachers.教师ID', 'teachers.姓名', 'subjects.科目名'], editableFieldsLeft: ['teachers.姓名'], editableFieldsRight: ['subjects.科目名'] } },
    'multi-table-batch-update': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师' }, parameters: { formId: 'audit_multi_batch', atomic: true, maxChanges: 200 } },
    'data-overview': { selection: single(['姓名', '工资', '绩效', '入职日期']), parameters: { formId: 'audit_overview' } },
    'kpi-dashboard': { selection: single(['姓名', '工资', '绩效']), parameters: { formId: 'audit_kpi', metrics: ['工资', '绩效'], dimensions: ['姓名'] } },
    'group-comparison': { selection: single(['科目ID', '工资', '绩效']), parameters: { formId: 'audit_group', dimensions: ['科目ID'], metrics: ['工资'], aggregation: 'sum' } },
    'pivot-analysis': { selection: single(['姓名', '科目ID', '工资']), parameters: { formId: 'audit_pivot', rowDimension: '姓名', columnDimension: '科目ID', metric: '工资', aggregation: 'sum' } },
    'trend-analysis': { selection: single(['入职日期', '工资']), parameters: { formId: 'audit_trend', timeField: '入职日期', metric: '工资', grain: 'month' } },
    'correlation-analysis': { selection: single(['工资', '绩效']), parameters: { formId: 'audit_correlation', fields: ['工资', '绩效'] } },
    'anomaly-detection': { selection: single(['工资', '绩效']), parameters: { formId: 'audit_anomaly', fields: ['工资', '绩效'], contamination: 0.1 } },
    'cross-table-summary': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [teacherSubject.id], fields: ['工资'] }, parameters: { formId: 'audit_cross_summary', relationId: teacherSubject.id, dimensions: ['teachers.科目ID'], metrics: ['teachers.工资'], aggregation: 'sum' } },
    'regression-prediction': { selection: single(['工资', '绩效']), parameters: { formId: 'audit_regression', target: '绩效', features: ['工资'], validationRatio: 0.2 } },
    'classification-prediction': { selection: single(['科目ID', '工资', '绩效']), parameters: { formId: 'audit_classification', target: '科目ID', features: ['工资', '绩效'], validationRatio: 0.2 } },
    'time-series-prediction': { selection: single(['入职日期', '工资']), parameters: { formId: 'audit_time_series', timeField: '入职日期', target: '工资', horizon: 6 } },
  };
  assert.deepEqual(Object.keys(cases).sort(), OPERATION_TEMPLATES.map((template) => template.id).sort(), 'audit matrix must cover the whole built-in catalog');
  for (const template of OPERATION_TEMPLATES) {
    const scenario = cases[template.id];
    const plan = planOperationTemplate(value, template.id, scenario.selection, scenario.parameters);
    assert.equal(plan.artifacts.forms.length, template.generation.forms, `${template.id}: form count`);
    assert.equal(plan.artifacts.rules.length + plan.artifacts.behaviors.length, template.generation.behaviors, `${template.id}: behavior count`);
    if (template.generation.behaviors > 0) {
      assert.ok(plan.artifacts.rules.every((artifact: any) => artifact.kind === 'rule' && String(artifact.ruleCode || '').trim().length > 0), `${template.id}: rule artifact content`);
      assert.ok(plan.artifacts.behaviors.every((artifact: any) => ['behavior', 'flow-trigger'].includes(artifact.kind)), `${template.id}: behavior artifact kind`);
      assert.ok([...plan.artifacts.rules, ...plan.artifacts.behaviors].some((artifact: any) => artifact.kind === 'rule' ? String(artifact.ruleCode || '').trim().length > 0 : Boolean(artifact.behavior || artifact.trigger)), `${template.id}: must generate non-empty rule or behavior content`);
    }
    assert.equal(plan.artifacts.workflows.length, template.generation.workflows, `${template.id}: workflow count`);
    assert.equal(plan.artifacts.outputs.length, template.generation.outputs, `${template.id}: output count`);
    assert.equal(plan.artifacts.tests.length, template.generation.tests, `${template.id}: test count`);
    assert.ok(plan.artifacts.tests.every((suite: any) => Array.isArray(suite.cases) && suite.cases.length > 0), `${template.id}: test suites must contain cases`);
    assert.ok(plan.artifacts.tests.every((suite: any) => suite.cases.every((item: any) => item.inputs && item.expected)), `${template.id}: test cases must include inputs and expected results`);
    const form = plan.artifacts.forms[0] as any;
    const window = form.design.formWindow;
    assert.ok(form.design.components.length >= 2, `${template.id}: empty form`);
    for (const component of form.design.components) {
      assert.ok(component.x >= 0 && component.y >= 0, `${template.id}: negative component position`);
      assert.ok(component.x + component.width <= window.width, `${template.id}: ${component.id} exceeds form width`);
      assert.ok(component.y + component.height <= window.height, `${template.id}: ${component.id} exceeds form height`);
    }
    if (template.category === 'analysis' || template.category === 'prediction') {
      assert.ok(['analysis-report', 'prediction-report'].includes(form.design.templateParameters?.presentation?.kind), `${template.id}: missing report presentation`);
      assert.equal(form.design.templateParameters?.presentation?.previewKind, template.id, `${template.id}: preview kind must identify the selected template`);
      assert.equal(form.design.components.some((component: any) => ['input', 'number', 'select', 'datePicker', 'textarea'].includes(component.type)), false, `${template.id}: analytical form must not masquerade as data entry`);
      assert.ok(form.design.components.some((component: any) => component.type === 'chart'), `${template.id}: missing visual result region`);
      assert.ok(form.design.components.some((component: any) => component.fieldBinding === '_分析结果'), `${template.id}: missing result binding`);
      const selectedFieldsText = form.design.components.find((component: any) => component.id.endsWith('_selected_fields'))?.props?.content || '';
      for (const field of scenario.selection.fields || []) assert.match(selectedFieldsText, new RegExp(field), `${template.id}: selected field ${field} missing from preview`);
      const previewChart = form.design.components.find((component: any) => component.props?.name === '_输入样本图');
      assert.notEqual(previewChart.props.title, '输入样本预览（非模型结果）', `${template.id}: must not use the generic analytical placeholder`);
    }
    if (template.id.includes('batch-update')) {
      const tables = form.design.components.filter((component: any) => component.type === 'table' && component.props?.editable);
      assert.ok(tables.length, `${template.id}: missing editable batch table`);
      for (const table of tables) {
        assert.equal(table.props.changeTracking, 'dirtyRows', `${template.id}: batch table must only emit dirty rows`);
        assert.equal(table.props.addable, false, `${template.id}: batch update must not insert rows`);
        assert.equal(table.props.removable, false, `${template.id}: batch update must not delete rows`);
        assert.ok(table.props.rowKey, `${template.id}: batch table requires a stable row key`);
        assert.equal(table.props.columns.find((column: any) => column.dataIndex === table.props.rowKey)?.editable, false, `${template.id}: row key must be readonly`);
      }
    }
    assert.doesNotThrow(() => applyOperationPlan(value, plan), `${template.id}: generated project must validate`);
  }
});

test('every template exposes the six required configuration categories in its exactConfiguration', () => {
  const value = project() as any;
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  const single = (fields: string[]) => ({ tableId: 'teachers', tableIds: ['teachers'], sheetName: '教师', fields });
  const cases: Record<string, { selection: any; parameters: any }> = {
    'single-table-entry': { selection: single(['教师ID', '姓名', '工资']), parameters: { formId: 'config_entry' } },
    'single-table-lookup-edit': { selection: single(['教师ID', '姓名', '工资']), parameters: { formId: 'config_lookup', queryFields: ['教师ID'], editableFields: ['姓名', '工资'] } },
    'single-table-batch-update': { selection: single(['教师ID', '姓名', '工资']), parameters: { formId: 'config_batch' } },
    'parallel-cross-table-entry': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师' }, parameters: { formId: 'config_parallel', atomic: true } },
    'master-detail-entry': { selection: { tableId: 'subjects', tableIds: ['subjects', 'teachers'], sheetName: '科目', relationIds: [relation.id] }, parameters: { formId: 'config_mde', relationId: relation.id } },
    'master-detail-view': { selection: { tableId: 'subjects', tableIds: ['subjects', 'teachers'], sheetName: '科目', relationIds: [relation.id] }, parameters: { formId: 'config_mdv', relationId: relation.id } },
    'join-query-update': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id] }, parameters: { formId: 'config_join', relationId: relation.id, atomic: true, queryFields: ['teachers.教师ID'], displayFields: ['teachers.教师ID'], editableFieldsLeft: ['teachers.姓名'], editableFieldsRight: ['subjects.科目名'] } },
    'multi-table-batch-update': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师' }, parameters: { formId: 'config_multi', atomic: true } },
    'data-overview': { selection: single(['姓名', '工资']), parameters: { formId: 'config_overview' } },
    'kpi-dashboard': { selection: single(['姓名', '工资']), parameters: { formId: 'config_kpi', metrics: ['工资'] } },
    'group-comparison': { selection: single(['科目ID', '工资']), parameters: { formId: 'config_group', dimensions: ['科目ID'], metrics: ['工资'], aggregation: 'sum' } },
    'pivot-analysis': { selection: single(['姓名', '科目ID', '工资']), parameters: { formId: 'config_pivot', rowDimension: '姓名', columnDimension: '科目ID', metric: '工资' } },
    'trend-analysis': { selection: single(['入职日期', '工资']), parameters: { formId: 'config_trend', timeField: '入职日期', metric: '工资', grain: 'month' } },
    'correlation-analysis': { selection: single(['工资', '绩效']), parameters: { formId: 'config_corr', fields: ['工资', '绩效'] } },
    'anomaly-detection': { selection: single(['工资', '绩效']), parameters: { formId: 'config_anomaly', fields: ['工资', '绩效'], contamination: 0.1 } },
    'cross-table-summary': { selection: { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['工资'] }, parameters: { formId: 'config_cross', relationId: relation.id, dimensions: ['teachers.科目ID'], metrics: ['teachers.工资'], aggregation: 'sum' } },
    'regression-prediction': { selection: single(['工资', '绩效']), parameters: { formId: 'config_regression', target: '绩效', features: ['工资'] } },
    'classification-prediction': { selection: single(['科目ID', '工资', '绩效']), parameters: { formId: 'config_class', target: '科目ID', features: ['工资', '绩效'] } },
    'time-series-prediction': { selection: single(['入职日期', '工资']), parameters: { formId: 'config_ts', timeField: '入职日期', target: '工资', horizon: 6 } },
  };
  for (const template of OPERATION_TEMPLATES) {
    const scenario = cases[template.id];
    if (!scenario) continue;
    const feasibility = analyzeOperationTemplate(value, template.id, scenario.selection, scenario.parameters);
    if (feasibility.status === 'blocked' || feasibility.status === 'needs-configuration') continue;
    const plan = planOperationTemplate(value, template.id, scenario.selection, scenario.parameters);
    const config = plan.preview?.exactConfiguration;
    assert.ok(config, `${template.id}: missing exactConfiguration`);
    assert.ok(config.copy, `${template.id}: missing copy config`);
    assert.ok(config.buttons, `${template.id}: missing buttons config`);
    assert.ok(config.previewControls || config.fieldProjection, `${template.id}: missing previewControls or fieldProjection`);
    assert.ok(config.resultBindings || config.policy || template.category === 'fragment', `${template.id}: missing resultBindings or policy`);
  }
});

test('lookup edit is blocked without a key and entry explicitly requires a stable single key', () => {
  const value = project(); value.srcTable[0].sheets[0].config.keyFields = [];
  const lookup = analyzeOperationTemplate(value, 'single-table-lookup-edit', { tableId: 'teachers', sheetName: '教师' }, { formId: 'edit' });
  assert.equal(lookup.status, 'blocked');
  assert.ok(lookup.checks.some((item) => item.code === 'KEY_REQUIRED'));
  const entry = analyzeOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师', fields: ['姓名'] });
  assert.equal(entry.status, 'blocked');
  assert.ok(entry.checks.some((item) => item.code === 'ENTRY_KEY_CONFIGURATION_REQUIRED'));
});

test('lookup edit rejects overlapping query and editable fields', () => {
  const value = project();
  const report = analyzeOperationTemplate(
    value,
    'single-table-lookup-edit',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名', '工资'] },
    { queryFields: ['教师ID', '姓名'], editableFields: ['姓名', '工资'] },
  );
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some((item) => item.code === 'LOOKUP_FIELD_ROLE_OVERLAP'));
});

test('prediction gates sample size and time/numeric roles', () => {
  const value = project(); value.srcTable[0].sheets[0].rowCount = 12;
  const report = analyzeOperationTemplate(value, 'time-series-prediction', { tableId: 'teachers', sheetName: '教师', fields: ['工资', '入职日期'] }, { timeField: '入职日期', target: '工资', horizon: 3 });
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some((item) => item.code === 'SAMPLE_TOO_SMALL'));
});

test('prediction gates constant targets, sparse features, single-class labels and invalid horizons', () => {
  const regressionValue = project();
  regressionValue.srcTable[0].sheets[0].headers = ['工资', '绩效'];
  regressionValue.srcTable[0].sheets[0].columns = [{ name: '工资', dataType: 'number' }, { name: '绩效', dataType: 'number' }] as any;
  regressionValue.srcTable[0].sheets[0].preview = [
    { 工资: 10, 绩效: 100 },
    { 工资: '', 绩效: 100 },
    { 工资: '', 绩效: 100 },
  ];
  regressionValue.srcTable[0].sheets[0].rowCount = 30;
  const regressionReport = analyzeOperationTemplate(
    regressionValue,
    'regression-prediction',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资', '绩效'] },
    { target: '绩效', features: ['工资'], validationRatio: 0.2 },
  );
  assert.equal(regressionReport.status, 'blocked');
  assert.ok(regressionReport.checks.some((item) => item.code === 'REGRESSION_CONSTANT_TARGET' || item.code === 'FEATURE_MISSING_TOO_HIGH'));

  const classificationValue = project();
  classificationValue.srcTable[0].sheets[0].headers = ['工资', '类别'];
  classificationValue.srcTable[0].sheets[0].columns = [{ name: '工资', dataType: 'number' }, { name: '类别', dataType: 'string' }] as any;
  classificationValue.srcTable[0].sheets[0].preview = [
    { 工资: 10, 类别: 'A' },
    { 工资: 20, 类别: 'A' },
    { 工资: 30, 类别: 'A' },
  ];
  classificationValue.srcTable[0].sheets[0].rowCount = 30;
  const classificationReport = analyzeOperationTemplate(
    classificationValue,
    'classification-prediction',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资', '类别'] },
    { target: '类别', features: ['工资'], validationRatio: 0.2 },
  );
  assert.equal(classificationReport.status, 'blocked');
  assert.ok(classificationReport.checks.some((item) => item.code === 'CLASS_COUNT_TOO_LOW'));

  const timeSeriesValue = project();
  timeSeriesValue.srcTable[0].sheets[0].headers = ['日期', '值'];
  timeSeriesValue.srcTable[0].sheets[0].columns = [{ name: '日期', dataType: 'date' }, { name: '值', dataType: 'number' }] as any;
  timeSeriesValue.srcTable[0].sheets[0].preview = [
    { 日期: '2026-01-01', 值: 10 },
    { 日期: '2026-01-01', 值: 11 },
    { 日期: '2026-01-02', 值: 12 },
    { 日期: '2026-01-03', 值: 13 },
  ];
  timeSeriesValue.srcTable[0].sheets[0].rowCount = 24;
  const timeSeriesReport = analyzeOperationTemplate(
    timeSeriesValue,
    'time-series-prediction',
    { tableId: 'teachers', sheetName: '教师', fields: ['日期', '值'] },
    { timeField: '日期', target: '值', horizon: 4 },
  );
  assert.equal(timeSeriesReport.status, 'blocked');
  assert.ok(timeSeriesReport.checks.some((item) => item.code === 'TIME_FIELD_DUPLICATE' || item.code === 'TIME_SERIES_HORIZON_TOO_LONG'));
});

test('analysis gates aligned correlation samples and informative anomaly fields', () => {
  const correlationValue = project();
  correlationValue.srcTable[0].sheets[0].headers = ['工资', '绩效'];
  correlationValue.srcTable[0].sheets[0].columns = [
    { name: '工资', dataType: 'number' },
    { name: '绩效', dataType: 'number' },
  ] as any;
  correlationValue.srcTable[0].sheets[0].preview = [
    { 工资: 10, 绩效: '' },
    { 工资: '', 绩效: 20 },
    { 工资: 30, 绩效: '' },
  ];
  correlationValue.srcTable[0].sheets[0].rowCount = 3;
  const correlationReport = analyzeOperationTemplate(
    correlationValue,
    'correlation-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资', '绩效'] },
    { fields: ['工资', '绩效'] },
  );
  assert.equal(correlationReport.status, 'blocked');
  assert.ok(correlationReport.checks.some((item) => item.code === 'CORRELATION_ALIGNED_SAMPLES_REQUIRED'));

  const anomalyValue = project();
  anomalyValue.srcTable[0].sheets[0].headers = ['工资'];
  anomalyValue.srcTable[0].sheets[0].columns = [{ name: '工资', dataType: 'number' }] as any;
  anomalyValue.srcTable[0].sheets[0].preview = Array.from({ length: 10 }, () => ({ 工资: 100 }));
  anomalyValue.srcTable[0].sheets[0].rowCount = 10;
  const anomalyReport = analyzeOperationTemplate(
    anomalyValue,
    'anomaly-detection',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资'] },
    { fields: ['工资'], contamination: 0.1 },
  );
  assert.equal(anomalyReport.status, 'blocked');
  assert.ok(anomalyReport.checks.some((item) => item.code === 'ANOMALY_FIELDS_CONSTANT'));
});

test('template recommendations evaluate every template with stable status-first ordering and explainable reasons', () => {
  const value = project();
  const selection = { tableId: 'teachers', tableIds: ['teachers'], sheetName: '教师', fields: ['教师ID', '工资', '入职日期'] };
  const first = recommendOperationTemplates(value, selection);
  const second = recommendOperationTemplates(value, selection);
  assert.equal(first.length, OPERATION_TEMPLATES.length);
  assert.deepEqual(first.map((item) => item.template.id), second.map((item) => item.template.id));
  assert.ok(first[0].matchScore >= first[1].matchScore);
  assert.ok(first.some((item) => item.reasons.some((reason) => reason.includes('唯一主键'))));
  assert.ok(first.some((item) => item.reasons.some((reason) => reason.includes('时间字段'))));
  const firstBlocked = first.findIndex((item) => item.report.status === 'blocked');
  assert.ok(firstBlocked > 0);
  assert.ok(first.slice(0, firstBlocked).every((item) => item.report.status !== 'blocked'));
});

test('template recommendations infer only safe parameters and include project custom templates', () => {
  const value = project() as any;
  value.customOperationTemplates = [{
    id: 'custom-safe-entry', version: '1.0.0', kind: 'operation', category: 'entry', name: '自定义安全录入', description: '自定义模板',
    selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, minFields: 1, requiresWritable: true },
    parameterSchema: { type: 'object', properties: { selectedFields: { type: 'array', items: { type: 'string' } } }, required: [], additionalProperties: false },
    generation: { forms: 1, workflows: 0, behaviors: 0, outputs: 0, tests: 1, modifiesData: false, destructive: false },
  }];
  const recommendations = recommendOperationTemplates(value, {
    tableId: 'teachers',
    tableIds: ['teachers'],
    sheetName: '教师',
    fields: ['工资', '入职日期'],
  });
  assert.ok(recommendations.some((item) => item.template.id === 'custom-safe-entry'));
  const trend = recommendations.find((item) => item.template.id === 'trend-analysis')!;
  assert.equal(trend.suggestedParameters.timeField, '入职日期');
  assert.equal(trend.suggestedParameters.metric, '工资');
  assert.equal(trend.suggestedParameters.grain, 'month');
  assert.deepEqual(trend.unresolvedParameters, []);
  const prediction = recommendations.find((item) => item.template.id === 'time-series-prediction')!;
  assert.equal(prediction.suggestedParameters.target, '工资');
  assert.equal(prediction.suggestedParameters.horizon, 6);
});

test('low-confidence inferred field types require explicit configuration before planning', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers.push('联系方式');
  value.srcTable[0].sheets[0].columns.push({ name: '联系方式', index: 6, dataType: 'unknown', nullable: true, uniqueCount: 3, sampleValues: ['见备注'] });
  value.srcTable[0].sheets[0].preview[0].联系方式 = '见备注';
  const report = analyzeOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '联系方式'] },
    { formId: 'teacher_contact_entry' },
  );
  assert.equal(report.status, 'needs-configuration');
  assert.ok(report.checks.some((item) => item.code === 'FIELD_TYPE_CONFIRMATION_REQUIRED'));
  assert.ok(report.requiredQuestions.some((item) => item.id === 'field_type:联系方式'));
});

test('feasibility matrix rejects missing tables, fields, invalid keys, read-only data and missing relations', () => {
  const noTable = analyzeOperationTemplate({ ...project(), srcTable: [] }, 'single-table-entry', {});
  assert.ok(noTable.checks.some((item) => item.code === 'TABLE_REQUIRED'));
  const noFields = project(); noFields.srcTable[0].sheets[0].headers = []; noFields.srcTable[0].sheets[0].columns = [];
  assert.ok(analyzeOperationTemplate(noFields, 'single-table-entry', { tableId: 'teachers', sheetName: '教师' }).checks.some((item) => item.code === 'FIELDS_REQUIRED'));
  const invalidKeys = project(); invalidKeys.srcTable[0].sheets[0].preview = [{ 教师ID: '', 姓名: '甲' }, { 教师ID: 'T1', 姓名: '乙' }, { 教师ID: 'T1', 姓名: '丙' }];
  const invalidKeyReport = analyzeOperationTemplate(invalidKeys, 'single-table-lookup-edit', { tableId: 'teachers', sheetName: '教师' });
  assert.ok(invalidKeyReport.checks.some((item) => item.code === 'EMPTY_KEY'));
  assert.ok(invalidKeyReport.checks.some((item) => item.code === 'DUPLICATE_KEY'));
  const readonly = project(); readonly.srcTable[0].sheets[0].config.readOnly = true;
  assert.ok(analyzeOperationTemplate(readonly, 'single-table-entry', { tableId: 'teachers', sheetName: '教师' }).checks.some((item) => item.code === 'READ_ONLY_TABLE'));
  assert.ok(analyzeOperationTemplate(project(), 'join-query-update', { tableIds: ['teachers', 'subjects'], relationIds: ['missing'] }, { relationId: 'missing' }).checks.some((item) => item.code === 'RELATION_REQUIRED'));
});

test('feasibility rejects incompatible relation types and mostly unparseable time fields', () => {
  const mismatch = project(); mismatch.srcTable[1].sheets[0].columns[0].dataType = 'number';
  const relation: DataRelation = { id: 'bad_types', name: '类型错误', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  assert.ok(validateRelation(mismatch, relation).checks.some((item) => item.code === 'RELATION_TYPE_MISMATCH'));
  const invalidTime = project(); invalidTime.srcTable[0].sheets[0].rowCount = 3; invalidTime.srcTable[0].sheets[0].preview = [{ 工资: 10, 入职日期: '不是日期' }, { 工资: 20, 入职日期: '仍然不是' }, { 工资: 30, 入职日期: '2026-01-01' }];
  const report = analyzeOperationTemplate(invalidTime, 'trend-analysis', { tableId: 'teachers', sheetName: '教师', fields: ['工资', '入职日期'] }, { timeField: '入职日期', metric: '工资', grain: 'month' });
  assert.ok(report.checks.some((item) => item.code === 'TIME_FIELD_UNPARSABLE'));
  const narrowSpan = project(); narrowSpan.srcTable[0].sheets[0].rowCount = 3; narrowSpan.srcTable[0].sheets[0].preview = [{ 工资: 10, 入职日期: '2026-01-01' }, { 工资: 20, 入职日期: '2026-01-15' }, { 工资: 30, 入职日期: '2026-01-30' }];
  const narrowReport = analyzeOperationTemplate(narrowSpan, 'trend-analysis', { tableId: 'teachers', sheetName: '教师', fields: ['工资', '入职日期'] }, { timeField: '入职日期', metric: '工资', grain: 'year' });
  assert.ok(narrowReport.checks.some((item) => item.code === 'TIME_GRAIN_SPAN_TOO_NARROW'));
  const wideSpan = project(); wideSpan.srcTable[0].sheets[0].rowCount = 3; wideSpan.srcTable[0].sheets[0].preview = [{ 工资: 10, 入职日期: '2024-01-01' }, { 工资: 20, 入职日期: '2025-06-01' }, { 工资: 30, 入职日期: '2026-12-31' }];
  const wideReport = analyzeOperationTemplate(wideSpan, 'trend-analysis', { tableId: 'teachers', sheetName: '教师', fields: ['工资', '入职日期'] }, { timeField: '入职日期', metric: '工资', grain: 'day' });
  assert.ok(wideReport.checks.some((item) => item.code === 'TIME_GRAIN_SPAN_TOO_WIDE'));
});

test('relation validation catches arity and type mismatches', () => {
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID', '教师ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  const result = validateRelation(project(), relation);
  assert.equal(result.valid, false);
  assert.ok(result.checks.some((item) => item.code === 'RELATION_ARITY_MISMATCH'));
});

test('entry template blocks more than 49 fields to prevent unusable forms', () => {
  const value = project();
  const headers = Array.from({ length: 50 }, (_, index) => `字段${index + 1}`);
  const columns = headers.map((name) => ({ name, dataType: 'string' }));
  const preview = [Object.fromEntries(headers.map((name) => [name, '示例']))];
  value.srcTable[0].sheets[0].headers = headers;
  value.srcTable[0].sheets[0].columns = columns as any;
  value.srcTable[0].sheets[0].preview = preview;
  value.srcTable[0].sheets[0].rowCount = 1;
  const report = analyzeOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师', fields: headers });
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some((item) => item.code === 'FIELD_COUNT_EXCEEDED'));
});

test('plan previews conflicts and atomically applies managed template metadata', () => {
  const value = project();
  const plan = planOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名'] }, { formId: 'teacher_entry', name: '教师录入' });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.artifacts.forms[0].id, 'teacher_entry');
  assert.deepEqual(plan.preview?.fieldProjection?.visibleFields, ['教师ID', '姓名']);
  assert.equal(plan.preview?.layout?.window?.title, '教师录入');
  assert.ok(Array.isArray(plan.preview?.rules?.[0]?.lines));
  assert.ok(Array.isArray(plan.preview?.buttonTriggers));
  const next = applyOperationPlan(value, plan);
  assert.equal(value.forms.length, 0, 'input project must not be mutated');
  assert.equal(next.forms.length, 1);
  assert.match(next.forms[0].ruleCode, /on submit -> run\("teacher_entry_save_flow"\); message\("保存成功", success\)/);
  assert.equal(next.templateInstances[0].id, plan.instanceId);
  assert.deepEqual(next.templateInstances[0].resources.ruleIds, ['teacher_entry::rule']);
  assert.deepEqual(next.templateInstances[0].resources.behaviorIds, ['teacher_entry::behavior::teacher_entry_reset_action']);
  assert.equal(next.testing.suites.length, 3);
  const conflicting = planOperationTemplate(next, 'single-table-entry', { tableId: 'teachers', sheetName: '教师', fields: ['姓名'] }, { formId: 'teacher_entry' });
  assert.equal(conflicting.conflicts[0].resourceId, 'teacher_entry');
  assert.throws(() => applyOperationPlan(next, conflicting), /已存在/);
});

test('selectedFields can drive generation when selection.fields is omitted and mismatches are blocked', () => {
  const value = project();
  const parameterDriven = planOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师' },
    { formId: 'teacher_selected_only', selectedFields: ['教师ID', '工资'] },
  );
  assert.deepEqual(
    parameterDriven.artifacts.forms[0].design.components
      .filter((item: any) => item.fieldBinding && item.fieldBinding !== '_生成状态')
      .map((item: any) => item.fieldBinding),
    ['教师ID', '工资'],
  );
  assert.deepEqual(parameterDriven.preview?.fieldProjection?.visibleFields, ['教师ID', '工资']);

  const mismatch = analyzeOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名'] },
    { selectedFields: ['教师ID', '工资'] },
  );
  assert.equal(mismatch.status, 'blocked');
  assert.ok(mismatch.checks.some((item) => item.code === 'SELECTED_FIELDS_MISMATCH'));
});

test('template protocol reuses the production scaffold for runnable entry and lookup-edit forms', () => {
  const value = project();
  const entry = planOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名'] }, { formId: 'teacher_entry', title: '教师资料录入', subtitle: '按教职工字段生成', columns: 1, includeReset: false, saveLabel: '保存教师资料', resetLabel: '清空重填', layoutMode: 'single-column', sectionMode: 'by-type', denseLayout: true, keyStrategy: 'upsert', duplicatePolicy: 'error', submitMode: 'create', resultField: '_写回结果', changeLogField: '_写回差异', writeBackField: '_写回状态' });
  assert.deepEqual(entry.artifacts.forms[0].design.components.filter((item: any) => item.fieldBinding && item.fieldBinding !== '_生成状态').map((item: any) => item.fieldBinding), ['教师ID', '姓名']);
  assert.ok(entry.artifacts.forms[0].design.components.some((item: any) => item.props?.label === '保存教师资料'));
  assert.equal(entry.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '保存教师资料')?.props?.events, undefined);
  assert.equal(entry.artifacts.forms[0].design.components.some((item: any) => item.props?.label === '重置'), false);
  assert.equal(entry.artifacts.forms[0].design.formWindow.props.title, '教师资料录入');
  assert.equal(entry.artifacts.forms[0].design.formWindow.props.subtitle, '按教职工字段生成');
  assert.equal(entry.preview?.layout?.mode, 'single-column');
  assert.equal(entry.preview?.layout?.sectionMode, 'by-type');
  assert.equal(entry.artifacts.forms[0].design.templateParameters.entryPolicy.keyStrategy, 'upsert');
  assert.equal(entry.artifacts.forms[0].design.templateParameters.entryPolicy.duplicatePolicy, 'error');
  assert.match(entry.artifacts.forms[0].ruleCode, /on submit -> run\("teacher_entry_save_flow"\); message\("保存成功", success\)/);
  assert.equal(JSON.parse(entry.artifacts.workflows[0].nodes.find((item: any) => item.id === 'submit').data.propertiesJson).writeBackMode, 'upsert');

  const entryInsert = planOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名'] }, { formId: 'teacher_insert_only', keyStrategy: 'insert' });
  assert.equal(JSON.parse(entryInsert.artifacts.workflows[0].nodes.find((item: any) => item.id === 'submit').data.propertiesJson).writeBackMode, 'insert');

  const lookup = planOperationTemplate(value, 'single-table-lookup-edit', { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名', '科目ID', '工资'] }, { formId: 'teacher_edit', queryFields: ['教师ID'], displayFields: ['科目ID'], editableFields: ['姓名', '工资'], lookupLabel: '查找教师', saveLabel: '提交修改', queryLimit: 1, autoQueryOnLoad: true, queryMode: 'any', dirtyOnly: true, refetchAfterSave: true, conflictPolicy: 'error', successMessage: '已保存教师修改', emptyResultMessage: '无结果', multipleResultMessage: '结果过多' });
  const renamedLookupButton = lookup.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '查找教师');
  assert.equal(renamedLookupButton.props.events, undefined);
  assert.equal(renamedLookupButton.props.flowTriggers?.onClick?.enabled, true);
  assert.equal(renamedLookupButton.props.flowTriggers?.onClick?.workflowId, 'teacher_edit_lookup_flow');
  assert.deepEqual(renamedLookupButton.props.flowTriggers?.onClick?.parameterMap?.['workflow_import.criteria'], { 教师ID: '$form.教师ID' });
  assert.deepEqual(lookup.artifacts.forms[0].design.templateParameters.fieldProjection.queryFields, ['教师ID']);
  assert.deepEqual(lookup.artifacts.forms[0].design.templateParameters.fieldProjection.displayFields, ['科目ID']);
  assert.deepEqual(lookup.artifacts.forms[0].design.templateParameters.fieldProjection.editableFields, ['姓名', '工资']);
  assert.deepEqual(lookup.preview?.fieldProjection?.queryFields, ['教师ID']);
  assert.deepEqual(lookup.preview?.fieldProjection?.displayFields, ['科目ID']);
  assert.deepEqual(lookup.preview?.fieldProjection?.editableFields, ['姓名', '工资']);
  const queryField = lookup.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '教师ID');
  const displayField = lookup.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '科目ID');
  const editableField = lookup.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '姓名');
  const saveFieldButton = lookup.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '提交修改');
  assert.equal(queryField.props.generatedRole, 'query');
  assert.equal(queryField.props.readonly, false);
  assert.equal(displayField.props.generatedRole, 'display');
  assert.equal(displayField.props.readonly, true);
  assert.equal(displayField.props.disabled, true);
  assert.equal(editableField.props.generatedRole, 'editable');
  assert.equal(editableField.props.disabled, true);
  assert.ok(saveFieldButton);
  assert.equal(saveFieldButton.props.disabled, true);
  assert.equal(saveFieldButton.props.disabledExpression, '($_lookupMatched != true) || ($_lookupUnique != true) || ($_lookupMatchCount != 1)');
  assert.equal(saveFieldButton.props.flowTriggers?.onClick?.enabled, true);
  assert.deepEqual(saveFieldButton.props.flowTriggers?.onClick?.parameterMap?.['workflow_import.originalData'], { 教师ID: '$form._original_教师ID', 科目ID: '$form._original_科目ID', 姓名: '$form._original_姓名', 工资: '$form._original_工资' });
  assert.equal(lookup.artifacts.forms[0].design.templateParameters.lookupPolicy.autoQueryOnLoad, true);
  assert.equal(lookup.artifacts.forms[0].design.templateParameters.lookupPolicy.queryMode, 'any');
  assert.equal(lookup.artifacts.forms[0].design.templateParameters.lookupPolicy.queryLimit, 1);
  assert.equal(lookup.artifacts.forms[0].design.templateParameters.lookupPolicy.dirtyOnly, true);
  assert.equal(lookup.artifacts.forms[0].design.templateParameters.lookupPolicy.refetchAfterSave, true);
  assert.deepEqual(lookup.artifacts.forms[0].design.templateParameters.lookupPolicy.unlockComponentIds.sort(), [displayField.id, editableField.id, saveFieldButton.id, lookup.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '工资').id].sort());
  assert.equal(lookup.preview?.exactConfiguration?.copy?.successMessage, '已保存教师修改');
  assert.equal(lookup.preview?.exactConfiguration?.policy?.lookupPolicy?.autoQueryOnLoad, true);
  assert.equal(lookup.preview?.exactConfiguration?.policy?.lookupPolicy?.queryMode, 'any');
  assert.equal(lookup.preview?.exactConfiguration?.policy?.lookupPolicy?.queryLimit, 1);
  assert.equal(lookup.preview?.exactConfiguration?.policy?.lookupPolicy?.dirtyOnly, true);
  assert.deepEqual(lookup.preview?.exactConfiguration?.resultBindings, {
    resultField: '_查询结果',
    changeLogField: '_变更差异',
    writeBackField: '_更新状态',
  });
  assert.equal(lookup.artifacts.rules[0].kind, 'rule');
  assert.match(lookup.artifacts.forms[0].ruleCode, /before click\("lookup"\) -> requireAny\(\$教师ID\)/);
  assert.match(lookup.artifacts.forms[0].ruleCode, /before submit -> require\(\$_lookupMatched\)/);
  assert.match(lookup.artifacts.forms[0].ruleCode, /before submit -> requireDirty\(\$姓名, \$工资\)/);
  const lookupWorkflow = lookup.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'form:lookup-fill'));
  assert.ok(lookupWorkflow);
  const lookupNode = lookupWorkflow.nodes.find((node: any) => node.specId === 'form:lookup-fill');
  const lookupProps = JSON.parse(lookupNode.data.propertiesJson);
  assert.deepEqual(lookupProps.queryFields, ['教师ID']);
  assert.equal(lookupProps.queryMode, 'any');
  assert.equal(lookupProps.maxMatches, 1);
  assert.equal(lookupProps.notFoundMessage, '无结果');
  assert.equal(lookupProps.multipleMatchMessage, '结果过多');
  assert.deepEqual(lookupProps.fieldMap, { 教师ID: '教师ID', 科目ID: '科目ID', 姓名: '姓名', 工资: '工资' });
  assert.deepEqual(lookupProps.originalFieldMap, { 教师ID: '_original_教师ID', 科目ID: '_original_科目ID', 姓名: '_original_姓名', 工资: '_original_工资' });
  assert.equal(Array.isArray(lookupProps.enableComponentIds), true);
  assert.equal(lookupWorkflow.edges.some((edge: any) => edge.sourceHandle === 'out:matched' && edge.targetHandle === 'in:matched'), true);
  assert.equal(lookupWorkflow.edges.some((edge: any) => edge.sourceHandle === 'out:matchCount' && edge.targetHandle === 'in:matchCount'), true);
  const lookupSaveFlow = lookup.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'behavior:submit'));
  assert.ok(lookupSaveFlow);
  const lookupSaveProps = JSON.parse(lookupSaveFlow.nodes.find((node: any) => node.id === 'submit').data.propertiesJson);
  assert.equal(lookupSaveProps.writeBackMode, 'update');
  assert.equal(lookupSaveProps.dirtyOnly, true);
  assert.equal(lookupSaveProps.conflictPolicy, 'error');
  assert.equal(lookupSaveProps.refetchAfterSave, true);
  assert.equal(lookupSaveProps.successMessage, '已保存教师修改');
  assert.deepEqual(lookupSaveProps.refreshOriginalFieldMap, { 教师ID: '_original_教师ID', 科目ID: '_original_科目ID', 姓名: '_original_姓名', 工资: '_original_工资' });
  assert.deepEqual(lookupSaveProps.conflictCheckFields, ['姓名', '工资']);
  assert.doesNotThrow(() => applyOperationPlan(value, lookup));

  const lookupFullWriteback = planOperationTemplate(value, 'single-table-lookup-edit', { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名', '工资'] }, { formId: 'teacher_edit_full_row', queryFields: ['教师ID'], editableFields: ['姓名', '工资'], dirtyOnly: false });
  const lookupFullSaveFlow = lookupFullWriteback.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'behavior:submit'));
  const lookupFullSaveProps = JSON.parse(lookupFullSaveFlow!.nodes.find((node: any) => node.id === 'submit').data.propertiesJson);
  assert.equal(lookupFullSaveProps.writeBackMode, 'upsert');
  assert.equal(lookupFullSaveProps.dirtyOnly, false);

  const lookupRefreshOnConflict = planOperationTemplate(value, 'single-table-lookup-edit', { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名', '工资'] }, { formId: 'teacher_edit_refresh_retry', queryFields: ['教师ID'], editableFields: ['姓名', '工资'], conflictPolicy: 'refresh-and-retry', refetchAfterSave: true });
  const lookupRefreshSaveFlow = lookupRefreshOnConflict.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'behavior:submit'));
  const lookupRefreshSaveProps = JSON.parse(lookupRefreshSaveFlow!.nodes.find((node: any) => node.id === 'submit').data.propertiesJson);
  assert.equal(lookupRefreshSaveProps.conflictPolicy, 'refresh-and-retry');
  assert.equal(lookupRefreshSaveProps.refetchAfterSave, true);
});

test('lookup-edit generated test assets cover not-found, multiple-match, unique-match and refetch scenarios', () => {
  const value = project();
  const plan = planOperationTemplate(
    value,
    'single-table-lookup-edit',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '姓名', '工资'] },
    { formId: 'teacher_lookup_asset_cases', queryFields: ['教师ID'], editableFields: ['姓名', '工资'], queryLimit: 2, dirtyOnly: true, refetchAfterSave: true },
  );
  const cases = plan.artifacts.tests.flatMap((suite: any) => suite.cases);
  const notFound = cases.find((item: any) => item.category === 'lookup-not-found');
  const multiple = cases.find((item: any) => item.category === 'lookup-multiple-match');
  const unique = cases.find((item: any) => item.category === 'lookup-unique-match');
  const refetch = cases.find((item: any) => item.category === 'lookup-refetch-after-save');
  const conflict = cases.find((item: any) => item.category === 'lookup-conflict');
  assert.ok(notFound);
  assert.equal(notFound.expected.lookup, 'not-found');
  assert.equal(notFound.expected.saveEnabled, false);
  assert.ok(multiple);
  assert.equal(multiple.expected.lookup, 'multiple-match');
  assert.equal(multiple.expected.saveEnabled, false);
  assert.equal(multiple.inputs.queryLimit, 2);
  assert.ok(unique);
  assert.equal(unique.expected.lookup, 'unique-match');
  assert.equal(unique.expected.dirtyOnly, true);
  assert.ok(refetch);
  assert.equal(refetch.expected.refetchAfterSave, true);
  assert.equal(refetch.expected.requeryConsistent, true);
  assert.ok(conflict);
  assert.equal(conflict.expected.conflictPolicy, 'error');
  assert.deepEqual(conflict.expected.staleFields, ['姓名', '工资']);
});

test('normalized field semantics are projected into generated component validators and defaults', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['教师ID', '手机号', '邮箱', '个人主页', '创建日期', '人数'];
  value.srcTable[0].sheets[0].columns = [
    { name: '教师ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 1, sampleValues: ['T1'] },
    { name: '手机号', index: 1, dataType: 'string', nullable: false, uniqueCount: 1, sampleValues: ['13800138000'] },
    { name: '邮箱', index: 2, dataType: 'string', nullable: true, uniqueCount: 1, sampleValues: ['teacher@example.com'] },
    { name: '个人主页', index: 3, dataType: 'string', nullable: true, uniqueCount: 1, sampleValues: ['https://example.com'] },
    { name: '创建日期', index: 4, dataType: 'date', nullable: false, uniqueCount: 1, sampleValues: ['2026-01-01'] },
    { name: '人数', index: 5, dataType: 'number', nullable: false, uniqueCount: 1, sampleValues: [12] },
  ];
  value.srcTable[0].sheets[0].preview = [{ 教师ID: 'T1', 手机号: '13800138000', 邮箱: 'teacher@example.com', 个人主页: 'https://example.com', 创建日期: '2026-01-01', 人数: 12 }];
  const plan = planOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '手机号', '邮箱', '个人主页', '创建日期', '人数'] },
    { formId: 'teacher_semantics_entry' },
  );
  const components = plan.artifacts.forms[0].design.components as any[];
  assert.equal(components.find((item) => item.fieldBinding === '手机号')?.props.validator, 'phone');
  assert.equal(components.find((item) => item.fieldBinding === '邮箱')?.props.validator, 'email');
  assert.equal(components.find((item) => item.fieldBinding === '个人主页')?.props.validator, 'url');
  assert.equal(components.find((item) => item.fieldBinding === '人数')?.props.validator, 'integer');
  assert.equal(components.find((item) => item.fieldBinding === '创建日期')?.props.defaultValue, '@today');
  assert.equal(plan.preview?.normalizedFields?.find((field: any) => field.name === '人数')?.type, 'integer');
});

test('entry rules and preview expose exact field constraints and generated roles', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['教师ID', '身份证号', '邮箱', '年龄', '入职日期'];
  value.srcTable[0].sheets[0].columns = [
    { name: '教师ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['T1', 'T2'] },
    { name: '身份证号', index: 1, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['110101199001011234', '110101199201011234'] },
    { name: '邮箱', index: 2, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['a@example.com', 'b@example.com'] },
    { name: '年龄', index: 3, dataType: 'number', nullable: false, uniqueCount: 2, sampleValues: [18, 60] },
    { name: '入职日期', index: 4, dataType: 'date', nullable: false, uniqueCount: 2, sampleValues: ['2026-01-01', '2026-02-01'] },
  ];
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 身份证号: '110101199001011234', 邮箱: 'a@example.com', 年龄: 18, 入职日期: '2026-01-01' },
    { 教师ID: 'T2', 身份证号: '110101199201011234', 邮箱: 'b@example.com', 年龄: 60, 入职日期: '2026-02-01' },
  ];
  const plan = planOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '身份证号', '邮箱', '年龄', '入职日期'] },
    { formId: 'teacher_constraints_entry' },
  );
  assert.match(plan.artifacts.forms[0].ruleCode, /before submit -> require\(\$身份证号\)/);
  assert.match(plan.artifacts.forms[0].ruleCode, /before submit -> validate\(\$邮箱, email\)/);
  assert.match(plan.artifacts.forms[0].ruleCode, /before submit -> validate\(\$年龄, (integer|number)\)/);
  const previewAge = plan.preview?.layout?.generatedRoles?.find((item: any) => item.field === '年龄');
  const previewDate = plan.preview?.layout?.generatedRoles?.find((item: any) => item.field === '入职日期');
  assert.equal(previewAge?.required, true);
  assert.ok(['integer', 'number'].includes(String(previewAge?.validator || '')));
  assert.equal(previewDate?.defaultValue, '@today');
});

test('entry compiles configured computed fields into rule DSL and keeps them readonly', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['教师ID', '课时', '单价', '总额'];
  value.srcTable[0].sheets[0].columns = [
    { name: '教师ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 1, sampleValues: ['T1'] },
    { name: '课时', index: 1, dataType: 'number', nullable: false, uniqueCount: 1, sampleValues: [2] },
    { name: '单价', index: 2, dataType: 'number', nullable: false, uniqueCount: 1, sampleValues: [120] },
    { name: '总额', index: 3, dataType: 'number', nullable: false, uniqueCount: 1, sampleValues: [240] },
  ] as any;
  value.srcTable[0].sheets[0].config.computedFields = [
    { target: '总额', expression: '$课时 * $单价' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 课时: 2, 单价: 120, 总额: 240 },
  ];
  const plan = planOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '课时', '单价', '总额'] },
    { formId: 'teacher_computed_entry' },
  );
  assert.match(plan.artifacts.forms[0].ruleCode, /compute \$总额 = \$课时 \* \$单价 watch\(\$课时, \$单价\)/);
  assert.match(plan.artifacts.forms[0].ruleCode, /before submit -> keepReadonly\(\$总额\)/);
  const amountComponent = (plan.artifacts.forms[0].design.components as any[]).find((item) => item.fieldBinding === '总额');
  assert.equal(amountComponent?.props.readonly, true);
  assert.equal(amountComponent?.props.generatedFieldType, 'computed');
  assert.equal(amountComponent?.props.defaultValue, '$课时 * $单价');
  const previewAmount = plan.preview?.layout?.generatedRoles?.find((item: any) => item.field === '总额');
  assert.equal(previewAmount?.readonly, true);
  assert.equal(plan.preview?.normalizedFields?.find((field: any) => field.name === '总额')?.computed, true);
});

test('entry consumes explicit default values, computed expressions and linkage DSL in rules, preview and components', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['教师ID', '状态', '驳回原因', '课时', '单价', '总额'];
  value.srcTable[0].sheets[0].columns = [
    { name: '教师ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 1, sampleValues: ['T1'] },
    { name: '状态', index: 1, dataType: 'enum', nullable: false, uniqueCount: 2, sampleValues: ['草稿', '驳回'] },
    { name: '驳回原因', index: 2, dataType: 'string', nullable: true, uniqueCount: 1, sampleValues: ['资料不完整'] },
    { name: '课时', index: 3, dataType: 'number', nullable: false, uniqueCount: 1, sampleValues: [2] },
    { name: '单价', index: 4, dataType: 'number', nullable: false, uniqueCount: 1, sampleValues: [120] },
    { name: '总额', index: 5, dataType: 'number', nullable: true, uniqueCount: 1, sampleValues: [240] },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 状态: '草稿', 驳回原因: '', 课时: 2, 单价: 120, 总额: 240 },
  ];
  const plan = planOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', '状态', '驳回原因', '课时', '单价', '总额'] },
    {
      formId: 'teacher_configured_entry',
      defaultValues: { 状态: '草稿' },
      computedExpressions: { 总额: '$课时 * $单价' },
      linkageDsl: [
        'when $状态 == "驳回" -> show(@驳回原因); require($驳回原因)',
        'else -> hide(@驳回原因); clear($驳回原因)',
      ],
    },
  );
  assert.match(plan.artifacts.forms[0].ruleCode, /compute \$总额 = \$课时 \* \$单价 watch\(\$课时, \$单价\)/);
  assert.match(plan.artifacts.forms[0].ruleCode, /when \$状态 == "驳回" -> show\(@驳回原因\); require\(\$驳回原因\)/);
  assert.match(plan.artifacts.forms[0].ruleCode, /else -> hide\(@驳回原因\); clear\(\$驳回原因\)/);
  const components = plan.artifacts.forms[0].design.components as any[];
  const statusComponent = components.find((item) => item.fieldBinding === '状态');
  const rejectReasonComponent = components.find((item) => item.fieldBinding === '驳回原因');
  const amountComponent = components.find((item) => item.fieldBinding === '总额');
  assert.equal(statusComponent?.props.defaultValue, '草稿');
  assert.equal(amountComponent?.props.readonly, true);
  assert.equal(amountComponent?.props.generatedFieldType, 'computed');
  assert.equal(amountComponent?.props.defaultValue, '$课时 * $单价');
  assert.equal(statusComponent?.props.linkageRules?.onChange?.length, 2);
  assert.equal(statusComponent?.props.linkageRules?.onChange?.[0]?.actions?.[0]?.targetComponentId, rejectReasonComponent?.id);
  assert.equal(plan.preview?.layout?.generatedRoles?.find((item: any) => item.field === '状态')?.defaultValue, '草稿');
  assert.equal(plan.preview?.normalizedFields?.find((item: any) => item.name === '总额')?.computed, true);
  assert.deepEqual(plan.preview?.exactConfiguration?.policy?.entryPolicy?.defaultValues, { 状态: '草稿' });
  assert.deepEqual(plan.preview?.exactConfiguration?.policy?.entryPolicy?.computedExpressions, { 总额: '$课时 * $单价' });
  assert.deepEqual(plan.preview?.exactConfiguration?.policy?.entryPolicy?.linkageDsl, [
    'when $状态 == "驳回" -> show(@驳回原因); require($驳回原因)',
    'else -> hide(@驳回原因); clear($驳回原因)',
  ]);
});

test('entry adds cross-field date order guards for common start/end pairs', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['任务ID', '开始日期', '结束日期'];
  value.srcTable[0].sheets[0].columns = [
    { name: '任务ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 2, sampleValues: ['A1', 'A2'] },
    { name: '开始日期', index: 1, dataType: 'date', nullable: false, uniqueCount: 2, sampleValues: ['2026-07-01', '2026-07-03'] },
    { name: '结束日期', index: 2, dataType: 'date', nullable: false, uniqueCount: 2, sampleValues: ['2026-07-02', '2026-07-04'] },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 任务ID: 'A1', 开始日期: '2026-07-01', 结束日期: '2026-07-02' },
    { 任务ID: 'A2', 开始日期: '2026-07-03', 结束日期: '2026-07-04' },
  ];
  const plan = planOperationTemplate(
    value,
    'single-table-entry',
    { tableId: 'teachers', sheetName: '教师', fields: ['任务ID', '开始日期', '结束日期'] },
    { formId: 'task_date_order_entry' },
  );
  assert.match(plan.artifacts.forms[0].ruleCode, /before submit -> compare\(\$结束日期, ">=", \$开始日期\)/);
});

test('multi-table transaction propagates generated keys and leaves input untouched', () => {
  const value = project();
  value.srcTable[0].sheets[0].columns[0].dataType = 'number';
  value.srcTable[0].sheets[0].preview = [{ 教师ID: 1, 姓名: '甲', 科目ID: 'S1', 工资: 100, 入职日期: '2026-01-01' }];
  value.srcTable[1].sheets[0].headers.push('创建教师ID');
  value.srcTable[1].sheets[0].columns.push({ name: '创建教师ID', dataType: 'number' });
  const result = applyDataRowsTransaction(value, [
    { id: 'teacher', tableId: 'teachers', sheetName: '教师', adds: [{ 姓名: '乙', 科目ID: 'S2', 工资: 120 }] },
    { id: 'subject', tableId: 'subjects', sheetName: '科目', adds: [{ 科目ID: 'S2', 科目名: '体育', 创建教师ID: { $ref: 'teacher.0.教师ID' } }] },
  ]);
  assert.equal(value.srcTable[0].sheets[0].preview.length, 1);
  assert.equal(result.project.srcTable[0].sheets[0].preview[1].教师ID, 2);
  assert.equal(result.project.srcTable[1].sheets[0].preview[1].创建教师ID, 2);
  assert.equal(result.totalChanges, 2);
});

test('failed later transaction operation rolls back the whole cloned result', () => {
  const value = project();
  assert.throws(() => applyDataRowsTransaction(value, [
    { id: 'teacher', tableId: 'teachers', sheetName: '教师', adds: [{ 教师ID: 'T2', 姓名: '乙' }] },
    { id: 'missing', tableId: 'subjects', sheetName: '不存在', adds: [{ 科目ID: 'S2' }] },
  ]), /不存在/);
  assert.equal(value.srcTable[0].sheets[0].preview.length, 1);
});

test('later duplicate-key conflict leaves every table unchanged in a multi-table transaction', () => {
  const value = project();
  const originalTeachers = structuredClone(value.srcTable[0].sheets[0].preview);
  const originalSubjects = structuredClone(value.srcTable[1].sheets[0].preview);
  assert.throws(() => applyDataRowsTransaction(value, [
    { id: 'teacher', tableId: 'teachers', sheetName: '教师', adds: [{ 教师ID: 'T2', 姓名: '乙', 科目ID: 'S1', 工资: 120, 绩效: 91, 入职日期: '2026-02-01' }] },
    { id: 'subject', tableId: 'subjects', sheetName: '科目', adds: [{ 科目ID: 'S1', 科目名: '重复科目' }] },
  ]), /重复|唯一|duplicate/i);
  assert.deepEqual(value.srcTable[0].sheets[0].preview, originalTeachers);
  assert.deepEqual(value.srcTable[1].sheets[0].preview, originalSubjects);
});

test('later update conflict leaves every table unchanged in a multi-table batch-style transaction', () => {
  const value = project();
  const originalTeachers = structuredClone(value.srcTable[0].sheets[0].preview);
  const originalSubjects = structuredClone(value.srcTable[1].sheets[0].preview);
  assert.throws(() => applyDataRowsTransaction(value, [
    { id: 'teacher_batch', tableId: 'teachers', sheetName: '教师', updates: [{ rowKey: 'T1', changes: { 工资: 150 } }] },
    { id: 'subject_batch', tableId: 'subjects', sheetName: '科目', updates: [{ rowKey: 'S9', changes: { 科目名: '不存在的科目' } }] },
  ]), /不存在|not found|missing/i);
  assert.deepEqual(value.srcTable[0].sheets[0].preview, originalTeachers);
  assert.deepEqual(value.srcTable[1].sheets[0].preview, originalSubjects);
});

test('declared relation query preserves source keys and supports left join', () => {
  const value = project();
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  value.srcTable[0].sheets[0].preview.push({ 教师ID: 'T2', 姓名: '乙', 科目ID: 'S9', 工资: 90, 入职日期: '2026-02-01' });
  const result = queryRelationRows(value, { relationId: relation.id, pageSize: 10 });
  assert.equal(result.total, 2);
  assert.equal(result.rows[0]['subjects.科目名'], '劳动课');
  assert.deepEqual((result.rows[0].__sources as any).teachers, { 教师ID: 'T1' });
  assert.equal((result.rows[1].__sources as any).subjects, null);
});

test('relation suggestions use names, compatible types, keys and sample overlap without mutating the project', () => {
  const value = project();
  const suggestions = suggestDataRelations(value);
  const subject = suggestions.find((item) => item.left.fields[0] === '科目ID' && item.right.fields[0] === '科目ID');
  assert.ok(subject);
  assert.equal(subject.cardinality, 'many-to-one');
  assert.ok(subject.confidence >= 0.8);
  assert.ok(subject.reasons.some((reason) => reason.includes('样本值重合')));
  assert.deepEqual(value.relations, []);
});

test('relation query supports filtering, sorting, paging and complete export', () => {
  const value = project();
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  value.srcTable[0].sheets[0].preview.push({ 教师ID: 'T2', 姓名: '乙', 科目ID: 'S1', 工资: 200, 入职日期: '2026-02-01' });
  const filtered = queryRelationRows(value, { relationId: relation.id, page: 1, pageSize: 1, filterModel: { 'teachers.工资': { type: 'greaterThan', filter: 100 } }, sortModel: [{ colId: 'teachers.工资', sort: 'desc' }] });
  assert.equal(filtered.queryTotal, 1);
  assert.equal(filtered.rows[0]['teachers.姓名'], '乙');
  const exported = queryRelationRows(value, { relationId: relation.id, exportAll: true, sortModel: [{ colId: 'teachers.工资', sort: 'desc' }] });
  assert.equal(exported.exportAll, true);
  assert.equal(exported.rows.length, 2);
  assert.equal(exported.rows[0]['teachers.工资'], 200);
});

test('many-to-many relation is explicitly blocked for generated update templates', () => {
  const value = project();
  const relation: DataRelation = { id: 'ambiguous', name: '模糊关系', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-many', defaultJoinType: 'left', integrity: 'informational', onDelete: 'restrict' };
  value.relations = [relation];
  const report = analyzeOperationTemplate(value, 'join-query-update', { tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id] }, { relationId: relation.id, atomic: true });
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some((item) => item.code === 'AMBIGUOUS_MANY_TO_MANY_UPDATE'));
});

test('cross-table query template generates an executable two-source join form', () => {
  const value = project(); const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' }; value.relations = [relation];
  const plan = planOperationTemplate(value, 'join-query-update', { tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['教师ID', '姓名', '科目ID'] }, { relationId: relation.id, atomic: true, formId: 'teacher_subject_query', joinType: 'left', queryFields: ['teachers.教师ID'], displayFields: ['teachers.教师ID', 'teachers.姓名', 'subjects.科目名'], editableFieldsLeft: ['teachers.姓名'], editableFieldsRight: ['subjects.科目名'], queryLimit: 1, resultField: '_联合查询结果', changeLogField: '_分表差异', writeBackField: '_分表状态', statusField: '_联合查询状态', ambiguousResultMessage: '结果歧义，请继续收窄条件' });
  const form = plan.artifacts.forms[0];
  const queryWorkflow = plan.artifacts.workflows.find((item: any) => item.id === 'teacher_subject_query_join_flow');
  const saveWorkflow = plan.artifacts.workflows.find((item: any) => item.id === 'teacher_subject_query_join_save_flow');
  assert.ok(form.design.components.some((item: any) => item.type === 'table' && item.fieldBinding === '_联合查询结果'));
  assert.ok(form.design.components.some((item: any) => item.fieldBinding === '_联合查询状态'));
  assert.ok(form.design.components.some((item: any) => item.props?.label === '加载联合数据' && item.props.flowTriggers.onClick.workflowId === queryWorkflow!.id));
  assert.ok(form.design.components.some((item: any) => item.props?.label === '原子提交更新' && item.props.flowTriggers.onClick.workflowId === saveWorkflow!.id));
  const resultTable = form.design.components.find((item: any) => item.fieldBinding === '_联合查询结果');
  assert.deepEqual(resultTable.props.columns.map((item: any) => item.dataIndex), ['teachers.教师ID', 'teachers.姓名', 'subjects.科目名']);
  assert.equal(resultTable.props.columns.find((item: any) => item.dataIndex === 'teachers.姓名')?.editable, true);
  assert.equal(resultTable.props.columns.find((item: any) => item.dataIndex === 'subjects.科目名')?.editable, true);
  assert.equal(resultTable.props.columns.find((item: any) => item.dataIndex === 'teachers.教师ID')?.editable, false);
  assert.deepEqual(queryWorkflow!.nodes.map((item: any) => item.specId), ['workflow:import', 'behavior-query-list', 'behavior-query-list', 'data:lookup-join']);
  assert.deepEqual(saveWorkflow!.nodes.map((item: any) => item.specId), ['workflow:import', 'data:transaction-write']);
  assert.deepEqual(plan.preview?.fieldProjection?.queryFields, ['teachers.教师ID']);
  assert.deepEqual(plan.preview?.fieldProjection?.editableFields, ['teachers.姓名', 'subjects.科目名']);
  assert.equal(plan.preview?.exactConfiguration?.policy?.joinPolicy?.joinType, 'left');
  assert.equal(plan.preview?.exactConfiguration?.policy?.joinPolicy?.statusField, '_联合查询状态');
  assert.equal(plan.preview?.exactConfiguration?.policy?.joinPolicy?.resultField, '_联合查询结果');
  assert.equal(plan.preview?.exactConfiguration?.policy?.joinPolicy?.changeLogField, '_分表差异');
  assert.equal(plan.preview?.exactConfiguration?.policy?.joinPolicy?.writeBackField, '_分表状态');
  assert.equal(plan.preview?.exactConfiguration?.policy?.joinPolicy?.ambiguousResultMessage, '结果歧义，请继续收窄条件');
  assert.deepEqual(plan.preview?.exactConfiguration?.policy?.joinPolicy?.readonlyFields, ['teachers.教师ID']);
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.messageField, '_联合查询状态');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.changeLogField, '_分表差异');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.writeBackField, '_分表状态');
  const joinProps = JSON.parse(queryWorkflow!.nodes.find((item: any) => item.specId === 'data:lookup-join').data.propertiesJson);
  assert.equal(joinProps.messageField, '_联合查询状态');
  assert.equal(joinProps.multipleMessage, '结果歧义，请继续收窄条件');
  assert.doesNotThrow(() => applyOperationPlan(value, plan));
});

test('join-query-update keeps same-name fields qualified and previewed without串表', () => {
  const value = project();
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  value.srcTable[1].sheets[0].headers = ['科目ID', '姓名', '科目名'];
  value.srcTable[1].sheets[0].columns = [
    { name: '科目ID', dataType: 'string' },
    { name: '姓名', dataType: 'string' },
    { name: '科目名', dataType: 'string' },
  ] as any;
  value.srcTable[1].sheets[0].preview = [{ 科目ID: 'S1', 姓名: '右表姓名', 科目名: '数学' }];
  const plan = planOperationTemplate(
    value,
    'join-query-update',
    { tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['教师ID', '姓名', '科目ID'] },
    {
      relationId: relation.id,
      atomic: true,
      formId: 'teacher_subject_same_name',
      joinType: 'left',
      queryFields: ['teachers.教师ID'],
      displayFields: ['teachers.姓名', 'subjects.姓名', 'subjects.科目名'],
      editableFieldsLeft: ['teachers.姓名'],
      editableFieldsRight: ['subjects.姓名'],
      queryLimit: 1,
    },
  );
  const resultTable = plan.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '_联合查询结果');
  assert.deepEqual(resultTable.props.columns.map((item: any) => item.dataIndex), ['teachers.姓名', 'subjects.姓名', 'subjects.科目名']);
  assert.equal(resultTable.props.columns.find((item: any) => item.dataIndex === 'teachers.姓名')?.editable, true);
  assert.equal(resultTable.props.columns.find((item: any) => item.dataIndex === 'subjects.姓名')?.editable, true);
  assert.equal(plan.preview?.exactConfiguration?.fieldProjection?.visibleFields?.includes('teachers.姓名'), true);
  assert.equal(plan.preview?.exactConfiguration?.fieldProjection?.visibleFields?.includes('subjects.姓名'), true);
  assert.deepEqual(plan.preview?.exactConfiguration?.policy?.joinPolicy?.readonlyFields, ['subjects.科目名']);
});

test('join-query-update preview reflects left and inner join with exact query cardinality controls', () => {
  const value = project();
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' },
    { 教师ID: 'T2', 姓名: '乙', 科目ID: 'S9', 工资: 120, 绩效: 80, 入职日期: '2026-01-02' },
  ];
  value.srcTable[1].sheets[0].preview = [{ 科目ID: 'S1', 科目名: '数学' }];
  const leftPlan = planOperationTemplate(
    value,
    'join-query-update',
    { tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['教师ID', '姓名', '科目ID'] },
    { relationId: relation.id, atomic: true, formId: 'join_left_preview', joinType: 'left', queryFields: ['teachers.教师ID'], displayFields: ['teachers.教师ID', 'subjects.科目名'], editableFieldsLeft: [], editableFieldsRight: [], queryLimit: 2 },
  );
  const innerPlan = planOperationTemplate(
    value,
    'join-query-update',
    { tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['教师ID', '姓名', '科目ID'] },
    { relationId: relation.id, atomic: true, formId: 'join_inner_preview', joinType: 'inner', queryFields: ['teachers.教师ID'], displayFields: ['teachers.教师ID', 'subjects.科目名'], editableFieldsLeft: [], editableFieldsRight: [], queryLimit: 2 },
  );
  const leftRows = leftPlan.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '_联合查询结果').props.data;
  const innerRows = innerPlan.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '_联合查询结果').props.data;
  assert.equal(leftRows.length, 2);
  assert.equal(innerRows.length, 1);
  assert.equal(leftPlan.preview?.exactConfiguration?.policy?.joinPolicy?.joinType, 'left');
  assert.equal(innerPlan.preview?.exactConfiguration?.policy?.joinPolicy?.joinType, 'inner');
  assert.equal(leftPlan.preview?.exactConfiguration?.policy?.joinPolicy?.queryLimit, 2);
  assert.equal(innerPlan.preview?.exactConfiguration?.policy?.joinPolicy?.queryLimit, 2);
});

test('join-query-update save workflow preserves dirty-field ownership and rolls back on single-side conflict', async () => {
  const { getExecutor } = await import('../../../ui/nodes/executor-registry');
  await import('../../../ui/nodes/executors/macros');
  const exec = getExecutor('data:transaction-write')!;
  const tables = [
    {
      id: 'teachers', fileName: 'teachers.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: 'x',
      sheets: [{ name: '教师', rowCount: 1, colCount: 3, headers: ['科目ID', '姓名', '工资'], columns: [], preview: [{ 科目ID: 'S1', 姓名: '甲', 工资: 100 }] }],
    },
    {
      id: 'subjects', fileName: 'subjects.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: 'y',
      sheets: [{ name: '科目', rowCount: 1, colCount: 2, headers: ['科目ID', '科目名'], columns: [], preview: [{ 科目ID: 'S1', 科目名: '数学' }] }],
    },
  ] as any;
  const leftDirtyOnly = await exec({
    inputs: { formData: { _联合查询结果: [{ 'teachers.科目ID': 'S1', 'teachers.姓名': '甲老师', 'teachers.工资': 100, 'subjects.科目ID': 'S1', 'subjects.科目名': '数学', '_original_teachers.科目ID': 'S1', '_original_teachers.姓名': '甲', '_original_teachers.工资': 100, '_original_subjects.科目ID': 'S1', '_original_subjects.科目名': '数学' }] } },
    properties: {
      targets: [
        { id: 'joined_teachers', tableId: 'teachers', sheetName: '教师', keyField: '科目ID', mode: 'update', sourceField: '_联合查询结果', fieldMap: { 科目ID: 'teachers.科目ID', 姓名: 'teachers.姓名', 工资: 'teachers.工资' }, originalFieldMap: { 科目ID: '_original_teachers.科目ID', 姓名: '_original_teachers.姓名', 工资: '_original_teachers.工资' }, conflictCheckFields: ['姓名'] },
        { id: 'joined_subjects', tableId: 'subjects', sheetName: '科目', keyField: '科目ID', mode: 'update', sourceField: '_联合查询结果', fieldMap: { 科目ID: 'subjects.科目ID', 科目名: 'subjects.科目名' }, originalFieldMap: { 科目ID: '_original_subjects.科目ID', 科目名: '_original_subjects.科目名' }, conflictCheckFields: ['科目名'] },
      ],
      diffField: '_分表差异',
      statusField: '_分表状态',
    },
    tables,
    getNodeOutput: () => ({}),
    checkType: () => ({ valid: true }),
    assertType: (_type: string, value: unknown) => value,
  } as any);
  assert.equal((leftDirtyOnly as any).committed, true);
  assert.deepEqual((leftDirtyOnly as any).diff, [
    { target: 'joined_teachers', mode: 'update', key: 'S1', fields: ['姓名'] },
    { target: 'joined_subjects', mode: 'update', key: 'S1', fields: [] },
  ]);
  assert.equal((leftDirtyOnly as any).sideEffects.some((effect: any) => effect.kind === 'update-table-row' && effect.tableId === 'subjects'), false);

  const rollbackOnSubjectConflict = await exec({
    inputs: { formData: { _联合查询结果: [{ 'teachers.科目ID': 'S1', 'teachers.姓名': '甲老师', 'teachers.工资': 100, 'subjects.科目ID': 'S1', 'subjects.科目名': '新数学', '_original_teachers.科目ID': 'S1', '_original_teachers.姓名': '甲', '_original_teachers.工资': 100, '_original_subjects.科目ID': 'S1', '_original_subjects.科目名': '旧数学' }] } },
    properties: {
      targets: [
        { id: 'joined_teachers', tableId: 'teachers', sheetName: '教师', keyField: '科目ID', mode: 'update', sourceField: '_联合查询结果', fieldMap: { 科目ID: 'teachers.科目ID', 姓名: 'teachers.姓名', 工资: 'teachers.工资' }, originalFieldMap: { 科目ID: '_original_teachers.科目ID', 姓名: '_original_teachers.姓名', 工资: '_original_teachers.工资' }, conflictCheckFields: ['姓名'] },
        { id: 'joined_subjects', tableId: 'subjects', sheetName: '科目', keyField: '科目ID', mode: 'update', sourceField: '_联合查询结果', fieldMap: { 科目ID: 'subjects.科目ID', 科目名: 'subjects.科目名' }, originalFieldMap: { 科目ID: '_original_subjects.科目ID', 科目名: '_original_subjects.科目名' }, conflictCheckFields: ['科目名'] },
      ],
      diffField: '_分表差异',
      statusField: '_分表状态',
    },
    tables,
    getNodeOutput: () => ({}),
    checkType: () => ({ valid: true }),
    assertType: (_type: string, value: unknown) => value,
  } as any);
  assert.equal((rollbackOnSubjectConflict as any).committed, false);
  assert.ok((rollbackOnSubjectConflict as any).conflicts.some((item: any) => item.code === 'WRITE_CONFLICT' && item.target === 'joined_subjects'));
  assert.equal((rollbackOnSubjectConflict as any).sideEffects.some((effect: any) => effect.kind === 'update-table-row'), false);
});

test('cross-table summary requires qualified names for ambiguous same-name fields and accepts stable qualified references', () => {
  const value = project();
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  value.srcTable[1].sheets[0].headers = ['科目ID', '科目名', '工资'];
  value.srcTable[1].sheets[0].columns = [
    { name: '科目ID', dataType: 'string' },
    { name: '科目名', dataType: 'string' },
    { name: '工资', dataType: 'number' },
  ] as any;
  value.srcTable[1].sheets[0].preview = [{ 科目ID: 'S1', 科目名: '劳动课', 工资: 300 }];

  const ambiguous = analyzeOperationTemplate(
    value,
    'cross-table-summary',
    { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id] },
    { relationId: relation.id, dimensions: ['科目ID'], metrics: ['工资'], aggregation: 'sum' },
  );
  assert.equal(ambiguous.status, 'blocked');
  assert.ok(ambiguous.checks.some((item) => item.code === 'CROSS_TABLE_FIELD_AMBIGUOUS'));

  const plan = planOperationTemplate(
    value,
    'cross-table-summary',
    { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['工资'] },
    { relationId: relation.id, dimensions: ['teachers.科目ID'], metrics: ['teachers.教师.工资'], aggregation: 'sum', formId: 'teacher_subject_summary' },
  );
  const chart = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.props?.name === '_输入样本图');
  assert.equal(chart.props.title, 'teachers.科目ID · teachers.工资');
  const recommendations = recommendOperationTemplates(value, { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['工资'] });
  const summary = recommendations.find((item) => item.template.id === 'cross-table-summary')!;
  assert.deepEqual(summary.suggestedParameters.metrics, ['teachers.工资']);
});

test('batch template points to the production cross-page atomic editor', () => {
  const value = project();
  const plan = planOperationTemplate(value, 'single-table-batch-update', { tableId: 'teachers', sheetName: '教师' }, { maxChanges: 250, formId: 'teacher_batch' });
  assert.deepEqual(plan.artifacts.forms[0].design.templateParameters.batchEditor, { tableId: 'teachers', sheetName: '教师', maxChanges: 250, crossPage: true, atomic: true, versionProtected: true });
  assert.equal(plan.preview?.exactConfiguration?.previewControls?.previewRows, 10);
  assert.equal(plan.preview?.exactConfiguration?.previewControls?.detailRows, 4);
  assert.equal(plan.preview?.exactConfiguration?.policy?.batchEditor?.maxChanges, 250);
  assert.deepEqual(plan.preview?.exactConfiguration?.resultBindings, { changeLogField: '_变更差异', writeBackField: '_批量状态' });
  const grid = plan.artifacts.forms[0].design.components.find((component: any) => component.fieldBinding === '_批量变更');
  assert.equal(grid.props.rowKey, '教师ID');
  assert.equal(grid.props.changeTracking, 'dirtyRows');
  assert.equal(grid.props.columns.find((column: any) => column.dataIndex === '教师ID').editable, false);
  const submit = plan.artifacts.forms[0].design.components.find((component: any) => component.props?.label === '预检并提交变更');
  assert.equal(submit.props.disabledExpression, '(len($_批量变更) == 0) || (len($_批量变更) > 250)');
  assert.doesNotThrow(() => applyOperationPlan(value, plan));
});

test('single-table batch form exposes exactly the fields selected in data preview while retaining a hidden row key', () => {
  const value = project();
  const plan = planOperationTemplate(
    value,
    'single-table-batch-update',
    { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '工资'] },
    { maxChanges: 100, formId: 'teacher_selected_fields_batch' },
  );
  const form = plan.artifacts.forms[0] as any;
  const grid = form.design.components.find((component: any) => component.fieldBinding === '_批量变更');
  assert.deepEqual(grid.props.columns.map((column: any) => column.dataIndex), ['姓名', '工资']);
  assert.equal(grid.props.rowKey, '教师ID');
  assert.equal(grid.props.data[0].教师ID, 'T1');
  assert.deepEqual(form.design.templateParameters.fieldProjection, {
    visibleFields: ['姓名', '工资'],
    internalFields: ['教师ID'],
  });
  const workflow = plan.artifacts.workflows.find((item: any) => item.id === 'teacher_selected_fields_batch_batch_flow');
  const transaction = workflow!.nodes.find((node: any) => node.specId === 'data:transaction-write');
  const properties = JSON.parse(transaction.data.propertiesJson);
  assert.deepEqual(Object.keys(properties.targets[0].fieldMap), ['教师ID', '姓名', '工资']);
  assert.doesNotThrow(() => applyOperationPlan(value, plan));
});

test('single-table batch generated test assets cover no-dirty, dirty-only, maxChanges and single-row conflict rollback', () => {
  const value = project();
  const plan = planOperationTemplate(
    value,
    'single-table-batch-update',
    { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '工资'] },
    { maxChanges: 3, formId: 'teacher_batch_assets' },
  );
  const cases = plan.artifacts.tests.flatMap((suite: any) => suite.cases);
  const noDirty = cases.find((item: any) => item.category === 'no-dirty-rows');
  const dirtyOnly = cases.find((item: any) => item.category === 'dirty-row-commit');
  const exceeded = cases.find((item: any) => item.category === 'max-changes-exceeded');
  const conflict = cases.find((item: any) => item.category === 'single-target-conflict-rolls-back-all');
  assert.ok(noDirty);
  assert.equal(noDirty.expected.submitEnabled, false);
  assert.ok(dirtyOnly);
  assert.equal(dirtyOnly.expected.dirtyOnly, true);
  assert.ok(exceeded);
  assert.equal(exceeded.expected.maxChanges, 3);
  assert.equal(exceeded.expected.submitEnabled, false);
  assert.equal(exceeded.inputs.dirtyRows.length, 4);
  assert.ok(conflict);
  assert.equal(conflict.expected.atomicRolledBack, true);
  assert.equal(conflict.expected.dirtyRowsPreserved, true);
  assert.equal(conflict.expected.noInsertOrDelete, true);
});

test('entry and analysis forms project only the fields selected in data preview', () => {
  const value = project();
  const selection = { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '工资'] };
  const entry = planOperationTemplate(value, 'single-table-entry', selection, {
    formId: 'teacher_selected_fields_entry',
    selectedFields: selection.fields,
  });
  const entryFields = entry.artifacts.forms[0].design.components
    .filter((component: any) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'))
    .map((component: any) => component.fieldBinding);
  assert.deepEqual(entryFields, ['姓名', '工资']);

  const overview = planOperationTemplate(value, 'data-overview', selection, {
    formId: 'teacher_selected_fields_overview',
  });
  const sample = overview.artifacts.forms[0].design.components.find((component: any) => component.props?.name === '_输入样本');
  assert.deepEqual(sample.props.columns, ['姓名', '工资']);
  assert.deepEqual(Object.keys(sample.props.data[0]), ['姓名', '工资']);
});

test('single-table entry follows stable field-count layout bands from scaffolded generation', () => {
  const value = project();
  const makeFields = (count: number) => Array.from({ length: count }, (_, index) => `字段${index + 1}`);
  const reconfigure = (count: number) => {
    const fields = makeFields(count);
    value.srcTable[0].sheets[0].headers = ['教师ID', ...fields];
    value.srcTable[0].sheets[0].columns = [
      { name: '教师ID', index: 0, dataType: 'string', nullable: false, uniqueCount: 999, sampleValues: ['T1'] },
      ...fields.map((field, index) => ({
        name: field,
        index: index + 1,
        dataType: 'string',
        nullable: index % 2 === 1,
        uniqueCount: 4,
        sampleValues: [`值${index + 1}`],
      })),
    ] as any;
    value.srcTable[0].sheets[0].preview = [Object.fromEntries(['教师ID', ...fields].map((field, index) => [field, index === 0 ? 'T1' : `值${index}`]))];
    return fields;
  };
  const cases = [
    { count: 1, expectedColumns: 1, expectedPages: 1, expectedSections: 0 },
    { count: 2, expectedColumns: 2, expectedPages: 1, expectedSections: 0 },
    { count: 6, expectedColumns: 3, expectedPages: 1, expectedSections: 0 },
    { count: 12, expectedColumns: 3, expectedPages: 1, expectedSections: 0 },
    { count: 13, expectedColumns: 3, expectedPages: 1, expectedSections: 2 },
    { count: 24, expectedColumns: 3, expectedPages: 1, expectedSections: 3 },
    { count: 25, expectedColumns: 3, expectedPages: 3, expectedSections: 4 },
    { count: 48, expectedColumns: 3, expectedPages: 4, expectedSections: 6 },
  ];
  for (const item of cases) {
    const fields = reconfigure(item.count);
    const plan = planOperationTemplate(
      value,
      'single-table-entry',
      { tableId: 'teachers', sheetName: '教师', fields: ['教师ID', ...fields] },
      { formId: `entry_${item.count}`, selectedFields: ['教师ID', ...fields] },
    );
    const form = plan.artifacts.forms[0] as any;
    assert.equal(form.design.templateParameters.layout.columns, item.expectedColumns, `count ${item.count}: columns`);
    assert.equal(form.design.formWindow.props.generatedPages, item.expectedPages, `count ${item.count}: generatedPages`);
    assert.equal(form.design.formWindow.props.generatedSections, item.expectedSections, `count ${item.count}: generatedSections`);
    if (item.count >= 25) assert.ok(form.design.components.some((component: any) => component.type === 'tabs'), `count ${item.count}: should generate tabs`);
  }
});

test('single-table entry blocks composite keys even before generation', () => {
  const value = project();
  const fields = Array.from({ length: 49 }, (_, index) => `字段${index + 1}`);
  value.srcTable[0].sheets[0].headers = fields;
  value.srcTable[0].sheets[0].columns = fields.map((field, index) => ({
    name: field,
    index,
    dataType: 'string',
    nullable: true,
    uniqueCount: 1,
    sampleValues: [`值${index + 1}`],
  })) as any;
  value.srcTable[0].sheets[0].config.keyFields = ['字段1', '字段2'];
  const report = analyzeOperationTemplate(value, 'single-table-entry', {
    tableId: 'teachers',
    sheetName: '教师',
    fields,
  });
  assert.equal(report.status, 'blocked');
  const composite = report.checks.find((item) => item.code === 'COMPOSITE_KEY_UNSUPPORTED');
  assert.ok(composite);
  assert.equal(composite.fix?.action, 'split-or-switch-template');
});

test('single-table entry blocks more than 48 visible business fields while allowing a stable single key', () => {
  const value = project();
  const visibleFields = Array.from({ length: 49 }, (_, index) => `字段${index + 1}`);
  const allFields = ['教师ID', ...visibleFields];
  value.srcTable[0].sheets[0].headers = allFields;
  value.srcTable[0].sheets[0].columns = allFields.map((field, index) => ({
    name: field,
    index,
    dataType: 'string',
    nullable: field !== '教师ID',
    uniqueCount: field === '教师ID' ? allFields.length : 1,
    sampleValues: [field === '教师ID' ? `ID-${index + 1}` : `值${index + 1}`],
  })) as any;
  value.srcTable[0].sheets[0].config.keyFields = ['教师ID'];
  const report = analyzeOperationTemplate(value, 'single-table-entry', {
    tableId: 'teachers',
    sheetName: '教师',
    fields: allFields,
  });
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some((item) => item.code === 'TOO_MANY_FIELDS_FOR_DIRECT_FORM'));
});

test('KPI dashboard turns every selected metric into a visible card, chart label and summary row', () => {
  const value = project();
  const metrics = ['工资', '绩效'];
  const plan = planOperationTemplate(
    value,
    'kpi-dashboard',
    { tableId: 'teachers', sheetName: '教师', fields: metrics },
    { formId: 'teacher_selected_kpis', metrics, title: '教师 KPI 预览', subtitle: '按工资与绩效生成', previewRows: 5, detailRows: 2 },
  );
  const components = plan.artifacts.forms[0].design.components as any[];
  const cards = components.filter((component) => component.props?.templateMetric);
  assert.deepEqual(cards.map((component) => component.props.templateMetric), metrics);
  const chart = components.find((component) => component.props?.name === '_输入样本图');
  assert.deepEqual(chart.props.chartData.labels, metrics);
  const result = components.find((component) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data.map((row: any) => row.指标), metrics);
  assert.equal(result.props.rows, 2);
  assert.equal(plan.artifacts.forms[0].design.formWindow.props.title, '教师 KPI 预览');
  assert.equal(plan.artifacts.forms[0].design.formWindow.props.subtitle, '按工资与绩效生成');
  assert.match(components.find((component) => component.id.endsWith('_selected_fields')).props.content, /工资、绩效/);
});

test('KPI dashboard generates a dedicated workflow and dimensions affect preview results', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['部门', '工资', '绩效'];
  value.srcTable[0].sheets[0].columns = [
    { name: '部门', dataType: 'string' },
    { name: '工资', dataType: 'number' },
    { name: '绩效', dataType: 'number' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 部门: 'A', 工资: 10, 绩效: 5 },
    { 部门: 'A', 工资: 20, 绩效: 8 },
    { 部门: 'B', 工资: 5, 绩效: 9 },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'kpi-dashboard',
    { tableId: 'teachers', sheetName: '教师', fields: ['部门', '工资', '绩效'] },
    { formId: 'kpi_grouped', metrics: ['工资', '绩效'], dimensions: ['部门'], aggregation: 'sum', chartLimit: 2, detailRows: 2 },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'data:kpi-dashboard', 'workflow:export']);
  assert.match(workflow.nodes[1].data.propertiesJson, /"dimensions":\["部门"\]/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"aggregation":"sum"/);
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.columns, ['部门', '工资', '绩效', '记录数']);
  assert.deepEqual(result.props.data, [
    { 部门: 'A', 工资: 30, 绩效: 13, 记录数: 2 },
    { 部门: 'B', 工资: 5, 绩效: 9, 记录数: 1 },
  ]);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.kpi, {
    metrics: ['工资', '绩效'],
    dimensions: ['部门'],
    aggregation: 'sum',
    resultField: '_分析结果',
    summaryField: '_KPI摘要',
    chartField: '_KPI图',
    messageField: '_分析状态',
    chartLimit: 2,
  });
});

test('data overview computes missing counts, uniques and averages from source rows', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['姓名', '工资', '备注'];
  value.srcTable[0].sheets[0].columns = [
    { name: '姓名', dataType: 'string' },
    { name: '工资', dataType: 'number' },
    { name: '备注', dataType: 'string' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 姓名: '甲', 工资: 100, 备注: '' },
    { 姓名: '乙', 工资: 200, 备注: '常量' },
    { 姓名: '乙', 工资: null, 备注: '常量' },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'data-overview',
    { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '工资', '备注'] },
    { formId: 'overview_exact', detailRows: 3, previewRows: 3 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data, [
    { 字段: '姓名', 类型: 'string', 缺失数: 0, 唯一值: 2, 非空率: 1, 常量列: false, 样本值: '甲，乙，乙', 分布摘要: '乙×2，甲×1' },
    { 字段: '工资', 类型: 'number', 缺失数: 1, 唯一值: 2, 非空率: 2 / 3, 常量列: false, 样本值: '100，200', 分布摘要: '100×1，200×1', 均值: 150 },
    { 字段: '备注', 类型: 'string', 缺失数: 1, 唯一值: 1, 非空率: 2 / 3, 常量列: true, 样本值: '常量，常量', 分布摘要: '常量×2' },
  ]);
});

test('data overview handles single text field, all-empty columns and constant columns with exact profile output', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['标签', '空列', '常量列'];
  value.srcTable[0].sheets[0].columns = [
    { name: '标签', dataType: 'string' },
    { name: '空列', dataType: 'string' },
    { name: '常量列', dataType: 'string' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 标签: 'A', 空列: '', 常量列: '固定值' },
    { 标签: 'B', 空列: null, 常量列: '固定值' },
    { 标签: 'B', 空列: undefined, 常量列: '固定值' },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'data-overview',
    { tableId: 'teachers', sheetName: '教师', fields: ['标签', '空列', '常量列'] },
    { formId: 'overview_profile_exact', detailRows: 3, previewRows: 3, chartLimit: 2 },
  );
  const form = plan.artifacts.forms[0] as any;
  const result = form.design.components.find((component: any) => component.fieldBinding === '_分析结果');
  const chart = form.design.components.find((component: any) => component.props?.name === '_输入样本图');
  assert.deepEqual(result.props.data, [
    { 字段: '标签', 类型: 'string', 缺失数: 0, 唯一值: 2, 非空率: 1, 常量列: false, 样本值: 'A，B，B', 分布摘要: 'B×2，A×1' },
    { 字段: '空列', 类型: 'string', 缺失数: 3, 唯一值: 0, 非空率: 0, 常量列: false, 样本值: '', 分布摘要: '' },
    { 字段: '常量列', 类型: 'string', 缺失数: 0, 唯一值: 1, 非空率: 1, 常量列: true, 样本值: '固定值，固定值，固定值', 分布摘要: '固定值×3' },
  ]);
  assert.deepEqual(chart.props.chartData.labels, ['标签', '空列']);
  assert.deepEqual(chart.props.chartData.datasets[0].data, [2, 0]);
});

test('data overview generates a dedicated profile workflow and configurable profile metadata', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['姓名', '工资', '备注'];
  value.srcTable[0].sheets[0].columns = [
    { name: '姓名', dataType: 'string' },
    { name: '工资', dataType: 'number' },
    { name: '备注', dataType: 'string' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 姓名: '甲', 工资: 100, 备注: '' },
    { 姓名: '乙', 工资: 200, 备注: '常量' },
  ];
  value.srcTable[0].sheets[0].rowCount = 2;
  const plan = planOperationTemplate(
    value,
    'data-overview',
    { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '工资', '备注'] },
    { formId: 'overview_profile_flow', detailRows: 3, previewRows: 3, resultField: '_画像结果', summaryField: '_画像摘要', chartField: '_画像图', messageField: '_画像状态', sampleField: '_画像输入样本', chartMetric: '缺失数', chartLimit: 2, distributionLimit: 2, sampleValueLimit: 2, chartTitle: '字段缺失分布', resultLabel: '字段画像清单' },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'data:profile-overview', 'workflow:export']);
  assert.match(workflow.nodes[0].data.propertiesJson, /"_画像输入样本"/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"_画像摘要"/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"_画像图"/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"缺失数"/);
  assert.equal(plan.artifacts.outputs[0].format, 'json');
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.profile, {
    fields: ['姓名', '工资', '备注'],
    sampleField: '_画像输入样本',
    resultField: '_画像结果',
    summaryField: '_画像摘要',
    chartField: '_画像图',
    messageField: '_画像状态',
    chartMetric: '缺失数',
    chartLimit: 2,
    distributionLimit: 2,
    sampleValueLimit: 2,
    chartTitle: '字段缺失分布',
    resultLabel: '字段画像清单',
  });
});

test('group comparison applies requested aggregation with manually checkable totals', () => {
  const value = project();
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' },
    { 教师ID: 'T2', 姓名: '乙', 科目ID: 'S1', 工资: 200, 绩效: 70, 入职日期: '2026-01-02' },
    { 教师ID: 'T3', 姓名: '丙', 科目ID: 'S2', 工资: 50, 绩效: 80, 入职日期: '2026-01-03' },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'group-comparison',
    { tableId: 'teachers', sheetName: '教师', fields: ['科目ID', '工资'] },
    { formId: 'group_exact', dimensions: ['科目ID'], metrics: ['工资'], aggregation: 'sum', detailRows: 4 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data, [
    { 分组: 'S1', 指标: '工资', 聚合值: 300, 记录数: 2 },
    { 分组: 'S2', 指标: '工资', 聚合值: 50, 记录数: 1 },
  ]);
  const chart = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.props?.name === '_输入样本图');
  assert.deepEqual(chart.props.chartData.datasets[0].data, [300, 50]);
});

test('group comparison preview respects aggregation choice, chartLimit and detailRows exactly', () => {
  const aggregations = {
    sum: [35, 14, 0],
    average: [17.5, 7, 0],
    min: [10, 5, 0],
    max: [25, 9, 0],
    count: [2, 2, 0],
  } as const;
  for (const [aggregation, expected] of Object.entries(aggregations)) {
    const value = project();
    value.srcTable[0].sheets[0].headers = ['部门', '工资'];
    value.srcTable[0].sheets[0].columns = [
      { name: '部门', dataType: 'string' },
      { name: '工资', dataType: 'number' },
    ] as any;
    value.srcTable[0].sheets[0].preview = [
      { 部门: 'A', 工资: 10 },
      { 部门: 'A', 工资: 25 },
      { 部门: 'B', 工资: 5 },
      { 部门: 'B', 工资: 9 },
      { 部门: 'C', 工资: null },
    ];
    value.srcTable[0].sheets[0].rowCount = 5;
    const plan = planOperationTemplate(
      value,
      'group-comparison',
      { tableId: 'teachers', sheetName: '教师', fields: ['部门', '工资'] },
      { formId: `group_${aggregation}`, dimensions: ['部门'], metrics: ['工资'], aggregation, chartLimit: 2, detailRows: 3, sampleRows: 4 },
    );
    const form = plan.artifacts.forms[0] as any;
    const chart = form.design.components.find((component: any) => component.props?.name === '_输入样本图');
    const result = form.design.components.find((component: any) => component.fieldBinding === '_分析结果');
    const sampleTable = form.design.components.find((component: any) => component.props?.name === '_输入样本');
    const configuration = form.design.components.find((component: any) => component.id.endsWith('_configuration'));
    assert.deepEqual(chart.props.chartData.labels, ['A', 'B'], `${aggregation}: chart labels`);
    assert.deepEqual(chart.props.chartData.datasets[0].data, expected.slice(0, 2), `${aggregation}: chart data`);
    assert.deepEqual(result.props.data.map((row: any) => row.聚合值), expected, `${aggregation}: table aggregates`);
    assert.equal(sampleTable.props.data.length, 4, `${aggregation}: sample rows`);
    assert.match(configuration.props.content, /图表上限 2 组/, `${aggregation}: configuration`);
    assert.match(configuration.props.content, /结果展示 3 行/, `${aggregation}: detail rows`);
  }
});

test('group comparison generates a dedicated aggregation workflow', () => {
  const plan = planOperationTemplate(
    project(),
    'group-comparison',
    { tableId: 'teachers', sheetName: '教师', fields: ['科目ID', '工资'] },
    { formId: 'group_flow', dimensions: ['科目ID'], metrics: ['工资'], aggregation: 'sum' },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'data:group-aggregate', 'workflow:export']);
  assert.match(workflow.nodes[1].data.propertiesJson, /"dimensions":\["科目ID"\]/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"metrics":\["工资"\]/);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.grouping, {
    dimensions: ['科目ID'],
    metrics: ['工资'],
    aggregation: 'sum',
    resultField: '_分析结果',
    summaryField: '_分组摘要',
    chartField: '_分组图',
    messageField: '_分析状态',
  });
});

test('pivot analysis builds a sparse matrix with exact aggregated cells', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['姓名', '科目ID', '工资'];
  value.srcTable[0].sheets[0].columns = [
    { name: '姓名', dataType: 'string' },
    { name: '科目ID', dataType: 'string' },
    { name: '工资', dataType: 'number' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 姓名: '甲', 科目ID: 'S1', 工资: 100 },
    { 姓名: '甲', 科目ID: 'S2', 工资: 50 },
    { 姓名: '乙', 科目ID: 'S1', 工资: 30 },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'pivot-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '科目ID', '工资'] },
    { formId: 'pivot_exact', rowDimension: '姓名', columnDimension: '科目ID', metric: '工资', aggregation: 'sum', detailRows: 4 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data, [
    { 姓名: '甲', S1: 100, S2: 50 },
    { 姓名: '乙', S1: 30, S2: 0 },
  ]);
});

test('pivot analysis preview respects sparse cells, aggregation choice and chartLimit columns', () => {
  const aggregations = {
    sum: [
      { 姓名: '甲', S1: 30, S2: 20 },
      { 姓名: '乙', S1: 5, S2: 0 },
      { 姓名: '丙', S1: 0, S2: 0 },
    ],
    average: [
      { 姓名: '甲', S1: 15, S2: 20 },
      { 姓名: '乙', S1: 5, S2: 0 },
      { 姓名: '丙', S1: 0, S2: 0 },
    ],
    min: [
      { 姓名: '甲', S1: 10, S2: 20 },
      { 姓名: '乙', S1: 5, S2: 0 },
      { 姓名: '丙', S1: 0, S2: 0 },
    ],
    max: [
      { 姓名: '甲', S1: 20, S2: 20 },
      { 姓名: '乙', S1: 5, S2: 0 },
      { 姓名: '丙', S1: 0, S2: 0 },
    ],
    count: [
      { 姓名: '甲', S1: 2, S2: 1 },
      { 姓名: '乙', S1: 1, S2: 0 },
      { 姓名: '丙', S1: 0, S2: 0 },
    ],
  } as const;
  for (const [aggregation, expectedRows] of Object.entries(aggregations)) {
    const value = project();
    value.srcTable[0].sheets[0].headers = ['姓名', '科目ID', '工资'];
    value.srcTable[0].sheets[0].columns = [
      { name: '姓名', dataType: 'string' },
      { name: '科目ID', dataType: 'string' },
      { name: '工资', dataType: 'number' },
    ] as any;
    value.srcTable[0].sheets[0].preview = [
      { 姓名: '甲', 科目ID: 'S1', 工资: 10 },
      { 姓名: '甲', 科目ID: 'S1', 工资: 20 },
      { 姓名: '甲', 科目ID: 'S2', 工资: 20 },
      { 姓名: '乙', 科目ID: 'S1', 工资: 5 },
      { 姓名: '丙', 科目ID: 'S3', 工资: null },
    ];
    value.srcTable[0].sheets[0].rowCount = 5;
    const plan = planOperationTemplate(
      value,
      'pivot-analysis',
      { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '科目ID', '工资'] },
      { formId: `pivot_${aggregation}`, rowDimension: '姓名', columnDimension: '科目ID', metric: '工资', aggregation, chartLimit: 2, detailRows: 3, sampleRows: 2 },
    );
    const form = plan.artifacts.forms[0] as any;
    const result = form.design.components.find((component: any) => component.fieldBinding === '_分析结果');
    const sampleTable = form.design.components.find((component: any) => component.props?.name === '_输入样本');
    const configuration = form.design.components.find((component: any) => component.id.endsWith('_configuration'));
    assert.deepEqual(result.props.columns, ['姓名', 'S1', 'S2'], `${aggregation}: result columns`);
    assert.deepEqual(result.props.data, expectedRows, `${aggregation}: result rows`);
    assert.equal(sampleTable.props.data.length, 2, `${aggregation}: sample rows`);
    assert.match(configuration.props.content, /图表上限 2 列/, `${aggregation}: configuration`);
  }
});

test('pivot analysis generates a dedicated matrix workflow', () => {
  const plan = planOperationTemplate(
    project(),
    'pivot-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['姓名', '科目ID', '工资'] },
    { formId: 'pivot_flow', rowDimension: '姓名', columnDimension: '科目ID', metric: '工资', aggregation: 'sum', chartLimit: 2 },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'data:pivot-matrix', 'workflow:export']);
  assert.match(workflow.nodes[1].data.propertiesJson, /"rowDimension":"姓名"/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"columnDimension":"科目ID"/);
  assert.match(workflow.nodes[1].data.propertiesJson, /"metric":"工资"/);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.pivot, {
    rowDimension: '姓名',
    columnDimension: '科目ID',
    metric: '工资',
    aggregation: 'sum',
    resultField: '_分析结果',
    summaryField: '_透视摘要',
    chartField: '_透视图',
    messageField: '_分析状态',
  });
});

test('correlation analysis computes exact pairwise coefficients with aligned samples', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['工资', '绩效', '工龄'];
  value.srcTable[0].sheets[0].columns = [
    { name: '工资', dataType: 'number' },
    { name: '绩效', dataType: 'number' },
    { name: '工龄', dataType: 'number' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 工资: 10, 绩效: 1, 工龄: 5 },
    { 工资: 20, 绩效: 2, 工龄: 4 },
    { 工资: 30, 绩效: 3, 工龄: 3 },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'correlation-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资', '绩效', '工龄'] },
    { formId: 'corr_exact', fields: ['工资', '绩效', '工龄'], detailRows: 3 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data, [
    { '字段 A': '工资', '字段 B': '绩效', 相关系数: 1 },
    { '字段 A': '工资', '字段 B': '工龄', 相关系数: -1 },
    { '字段 A': '绩效', '字段 B': '工龄', 相关系数: -1 },
  ]);
});

test('correlation analysis generates a dedicated matrix workflow', () => {
  const plan = planOperationTemplate(
    project(),
    'correlation-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资', '绩效'] },
    { formId: 'corr_flow', fields: ['工资', '绩效'] },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'data:correlation-matrix', 'workflow:export']);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.correlation, {
    fields: ['工资', '绩效'],
    resultField: '_分析结果',
    summaryField: '_相关摘要',
    chartField: '_相关图',
    messageField: '_分析状态',
  });
});

test('anomaly detection ranks outliers by score and generates a dedicated workflow', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['工资'];
  value.srcTable[0].sheets[0].columns = [
    { name: '工资', dataType: 'number' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 工资: 10 },
    { 工资: 11 },
    { 工资: 12 },
    { 工资: 13 },
    { 工资: 14 },
    { 工资: 15 },
    { 工资: 16 },
    { 工资: 17 },
    { 工资: 18 },
    { 工资: 60 },
  ];
  value.srcTable[0].sheets[0].rowCount = 10;
  const plan = planOperationTemplate(
    value,
    'anomaly-detection',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资'] },
    { formId: 'anomaly_exact', fields: ['工资'], contamination: 0.1, detailRows: 4 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.equal(result.props.data[0].记录, 10);
  assert.equal(result.props.data[0].判定, '异常');
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'data:anomaly-score', 'workflow:export']);
});

test('cross-table summary generates a dedicated join-and-group workflow with qualified fields', () => {
  const value = project();
  const relation: DataRelation = { id: 'teacher_subject', name: '教师科目', left: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, right: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' },
    { 教师ID: 'T2', 姓名: '乙', 科目ID: 'S1', 工资: 200, 绩效: 70, 入职日期: '2026-01-02' },
    { 教师ID: 'T3', 姓名: '丙', 科目ID: 'S2', 工资: 50, 绩效: 80, 入职日期: '2026-01-03' },
  ];
  value.srcTable[1].sheets[0].preview = [
    { 科目ID: 'S1', 科目名称: '数学', 学段: '初中' },
    { 科目ID: 'S2', 科目名称: '英语', 学段: '高中' },
  ];
  const plan = planOperationTemplate(
    value,
    'cross-table-summary',
    { tableId: 'teachers', tableIds: ['teachers', 'subjects'], sheetName: '教师', relationIds: [relation.id], fields: ['工资'] },
    { formId: 'cross_summary_flow', relationId: relation.id, dimensions: ['subjects.科目名'], metrics: ['teachers.工资'], aggregation: 'sum', joinType: 'left' },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'behavior-query-list', 'data:qualified-join-group', 'workflow:export']);
  assert.ok(workflow.nodes[2].data.propertiesJson.includes('"leftPrefix":"teachers."'));
  assert.ok(workflow.nodes[2].data.propertiesJson.includes('"rightPrefix":"subjects."'));
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.crossSummary, {
    relationId: relation.id,
    dimensions: ['subjects.科目名'],
    metrics: ['teachers.工资'],
    aggregation: 'sum',
    joinType: 'left',
    resultField: '_分析结果',
    summaryField: '_跨表摘要',
    chartField: '_跨表图',
    messageField: '_分析状态',
  });
});

test('regression prediction generates a dedicated evaluation workflow', () => {
  const plan = planOperationTemplate(
    project(),
    'regression-prediction',
    { tableId: 'teachers', sheetName: '教师', fields: ['工资', '绩效'] },
    { formId: 'regression_flow', target: '绩效', features: ['工资'], validationRatio: 0.2 },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'ml:regression-evaluate', 'workflow:export']);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.regression, {
    target: '绩效',
    features: ['工资'],
    validationRatio: 0.2,
    resultField: '_分析结果',
    summaryField: '_回归摘要',
    chartField: '_回归图',
    messageField: '_分析状态',
  });
});

test('classification prediction generates a dedicated evaluation workflow', () => {
  const plan = planOperationTemplate(
    project(),
    'classification-prediction',
    { tableId: 'teachers', sheetName: '教师', fields: ['科目ID', '工资', '绩效'] },
    { formId: 'classification_flow', target: '科目ID', features: ['工资', '绩效'], validationRatio: 0.2 },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'ml:classification-evaluate', 'workflow:export']);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.classification, {
    target: '科目ID',
    features: ['工资', '绩效'],
    validationRatio: 0.2,
    resultField: '_分析结果',
    summaryField: '_分类摘要',
    chartField: '_分类图',
    messageField: '_分析状态',
  });
});

test('time-series prediction generates a dedicated backtest workflow', () => {
  const plan = planOperationTemplate(
    project(),
    'time-series-prediction',
    { tableId: 'teachers', sheetName: '教师', fields: ['入职日期', '工资'] },
    { formId: 'time_series_flow', timeField: '入职日期', target: '工资', horizon: 6 },
  );
  const workflow = plan.artifacts.workflows[0] as any;
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'ml:time-series-backtest', 'workflow:export']);
  assert.deepEqual((plan.artifacts.forms[0] as any).design.templateParameters.timeSeries, {
    timeField: '入职日期',
    target: '工资',
    horizon: 6,
    resultField: '_分析结果',
    summaryField: '_时序摘要',
    chartField: '_时序图',
    messageField: '_分析状态',
  });
});

test('trend analysis sorts time values and keeps exact metric sequence in result rows', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['入职日期', '工资'];
  value.srcTable[0].sheets[0].columns = [
    { name: '入职日期', dataType: 'date' },
    { name: '工资', dataType: 'number' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 入职日期: '2026-03-01', 工资: 300 },
    { 入职日期: '2026-01-01', 工资: 100 },
    { 入职日期: '2026-02-01', 工资: 200 },
  ];
  value.srcTable[0].sheets[0].rowCount = 3;
  const plan = planOperationTemplate(
    value,
    'trend-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['入职日期', '工资'] },
    { formId: 'trend_exact', timeField: '入职日期', metric: '工资', grain: 'month', detailRows: 3, previewRows: 3 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data, [
    { 时间: '2026-01', 指标: '工资', 指标值: 100, 移动平均: 100, 变化率: null, 同比变化率: null, 缺失周期: false },
    { 时间: '2026-02', 指标: '工资', 指标值: 200, 移动平均: 150, 变化率: 1, 同比变化率: null, 缺失周期: false },
    { 时间: '2026-03', 指标: '工资', 指标值: 300, 移动平均: 200, 变化率: 0.5, 同比变化率: null, 缺失周期: false },
  ]);
  const chart = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.props?.name === '_输入样本图');
  assert.deepEqual(chart.props.chartData.labels, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(chart.props.chartData.datasets[0].data, [100, 200, 300]);
});

test('trend analysis aggregates repeated periods, fills missing periods and supports all configured grains', () => {
  const cases = [
    {
      grain: 'day',
      rows: [
        { 日期: '2026-01-01', 指标: 10 },
        { 日期: '2026-01-01', 指标: 20 },
        { 日期: '2026-01-03', 指标: 5 },
      ],
      expectedLabels: ['2026-01-01', '2026-01-02', '2026-01-03'],
      expectedData: [
        { 时间: '2026-01-01', 指标: '指标', 指标值: 30, 移动平均: 30, 变化率: null, 同比变化率: null, 缺失周期: false },
        { 时间: '2026-01-02', 指标: '指标', 指标值: 0, 移动平均: 15, 变化率: -1, 同比变化率: null, 缺失周期: true },
        { 时间: '2026-01-03', 指标: '指标', 指标值: 5, 移动平均: 35 / 3, 变化率: 1, 同比变化率: null, 缺失周期: false },
      ],
    },
    {
      grain: 'week',
      rows: [
        { 日期: '2026-01-05', 指标: 10 },
        { 日期: '2026-01-06', 指标: 15 },
        { 日期: '2026-01-19', 指标: 8 },
      ],
      expectedLabels: ['2026-W02', '2026-W03', '2026-W04'],
      expectedData: [
        { 时间: '2026-W02', 指标: '指标', 指标值: 25, 移动平均: 25, 变化率: null, 同比变化率: null, 缺失周期: false },
        { 时间: '2026-W03', 指标: '指标', 指标值: 0, 移动平均: 12.5, 变化率: -1, 同比变化率: null, 缺失周期: true },
        { 时间: '2026-W04', 指标: '指标', 指标值: 8, 移动平均: 11, 变化率: 1, 同比变化率: null, 缺失周期: false },
      ],
    },
    {
      grain: 'month',
      rows: [
        { 日期: '2026-01-01', 指标: 10 },
        { 日期: '2026-01-20', 指标: 15 },
        { 日期: '2026-03-01', 指标: 8 },
      ],
      expectedLabels: ['2026-01', '2026-02', '2026-03'],
      expectedData: [
        { 时间: '2026-01', 指标: '指标', 指标值: 25, 移动平均: 25, 变化率: null, 同比变化率: null, 缺失周期: false },
        { 时间: '2026-02', 指标: '指标', 指标值: 0, 移动平均: 12.5, 变化率: -1, 同比变化率: null, 缺失周期: true },
        { 时间: '2026-03', 指标: '指标', 指标值: 8, 移动平均: 11, 变化率: 1, 同比变化率: null, 缺失周期: false },
      ],
    },
    {
      grain: 'quarter',
      rows: [
        { 日期: '2026-01-01', 指标: 10 },
        { 日期: '2026-03-30', 指标: 5 },
        { 日期: '2026-07-01', 指标: 8 },
      ],
      expectedLabels: ['2026-Q1', '2026-Q2', '2026-Q3'],
      expectedData: [
        { 时间: '2026-Q1', 指标: '指标', 指标值: 15, 移动平均: 15, 变化率: null, 同比变化率: null, 缺失周期: false },
        { 时间: '2026-Q2', 指标: '指标', 指标值: 0, 移动平均: 7.5, 变化率: -1, 同比变化率: null, 缺失周期: true },
        { 时间: '2026-Q3', 指标: '指标', 指标值: 8, 移动平均: 23 / 3, 变化率: 1, 同比变化率: null, 缺失周期: false },
      ],
    },
    {
      grain: 'year',
      rows: [
        { 日期: '2024-01-01', 指标: 10 },
        { 日期: '2024-03-01', 指标: 20 },
        { 日期: '2026-01-01', 指标: 5 },
      ],
      expectedLabels: ['2024', '2025', '2026'],
      expectedData: [
        { 时间: '2024', 指标: '指标', 指标值: 30, 移动平均: 30, 变化率: null, 同比变化率: null, 缺失周期: false },
        { 时间: '2025', 指标: '指标', 指标值: 0, 移动平均: 15, 变化率: -1, 同比变化率: -1, 缺失周期: true },
        { 时间: '2026', 指标: '指标', 指标值: 5, 移动平均: 35 / 3, 变化率: 1, 同比变化率: 1, 缺失周期: false },
      ],
    },
  ] as const;

  for (const item of cases) {
    const value = project();
    value.srcTable[0].sheets[0].headers = ['日期', '指标'];
    value.srcTable[0].sheets[0].columns = [
      { name: '日期', dataType: 'date' },
      { name: '指标', dataType: 'number' },
    ] as any;
    value.srcTable[0].sheets[0].preview = item.rows as any;
    value.srcTable[0].sheets[0].rowCount = item.rows.length;
    const plan = planOperationTemplate(
      value,
      'trend-analysis',
      { tableId: 'teachers', sheetName: '教师', fields: ['日期', '指标'] },
      { formId: `trend_${item.grain}`, timeField: '日期', metric: '指标', grain: item.grain, detailRows: 3, previewRows: 3 },
    );
    const form = plan.artifacts.forms[0] as any;
    const result = form.design.components.find((component: any) => component.fieldBinding === '_分析结果');
    const chart = form.design.components.find((component: any) => component.props?.name === '_输入样本图');
    const configuration = form.design.components.find((component: any) => component.id.endsWith('_configuration'));
    assert.deepEqual(chart.props.chartData.labels, item.expectedLabels, `${item.grain}: labels`);
    assert.deepEqual(result.props.data, item.expectedData, `${item.grain}: result`);
    assert.match(configuration.props.content, new RegExp(`粒度：${item.grain}`), `${item.grain}: configuration`);
  }
});

test('trend analysis computes year-over-year change against the same prior bucket', () => {
  const value = project();
  value.srcTable[0].sheets[0].headers = ['日期', '指标'];
  value.srcTable[0].sheets[0].columns = [
    { name: '日期', dataType: 'date' },
    { name: '指标', dataType: 'number' },
  ] as any;
  value.srcTable[0].sheets[0].preview = [
    { 日期: '2025-01-01', 指标: 10 },
    { 日期: '2025-02-01', 指标: 20 },
    { 日期: '2026-01-01', 指标: 15 },
    { 日期: '2026-02-01', 指标: 30 },
  ];
  value.srcTable[0].sheets[0].rowCount = 4;
  const plan = planOperationTemplate(
    value,
    'trend-analysis',
    { tableId: 'teachers', sheetName: '教师', fields: ['日期', '指标'] },
    { formId: 'trend_yoy', timeField: '日期', metric: '指标', grain: 'month', detailRows: 4, previewRows: 4 },
  );
  const result = (plan.artifacts.forms[0] as any).design.components.find((component: any) => component.fieldBinding === '_分析结果');
  assert.deepEqual(result.props.data, [
    { 时间: '2025-01', 指标: '指标', 指标值: 10, 移动平均: 10, 变化率: null, 同比变化率: null, 缺失周期: false },
    { 时间: '2025-02', 指标: '指标', 指标值: 20, 移动平均: 15, 变化率: 1, 同比变化率: null, 缺失周期: false },
    { 时间: '2025-03', 指标: '指标', 指标值: 0, 移动平均: 10, 变化率: -1, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-04', 指标: '指标', 指标值: 0, 移动平均: 20 / 3, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-05', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-06', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-07', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-08', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-09', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-10', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-11', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2025-12', 指标: '指标', 指标值: 0, 移动平均: 0, 变化率: 0, 同比变化率: null, 缺失周期: true },
    { 时间: '2026-01', 指标: '指标', 指标值: 15, 移动平均: 5, 变化率: 1, 同比变化率: 0.5, 缺失周期: false },
    { 时间: '2026-02', 指标: '指标', 指标值: 30, 移动平均: 15, 变化率: 1, 同比变化率: 0.5, 缺失周期: false },
  ].slice(-4));
});

test('template catalog exposes expanded configurable parameters for form and preview tuning', () => {
  const entry = OPERATION_TEMPLATES.find((item) => item.id === 'single-table-entry')!;
  assert.ok(entry.parameterSchema.properties?.columns);
  assert.ok(entry.parameterSchema.properties?.includeReset);
  assert.ok(entry.parameterSchema.properties?.saveLabel);
  assert.ok(entry.parameterSchema.properties?.keyStrategy);
  assert.ok(entry.parameterSchema.properties?.duplicatePolicy);
  assert.ok(entry.parameterSchema.properties?.writeBackField);
  const lookup = OPERATION_TEMPLATES.find((item) => item.id === 'single-table-lookup-edit')!;
  assert.ok(lookup.parameterSchema.properties?.queryLimit);
  assert.ok(lookup.parameterSchema.properties?.dirtyOnly);
  assert.ok(lookup.parameterSchema.properties?.refetchAfterSave);
  assert.ok(lookup.parameterSchema.properties?.multipleResultMessage);
  const analysis = OPERATION_TEMPLATES.find((item) => item.id === 'data-overview')!;
  assert.ok(analysis.parameterSchema.properties?.title);
  assert.ok(analysis.parameterSchema.properties?.subtitle);
  assert.ok(analysis.parameterSchema.properties?.previewRows);
  assert.ok(analysis.parameterSchema.properties?.detailRows);
  assert.ok(analysis.parameterSchema.properties?.sampleRows);
  assert.ok(analysis.parameterSchema.properties?.chartLimit);

  const groupComparison = OPERATION_TEMPLATES.find((item) => item.id === 'group-comparison')!;
  assert.ok(groupComparison.parameterSchema.properties?.aggregation);
  assert.ok(groupComparison.parameterSchema.properties?.chartLimit);
  assert.ok(groupComparison.parameterSchema.properties?.sampleRows);

  const pivot = OPERATION_TEMPLATES.find((item) => item.id === 'pivot-analysis')!;
  assert.ok(pivot.parameterSchema.properties?.rowDimension);
  assert.ok(pivot.parameterSchema.properties?.columnDimension);
  assert.ok(pivot.parameterSchema.properties?.metric);
  assert.ok(pivot.parameterSchema.properties?.aggregation);
  assert.ok(pivot.parameterSchema.properties?.chartLimit);

  const masterDetailView = OPERATION_TEMPLATES.find((item) => item.id === 'master-detail-view')!;
  assert.ok(masterDetailView.parameterSchema.properties?.joinType);
  assert.ok(masterDetailView.parameterSchema.properties?.pageSize);
  assert.ok(masterDetailView.parameterSchema.properties?.exportFormat);

  const masterDetailEntry = OPERATION_TEMPLATES.find((item) => item.id === 'master-detail-entry')!;
  const masterEntryProperties = masterDetailEntry.parameterSchema.properties || {};
  assert.ok(masterEntryProperties.masterFields);
  assert.ok(masterEntryProperties.detailFields);
  assert.ok(masterEntryProperties.detailTitle);
  assert.ok(masterEntryProperties.detailRows);
  assert.ok(masterEntryProperties.allowEmptyDetails);
  assert.ok(masterEntryProperties.detailEditableMode);
  assert.ok(masterEntryProperties.duplicateDetailPolicy);
  assert.ok(masterEntryProperties.resultField);
  assert.ok(masterEntryProperties.statusField);
  assert.ok(masterEntryProperties.changeLogField);
  assert.ok(masterEntryProperties.submitLabel);
});

test('cross-table mutation templates generate preflighted atomic write workflows with visible diffs', () => {
  const value = project(); const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' }; value.relations = [relation];
  const cases = [
    planOperationTemplate(value, 'parallel-cross-table-entry', { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' }, { atomic: true, existingPolicy: 'error', formId: 'parallel_entry' }),
    planOperationTemplate(value, 'master-detail-entry', { tableIds: ['subjects', 'teachers'], tableId: 'subjects', sheetName: '科目', relationIds: [relation.id] }, { relationId: relation.id, allowEmptyDetails: false, formId: 'master_detail_entry' }),
    planOperationTemplate(value, 'multi-table-batch-update', { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' }, { atomic: true, maxChanges: 200, formId: 'multi_batch' }),
  ];
  for (const plan of cases) {
    const transaction = plan.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'data:transaction-write'));
    assert.ok(transaction, `${plan.templateId} must generate transaction workflow`);
    assert.ok(plan.artifacts.forms[0].design.components.some((item: any) => item.fieldBinding === '_变更差异'));
    assert.ok(plan.artifacts.forms[0].design.components.some((item: any) => item.props?.label === '预检并原子提交'));
    const writeNode = transaction.nodes.find((node: any) => node.specId === 'data:transaction-write');
    const writeProps = JSON.parse(writeNode.data.propertiesJson);
    if (plan.templateId === 'master-detail-entry') {
      assert.deepEqual(plan.artifacts.forms[0].design.templateParameters.detailPolicy, {
        allowEmptyDetails: false,
        relationId: relation.id,
        detailTitle: '科目教师 明细',
        detailRows: 8,
        detailEditableMode: 'editable',
        duplicateDetailPolicy: 'error',
        masterFields: ['subjects.科目ID', 'subjects.科目名'],
        detailFields: ['teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期'],
      });
      assert.equal(plan.artifacts.forms[0].design.templateParameters.resultField, '_主从提交结果');
      assert.deepEqual(plan.artifacts.forms[0].design.templateParameters.fieldProjection.visibleFields, ['subjects.科目ID', 'subjects.科目名', 'teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期']);
      assert.equal(writeProps.targets[0].fieldMap.科目ID, 'subjects.科目ID');
      assert.equal(writeProps.resultField, '_主从提交结果');
      assert.equal(writeProps.targets[1].sourceField, '_明细');
      assert.equal(writeProps.targets[1].duplicatePolicy, 'error');
      assert.deepEqual(writeProps.targets[1].foreignKey, { field: '科目ID', fromTarget: 'master_1', fromField: '科目ID' });
      const detailGrid = plan.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '_明细');
      const resultGrid = plan.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '_主从提交结果');
      assert.match(detailGrid.props.emptyStateText, /至少新增一条明细/);
      assert.equal(detailGrid.props.label, '科目教师 明细');
      assert.equal(resultGrid.props.label, '主从提交结果');
      assert.equal(detailGrid.props.rows, 8);
      assert.equal(detailGrid.props.editable, true);
      assert.deepEqual(detailGrid.props.sourceQualifiedColumns, ['teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期']);
      const submitButton = plan.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '预检并原子提交');
      assert.equal(submitButton.props.disabledExpression, 'len($_明细) == 0');
      assert.equal(plan.preview?.exactConfiguration?.policy?.detailPolicy?.allowEmptyDetails, false);
      assert.equal(plan.preview?.exactConfiguration?.policy?.detailPolicy?.detailEditableMode, 'editable');
      assert.equal(plan.preview?.exactConfiguration?.policy?.detailPolicy?.duplicateDetailPolicy, 'error');
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.resultField, '_主从提交结果');
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.statusField, '_事务状态');
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.diffField, '_变更差异');
      assert.equal(plan.preview?.exactConfiguration?.internalBindings?.some((item: any) => item.field === '_明细'), true);
      assert.equal(plan.preview?.exactConfiguration?.resultBindings?.resultField, '_主从提交结果');
      assert.equal(plan.preview?.exactConfiguration?.resultBindings?.changeLogField, '_变更差异');
      assert.equal(plan.preview?.exactConfiguration?.resultBindings?.writeBackField, '_事务状态');
      const masterFields = plan.artifacts.forms[0].design.components.filter((item: any) => typeof item.fieldBinding === 'string' && item.fieldBinding.startsWith('subjects.'));
      assert.ok(masterFields.length >= 2);
    }
    if (plan.templateId === 'parallel-cross-table-entry') {
      assert.equal(writeProps.targets[0].fieldMap.教师ID, 'teachers.教师ID');
      assert.ok(plan.artifacts.forms[0].design.templateParameters.crossTableSources.some((item: any) => item.tableId === 'teachers'));
      assert.deepEqual(plan.artifacts.forms[0].design.templateParameters.fieldProjection.visibleFields, ['teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期', 'subjects.科目ID', 'subjects.科目名']);
      assert.deepEqual(plan.artifacts.forms[0].design.templateParameters.transactionPolicy, {
        atomic: true,
        existingPolicy: 'error',
        sectionMode: 'by-table',
        statusField: '_事务状态',
        diffField: '_变更差异',
        showDiffPreview: true,
        targets: [
          { tableId: 'teachers', sheetName: '教师', keyField: '教师ID', mode: 'insert', existingPolicy: 'error' },
          { tableId: 'subjects', sheetName: '科目', keyField: '科目ID', mode: 'insert', existingPolicy: 'error' },
        ],
      });
      const primaryFields = plan.artifacts.forms[0].design.components.filter((item: any) => typeof item.fieldBinding === 'string' && item.fieldBinding.startsWith('teachers.'));
      assert.ok(primaryFields.length >= 3);
      const submitButton = plan.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '预检并原子提交');
      assert.deepEqual(submitButton.props.flowTriggers?.onClick?.parameterMap, { 'transaction_import.formData': '$values' });
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.existingPolicy, 'error');
      assert.equal(plan.preview?.exactConfiguration?.crossTableSources?.length, 2);
      assert.deepEqual(plan.preview?.exactConfiguration?.fieldProjection?.visibleFields, ['teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期', 'subjects.科目ID', 'subjects.科目名']);
      assert.equal(plan.preview?.exactConfiguration?.internalBindings?.some((item: any) => item.field === '_事务状态'), true);
    }
    if (plan.templateId === 'multi-table-batch-update') {
      assert.ok(plan.artifacts.forms[0].design.templateParameters.crossTableSources.some((item: any) => item.tableId === 'subjects'));
      assert.deepEqual(plan.artifacts.forms[0].design.templateParameters.transactionPolicy, {
        atomic: true,
        maxChanges: 200,
        showOnlyDirty: true,
        statusField: '_事务状态',
        diffField: '_变更差异',
        targets: [
          { tableId: 'teachers', sheetName: '教师', keyField: '教师ID', mode: 'upsert' },
          { tableId: 'subjects', sheetName: '科目', keyField: '科目ID', mode: 'upsert' },
        ],
        batchSets: [
          { tableId: 'teachers', sheetName: '教师', keyField: '教师ID', sourceField: '_批量变更_teachers', qualifiedColumns: ['teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期'], editableColumns: ['teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期'] },
          { tableId: 'subjects', sheetName: '科目', keyField: '科目ID', sourceField: '_批量变更_subjects', qualifiedColumns: ['subjects.科目ID', 'subjects.科目名'], editableColumns: ['subjects.科目名'] },
        ],
        dirtyStats: [
          { tableId: 'teachers', sourceField: '_批量变更_teachers', previewRowCount: 10, initialDirtyRows: 0, editableColumnCount: 5, qualifiedColumns: ['teachers.教师ID', 'teachers.姓名', 'teachers.科目ID', 'teachers.工资', 'teachers.绩效', 'teachers.入职日期'] },
          { tableId: 'subjects', sourceField: '_批量变更_subjects', previewRowCount: 2, initialDirtyRows: 0, editableColumnCount: 1, qualifiedColumns: ['subjects.科目ID', 'subjects.科目名'] },
        ],
      });
      const subjectGrid = plan.artifacts.forms[0].design.components.find((item: any) => item.fieldBinding === '_批量变更_subjects');
      assert.deepEqual(subjectGrid.props.sourceQualifiedColumns, ['subjects.科目ID', 'subjects.科目名']);
      const submitButton = plan.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '预检并原子提交');
      assert.equal(submitButton.props.disabledExpression, '((len($_批量变更_teachers) + len($_批量变更_subjects)) == 0) || ((len($_批量变更_teachers) + len($_批量变更_subjects)) > 200)');
      assert.deepEqual(submitButton.props.flowTriggers?.onClick?.parameterMap, { 'transaction_import.formData': '$values' });
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.maxChanges, 200);
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.batchSets?.length, 2);
      assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.dirtyStats?.[0]?.initialDirtyRows, 0);
      assert.equal(plan.preview?.exactConfiguration?.buttons?.find((item: any) => item.label === '预检并原子提交')?.disabledExpression, '((len($_批量变更_teachers) + len($_批量变更_subjects)) == 0) || ((len($_批量变更_teachers) + len($_批量变更_subjects)) > 200)');
      assert.equal(plan.preview?.exactConfiguration?.internalBindings?.filter((item: any) => item.field.startsWith('_批量变更_')).length, 2);
      assert.deepEqual(writeProps.targets.map((item: any) => ({ tableId: item.tableId, conflictCheckFields: item.conflictCheckFields })), [
        { tableId: 'teachers', conflictCheckFields: ['姓名', '科目ID', '工资', '绩效', '入职日期'] },
        { tableId: 'subjects', conflictCheckFields: ['科目名'] },
      ]);
    }
    assert.doesNotThrow(() => applyOperationPlan(value, plan));
  }
});

test('generated test assets cover cross-table batch limits and parallel existingPolicy conflict handling', () => {
  const value = project();
  const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];

  const multiBatch = planOperationTemplate(
    value,
    'multi-table-batch-update',
    { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, maxChanges: 200, formId: 'multi_batch_test_assets' },
  );
  const multiBatchCase = multiBatch.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'max-changes-exceeded');
  const noDirtyCase = multiBatch.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'no-dirty-rows');
  const rollbackCase = multiBatch.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'single-target-conflict-rolls-back-all');
  assert.ok(multiBatchCase);
  assert.equal(multiBatchCase.expected.submitEnabled, false);
  assert.ok(noDirtyCase);
  assert.equal(noDirtyCase.expected.submitEnabled, false);
  assert.ok(rollbackCase);
  assert.equal(rollbackCase.expected.atomicRolledBack, true);
  assert.equal(rollbackCase.expected.dirtyRowsPreserved, true);

  const parallel = planOperationTemplate(
    value,
    'parallel-cross-table-entry',
    { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, existingPolicy: 'error', formId: 'parallel_entry_test_assets' },
  );
  const conflictCase = parallel.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'existing-key-conflict');
  const skipCase = parallel.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'existing-key-skip');
  const updateCase = parallel.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'existing-key-update');
  const successCase = parallel.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'atomic-commit');
  assert.ok(conflictCase);
  assert.equal(conflictCase.expected.conflictPolicy, 'error');
  assert.ok(skipCase);
  assert.equal(skipCase.expected.conflictPolicy, 'skip');
  assert.equal(skipCase.expected.skippedExisting, true);
  assert.ok(updateCase);
  assert.equal(updateCase.expected.conflictPolicy, 'update');
  assert.equal(updateCase.expected.updatesExisting, true);
  assert.ok(successCase);
  assert.equal(successCase.expected.atomic, true);
});

test('master-detail-entry test assets cover foreign-key propagation, detail conflict and empty detail guard', () => {
  const value = project();
  const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  const plan = planOperationTemplate(
    value,
    'master-detail-entry',
    { tableIds: ['subjects', 'teachers'], tableId: 'subjects', sheetName: '科目', relationIds: [relation.id] },
    { relationId: relation.id, allowEmptyDetails: false, formId: 'master_detail_asset_cases' },
  );
  const cases = plan.artifacts.tests.flatMap((suite: any) => suite.cases);
  const propagation = cases.find((item: any) => item.category === 'detail-foreign-key-propagation');
  const conflict = cases.find((item: any) => item.category === 'detail-key-conflict');
  const foreignKeyMismatch = cases.find((item: any) => item.category === 'detail-foreign-key-mismatch');
  const empty = cases.find((item: any) => item.category === 'empty-details');
  assert.ok(propagation);
  assert.equal(propagation.expected.foreignKeyPropagated, true);
  assert.equal(propagation.expected.atomic, true);
  assert.ok(conflict);
  assert.equal(conflict.expected.atomicRolledBack, true);
  assert.ok(foreignKeyMismatch);
  assert.equal(foreignKeyMismatch.expected.conflictCode, 'FOREIGN_KEY_MISMATCH');
  assert.ok(empty);
  assert.equal(empty.expected.submitEnabled, false);
});

test('master-detail-entry consumes master/detail projection, edit mode and exact preview bindings precisely', () => {
  const value = project();
  const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' };
  value.relations = [relation];
  const plan = planOperationTemplate(
    value,
    'master-detail-entry',
    { tableIds: ['subjects', 'teachers'], tableId: 'subjects', sheetName: '科目', relationIds: [relation.id] },
    {
      relationId: relation.id,
      formId: 'master_detail_projected',
      masterFields: ['科目名'],
      detailFields: ['姓名', '工资'],
      detailTitle: '教师明细编辑',
      detailRows: 3,
      allowEmptyDetails: true,
      detailEditableMode: 'readonly',
      duplicateDetailPolicy: 'skip',
      resultField: '_主从结果快照',
      statusField: '_主从事务状态',
      changeLogField: '_主从事务差异',
      successMessage: '主从预检完成',
      submitLabel: '提交主从修改',
    },
  );
  const form = plan.artifacts.forms[0];
  assert.deepEqual(form.design.templateParameters.fieldProjection.visibleFields, ['subjects.科目名', 'teachers.姓名', 'teachers.工资']);
  assert.deepEqual(form.design.templateParameters.fieldProjection.internalFields, ['subjects.科目ID', 'teachers.科目ID']);
  assert.deepEqual(form.design.templateParameters.detailPolicy, {
    allowEmptyDetails: true,
    relationId: relation.id,
    detailTitle: '教师明细编辑',
    detailRows: 3,
    detailEditableMode: 'readonly',
    duplicateDetailPolicy: 'skip',
    masterFields: ['subjects.科目名'],
    detailFields: ['teachers.姓名', 'teachers.工资'],
  });
  assert.equal(form.design.templateParameters.resultField, '_主从结果快照');
  assert.deepEqual(form.design.templateParameters.transactionPolicy, {
    atomic: true,
    resultField: '_主从结果快照',
    statusField: '_主从事务状态',
    diffField: '_主从事务差异',
    successMessage: '主从预检完成',
    targets: [
      { tableId: 'subjects', sheetName: '科目', keyField: '科目ID', mode: 'upsert', duplicatePolicy: undefined, sourceField: undefined },
      { tableId: 'teachers', sheetName: '教师', keyField: '教师ID', mode: 'insert', duplicatePolicy: 'skip', sourceField: '_明细' },
    ],
  });
  const masterFieldBindings = form.design.components.filter((item: any) => typeof item.fieldBinding === 'string' && item.fieldBinding.startsWith('subjects.')).map((item: any) => item.fieldBinding);
  assert.deepEqual(masterFieldBindings, ['subjects.科目名']);
  const detailGrid = form.design.components.find((item: any) => item.fieldBinding === '_明细');
  const resultGrid = form.design.components.find((item: any) => item.fieldBinding === '_主从结果快照');
  assert.equal(detailGrid.props.label, '教师明细编辑');
  assert.equal(resultGrid.props.label, '主从提交结果');
  assert.equal(detailGrid.props.rows, 3);
  assert.equal(detailGrid.props.editable, false);
  assert.equal(detailGrid.props.addable, false);
  assert.equal(detailGrid.props.removable, false);
  assert.deepEqual(detailGrid.props.columns.map((item: any) => item.dataIndex), ['姓名', '工资']);
  assert.deepEqual(detailGrid.props.sourceQualifiedColumns, ['teachers.姓名', 'teachers.工资']);
  assert.equal(form.design.components.some((item: any) => item.fieldBinding === '_主从事务状态'), true);
  assert.equal(form.design.components.some((item: any) => item.fieldBinding === '_主从事务差异'), true);
  const submitButton = form.design.components.find((item: any) => item.props?.label === '提交主从修改');
  assert.equal(submitButton.props.disabledExpression, undefined);
  assert.equal(plan.preview?.exactConfiguration?.copy?.successMessage, '主从预检完成');
  assert.deepEqual(plan.preview?.exactConfiguration?.fieldProjection?.visibleFields, ['subjects.科目名', 'teachers.姓名', 'teachers.工资']);
  assert.equal(plan.preview?.exactConfiguration?.policy?.detailPolicy?.detailEditableMode, 'readonly');
  assert.equal(plan.preview?.exactConfiguration?.policy?.detailPolicy?.detailRows, 3);
  assert.equal(plan.preview?.exactConfiguration?.policy?.detailPolicy?.duplicateDetailPolicy, 'skip');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.resultField, '_主从结果快照');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.statusField, '_主从事务状态');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.diffField, '_主从事务差异');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.resultField, '_主从结果快照');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.changeLogField, '_主从事务差异');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.writeBackField, '_主从事务状态');
  const workflow = plan.artifacts.workflows.find((item: any) => item.id === 'master_detail_projected_transaction_flow');
  const writeProps = JSON.parse(workflow!.nodes.find((node: any) => node.specId === 'data:transaction-write').data.propertiesJson);
  assert.equal(writeProps.resultField, '_主从结果快照');
  assert.equal(writeProps.statusField, '_主从事务状态');
  assert.equal(writeProps.diffField, '_主从事务差异');
  assert.equal(writeProps.successMessage, '主从预检完成');
  assert.deepEqual(writeProps.targets.map((item: any) => ({ tableId: item.tableId, fieldMap: item.fieldMap, duplicatePolicy: item.duplicatePolicy })), [
    { tableId: 'subjects', fieldMap: { 科目ID: 'subjects.科目ID', 科目名: 'subjects.科目名' }, duplicatePolicy: undefined },
    { tableId: 'teachers', fieldMap: { 教师ID: '教师ID', 姓名: '姓名', 工资: '工资' }, duplicatePolicy: 'skip' },
  ]);
});

test('parallel-cross-table-entry propagates existingPolicy into transaction targets and previewed strategy', () => {
  const value = project();
  const skipPlan = planOperationTemplate(
    value,
    'parallel-cross-table-entry',
    { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, existingPolicy: 'skip', formId: 'parallel_entry_skip' },
  );
  const skipWorkflow = skipPlan.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'data:transaction-write'));
  const skipWriteProps = JSON.parse(skipWorkflow!.nodes.find((node: any) => node.specId === 'data:transaction-write').data.propertiesJson);
  assert.deepEqual(skipWriteProps.targets.map((target: any) => ({ tableId: target.tableId, mode: target.mode, existingPolicy: target.existingPolicy })), [
    { tableId: 'teachers', mode: 'upsert', existingPolicy: 'skip' },
    { tableId: 'subjects', mode: 'upsert', existingPolicy: 'skip' },
  ]);
  assert.equal(skipPlan.preview?.exactConfiguration?.policy?.transactionPolicy?.existingPolicy, 'skip');

  const updatePlan = planOperationTemplate(
    value,
    'parallel-cross-table-entry',
    { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, existingPolicy: 'update', formId: 'parallel_entry_update' },
  );
  const updateWorkflow = updatePlan.artifacts.workflows.find((workflow: any) => workflow.nodes.some((node: any) => node.specId === 'data:transaction-write'));
  const updateWriteProps = JSON.parse(updateWorkflow!.nodes.find((node: any) => node.specId === 'data:transaction-write').data.propertiesJson);
  assert.deepEqual(updateWriteProps.targets.map((target: any) => ({ tableId: target.tableId, mode: target.mode, existingPolicy: target.existingPolicy })), [
    { tableId: 'teachers', mode: 'upsert', existingPolicy: 'update' },
    { tableId: 'subjects', mode: 'upsert', existingPolicy: 'update' },
  ]);
  assert.equal(updatePlan.preview?.exactConfiguration?.policy?.transactionPolicy?.existingPolicy, 'update');
});

test('parallel-cross-table-entry consumes table projections, section config, bindings and exact preview precisely', () => {
  const value = project();
  value.srcTable.push({
    id: 'bonuses',
    fileName: 'bonuses.json',
    fileType: 'json',
    sheets: [{
      name: '奖金',
      rowCount: 2,
      headers: ['奖金ID', '教师ID', '金额', '发放日期'],
      columns: [{ name: '奖金ID', dataType: 'string' }, { name: '教师ID', dataType: 'string' }, { name: '金额', dataType: 'number' }, { name: '发放日期', dataType: 'date' }],
      preview: [{ 奖金ID: 'B1', 教师ID: 'T1', 金额: 300, 发放日期: '2026-07-01' }],
      config: { keyFields: ['奖金ID'], readOnly: false },
    }],
  } as any);
  const plan = planOperationTemplate(
    value,
    'parallel-cross-table-entry',
    { tableIds: ['teachers', 'subjects', 'bonuses'], tableId: 'teachers', sheetName: '教师' },
    {
      atomic: true,
      formId: 'parallel_entry_projected',
      tableOrder: ['bonuses', 'teachers', 'subjects'],
      tableTitles: {
        teachers: '教师主档',
        subjects: '科目档案',
      },
      fieldsByTable: {
        bonuses: ['教师ID', '金额'],
        teachers: ['教师ID', '姓名', '工资'],
        subjects: ['科目名'],
      },
      sectionMode: 'compact',
      existingPolicy: 'update',
      statusField: '_并列事务状态',
      diffField: '_并列事务差异',
      successMessage: '跨表预检已完成',
      failureMessage: '跨表预检发现冲突',
      showDiffPreview: false,
      submitLabel: '提交三表录入',
    },
  );
  const form = plan.artifacts.forms[0];
  assert.deepEqual(form.design.templateParameters.fieldProjection.visibleFields, [
    'bonuses.教师ID',
    'bonuses.金额',
    'teachers.教师ID',
    'teachers.姓名',
    'teachers.工资',
    'subjects.科目名',
  ]);
  assert.deepEqual(form.design.templateParameters.transactionPolicy, {
    atomic: true,
    existingPolicy: 'update',
    sectionMode: 'compact',
    statusField: '_并列事务状态',
    diffField: '_并列事务差异',
    showDiffPreview: false,
    targets: [
      { tableId: 'bonuses', sheetName: '奖金', keyField: '奖金ID', mode: 'upsert', existingPolicy: 'update' },
      { tableId: 'teachers', sheetName: '教师', keyField: '教师ID', mode: 'upsert', existingPolicy: 'update' },
      { tableId: 'subjects', sheetName: '科目', keyField: '科目ID', mode: 'upsert', existingPolicy: 'update' },
    ],
  });
  assert.equal(form.design.components.some((item: any) => item.fieldBinding === '_并列事务差异'), false);
  assert.equal(form.design.components.some((item: any) => item.fieldBinding === '_并列事务状态'), true);
  assert.equal(form.design.components.some((item: any) => item.id === 'parallel_entry_projected_subjects_section'), false);
  const teacherName = form.design.components.find((item: any) => item.fieldBinding === 'teachers.姓名');
  const teacherId = form.design.components.find((item: any) => item.fieldBinding === 'teachers.教师ID');
  const teacherSalary = form.design.components.find((item: any) => item.fieldBinding === 'teachers.工资');
  const subjectName = form.design.components.find((item: any) => item.fieldBinding === 'subjects.科目名');
  const bonusTeacherId = form.design.components.find((item: any) => item.fieldBinding === 'bonuses.教师ID');
  const bonusAmount = form.design.components.find((item: any) => item.fieldBinding === 'bonuses.金额');
  assert.ok(teacherId);
  assert.ok(bonusTeacherId);
  assert.notEqual(teacherId.id, bonusTeacherId.id);
  assert.equal(teacherId.props.label, '教师主档 · 教师ID');
  assert.equal(bonusTeacherId.props.label, 'bonuses.json · 教师ID');
  assert.equal(teacherName.props.label, '教师主档 · 姓名');
  assert.equal(subjectName.props.label, '科目档案 · 科目名');
  assert.equal(teacherSalary.type, 'number');
  assert.equal(bonusAmount.type, 'number');
  const submitButton = form.design.components.find((item: any) => item.props?.label === '提交三表录入');
  assert.deepEqual(submitButton.props.flowTriggers?.onClick?.parameterMap, { 'transaction_import.formData': '$values' });
  assert.equal(plan.preview?.exactConfiguration?.copy?.successMessage, '跨表预检已完成');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.sectionMode, 'compact');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.statusField, '_并列事务状态');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.diffField, '_并列事务差异');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.showDiffPreview, false);
  assert.deepEqual(plan.preview?.exactConfiguration?.fieldProjection?.visibleFields, [
    'bonuses.教师ID',
    'bonuses.金额',
    'teachers.教师ID',
    'teachers.姓名',
    'teachers.工资',
    'subjects.科目名',
  ]);
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.changeLogField, '_并列事务差异');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.writeBackField, '_并列事务状态');
  const workflow = plan.artifacts.workflows.find((item: any) => item.id === 'parallel_entry_projected_transaction_flow');
  const writeProps = JSON.parse(workflow!.nodes.find((node: any) => node.specId === 'data:transaction-write').data.propertiesJson);
  assert.equal(writeProps.statusField, '_并列事务状态');
  assert.equal(writeProps.diffField, '_并列事务差异');
  assert.equal(writeProps.successMessage, '跨表预检已完成');
  assert.equal(writeProps.failureMessage, '跨表预检发现冲突');
  assert.deepEqual(writeProps.targets.map((item: any) => ({ tableId: item.tableId, fieldMap: item.fieldMap })), [
    { tableId: 'bonuses', fieldMap: { 教师ID: 'bonuses.教师ID', 金额: 'bonuses.金额' } },
    { tableId: 'teachers', fieldMap: { 教师ID: 'teachers.教师ID', 姓名: 'teachers.姓名', 工资: 'teachers.工资' } },
    { tableId: 'subjects', fieldMap: { 科目名: 'subjects.科目名' } },
  ]);
});

test('multi-table-batch-update keeps per-table batch sets for 3-table scenarios', () => {
  const value = project();
  value.srcTable.push({
    id: 'bonuses',
    fileName: 'bonuses.json',
    fileType: 'json',
    sheets: [{
      name: '奖金',
      rowCount: 2,
      headers: ['奖金ID', '教师ID', '金额'],
      columns: [{ name: '奖金ID', dataType: 'string' }, { name: '教师ID', dataType: 'string' }, { name: '金额', dataType: 'number' }],
      preview: [{ 奖金ID: 'B1', 教师ID: 'T1', 金额: 300 }],
      config: { keyFields: ['奖金ID'], readOnly: false },
    }],
  } as any);
  const plan = planOperationTemplate(
    value,
    'multi-table-batch-update',
    { tableIds: ['teachers', 'subjects', 'bonuses'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, maxChanges: 300, formId: 'multi_batch_three_tables' },
  );
  const policy = plan.artifacts.forms[0].design.templateParameters.transactionPolicy;
  assert.equal(policy.batchSets.length, 3);
  assert.deepEqual(policy.batchSets.map((item: any) => item.sourceField), ['_批量变更_teachers', '_批量变更_subjects', '_批量变更_bonuses']);
  assert.equal(policy.dirtyStats.length, 3);
  const submitButton = plan.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '预检并原子提交');
  assert.equal(submitButton.props.disabledExpression, '((len($_批量变更_teachers) + len($_批量变更_subjects) + len($_批量变更_bonuses)) == 0) || ((len($_批量变更_teachers) + len($_批量变更_subjects) + len($_批量变更_bonuses)) > 300)');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.batchSets?.length, 3);
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.dirtyStats?.length, 3);
});

test('multi-table-batch-update consumes per-table projections, custom bindings and ordering exactly', () => {
  const value = project();
  value.srcTable.push({
    id: 'bonuses',
    fileName: 'bonuses.json',
    fileType: 'json',
    sheets: [{
      name: '奖金',
      rowCount: 2,
      headers: ['奖金ID', '教师ID', '金额', '发放日期'],
      columns: [{ name: '奖金ID', dataType: 'string' }, { name: '教师ID', dataType: 'string' }, { name: '金额', dataType: 'number' }, { name: '发放日期', dataType: 'date' }],
      preview: [{ 奖金ID: 'B1', 教师ID: 'T1', 金额: 300, 发放日期: '2026-07-01' }],
      config: { keyFields: ['奖金ID'], readOnly: false },
    }],
  } as any);
  const plan = planOperationTemplate(
    value,
    'multi-table-batch-update',
    { tableIds: ['teachers', 'subjects', 'bonuses'], tableId: 'teachers', sheetName: '教师' },
    {
      atomic: true,
      maxChanges: 80,
      formId: 'multi_batch_projected',
      tableOrder: ['bonuses', 'teachers', 'subjects'],
      fieldsByTable: {
        teachers: ['姓名', '工资'],
        subjects: ['科目名'],
        bonuses: ['教师ID', '金额'],
      },
      editableFieldsByTable: {
        teachers: ['工资'],
        subjects: ['科目名'],
        bonuses: ['金额'],
      },
      statusField: '_批量提交状态',
      changeLogField: '_批量提交差异',
      successMessage: '多表批量预检完成',
      showOnlyDirty: false,
      submitLabel: '提交三表批改',
    },
  );
  const form = plan.artifacts.forms[0];
  const grids = form.design.components.filter((item: any) => item.type === 'table' && String(item.fieldBinding || '').startsWith('_批量变更_'));
  assert.deepEqual(grids.map((item: any) => item.props.sourceTableId), ['bonuses', 'teachers', 'subjects']);
  const teacherGrid = grids.find((item: any) => item.props.sourceTableId === 'teachers');
  const subjectGrid = grids.find((item: any) => item.props.sourceTableId === 'subjects');
  const bonusGrid = grids.find((item: any) => item.props.sourceTableId === 'bonuses');
  assert.deepEqual(teacherGrid.props.columns.map((item: any) => item.dataIndex), ['姓名', '工资']);
  assert.equal(teacherGrid.props.columns.find((item: any) => item.dataIndex === '姓名')?.editable, false);
  assert.equal(teacherGrid.props.columns.find((item: any) => item.dataIndex === '工资')?.editable, true);
  assert.deepEqual(subjectGrid.props.columns.map((item: any) => item.dataIndex), ['科目名']);
  assert.deepEqual(bonusGrid.props.columns.map((item: any) => item.dataIndex), ['教师ID', '金额']);
  assert.equal(bonusGrid.props.showOnlyDirty, false);
  assert.deepEqual(form.design.templateParameters.fieldProjection.visibleFields, ['bonuses.教师ID', 'bonuses.金额', 'teachers.姓名', 'teachers.工资', 'subjects.科目名']);
  assert.deepEqual(form.design.templateParameters.fieldProjection.internalFields, ['bonuses.奖金ID', 'teachers.教师ID', 'subjects.科目ID']);
  assert.equal(form.design.templateParameters.transactionPolicy.statusField, '_批量提交状态');
  assert.equal(form.design.templateParameters.transactionPolicy.diffField, '_批量提交差异');
  assert.equal(form.design.templateParameters.transactionPolicy.showOnlyDirty, false);
  assert.deepEqual(form.design.templateParameters.transactionPolicy.batchSets, [
    { tableId: 'bonuses', sheetName: '奖金', keyField: '奖金ID', sourceField: '_批量变更_bonuses', qualifiedColumns: ['bonuses.教师ID', 'bonuses.金额'], editableColumns: ['bonuses.金额'] },
    { tableId: 'teachers', sheetName: '教师', keyField: '教师ID', sourceField: '_批量变更_teachers', qualifiedColumns: ['teachers.姓名', 'teachers.工资'], editableColumns: ['teachers.工资'] },
    { tableId: 'subjects', sheetName: '科目', keyField: '科目ID', sourceField: '_批量变更_subjects', qualifiedColumns: ['subjects.科目名'], editableColumns: ['subjects.科目名'] },
  ]);
  assert.deepEqual(form.design.templateParameters.transactionPolicy.dirtyStats, [
    { tableId: 'bonuses', sourceField: '_批量变更_bonuses', previewRowCount: 2, initialDirtyRows: 0, editableColumnCount: 1, qualifiedColumns: ['bonuses.教师ID', 'bonuses.金额'] },
    { tableId: 'teachers', sourceField: '_批量变更_teachers', previewRowCount: 10, initialDirtyRows: 0, editableColumnCount: 1, qualifiedColumns: ['teachers.姓名', 'teachers.工资'] },
    { tableId: 'subjects', sourceField: '_批量变更_subjects', previewRowCount: 2, initialDirtyRows: 0, editableColumnCount: 1, qualifiedColumns: ['subjects.科目名'] },
  ]);
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.statusField, '_批量提交状态');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.diffField, '_批量提交差异');
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.showOnlyDirty, false);
  assert.equal(plan.preview?.exactConfiguration?.policy?.transactionPolicy?.dirtyStats?.[0]?.editableColumnCount, 1);
  assert.equal(plan.preview?.exactConfiguration?.copy?.successMessage, '多表批量预检完成');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.changeLogField, '_批量提交差异');
  assert.equal(plan.preview?.exactConfiguration?.resultBindings?.writeBackField, '_批量提交状态');
  assert.equal(plan.preview?.exactConfiguration?.buttons?.find((item: any) => item.label === '提交三表批改')?.workflowIds?.[0], 'multi_batch_projected_transaction_flow');
  const workflow = plan.artifacts.workflows.find((item: any) => item.id === 'multi_batch_projected_transaction_flow');
  const writeProps = JSON.parse(workflow!.nodes.find((node: any) => node.specId === 'data:transaction-write').data.propertiesJson);
  assert.equal(writeProps.statusField, '_批量提交状态');
  assert.equal(writeProps.diffField, '_批量提交差异');
  assert.equal(writeProps.successMessage, '多表批量预检完成');
  assert.deepEqual(writeProps.targets.map((item: any) => ({ tableId: item.tableId, fieldMap: item.fieldMap, conflictCheckFields: item.conflictCheckFields })), [
    { tableId: 'bonuses', fieldMap: { 奖金ID: '奖金ID', 教师ID: '教师ID', 金额: '金额' }, conflictCheckFields: ['金额'] },
    { tableId: 'teachers', fieldMap: { 教师ID: '教师ID', 姓名: '姓名', 工资: '工资' }, conflictCheckFields: ['工资'] },
    { tableId: 'subjects', fieldMap: { 科目ID: '科目ID', 科目名: '科目名' }, conflictCheckFields: ['科目名'] },
  ]);
});

test('multi-table-batch-update keeps submit enabled exactly at maxChanges and blocks only when exceeded', () => {
  const value = project();
  value.srcTable.push({
    id: 'bonuses',
    fileName: 'bonuses.json',
    fileType: 'json',
    sheets: [{
      name: '奖金',
      rowCount: 2,
      headers: ['奖金ID', '教师ID', '金额'],
      columns: [{ name: '奖金ID', dataType: 'string' }, { name: '教师ID', dataType: 'string' }, { name: '金额', dataType: 'number' }],
      preview: [{ 奖金ID: 'B1', 教师ID: 'T1', 金额: 300 }],
      config: { keyFields: ['奖金ID'], readOnly: false },
    }],
  } as any);
  const plan = planOperationTemplate(
    value,
    'multi-table-batch-update',
    { tableIds: ['teachers', 'subjects', 'bonuses'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, maxChanges: 3, formId: 'multi_batch_exact_limit' },
  );
  const submitButton = plan.artifacts.forms[0].design.components.find((item: any) => item.props?.label === '预检并原子提交');
  assert.equal(
    submitButton.props.disabledExpression,
    '((len($_批量变更_teachers) + len($_批量变更_subjects) + len($_批量变更_bonuses)) == 0) || ((len($_批量变更_teachers) + len($_批量变更_subjects) + len($_批量变更_bonuses)) > 3)',
  );
  const overLimitCase = plan.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'max-changes-exceeded');
  assert.ok(overLimitCase);
  assert.equal(overLimitCase.inputs.totalDirtyRows, 4);
  assert.equal(overLimitCase.expected.submitEnabled, false);
  assert.equal(plan.preview?.exactConfiguration?.buttons?.find((item: any) => item.label === '预检并原子提交')?.disabledExpression, submitButton.props.disabledExpression);
});

test('cross-table write templates block when any selected table is read-only', () => {
  const readonly = project();
  readonly.srcTable[1].sheets[0].config.readOnly = true;
  const parallel = analyzeOperationTemplate(
    readonly,
    'parallel-cross-table-entry',
    { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, existingPolicy: 'error' },
  );
  const batch = analyzeOperationTemplate(
    readonly,
    'multi-table-batch-update',
    { tableIds: ['teachers', 'subjects'], tableId: 'teachers', sheetName: '教师' },
    { atomic: true, maxChanges: 200 },
  );
  assert.equal(parallel.status, 'blocked');
  assert.ok(parallel.checks.some((item) => item.code === 'READ_ONLY_TABLE'));
  assert.equal(batch.status, 'blocked');
  assert.ok(batch.checks.some((item) => item.code === 'READ_ONLY_TABLE'));
});

test('master-detail view generates readonly master snapshot, nested detail tables and executable grouping workflow', () => {
  const value = project(); const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' }; value.relations = [relation];
  value.srcTable[1].sheets[0].preview = [
    { 科目ID: 'S1', 科目名: '劳动课' },
    { 科目ID: 'S2', 科目名: '数学' },
  ];
  value.srcTable[1].sheets[0].rowCount = 2;
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' },
    { 教师ID: 'T2', 姓名: '乙', 科目ID: 'S1', 工资: 120, 绩效: 95, 入职日期: '2026-02-01' },
  ];
  value.srcTable[0].sheets[0].rowCount = 2;
  const plan = planOperationTemplate(value, 'master-detail-view', { tableIds: ['subjects', 'teachers'], tableId: 'subjects', sheetName: '科目', relationIds: [relation.id] }, { relationId: relation.id, formId: 'subject_teachers_detail', joinType: 'left', pageSize: 2, exportFormat: 'xlsx' });
  const workflow = plan.artifacts.workflows[0];
  const form = plan.artifacts.forms[0] as any;
  assert.ok(form.design.components.some((item: any) => item.fieldBinding === '_主从详情结果'));
  const result = form.design.components.find((item: any) => item.fieldBinding === '_主从详情结果');
  const masterList = form.design.components.find((item: any) => item.fieldBinding === '_主记录列表');
  const currentDetails = form.design.components.find((item: any) => item.fieldBinding === '_当前明细');
  const readonlyFields = form.design.components.filter((item: any) => typeof item.fieldBinding === 'string' && item.fieldBinding.startsWith('subjects.'));
  assert.ok(readonlyFields.length >= 2);
  assert.ok(readonlyFields.every((item: any) => item.props.readonly === true && item.props.disabled === true));
  assert.deepEqual(masterList.props.columns, ['科目ID', '科目名', '明细数量']);
  assert.equal(masterList.props.rows, 2);
  assert.deepEqual(masterList.props.data, [
    { 科目ID: 'S1', 科目名: '劳动课', 明细数量: 2 },
    { 科目ID: 'S2', 科目名: '数学', 明细数量: 0 },
  ]);
  assert.deepEqual(currentDetails.props.data, [
    { 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' },
    { 教师ID: 'T2', 姓名: '乙', 科目ID: 'S1', 工资: 120, 绩效: 95, 入职日期: '2026-02-01' },
  ]);
  assert.equal(currentDetails.props.editable, false);
  assert.deepEqual(result.props.sourceQualifiedColumns, ['subjects.科目ID', 'subjects.科目名', 'teachers.__count', 'teachers.__details']);
  assert.ok(form.design.templateParameters.crossTableSources.some((item: any) => item.tableId === 'teachers'));
  assert.deepEqual(form.design.templateParameters.detailView, { joinType: 'left', pageSize: 2, exportFormat: 'xlsx', masterKey: '科目ID', detailKey: '科目ID' });
  assert.deepEqual(workflow.nodes.map((item: any) => item.specId), ['behavior-query-list', 'behavior-query-list', 'data:master-detail']);
  assert.match(workflow.nodes[2].data.propertiesJson, /"joinType":"left"/);
  assert.equal(plan.artifacts.outputs[0].format, 'xlsx');
  assert.doesNotThrow(() => applyOperationPlan(value, plan));
});

test('master-detail view inner join preview excludes empty masters while keeping export metadata', () => {
  const value = project(); const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' }; value.relations = [relation];
  value.srcTable[1].sheets[0].preview = [
    { 科目ID: 'S1', 科目名: '劳动课' },
    { 科目ID: 'S2', 科目名: '数学' },
  ];
  value.srcTable[1].sheets[0].rowCount = 2;
  value.srcTable[0].sheets[0].preview = [
    { 教师ID: 'T1', 姓名: '甲', 科目ID: 'S1', 工资: 100, 绩效: 90, 入职日期: '2026-01-01' },
  ];
  value.srcTable[0].sheets[0].rowCount = 1;
  const plan = planOperationTemplate(value, 'master-detail-view', { tableIds: ['subjects', 'teachers'], tableId: 'subjects', sheetName: '科目', relationIds: [relation.id] }, { relationId: relation.id, formId: 'subject_teachers_inner', joinType: 'inner', pageSize: 5, exportFormat: 'csv' });
  const form = plan.artifacts.forms[0] as any;
  const masterList = form.design.components.find((item: any) => item.fieldBinding === '_主记录列表');
  assert.deepEqual(masterList.props.data, [
    { 科目ID: 'S1', 科目名: '劳动课', 明细数量: 1 },
  ]);
  assert.deepEqual(form.design.templateParameters.detailView, { joinType: 'inner', pageSize: 5, exportFormat: 'csv', masterKey: '科目ID', detailKey: '科目ID' });
  assert.equal(plan.artifacts.outputs[0].format, 'csv');
  const exportCase = plan.artifacts.tests.flatMap((suite: any) => suite.cases).find((item: any) => item.category === 'exportable-master-detail');
  assert.ok(exportCase);
  assert.equal(exportCase.expected.exportFormat, 'csv');
});

test('master-detail view tolerates empty master rows and keeps readonly/detail regions usable', () => {
  const value = project(); const relation: DataRelation = { id: 'subject_teachers', name: '科目教师', left: { tableId: 'subjects', sheetName: '科目', fields: ['科目ID'] }, right: { tableId: 'teachers', sheetName: '教师', fields: ['科目ID'] }, cardinality: 'one-to-many', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' }; value.relations = [relation];
  value.srcTable[1].sheets[0].preview = [];
  value.srcTable[1].sheets[0].rowCount = 0;
  value.srcTable[0].sheets[0].preview = [];
  value.srcTable[0].sheets[0].rowCount = 0;
  const plan = planOperationTemplate(value, 'master-detail-view', { tableIds: ['subjects', 'teachers'], tableId: 'subjects', sheetName: '科目', relationIds: [relation.id] }, { relationId: relation.id, formId: 'subject_teachers_empty', joinType: 'left', pageSize: 3 });
  const form = plan.artifacts.forms[0] as any;
  const masterList = form.design.components.find((item: any) => item.fieldBinding === '_主记录列表');
  const currentDetails = form.design.components.find((item: any) => item.fieldBinding === '_当前明细');
  const readonlyFields = form.design.components.filter((item: any) => typeof item.fieldBinding === 'string' && item.fieldBinding.startsWith('subjects.'));
  assert.deepEqual(masterList.props.data, []);
  assert.deepEqual(currentDetails.props.data, []);
  assert.ok(readonlyFields.every((item: any) => item.props.readonly === true));
  assert.equal(form.design.templateParameters.detailView.pageSize, 3);
});

test('template lifecycle detects manual drift and only deletes owned resources', () => {
  const value = project();
  const plan = planOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师' }, { formId: 'teacher_entry' });
  const generated = applyOperationPlan(value, plan);
  assert.equal(inspectTemplateInstanceDrift(generated, plan.instanceId).drifted, false);
  generated.forms[0].design.components[0].props.title = '用户修改标题';
  const drift = inspectTemplateInstanceDrift(generated, plan.instanceId);
  assert.equal(drift.drifted, true);
  assert.equal(drift.checks.find((item) => item.id === 'teacher_entry')?.status, 'modified');
  generated.forms.push({ id: 'manual', name: '手工表单', design: { id: 'manual_design', name: '手工表单', components: [] } });
  const removed = deleteTemplateInstanceResources(generated, plan.instanceId);
  assert.deepEqual(removed.forms.map((item: any) => item.id), ['manual']);
  assert.equal(removed.templateInstances.length, 0);
});

test('safe regeneration preserves instance identity, restores missing resources and blocks manual overwrite by default', () => {
  const value = project(); const plan = planOperationTemplate(value, 'single-table-entry', { tableId: 'teachers', sheetName: '教师' }, { formId: 'teacher_entry' }); const generated = applyOperationPlan(value, plan);
  generated.workflows = [];
  const restored = regenerateTemplateInstance(generated, plan.instanceId);
  assert.equal(restored.project.templateInstances[0].id, plan.instanceId);
  assert.equal(restored.project.workflows.length, 1);
  assert.equal(restored.project.forms[0].generatedBy.instanceId, plan.instanceId);
  restored.project.forms[0].name = '用户修改的名称';
  assert.throws(() => regenerateTemplateInstance(restored.project, plan.instanceId), /手工修改/);
  const overwritten = regenerateTemplateInstance(restored.project, plan.instanceId, true);
  assert.equal(overwritten.project.forms[0].name, '单表数据录入');
  assert.deepEqual(overwritten.overwritten, ['teacher_entry']);
});
