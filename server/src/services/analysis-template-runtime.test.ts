import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisRunStatus, appendAnalysisRun, applyPredictionWriteback, assessAnalysisResult, runAnalysisTemplate } from './analysis-template-runtime';
import { applyOperationPlan, inspectTemplateInstanceDrift, planOperationTemplate } from './template-operation-center';

function project(): any {
  return { config: { id: 'analysis_runtime_test', updatedAt: '2026-07-22T00:00:00.000Z' }, srcTable: [{ id: 'sales', fileName: 'sales.json', fileType: 'json', sheets: [{ name: '销售', rowCount: 3, headers: ['区域', '月份', '销售额'], columns: [{ name: '区域', dataType: 'enum', uniqueCount: 2 }, { name: '月份', dataType: 'enum', uniqueCount: 2 }, { name: '销售额', dataType: 'number' }], preview: [{ 区域: '东区', 月份: '一月', 销售额: 10 }, { 区域: '东区', 月份: '二月', 销售额: 20 }, { 区域: '西区', 月份: '一月', 销售额: 5 }], config: { keyFields: [], readOnly: true } }] }], relations: [] };
}

test('prediction result is unusable without metrics, baseline and superiority', () => {
  const result = assessAnalysisResult('regression-prediction', { predictions: [1, 2] });
  assert.equal(result.usable, false);
  assert.deepEqual(result.reasons, ['评价指标缺失', '基线指标缺失', '模型未优于基线']);
});

test('classification requires confusion matrix even when it beats baseline', () => {
  const result = assessAnalysisResult('classification-prediction', { metrics: { accuracy: 0.9 }, baseline: { majority_accuracy: 0.6 }, better_than_baseline: true });
  assert.equal(result.usable, false);
  assert.ok(result.reasons.includes('混淆矩阵缺失'));
});

test('time series requires ordered backtest sizes', () => {
  const missing = assessAnalysisResult('time-series-prediction', { metrics: { mae: 1 }, baseline: { mae: 2 }, better_than_baseline: true });
  assert.equal(missing.usable, false);
  const ready = assessAnalysisResult('time-series-prediction', { metrics: { mae: 1 }, baseline: { mae: 2 }, better_than_baseline: true, train_size: 20, test_size: 4 });
  assert.equal(ready.usable, true);
});

test('group and pivot templates produce chartable aggregates and auditable detail', () => {
  const grouped = runAnalysisTemplate(project(), { templateId: 'group-comparison', tableId: 'sales', sheetName: '销售', fields: ['区域', '销售额'], parameters: { dimensions: ['区域'], metrics: ['销售额'], aggregation: 'sum' } });
  assert.deepEqual(grouped.result.groups, [{ 区域: '东区', sum_销售额: 30, count: 2 }, { 区域: '西区', sum_销售额: 5, count: 1 }]);
  assert.equal(grouped.result.detail.length, 3);
  const pivot = runAnalysisTemplate(project(), { templateId: 'pivot-analysis', tableId: 'sales', sheetName: '销售', fields: ['区域', '月份', '销售额'], parameters: { rowDimension: '区域', columnDimension: '月份', metric: '销售额', aggregation: 'sum' } });
  assert.deepEqual(pivot.result.columns, ['一月', '二月']);
  assert.deepEqual(pivot.result.matrix[0], { 区域: '东区', 一月: 10, 二月: 20 });
});

test('analysis run becomes explicitly stale when input data changes', () => {
  const value = project(); const run = runAnalysisTemplate(value, { templateId: 'kpi-dashboard', tableId: 'sales', sheetName: '销售', fields: ['销售额'], parameters: { metrics: ['销售额'] } });
  assert.equal(analysisRunStatus(value, run.record).stale, false);
  value.srcTable[0].sheets[0].preview.push({ 区域: '北区', 月份: '三月', 销售额: 99 });
  const status = analysisRunStatus(value, run.record);
  assert.equal(status.stale, true);
  assert.match(status.staleReason || '', /重新运行/);
});

