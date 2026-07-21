import { registerExecutor, type NodeExecContext } from '../executor-registry';

const ML_API = 'http://localhost:3001/api/ml';

async function callML(command: string, args: Record<string, unknown> = {}): Promise<any> {
  const resp = await fetch(`${ML_API}/${command}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return resp.json();
}

// ── 预处理 ──────────────────────────────────────────

registerExecutor('ml:normalize', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const fields = String(properties.fields || '').split(',').map(s => s.trim()).filter(Boolean);
  const result = await callML('normalize', { data, fields: fields.length ? fields : undefined, min: properties.min ?? 0, max: properties.max ?? 1 });
  return result;
});

registerExecutor('ml:standardize', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const fields = String(properties.fields || '').split(',').map(s => s.trim()).filter(Boolean);
  return callML('standardize', { data, fields: fields.length ? fields : undefined });
});

registerExecutor('ml:onehot-encode', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('onehot_encode', { data: dataCheck.normalized, fields: properties.fields || '' });
});

registerExecutor('ml:label-encode', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('label_encode', { data: dataCheck.normalized, fields: properties.fields || '' });
});

registerExecutor('ml:pca', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const fields = String(properties.fields || '').split(',').map(s => s.trim()).filter(Boolean);
  return callML('pca', { data: dataCheck.normalized, n_components: properties.n_components ?? 2, fields: fields.length ? fields : undefined });
});

registerExecutor('ml:feature-select', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('feature_select', { data: dataCheck.normalized, target_field: properties.target_field || '', method: properties.method || 'variance', threshold: properties.threshold ?? 0.01 });
});

// ── 分析 ────────────────────────────────────────────

registerExecutor('ml:descriptive-stats', async (ctx) => {
  const { inputs, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('descriptive_stats', { data: dataCheck.normalized });
});

registerExecutor('ml:correlation', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const fields = String(properties.fields || '').split(',').map(s => s.trim()).filter(Boolean);
  return callML('correlation', { data: dataCheck.normalized, fields: fields.length ? fields : undefined, method: properties.method || 'pearson' });
});

registerExecutor('ml:linear-regression', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as Record<string, unknown>[];
  const xField = String(properties.x_field || '');
  const yField = String(properties.y_field || '');
  const points = data.map((row) => [Number(row[xField]), Number(row[yField])] as const)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < 2) return { error: '线性回归至少需要两条有效数据' };
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  const denominator = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  if (denominator === 0) return { error: `自变量 ${xField} 没有变化，无法回归` };
  const slope = points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const predictions = points.map(([x]) => slope * x + intercept);
  const total = points.reduce((sum, [, y]) => sum + (y - meanY) ** 2, 0);
  const residual = points.reduce((sum, [, y], index) => sum + (y - predictions[index]) ** 2, 0);
  return { slope, intercept, r2: total === 0 ? 1 : 1 - residual / total, predictions };
});

registerExecutor('ml:hypothesis-test', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('hypothesis_test', { data: dataCheck.normalized, field1: properties.field1 || '', field2: properties.field2 || null, test_type: properties.test_type || 'ttest' });
});

async function executeTimeSeries(ctx: NodeExecContext) {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { moving_average: [], trend_slope: 0, error: `数据格式错误: ${dataCheck.error}` };
  const rows = dataCheck.normalized as Record<string, unknown>[];
  const field = String(properties.field || '');
  const periods = Math.max(1, Math.trunc(Number(properties.periods) || 10));
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  const localResult = () => {
    const moving_average = values.map((_, index) => {
      const window = values.slice(Math.max(0, index - periods + 1), index + 1);
      return window.reduce((sum, value) => sum + value, 0) / Math.max(1, window.length);
    });
    const meanX = values.length > 0 ? (values.length - 1) / 2 : 0;
    const meanY = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const denominator = values.reduce((sum, _value, index) => sum + (index - meanX) ** 2, 0);
    const trend_slope = denominator === 0
      ? 0
      : values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0) / denominator;
    return { moving_average, trend_slope, source: 'local-fallback' };
  };
  try {
    const remote = await callML('time_series', { data: rows, field, periods });
    if (Array.isArray(remote?.moving_average) && Number.isFinite(Number(remote?.trend_slope))) {
      return { ...remote, trend_slope: Number(remote.trend_slope), source: remote.source || 'ml-service' };
    }
    return { ...localResult(), warning: String(remote?.error || '外部 ML 服务未返回完整时间序列结果') };
  } catch (error) {
    return { ...localResult(), warning: error instanceof Error ? error.message : String(error) };
  }
}

// Keep the historical runtime namespace and the schema ID executable.
registerExecutor('ml:time-series', executeTimeSeries);
registerExecutor('ml-time-series', executeTimeSeries);

// ── 挖掘 ────────────────────────────────────────────

registerExecutor('ml:kmeans', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const fields = String(properties.fields || '').split(',').map(s => s.trim()).filter(Boolean);
  return callML('kmeans', { data: dataCheck.normalized, n_clusters: properties.n_clusters ?? 3, fields: fields.length ? fields : undefined });
});

registerExecutor('ml:knn', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('knn', { data: dataCheck.normalized, target_field: properties.target_field || '', n_neighbors: properties.n_neighbors ?? 5, train_ratio: properties.train_ratio ?? 0.8 });
});

registerExecutor('ml:decision-tree', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('random_forest', { data: dataCheck.normalized, target_field: properties.target_field || '', n_estimators: 1, train_ratio: properties.train_ratio ?? 0.8 });
});

registerExecutor('ml:random-forest', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('random_forest', { data: dataCheck.normalized, target_field: properties.target_field || '', n_estimators: properties.n_estimators ?? 100, train_ratio: properties.train_ratio ?? 0.8 });
});

registerExecutor('ml:naive-bayes', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('naive_bayes', { data: dataCheck.normalized, target_field: properties.target_field || '', train_ratio: properties.train_ratio ?? 0.8 });
});

registerExecutor('ml:svm', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('svm', { data: dataCheck.normalized, target_field: properties.target_field || '', kernel: properties.kernel || 'rbf', train_ratio: properties.train_ratio ?? 0.8 });
});

registerExecutor('ml:anomaly-detect', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const fields = String(properties.fields || '').split(',').map(s => s.trim()).filter(Boolean);
  return callML('anomaly_detect', { data: dataCheck.normalized, fields: fields.length ? fields : undefined, contamination: properties.contamination ?? 0.1 });
});
