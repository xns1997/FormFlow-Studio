import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PYTHON_EXECUTABLE, pythonServicePath } from '../config/paths';
import { buildRowKeys, dataVersion } from './data-preview';
import { batchProjectRows, fullSourceRows, toolError, type JsonObject } from './project-authoring';
import { analyzeOperationTemplate, getOperationTemplate, queryRelationRows, resourceFingerprint } from './template';

const SCRIPT = pythonServicePath('src', 'ml_engine.py');
const COMMANDS: Record<string, string> = {
  'data-overview': 'descriptive_stats',
  'correlation-analysis': 'correlation',
  'anomaly-detection': 'anomaly_detect',
  'regression-prediction': 'regression_predict',
  'classification-prediction': 'classification_predict',
  'time-series-prediction': 'time_series_forecast',
  'trend-analysis': 'time_series',
};

export interface AnalysisRunInput {
  templateId: string;
  tableId: string;
  sheetName: string;
  fields?: string[];
  parameters?: JsonObject;
  tableIds?: string[];
  relationIds?: string[];
}

export interface AnalysisRunRecord {
  id: string;
  templateId: string;
  templateName?: string;
  status: 'succeeded' | 'failed';
  usable: boolean;
  projectRevision?: string;
  dataVersion: string;
  configurationHash: string;
  modelVersion: string;
  metrics?: JsonObject;
  baseline?: JsonObject;
  betterThanBaseline?: boolean;
  error?: string;
  createdAt: string;
  completedAt: string;
  input?: AnalysisRunInput;
  result?: JsonObject;
}

function compactResult(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[已截断]';
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => compactResult(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as JsonObject).map(([key, item]) => [key, compactResult(item, depth + 1)]));
  return value;
}

function numeric(values: unknown[]) { return values.map(Number).filter(Number.isFinite); }
function aggregate(values: unknown[], kind = 'sum') {
  const numbers = numeric(values); if (kind === 'count') return values.filter((value) => value !== null && value !== undefined && value !== '').length;
  if (!numbers.length) return null; if (kind === 'average') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (kind === 'min') return Math.min(...numbers); if (kind === 'max') return Math.max(...numbers); return numbers.reduce((sum, value) => sum + value, 0);
}

function localAnalysis(templateId: string, rows: JsonObject[], parameters: JsonObject): JsonObject | undefined {
  const metrics = (parameters.metrics || []) as string[]; const dimensions = (parameters.dimensions || []) as string[]; const aggregation = String(parameters.aggregation || 'sum');
  if (templateId === 'kpi-dashboard') return { cards: Object.fromEntries(metrics.map((field) => [field, { sum: aggregate(rows.map((row) => row[field]), 'sum'), average: aggregate(rows.map((row) => row[field]), 'average'), min: aggregate(rows.map((row) => row[field]), 'min'), max: aggregate(rows.map((row) => row[field]), 'max'), count: aggregate(rows.map((row) => row[field]), 'count') }])), row_count: rows.length, detail: rows };
  if (templateId === 'group-comparison' || templateId === 'cross-table-summary') {
    const groups = new Map<string, JsonObject[]>();
    for (const row of rows) { const key = JSON.stringify(dimensions.map((field) => row[field])); groups.set(key, [...(groups.get(key) || []), row]); }
    return { groups: [...groups.entries()].map(([key, members]) => ({ ...Object.fromEntries(dimensions.map((field, index) => [field, JSON.parse(key)[index]])), ...Object.fromEntries(metrics.map((field) => [`${aggregation}_${field}`, aggregate(members.map((row) => row[field]), aggregation)])), count: members.length })), detail: rows };
  }
  if (templateId === 'pivot-analysis') {
    const rowField = String(parameters.rowDimension); const columnField = String(parameters.columnDimension); const metric = String(parameters.metric);
    const rowValues = [...new Set(rows.map((row) => String(row[rowField] ?? '')))].sort(); const columnValues = [...new Set(rows.map((row) => String(row[columnField] ?? '')))].sort();
    const matrix = rowValues.map((rowValue) => ({ [rowField]: rowValue, ...Object.fromEntries(columnValues.map((columnValue) => [columnValue, aggregate(rows.filter((row) => String(row[rowField] ?? '') === rowValue && String(row[columnField] ?? '') === columnValue).map((row) => row[metric]), aggregation)])) }));
    return { row_dimension: rowField, column_dimension: columnField, metric, aggregation, columns: columnValues, matrix, detail: rows };
  }
  return undefined;
}