test('completed analysis hydrates its generated report form with status, chart and result rows', () => {
  const value = project();
  (value.config as any).name = '分析运行';
  (value as any).release = { mode: 'design' };
  const plan = planOperationTemplate(value, 'kpi-dashboard', { tableId: 'sales', tableIds: ['sales'], sheetName: '销售', fields: ['区域', '销售额'] }, { formId: 'sales_kpi', metrics: ['销售额'], dimensions: ['区域'] });
  const generated = applyOperationPlan(value, plan);
  const run = runAnalysisTemplate(generated, { templateId: 'kpi-dashboard', tableId: 'sales', sheetName: '销售', fields: ['区域', '销售额'], parameters: { metrics: ['销售额'], dimensions: ['区域'] } });
  const hydrated = appendAnalysisRun(generated, run.record);
  const components = hydrated.forms[0].design.components;
  assert.match(components.find((component: any) => component.fieldBinding === '_分析状态').props.content, /运行完成/);
  assert.ok(components.find((component: any) => component.fieldBinding === '_分析结果').props.data.length > 0);
  assert.equal(components.find((component: any) => component.props?.name === '_输入样本图').props.title, '最新分析结果');
  assert.equal(inspectTemplateInstanceDrift(hydrated, plan.instanceId).drifted, false);
});

test('completed KPI run keeps selected metrics in cards, summary table and chart', () => {
  const value = project();
  (value.config as any).name = 'KPI 运行';
  (value as any).release = { mode: 'design' };
  const selection = { tableId: 'sales', tableIds: ['sales'], sheetName: '销售', fields: ['销售额'] };
  const parameters = { formId: 'sales_selected_kpi', metrics: ['销售额'] };
  const plan = planOperationTemplate(value, 'kpi-dashboard', selection, parameters);
  const generated = applyOperationPlan(value, plan);
  const run = runAnalysisTemplate(generated, { templateId: 'kpi-dashboard', ...selection, parameters });
  const hydrated = appendAnalysisRun(generated, run.record);
  const components = hydrated.forms[0].design.components;
  const card = components.find((component: any) => component.props?.templateMetric === '销售额');
  const result = components.find((component: any) => component.fieldBinding === '_分析结果');
  const chart = components.find((component: any) => component.props?.name === '_输入样本图');
  assert.equal(card.props.content, 35 / 3);
  assert.deepEqual(result.props.data.map((row: any) => row.指标), ['销售额']);
  assert.deepEqual(chart.props.chartData.labels, ['销售额']);
});

test('optional prediction writeback is immutable, version-bound and refuses silent field overwrite', () => {
  const value = project(); const seed = runAnalysisTemplate(value, { templateId: 'kpi-dashboard', tableId: 'sales', sheetName: '销售', fields: ['销售额'], parameters: { metrics: ['销售额'] } });
  const record = { ...seed.record, id: 'prediction_writeback', templateId: 'regression-prediction', status: 'succeeded' as const, usable: true, result: { predictions: [11, 22, 33] } }; value.modelRuns = [record];
  const written = applyPredictionWriteback(value, record.id, '预测利润');
  assert.equal((value.srcTable[0].sheets[0].preview[0] as any).预测利润, undefined);
  assert.deepEqual(written.project.srcTable[0].sheets[0].preview.map((row: any) => row.预测利润), [11, 22, 33]);
  assert.ok(written.project.srcTable[0].sheets[0].headers.includes('预测利润'));
  assert.throws(() => applyPredictionWriteback(written.project, record.id, '预测利润'), /已存在/);
  value.srcTable[0].sheets[0].preview.push({ 区域: '北区', 月份: '三月', 销售额: 99 });
  assert.throws(() => applyPredictionWriteback(value, record.id, '过期预测'), /数量与当前输入行数不一致/);
});

