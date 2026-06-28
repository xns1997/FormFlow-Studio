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
  return callML('linear_regression', { data: dataCheck.normalized, x_field: properties.x_field || '', y_field: properties.y_field || '' });
});

registerExecutor('ml:hypothesis-test', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('hypothesis_test', { data: dataCheck.normalized, field1: properties.field1 || '', field2: properties.field2 || null, test_type: properties.test_type || 'ttest' });
});

registerExecutor('ml:time-series', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  return callML('time_series', { data: dataCheck.normalized, field: properties.field || '', periods: properties.periods ?? 10 });
});

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