export function assessAnalysisResult(templateId: string, result: JsonObject): { usable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (result.error) reasons.push(String(result.error));
  if (templateId.endsWith('-prediction')) {
    if (!result.metrics || !Object.keys(result.metrics).length) reasons.push('评价指标缺失');
    if (!result.baseline || !Object.keys(result.baseline).length) reasons.push('基线指标缺失');
    if (result.better_than_baseline !== true) reasons.push('模型未优于基线');
  }
  if (templateId === 'classification-prediction' && !Array.isArray(result.confusion_matrix)) reasons.push('混淆矩阵缺失');
  if (templateId === 'time-series-prediction' && (!result.train_size || !result.test_size)) reasons.push('时间顺序回测记录缺失');
  return { usable: reasons.length === 0, reasons };
}

function pythonArguments(input: AnalysisRunInput, rows: JsonObject[]) {
  const parameters = input.parameters || {};
  if (input.templateId === 'regression-prediction') return { data: rows, target_field: parameters.target, feature_fields: parameters.features || input.fields, train_ratio: 1 - Number(parameters.validationRatio || 0.2), standardize: !!parameters.standardize };
  if (input.templateId === 'classification-prediction') return { data: rows, target_field: parameters.target, feature_fields: parameters.features || input.fields, train_ratio: 1 - Number(parameters.validationRatio || 0.2), threshold: Number(parameters.threshold || 0.5) };
  if (input.templateId === 'time-series-prediction') return { data: rows, time_field: parameters.timeField, target_field: parameters.target, horizon: Number(parameters.horizon || 6), seasonal_period: Number(parameters.seasonalPeriod || 1) };
  if (input.templateId === 'correlation-analysis') return { data: rows, fields: parameters.fields || input.fields, method: parameters.method || 'pearson' };
  if (input.templateId === 'anomaly-detection') return { data: rows, fields: parameters.fields || input.fields, contamination: Number(parameters.contamination || 0.1) };
  if (input.templateId === 'trend-analysis') return { data: rows, field: parameters.metric, periods: Number(parameters.periods || 10) };
  return { data: rows, ...parameters };
}

function analysisInputRows(project: JsonObject, input: AnalysisRunInput) {
  if (input.templateId === 'cross-table-summary') return queryRelationRows(project, { relationId: String(input.parameters?.relationId), exportAll: true }).rows;
  const table = (project.srcTable || []).find((item: JsonObject) => item.id === input.tableId);
  const sheet = table?.sheets?.find((item: JsonObject) => item.name === input.sheetName);
  if (!table || !sheet) throw toolError('SHEET_NOT_FOUND', '分析数据表或 Sheet 不存在');
  const rows = fullSourceRows(project, table, sheet);
  const fields = (input.fields || []).filter((field) => (sheet.headers || []).includes(field));
  if (!fields.length) return rows;
  return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
}