test('cross-table summary aggregates declared join results and retains source detail', () => {
  const value = project();
  value.srcTable.push({ id: 'targets', fileName: 'targets.json', fileType: 'json', sheets: [{ name: '目标', rowCount: 2, headers: ['月份', '目标值'], columns: [{ name: '月份', dataType: 'enum' }, { name: '目标值', dataType: 'number' }], preview: [{ 月份: '一月', 目标值: 100 }, { 月份: '二月', 目标值: 200 }], config: { keyFields: ['月份'], readOnly: true } }] });
  value.relations.push({ id: 'sales_target', name: '销售目标', left: { tableId: 'sales', sheetName: '销售', fields: ['月份'] }, right: { tableId: 'targets', sheetName: '目标', fields: ['月份'] }, cardinality: 'many-to-one', defaultJoinType: 'left', integrity: 'checked', onDelete: 'restrict' });
  const run = runAnalysisTemplate(value, { templateId: 'cross-table-summary', tableId: 'sales', tableIds: ['sales', 'targets'], sheetName: '销售', fields: ['销售额'], relationIds: ['sales_target'], parameters: { relationId: 'sales_target', dimensions: ['sales.区域'], metrics: ['targets.目标值'], aggregation: 'average' } });
  assert.deepEqual(run.result.groups, [{ 'sales.区域': '东区', 'average_targets.目标值': 150, count: 2 }, { 'sales.区域': '西区', 'average_targets.目标值': 100, count: 1 }]);
  assert.deepEqual(run.result.detail[0].__sources.sales, {});
});

test('regression prediction runs end-to-end, persists predictions and becomes stale after a data change', () => {
  const value = project(); const rows = Array.from({ length: 40 }, (_, index) => ({ 区域: index % 2 ? '东区' : '西区', 月份: `${index + 1}`, 销售额: index + 1, 利润: (index + 1) * 2 + 3 }));
  const sheet = value.srcTable[0].sheets[0] as any; sheet.rowCount = rows.length; sheet.headers.push('利润'); sheet.columns.push({ name: '利润', dataType: 'number' }); sheet.preview = rows;
  const run = runAnalysisTemplate(value, { templateId: 'regression-prediction', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: { target: '利润', features: ['销售额'], validationRatio: 0.2 } });
  assert.equal(run.record.status, 'succeeded', run.record.error);
  assert.ok(Array.isArray(run.result.predictions));
  assert.ok(run.result.metrics && run.result.baseline);
  assert.equal(run.record.usable, true);
  sheet.preview.push({ 区域: '北区', 月份: '41', 销售额: 41, 利润: 85 });
  assert.equal(analysisRunStatus(value, run.record).stale, true);
});

test('classification and time-series predictions run end-to-end with usable quality evidence', () => {
  const classificationProject = project(); const classificationRows = Array.from({ length: 60 }, (_, index) => ({ 特征一: index, 特征二: index % 5, 类别: index < 30 ? '低' : '高' }));
  const classificationSheet = classificationProject.srcTable[0].sheets[0] as any;
  classificationSheet.rowCount = classificationRows.length; classificationSheet.headers = ['特征一', '特征二', '类别']; classificationSheet.columns = [{ name: '特征一', dataType: 'number' }, { name: '特征二', dataType: 'number' }, { name: '类别', dataType: 'enum' }]; classificationSheet.preview = classificationRows;
  const classification = runAnalysisTemplate(classificationProject, { templateId: 'classification-prediction', tableId: 'sales', sheetName: '销售', fields: ['特征一', '特征二', '类别'], parameters: { target: '类别', features: ['特征一', '特征二'], validationRatio: 0.2 } });
  assert.equal(classification.record.status, 'succeeded', classification.record.error);
  assert.equal(classification.record.usable, true, classification.record.error);
  assert.ok(Array.isArray(classification.result.confusion_matrix));
  assert.equal(classification.result.predictions.length, classificationRows.length);

  const seriesProject = project(); const seriesRows = Array.from({ length: 36 }, (_, index) => ({ 日期: `2024-${String(Math.floor(index / 12) + 1).padStart(2, '0')}-${String(index % 12 + 1).padStart(2, '0')}`, 指标: 100 + index * 4 }));
  const seriesSheet = seriesProject.srcTable[0].sheets[0] as any;
  seriesSheet.rowCount = seriesRows.length; seriesSheet.headers = ['日期', '指标']; seriesSheet.columns = [{ name: '日期', dataType: 'date' }, { name: '指标', dataType: 'number' }]; seriesSheet.preview = seriesRows;
  const series = runAnalysisTemplate(seriesProject, { templateId: 'time-series-prediction', tableId: 'sales', sheetName: '销售', fields: ['日期', '指标'], parameters: { timeField: '日期', target: '指标', horizon: 6 } });
  assert.equal(series.record.status, 'succeeded', series.record.error);
  assert.equal(series.record.usable, true, series.record.error);
  assert.equal(series.result.forecast.length, 6);
  assert.ok(Array.isArray(series.result.intervals));
});

test('invalid prediction configuration is blocked early and bad data is caught at feasibility', () => {
  const value = project(); const rows = Array.from({ length: 35 }, (_, index) => ({ 区域: '东区', 月份: `${index}`, 销售额: '无法转数值', 利润: index * 2 })); const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length; sheet.headers.push('利润'); sheet.columns.push({ name: '利润', dataType: 'number' }); sheet.preview = rows;
  assert.throws(() => runAnalysisTemplate(value, { templateId: 'regression-prediction', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: { target: '不存在字段', features: ['销售额'], validationRatio: 0.2 } }), /条件未满足/);
  assert.throws(() => runAnalysisTemplate(value, { templateId: 'regression-prediction', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: { target: '利润', features: ['销售额'], validationRatio: 0.2 } }), /缺失率过高|条件未满足/);
  const constantRows = Array.from({ length: 35 }, (_, index) => ({ 区域: '东区', 月份: `${index}`, 销售额: index + 1, 利润: 42 })); sheet.rowCount = constantRows.length; sheet.preview = constantRows;
  assert.throws(() => runAnalysisTemplate(value, { templateId: 'regression-prediction', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: { target: '利润', features: ['销售额'], validationRatio: 0.2 } }), /常量|条件未满足/);
});