export function runAnalysisTemplate(project: JsonObject, input: AnalysisRunInput, projectRevision?: string) {
  const command = COMMANDS[input.templateId];
  const selection = { tableId: input.tableId, tableIds: input.tableIds || [input.tableId], sheetName: input.sheetName, fields: input.fields || [], relationIds: input.relationIds || (input.parameters?.relationId ? [String(input.parameters.relationId)] : []) };
  const feasibility = analyzeOperationTemplate(project, input.templateId, selection, input.parameters || {});
  if (feasibility.status === 'blocked' || feasibility.status === 'needs-configuration') throw toolError('TEMPLATE_NOT_FEASIBLE', feasibility.summary, 'input', feasibility);
  const table = (project.srcTable || []).find((item: JsonObject) => item.id === input.tableId);
  const sheet = table?.sheets?.find((item: JsonObject) => item.name === input.sheetName);
  if (!table || !sheet) throw toolError('SHEET_NOT_FOUND', '分析数据表或 Sheet 不存在');
  const rows = analysisInputRows(project, input);
  const versionRows = input.templateId === 'cross-table-summary' ? rows : fullSourceRows(project, table, sheet);
  const started = new Date().toISOString();
  const args = pythonArguments(input, rows); const configurationHash = createHash('sha256').update(JSON.stringify(args, (_key, value) => _key === 'data' ? undefined : value)).digest('hex');
  let result: JsonObject;
  const local = localAnalysis(input.templateId, rows, input.parameters || {});
  if (local) result = local;
  else if (!command) throw toolError('ANALYSIS_RUNTIME_UNAVAILABLE', `模板 ${input.templateId} 尚无运行器`, 'templateId');
  else try {
    const output = execFileSync(PYTHON_EXECUTABLE, [SCRIPT, command, JSON.stringify(args)], { timeout: 30_000, maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' });
    result = JSON.parse(output);
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  const assessment = assessAnalysisResult(input.templateId, result); const completedAt = new Date().toISOString();
  const record: AnalysisRunRecord = { id: `run_${randomUUID()}`, templateId: input.templateId, templateName: getOperationTemplate(input.templateId, project).name, status: result.error ? 'failed' : 'succeeded', usable: assessment.usable, projectRevision, dataVersion: dataVersion(versionRows), configurationHash, modelVersion: `${input.templateId}@1.0.0`, metrics: result.metrics, baseline: result.baseline, betterThanBaseline: result.better_than_baseline, error: result.error || assessment.reasons.join('；') || undefined, createdAt: started, completedAt, input, result: compactResult(result) as JsonObject };
  return { result, record, quality: assessment };
}

export function analysisRunStatus(project: JsonObject, record: AnalysisRunRecord) {
  if (!record.input) return { ...record, stale: true, staleReason: '旧结果缺少输入数据定位信息，请重新运行。' };
  const table = (project.srcTable || []).find((item: JsonObject) => item.id === record.input?.tableId); const sheet = table?.sheets?.find((item: JsonObject) => item.name === record.input?.sheetName);
  if (!table || !sheet) return { ...record, stale: true, staleReason: '输入数据表或 Sheet 已不存在。' };
  const rows = record.templateId === 'cross-table-summary'
    ? analysisInputRows(project, record.input)
    : fullSourceRows(project, table, sheet);
  const currentDataVersion = dataVersion(rows); const stale = currentDataVersion !== record.dataVersion;
  return { ...record, stale, currentDataVersion, staleReason: stale ? '输入数据自结果生成后已变化，请重新运行。' : undefined };
}

function presentationRows(record: AnalysisRunRecord) {
  const result = record.result || {};
  const cards = result.cards;
  if (cards && typeof cards === 'object') return Object.entries(cards as JsonObject).map(([name, summary]) => ({ 指标: name, ...(summary as JsonObject) }));
  if (record.templateId === 'data-overview' && result.stats && typeof result.stats === 'object') {
    const rowCount = Number((result.shape as unknown[])?.[0] || 0);
    return Object.entries(result.stats as JsonObject).map(([field, summary]) => {
      const stats = summary as JsonObject;
      const count = Number(stats.count || 0);
      return { 字段: field, 类型: result.dtypes?.[field] || 'unknown', 缺失数: Math.max(0, rowCount - count), 唯一值: stats.unique ?? '—', 均值: stats.mean ?? '—' };
    });
  }
  if (record.templateId === 'correlation-analysis' && result.matrix && typeof result.matrix === 'object') {
    const fields = (result.columns || Object.keys(result.matrix)) as string[];
    const pairs: JsonObject[] = [];
    for (let left = 0; left < fields.length; left += 1) for (let right = left + 1; right < fields.length; right += 1) {
      pairs.push({ '字段 A': fields[left], '字段 B': fields[right], 相关系数: result.matrix?.[fields[left]]?.[fields[right]] ?? result.matrix?.[fields[right]]?.[fields[left]] ?? 0 });
    }
    return pairs;
  }
  if (record.templateId === 'trend-analysis' && Array.isArray(result.moving_average)) {
    return result.moving_average.map((value, index) => ({ 序号: index + 1, 移动平均: value ?? '—' }));
  }
  if (record.templateId === 'time-series-prediction' && Array.isArray(result.forecast)) {
    return result.forecast.map((value, index) => ({ 预测期: index + 1, 预测值: value, 下界: result.intervals?.[index]?.lower ?? '—', 上界: result.intervals?.[index]?.upper ?? '—' }));
  }
  for (const key of ['groups', 'matrix', 'predictions', 'forecast', 'anomalies', 'data', 'detail']) {
    const value = result[key];
    if (Array.isArray(value)) return value.slice(0, 100).map((item, index) => item && typeof item === 'object' ? item as JsonObject : { 序号: index + 1, 结果: item });
  }
  const metrics = Object.entries(record.metrics || {}).map(([name, value]) => ({ 指标: name, 模型值: value, 基线值: record.baseline?.[name] ?? '—', 结论: record.usable ? '可用' : '需复核' }));
  if (metrics.length) return metrics;
  return [];
}

function presentationChartData(record: AnalysisRunRecord, rows: JsonObject[]) {
  const cards = record.result?.cards;
  if (cards && typeof cards === 'object') {
    const entries = Object.entries(cards as JsonObject);
    return {
      labels: entries.map(([name]) => name),
      datasets: [{
        label: '平均值',
        data: entries.map(([, summary]) => Number((summary as JsonObject)?.average) || 0),
        backgroundColor: 'rgba(0,122,255,0.28)',
        borderColor: '#007aff',
      }],
    };
  }
  if (record.templateId === 'data-overview' && rows.length) {
    return { labels: rows.map((row) => String(row.字段)), datasets: [{ label: '缺失数', data: rows.map((row) => Number(row.缺失数) || 0), backgroundColor: 'rgba(255,149,0,0.28)', borderColor: '#ff9500' }] };
  }
  if (record.templateId === 'correlation-analysis' && rows.length) {
    return { labels: rows.map((row) => `${row['字段 A']} × ${row['字段 B']}`), datasets: [{ label: '相关系数', data: rows.map((row) => Number(row.相关系数) || 0), backgroundColor: 'rgba(0,122,255,0.28)', borderColor: '#007aff' }] };
  }
  if (record.templateId === 'trend-analysis' && Array.isArray(record.result?.moving_average)) {
    return { labels: record.result.moving_average.map((_value: unknown, index: number) => String(index + 1)), datasets: [{ label: String(record.input?.parameters?.metric || '移动平均'), data: record.result.moving_average.map((value: unknown) => value == null ? null : Number(value)), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.16)' }] };
  }
  if (record.templateId === 'time-series-prediction' && rows.length) {
    return { labels: rows.map((row) => String(row.预测期)), datasets: [{ label: String(record.input?.parameters?.target || '预测值'), data: rows.map((row) => Number(row.预测值) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.16)' }] };
  }
  const metricValues = Object.entries(record.metrics || {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
  if (metricValues.length) return { labels: metricValues.map(([name]) => name), datasets: [{ label: '模型指标', data: metricValues.map(([, value]) => value), backgroundColor: 'rgba(0,122,255,0.32)', borderColor: '#007aff' }] };
  if (!rows.length) return undefined;
  const keys = Object.keys(rows[0]); const numericKey = keys.find((key) => rows.some((row) => Number.isFinite(Number(row[key]))));
  if (!numericKey) return undefined;
  const labelKey = keys.find((key) => key !== numericKey) || numericKey;
  return { labels: rows.slice(0, 30).map((row, index) => String(row[labelKey] ?? index + 1)), datasets: [{ label: numericKey, data: rows.slice(0, 30).map((row) => Number(row[numericKey]) || 0), backgroundColor: 'rgba(0,122,255,0.24)', borderColor: '#007aff' }] };
}

export function appendAnalysisRun(project: JsonObject, record: AnalysisRunRecord) {
  const next = structuredClone(project); next.modelRuns = [...(next.modelRuns || []), record].slice(-50); next.config.updatedAt = record.completedAt;
  const rows = presentationRows(record);
  for (const form of next.forms || []) {
    if (form.design?.templateKey !== record.templateId) continue;
    const status = form.design.components?.find((component: JsonObject) => component.fieldBinding === '_分析状态');
    if (status) {
      status.props ||= {};
      status.props.content = record.status === 'failed'
        ? `运行失败：${record.error || '请检查数据与配置后重试。'}`
        : record.usable
          ? `运行完成，结果可用。数据版本 ${record.dataVersion.slice(0, 10)}，完成于 ${record.completedAt}。`
          : `运行完成，但结果需要复核：${record.error || '质量门禁未通过。'}`;
      status.props.color = record.status === 'failed' || !record.usable ? '#b42318' : '#166534';
    }
    const resultTable = form.design.components?.find((component: JsonObject) => component.fieldBinding === '_分析结果');
    if (resultTable) {
      resultTable.props ||= {};
      resultTable.props.data = rows;
      if (rows.length) resultTable.props.columns = Object.keys(rows[0]).slice(0, 12);
    }
    const chart = form.design.components?.find((component: JsonObject) => component.props?.name === '_输入样本图');
    if (chart) {
      chart.props.title = record.status === 'failed' ? '运行未完成' : '最新分析结果';
      chart.props.chartData = presentationChartData(record, rows);
    }
    const cards = record.result?.cards;
    if (cards && typeof cards === 'object') {
      for (const component of form.design.components || []) {
        const metric = component.props?.templateMetric;
        if (!metric || !(metric in cards)) continue;
        component.props.content = Number((cards as JsonObject)[metric]?.average) || 0;
      }
    }
    form.updatedAt = record.completedAt;
    form.design.updatedAt = record.completedAt;
    const instance = (next.templateInstances || []).find((item: JsonObject) => (item.resources?.formIds || []).includes(form.id));
    if (instance) {
      instance.fingerprints ||= {};
      instance.fingerprints[form.id] = resourceFingerprint(form);
      instance.updatedAt = record.completedAt;
    }
  }
  return next;
}

export function applyPredictionWriteback(source: JsonObject, recordId: string, fieldNameValue: string, overwrite = false) {
  const project = structuredClone(source); const record = (project.modelRuns || []).find((item: JsonObject) => item.id === recordId);
  if (!record) throw toolError('ANALYSIS_RUN_NOT_FOUND', '预测结果不存在', 'id');
  if (!['regression-prediction', 'classification-prediction'].includes(record.templateId) || record.status !== 'succeeded' || !record.usable) throw toolError('PREDICTION_NOT_WRITEABLE', '只有可用的回归或分类结果可以写回', 'id');
  const predictions = record.result?.predictions; if (!Array.isArray(predictions)) throw toolError('PREDICTIONS_MISSING', '预测数组不存在', 'id');
  const table = (project.srcTable || []).find((item: JsonObject) => item.id === record.input?.tableId); const sheet = table?.sheets?.find((item: JsonObject) => item.name === record.input?.sheetName);
  if (!table || !sheet) throw toolError('SHEET_NOT_FOUND', '预测输入表已不存在'); const rows = fullSourceRows(project, table, sheet);
  if (predictions.length !== rows.length) throw toolError('PREDICTION_ROW_COUNT_MISMATCH', '预测数量与当前输入行数不一致，不能安全写回', 'id', { predictions: predictions.length, rows: rows.length });
  const fieldName = fieldNameValue.trim(); if (!fieldName) throw toolError('REQUIRED_ARGUMENT', '写回字段名不能为空', 'fieldName');
  if ((sheet.headers || []).includes(fieldName) && !overwrite) throw toolError('WRITEBACK_FIELD_EXISTS', '写回字段已存在；如需覆盖请明确确认', 'fieldName');
  const keys = buildRowKeys(rows, sheet.config?.keyFields || []); const result = batchProjectRows(project, { tableId: table.id, sheetName: sheet.name, baseVersion: record.dataVersion, updates: keys.map((rowKey, index) => ({ rowKey, changes: { [fieldName]: predictions[index] } })) });
  if (!(sheet.headers || []).includes(fieldName)) { sheet.headers.push(fieldName); sheet.columns ||= []; sheet.columns.push({ name: fieldName, index: sheet.headers.length - 1, dataType: 'number', nullable: false, uniqueCount: new Set(predictions.map(String)).size, sampleValues: predictions.slice(0, 5) }); sheet.colCount = sheet.headers.length; }
  record.writeback = { tableId: table.id, sheetName: sheet.name, fieldName, at: new Date().toISOString(), dataVersion: result.dataVersion };
  return { project, tableId: table.id, sheetName: sheet.name, fieldName, dataVersion: result.dataVersion, applied: result.applied.updates };
}