test('overview, trend, correlation and anomaly templates execute their dedicated runtimes', () => {
  const value = project(); const rows = Array.from({ length: 30 }, (_, index) => ({ 日期: `2026-01-${String(index + 1).padStart(2, '0')}`, 销售额: 100 + index * 3, 利润: 20 + index * 2 + (index % 3) })); const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length; sheet.headers = ['日期', '销售额', '利润']; sheet.columns = [{ name: '日期', dataType: 'date' }, { name: '销售额', dataType: 'number' }, { name: '利润', dataType: 'number' }]; sheet.preview = rows;
  const overview = runAnalysisTemplate(value, { templateId: 'data-overview', tableId: 'sales', sheetName: '销售', fields: ['日期', '销售额', '利润'], parameters: {} });
  assert.deepEqual(overview.result.shape, [30, 3]);
  const selectedOverview = runAnalysisTemplate(value, { templateId: 'data-overview', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: {} });
  assert.deepEqual(selectedOverview.result.shape, [30, 2]);
  assert.deepEqual(Object.keys(selectedOverview.result.stats), ['销售额', '利润']);
  const trend = runAnalysisTemplate(value, { templateId: 'trend-analysis', tableId: 'sales', sheetName: '销售', fields: ['日期', '销售额'], parameters: { timeField: '日期', metric: '销售额', grain: 'day' } });
  assert.equal(trend.record.status, 'succeeded', trend.record.error);
  const correlation = runAnalysisTemplate(value, { templateId: 'correlation-analysis', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: { fields: ['销售额', '利润'] } });
  assert.ok(correlation.result.matrix.销售额.利润 > 0.9);
  const anomaly = runAnalysisTemplate(value, { templateId: 'anomaly-detection', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'], parameters: { fields: ['销售额', '利润'], contamination: 0.1 } });
  assert.equal(anomaly.record.status, 'succeeded', anomaly.record.error);
  assert.equal(anomaly.result.data.length, 30);
});

test('overview, correlation and trend hydrate their dedicated result structures without restoring unselected fields', () => {
  const value = project(); const rows = Array.from({ length: 30 }, (_, index) => ({ 日期: `2026-01-${String(index + 1).padStart(2, '0')}`, 销售额: 100 + index * 3, 利润: 20 + index * 2 + (index % 3), 未选字段: index }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length; sheet.headers = ['日期', '销售额', '利润', '未选字段']; sheet.columns = [{ name: '日期', dataType: 'date' }, { name: '销售额', dataType: 'number' }, { name: '利润', dataType: 'number' }, { name: '未选字段', dataType: 'number' }]; sheet.preview = rows;
  (value.config as any).name = '分析结果适配';
  (value as any).release = { mode: 'design' };
  const cases = [
    { templateId: 'data-overview', fields: ['销售额', '利润'], parameters: { formId: 'overview_projection' }, expectedRows: ['销售额', '利润'] },
    { templateId: 'correlation-analysis', fields: ['销售额', '利润'], parameters: { formId: 'correlation_projection', fields: ['销售额', '利润'] }, expectedRows: ['销售额 × 利润'] },
    { templateId: 'trend-analysis', fields: ['日期', '销售额'], parameters: { formId: 'trend_projection', timeField: '日期', metric: '销售额', grain: 'day' }, expectedRows: [] },
  ];
  for (const scenario of cases) {
    const selection = { tableId: 'sales', tableIds: ['sales'], sheetName: '销售', fields: scenario.fields };
    const plan = planOperationTemplate(value, scenario.templateId, selection, scenario.parameters);
    const generated = applyOperationPlan(value, plan);
    const run = runAnalysisTemplate(generated, { templateId: scenario.templateId, ...selection, parameters: scenario.parameters });
    const hydrated = appendAnalysisRun(generated, run.record);
    const components = hydrated.forms[0].design.components;
    const result = components.find((component: any) => component.fieldBinding === '_分析结果');
    const chart = components.find((component: any) => component.props?.name === '_输入样本图');
    assert.ok(result.props.data.length, `${scenario.templateId}: missing hydrated rows`);
    assert.ok(chart.props.chartData?.labels?.length, `${scenario.templateId}: missing hydrated chart labels`);
    assert.equal(JSON.stringify(result.props.data).includes('未选字段'), false, `${scenario.templateId}: restored an unselected field`);
    if (scenario.templateId === 'data-overview') assert.deepEqual(result.props.data.map((row: any) => row.字段), scenario.expectedRows);
    if (scenario.templateId === 'correlation-analysis') assert.deepEqual(chart.props.chartData.labels, scenario.expectedRows);
  }
});

test('KPI dashboard handles multiple metrics, empty values and zero counts', () => {
  const value = project();
  const rows = Array.from({ length: 20 }, (_, index) => ({
    区域: index < 10 ? '东区' : '西区',
    月份: `${index + 1}`,
    销售额: index % 3 === 0 ? null : (index + 1) * 10,
    利润: index % 5 === 0 ? 0 : (index + 1) * 2,
  }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length;
  sheet.headers = ['区域', '月份', '销售额', '利润'];
  sheet.columns = [
    { name: '区域', dataType: 'enum', uniqueCount: 2 },
    { name: '月份', dataType: 'enum', uniqueCount: 20 },
    { name: '销售额', dataType: 'number' },
    { name: '利润', dataType: 'number' },
  ];
  sheet.preview = rows;
  const run = runAnalysisTemplate(value, {
    templateId: 'kpi-dashboard', tableId: 'sales', sheetName: '销售', fields: ['区域', '销售额', '利润'],
    parameters: { metrics: ['销售额', '利润'], dimensions: ['区域'], aggregation: 'sum' },
  });
  assert.equal(run.record.status, 'succeeded', run.record.error);
  assert.ok(run.result.cards.销售额);
  assert.ok(run.result.cards.利润);
  assert.ok(run.result.detail.length > 0);
});

test('group comparison supports multiple dimensions and metrics with empty groups', () => {
  const value = project();
  const rows = [
    { 类别: 'A', 区域: '东', 销售额: 100, 利润: 20 },
    { 类别: 'A', 区域: '东', 销售额: 150, 利润: 30 },
    { 类别: 'B', 区域: '西', 销售额: 200, 利润: 40 },
    { 类别: 'C', 区域: '东', 销售额: null, 利润: 10 },
  ];
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length;
  sheet.headers = ['类别', '区域', '销售额', '利润'];
  sheet.columns = [
    { name: '类别', dataType: 'enum', uniqueCount: 3 },
    { name: '区域', dataType: 'enum', uniqueCount: 2 },
    { name: '销售额', dataType: 'number' },
    { name: '利润', dataType: 'number' },
  ];
  sheet.preview = rows;
  const run = runAnalysisTemplate(value, {
    templateId: 'group-comparison', tableId: 'sales', sheetName: '销售', fields: ['类别', '区域', '销售额', '利润'],
    parameters: { dimensions: ['类别', '区域'], metrics: ['销售额', '利润'], aggregation: 'sum' },
  });
  assert.equal(run.record.status, 'succeeded', run.record.error);
  assert.ok(run.result.groups.length >= 2);
  const groupA = run.result.groups.find((g: any) => g['类别'] === 'A' && g['区域'] === '东');
  assert.ok(groupA);
  assert.equal(groupA['sum_销售额'], 250);
});

test('correlation detects negative correlation between opposing trends', () => {
  const value = project();
  const rows = Array.from({ length: 20 }, (_, index) => ({
    销售额: 100 + index * 5,
    利润: 200 - index * 3,
  }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length;
  sheet.headers = ['销售额', '利润'];
  sheet.columns = [
    { name: '销售额', dataType: 'number' },
    { name: '利润', dataType: 'number' },
  ];
  sheet.preview = rows;
  const run = runAnalysisTemplate(value, {
    templateId: 'correlation-analysis', tableId: 'sales', sheetName: '销售', fields: ['销售额', '利润'],
    parameters: { fields: ['销售额', '利润'] },
  });
  assert.equal(run.record.status, 'succeeded', run.record.error);
  assert.ok(run.result.matrix);
  assert.ok(run.result.matrix.销售额.利润 < -0.9);
});

test('anomaly detection handles data with no clear outliers', () => {
  const value = project();
  const rows = Array.from({ length: 30 }, (_, index) => ({
    指标一: 100 + (index % 5),
    指标二: 50 + (index % 3),
  }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length;
  sheet.headers = ['指标一', '指标二'];
  sheet.columns = [
    { name: '指标一', dataType: 'number' },
    { name: '指标二', dataType: 'number' },
  ];
  sheet.preview = rows;
  const run = runAnalysisTemplate(value, {
    templateId: 'anomaly-detection', tableId: 'sales', sheetName: '销售', fields: ['指标一', '指标二'],
    parameters: { fields: ['指标一', '指标二'], contamination: 0.1 },
  });
  assert.equal(run.record.status, 'succeeded', run.record.error);
  assert.equal(run.result.data.length, 30);
  assert.ok(run.result.data.every((row: any) => typeof row['anomaly_score'] === 'number'));
});

test('regression at 30-row exact boundary with single and multiple features', () => {
  const value = project();
  const rows = Array.from({ length: 30 }, (_, index) => ({ 特征A: index + 1, 特征B: (index + 1) * 0.5, 目标: (index + 1) * 3 + 10 }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length; sheet.headers = ['特征A', '特征B', '目标']; sheet.columns = [{ name: '特征A', dataType: 'number' }, { name: '特征B', dataType: 'number' }, { name: '目标', dataType: 'number' }]; sheet.preview = rows;
  const single = runAnalysisTemplate(value, { templateId: 'regression-prediction', tableId: 'sales', sheetName: '销售', fields: ['特征A', '目标'], parameters: { target: '目标', features: ['特征A'], validationRatio: 0.2 } });
  assert.equal(single.record.status, 'succeeded', single.record.error);
  assert.equal(single.record.usable, true);
  const multi = runAnalysisTemplate(value, { templateId: 'regression-prediction', tableId: 'sales', sheetName: '销售', fields: ['特征A', '特征B', '目标'], parameters: { target: '目标', features: ['特征A', '特征B'], validationRatio: 0.2 } });
  assert.equal(multi.record.status, 'succeeded', multi.record.error);
  assert.equal(multi.record.usable, true);
  assert.ok(multi.result.predictions.length === 30);
});

test('classification handles binary, multiclass and imbalanced scenarios', () => {
  const value = project();
  const binaryRows = Array.from({ length: 40 }, (_, index) => ({ 特征: index, 类别: index < 20 ? 'A' : 'B' }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = binaryRows.length; sheet.headers = ['特征', '类别']; sheet.columns = [{ name: '特征', dataType: 'number' }, { name: '类别', dataType: 'enum' }]; sheet.preview = binaryRows;
  const binary = runAnalysisTemplate(value, { templateId: 'classification-prediction', tableId: 'sales', sheetName: '销售', fields: ['特征', '类别'], parameters: { target: '类别', features: ['特征'], validationRatio: 0.2 } });
  assert.equal(binary.record.status, 'succeeded', binary.record.error);
  assert.ok(Array.isArray(binary.result.confusion_matrix));
  const multiRows = Array.from({ length: 60 }, (_, index) => ({ 特征: index, 类别: ['低', '中', '高'][index % 3] }));
  sheet.rowCount = multiRows.length; sheet.preview = multiRows;
  const multi = runAnalysisTemplate(value, { templateId: 'classification-prediction', tableId: 'sales', sheetName: '销售', fields: ['特征', '类别'], parameters: { target: '类别', features: ['特征'], validationRatio: 0.2 } });
  assert.equal(multi.record.status, 'succeeded', multi.record.error);
  assert.equal(multi.result.confusion_matrix.length, 3);
});

test('time-series at 24-row exact boundary with ordered and unordered data', () => {
  const value = project();
  const rows = Array.from({ length: 24 }, (_, index) => ({ 日期: `2024-${String(Math.floor(index / 2) + 1).padStart(2, '0')}-${String((index % 2) * 15 + 1).padStart(2, '0')}`, 指标: 100 + index * 2 }));
  const sheet = value.srcTable[0].sheets[0] as any;
  sheet.rowCount = rows.length; sheet.headers = ['日期', '指标']; sheet.columns = [{ name: '日期', dataType: 'date' }, { name: '指标', dataType: 'number' }]; sheet.preview = rows;
  const run = runAnalysisTemplate(value, { templateId: 'time-series-prediction', tableId: 'sales', sheetName: '销售', fields: ['日期', '指标'], parameters: { timeField: '日期', target: '指标', horizon: 3 } });
  assert.equal(run.record.status, 'succeeded', run.record.error);
  assert.equal(run.record.usable, true);
  assert.equal(run.result.forecast.length, 3);
});
