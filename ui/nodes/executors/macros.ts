import { registerExecutor } from '../executor-registry';
import { normalizeFlowSideEffect } from '../../src/services/engine/flowSideEffects';
import { buildFillFormPatch, findRowInTables, validateRequiredFields } from '../../src/services/engine/crudHelpers';
import { evaluatePropertyExpression } from '../../src/services/engine/propertyExpression';

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return objectValue(parsed); } catch { return {}; } }
  return {};
}

function arrayValue<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
  return [];
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function compare(left: unknown, operator: string, right: unknown) {
  if (operator === '==') return left == right;
  if (operator === '!=') return left != right;
  if (operator === '>') return Number(left) > Number(right);
  if (operator === '>=') return Number(left) >= Number(right);
  if (operator === '<') return Number(left) < Number(right);
  if (operator === '<=') return Number(left) <= Number(right);
  if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''));
  if (operator === 'isEmpty') return left == null || left === '';
  if (operator === 'isNotEmpty') return left != null && left !== '';
  return false;
}

type SaveRule = {
  type?: string;
  min?: number;
  minExclusive?: number;
  max?: number;
  pattern?: string;
  equals?: unknown;
  afterOrEqualField?: string;
};

function invalidSaveResult(errors: Record<string, string>) {
  const message = Object.values(errors).join('；');
  const effect = normalizeFlowSideEffect({ kind: 'show-message', message, level: 'error' });
  return { valid: false, saved: false, status: message, errors, missingFields: [], sideEffects: effect ? [effect] : [] };
}

function findSheetRows(ctx: Parameters<Parameters<typeof registerExecutor>[1]>[0], tableId: string, sheetName: string) {
  return ctx.tables.find((table) => table.id === tableId)?.sheets.find((sheet) => sheet.name === sheetName)?.preview || [];
}

registerExecutor('form:save', (ctx) => {
  const formData = { ...objectValue(ctx.inputs.formData ?? ctx.inputs.data) };
  const requiredFields = stringList(ctx.inputs.requiredFields ?? ctx.properties.requiredFields);
  const validation = validateRequiredFields(formData, requiredFields);
  if (!validation.valid) return {
    valid: false, saved: false, status: validation.message, missingFields: validation.missingFields,
      sideEffects: validation.message ? [normalizeFlowSideEffect({ kind: 'show-message', message: validation.message, level: 'error' })!] : [],
  };

  const errors: Record<string, string> = {};
  const rules = objectValue(ctx.inputs.rules ?? ctx.properties.rules) as Record<string, SaveRule>;
  for (const [field, rule] of Object.entries(rules)) {
    const value = formData[field];
    if (value == null || value === '') continue;
    if (rule.type === 'number' && (Number.isNaN(Number(value)) || !Number.isFinite(Number(value)))) errors[field] = `${field} 必须是有效数字`;
    else if (rule.min != null && Number(value) < rule.min) errors[field] = `${field} 不得小于 ${rule.min}`;
    else if (rule.minExclusive != null && Number(value) <= rule.minExclusive) errors[field] = `${field} 必须大于 ${rule.minExclusive}`;
    else if (rule.max != null && Number(value) > rule.max) errors[field] = `${field} 不得大于 ${rule.max}`;
    else if (rule.equals !== undefined && value !== rule.equals) errors[field] = `${field} 必须为 ${String(rule.equals)}`;
    else if (rule.pattern) {
      try { if (!new RegExp(rule.pattern).test(String(value))) errors[field] = `${field} 格式不正确`; }
      catch { errors[field] = `${field} 正则配置无效`; }
    }
    if (rule.afterOrEqualField && formData[rule.afterOrEqualField] != null) {
      const left = Date.parse(String(value));
      const right = Date.parse(String(formData[rule.afterOrEqualField]));
      if (Number.isNaN(left) || Number.isNaN(right) || left < right) errors[field] = `${field} 不得早于 ${rule.afterOrEqualField}`;
    }
  }
  const conditionalRequired = arrayValue<{ field?: string; operator?: string; value?: unknown; fields?: string[] }>(ctx.inputs.conditionalRequired ?? ctx.properties.conditionalRequired);
  for (const condition of conditionalRequired) {
    if (!condition.field || !compare(formData[condition.field], condition.operator || '==', condition.value)) continue;
    for (const field of stringList(condition.fields)) if (formData[field] == null || formData[field] === '') errors[field] = `${field} 为必填项`;
  }
  const foreignKeys = arrayValue<{ formField?: string; tableId?: string; sheetName?: string; keyField?: string; message?: string }>(ctx.inputs.foreignKeys ?? ctx.properties.foreignKeys);
  for (const foreignKey of foreignKeys) {
    if (!foreignKey.formField || !foreignKey.tableId || !foreignKey.sheetName || !foreignKey.keyField) continue;
    const value = formData[foreignKey.formField];
    if (!findSheetRows(ctx, foreignKey.tableId, foreignKey.sheetName).some((row) => row[foreignKey.keyField!] === value)) {
      errors[foreignKey.formField] = foreignKey.message || `${foreignKey.formField} 引用的数据不存在`;
    }
  }
  if (Object.keys(errors).length) return invalidSaveResult(errors);

  const tableId = String(ctx.inputs.tableId ?? ctx.properties.tableId ?? '');
  const sheetName = String(ctx.inputs.sheetName ?? ctx.properties.sheetName ?? '');
  const keyField = String(ctx.inputs.keyField ?? ctx.properties.keyField ?? '');
  if (ctx.properties.deriveFirstPurchase) {
    const playerField = String(ctx.properties.playerField || 'player_id');
    const statusField = String(ctx.properties.statusField || 'payment_status');
    const paidValue = ctx.properties.paidValue ?? '已支付';
    formData[String(ctx.properties.firstPurchaseField || 'is_first_purchase')] = !findSheetRows(ctx, tableId, sheetName)
      .some((row) => row[playerField] === formData[playerField] && row[statusField] === paidValue && row[keyField] !== formData[keyField]);
  }
  const fieldMap = objectValue(ctx.inputs.fieldMap ?? ctx.properties.fieldMap);
  const row = Object.keys(fieldMap).length
    ? Object.fromEntries(Object.entries(fieldMap).map(([formField, column]) => [String(column), formData[formField]]))
    : { ...formData };
  const keyValue = row[keyField] ?? formData[keyField];
  if (!tableId || !sheetName || !keyField || keyValue == null || keyValue === '') throw new Error('表单保存需要数据表、工作表、主键和主键值');
  const existing = findSheetRows(ctx, tableId, sheetName).find((candidate) => candidate[keyField] === keyValue);
  if (existing && ctx.properties.duplicatePolicy === 'reject') return invalidSaveResult({ [keyField]: `${keyField} 已存在` });
  const protectedUpdate = objectValue(ctx.properties.protectedUpdate) as { statusField?: string; statusValue?: unknown; fields?: string[] };
  if (existing && protectedUpdate.statusField && existing[protectedUpdate.statusField] === protectedUpdate.statusValue) {
    for (const field of stringList(protectedUpdate.fields)) {
      if (formData[field] !== undefined && formData[field] !== existing[field]) errors[field] = `${field} 在${String(protectedUpdate.statusValue)}状态下不可修改`;
    }
    if (Object.keys(errors).length) return invalidSaveResult(errors);
  }
  const writeBack = normalizeFlowSideEffect({ kind: 'upsert-table-row', tableId, sheetName, keyField, keyValue, row });
  const successMessage = String(ctx.properties.successMessage || '保存成功');
  const sideEffects = [writeBack, normalizeFlowSideEffect({ kind: 'show-message', message: successMessage, level: 'success' })]
    .filter((effect): effect is NonNullable<typeof effect> => effect != null);
  if (ctx.properties.resetAfterSave) for (const field of stringList(ctx.properties.resetFields)) {
    const effect = normalizeFlowSideEffect({ kind: 'set-form-value', field, value: '' });
    if (effect) sideEffects.push(effect);
  }
  return { valid: true, saved: true, status: successMessage, row, writeBack, result: row, sideEffects };
});

registerExecutor('analytics:game-dashboard', (ctx) => {
  const formData = objectValue(ctx.inputs.formData ?? ctx.inputs.filters);
  const rows = findSheetRows(ctx, 'daily_metrics', 'daily_metrics')
    .filter((row) => row.data_kind === 'actual')
    .filter((row) => !formData.filter_channel || row.channel === formData.filter_channel)
    .filter((row) => !formData.filter_version || row.version === formData.filter_version);
  const dateRange = objectValue(formData.date_range);
  const start = String(dateRange.start ?? dateRange[0] ?? '');
  const end = String(dateRange.end ?? dateRange[1] ?? '');
  const filtered = rows.filter((row) => (!start || String(row.metric_date) >= start) && (!end || String(row.metric_date) <= end));
  const activeRows = filtered.length ? filtered : rows;
  const latestDate = activeRows.reduce((latest, row) => String(row.metric_date) > latest ? String(row.metric_date) : latest, '');
  const latestRows = activeRows.filter((row) => String(row.metric_date) === latestDate);
  const sum = (field: string) => latestRows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const average = (field: string) => latestRows.length ? latestRows.reduce((total, row) => total + (Number(row[field]) || 0), 0) / latestRows.length : 0;
  const dau = sum('dau');
  const revenue = sum('revenue');
  const payingPlayers = sum('paying_players');
  const mode = String(ctx.properties.mode || 'analysis');
  const action = mode === 'forecast' ? '30天预测已运行' : mode === 'campaign' ? '活动效果分析已运行' : '指标分析已完成并刷新看板';
  const dashboardStatus = `${action} · 数据日期 ${latestDate || '无匹配数据'} · ${activeRows.length} 条指标记录`;
  const result = {
    kpi_dau: dau,
    kpi_mau: sum('mau'),
    kpi_d1: average('d1_retention_rate'),
    kpi_d7: average('d7_retention_rate'),
    kpi_payment_rate: dau ? payingPlayers / dau : 0,
    kpi_revenue: revenue,
    kpi_arpu: dau ? revenue / dau : 0,
    kpi_arppu: payingPlayers ? revenue / payingPlayers : 0,
    dashboard_status: dashboardStatus,
    refreshed_rows: activeRows.length,
  };
  const message = normalizeFlowSideEffect({ kind: 'show-message', message: dashboardStatus, level: 'success' });
  return { ...result, result, sideEffects: message ? [message] : [] };
});

registerExecutor('form:lookup-fill', (ctx) => {
  const tableId = String(ctx.inputs.tableId ?? ctx.properties.tableId ?? '');
  const sheetName = String(ctx.inputs.sheetName ?? ctx.properties.sheetName ?? '');
  const criteria = objectValue(ctx.inputs.criteria ?? ctx.properties.criteria);
  const row = findRowInTables(ctx.tables, `${tableId}:${sheetName}`, criteria, {}, { tableId, sheetName });
  const fieldMap = objectValue(ctx.inputs.fieldMap ?? ctx.properties.fieldMap) as Record<string, string>;
  const result = buildFillFormPatch(row, fieldMap);
  const sideEffects = Object.entries(result.patch).map(([field, value]) => normalizeFlowSideEffect({ kind: 'set-form-value', field, value })!).filter(Boolean);
  if (!row && ctx.properties.notFoundMessage) sideEffects.push(normalizeFlowSideEffect({ kind: 'show-message', message: String(ctx.properties.notFoundMessage), level: 'warning' })!);
  return { matched: !!row, record: row, patch: result.patch, appliedFields: result.appliedFields, sideEffects };
});

registerExecutor('form:conditional-state', (ctx) => {
  const field = String(ctx.properties.field || '');
  const formData = objectValue(ctx.inputs.formData);
  const value = ctx.inputs.value ?? formData[field];
  const matched = compare(value, String(ctx.properties.operator || '=='), ctx.inputs.compareValue ?? ctx.properties.compareValue);
  const target = String(ctx.properties.target || '');
  const state = String(ctx.properties.state || 'visible');
  const whenTrue = ctx.properties.whenTrue !== false;
  const active = matched ? whenTrue : !whenTrue;
  const effect = state === 'required'
    ? normalizeFlowSideEffect({ kind: 'set-field-required', field: target, required: active })
    : state === 'disabled'
      ? normalizeFlowSideEffect({ kind: 'set-component-disabled', componentId: target, disabled: active })
      : normalizeFlowSideEffect({ kind: 'set-component-visible', componentId: target, visible: active });
  const sideEffects = effect ? [effect] : [];
  if (!active && ctx.properties.clearWhenInactive) {
    const clear = normalizeFlowSideEffect({ kind: 'set-form-value', field: target, value: '' });
    if (clear) sideEffects.push(clear);
  }
  return { matched, active, target, state, sideEffects };
});

registerExecutor('form:cascade-options', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const parentField = String(ctx.properties.parentField || 'parent');
  const labelField = String(ctx.properties.labelField || 'label');
  const valueField = String(ctx.properties.valueField || labelField);
  const parentValue = ctx.inputs.parentValue;
  const matchedRows = rows.filter((row) => row[parentField] == parentValue);
  const options = matchedRows.map((row) => ({ label: String(row[labelField] ?? ''), value: row[valueField] }));
  return { options, values: options.map((option) => option.value), first: options[0]?.value, count: options.length };
});

registerExecutor('form:computed-field', (ctx) => {
  const formData = objectValue(ctx.inputs.formData ?? ctx.inputs.values);
  const expression = String(ctx.inputs.expression ?? ctx.properties.expression ?? '');
  const result = evaluatePropertyExpression(expression, { form: formData, row: objectValue(ctx.inputs.row), flow: objectValue(ctx.inputs.flow), event: objectValue(ctx.inputs.event) });
  if (!result.ok) throw new Error(result.error);
  const targetField = String(ctx.properties.targetField || '');
  const sideEffect = targetField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: targetField, value: result.value }) : null;
  return { value: result.value, result: result.value, targetField, sideEffects: sideEffect ? [sideEffect] : [] };
});

registerExecutor('form:validate-all', (ctx) => {
  const formData = objectValue(ctx.inputs.formData ?? ctx.inputs.values);
  const requiredFields = stringList(ctx.inputs.requiredFields ?? ctx.properties.requiredFields);
  const validation = validateRequiredFields(formData, requiredFields);
  const rules = objectValue(ctx.inputs.rules ?? ctx.properties.rules) as Record<string, { type?: string; min?: number; max?: number; pattern?: string }>;
  const errors: Record<string, string> = Object.fromEntries(validation.missingFields.map((field) => [field, `${field} 为必填项`]));
  for (const [field, rule] of Object.entries(rules)) {
    const value = formData[field];
    if (value == null || value === '') continue;
    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) errors[field] = `${field} 必须是数字`;
    else if (rule.min != null && Number(value) < Number(rule.min)) errors[field] = `${field} 小于最小值`;
    else if (rule.max != null && Number(value) > Number(rule.max)) errors[field] = `${field} 超过最大值`;
    else if (rule.pattern) { try { if (!new RegExp(rule.pattern).test(String(value))) errors[field] = `${field} 格式不正确`; } catch { errors[field] = `${field} 正则配置无效`; } }
  }
  const valid = Object.keys(errors).length === 0;
  const message = valid ? undefined : Object.values(errors).join('；');
  const sideEffect = message ? normalizeFlowSideEffect({ kind: 'show-message', message, level: 'error' }) : null;
  return { valid, missingFields: validation.missingFields, message, errors, sideEffects: sideEffect ? [sideEffect] : [] };
});

registerExecutor('data:lookup-join', (ctx) => {
  const leftRows = arrayValue<Record<string, unknown>>(ctx.inputs.left ?? ctx.inputs.rows);
  const rightRows = arrayValue<Record<string, unknown>>(ctx.inputs.right ?? ctx.inputs.reference);
  const leftKey = String(ctx.properties.leftKey || ctx.properties.key || 'id');
  const rightKey = String(ctx.properties.rightKey || ctx.properties.key || leftKey);
  const prefix = String(ctx.properties.prefix || '');
  const index = new Map(rightRows.map((row) => [String(row[rightKey]), row]));
  const rows = leftRows.map((row) => {
    const joined = index.get(String(row[leftKey]));
    if (!joined) return row;
    return { ...row, ...Object.fromEntries(Object.entries(joined).filter(([key]) => key !== rightKey).map(([key, value]) => [`${prefix}${key}`, value])) };
  });
  return { rows, result: rows, matchedCount: rows.filter((row, indexValue) => row !== leftRows[indexValue]).length };
});

registerExecutor('logic:match', (ctx) => {
  const value = ctx.inputs.value;
  const cases = arrayValue<{ value?: unknown; result?: unknown; label?: string }>(ctx.inputs.cases ?? ctx.properties.cases);
  const matched = cases.find((item) => item.value === value);
  const result = matched ? matched.result : (ctx.inputs.default ?? ctx.properties.defaultValue);
  return { result, matched: !!matched, label: matched?.label, value, trigger: ctx.inputs.trigger };
});

registerExecutor('flow:try-catch', (ctx) => {
  const error = ctx.inputs.error;
  const failed = error != null && error !== false && error !== '';
  const retryCount = Math.max(0, Number(ctx.properties.retryCount || 0));
  const timedOut = failed && /timeout|超时/i.test(String(error));
  const fallback = ctx.inputs.fallback ?? ctx.properties.compensationValue;
  return { result: failed ? fallback : ctx.inputs.value, success: failed ? undefined : ctx.inputs.value, failure: failed ? error : undefined, error, failed, attempts: failed ? retryCount + 1 : 1, timedOut, compensated: failed && fallback !== undefined };
});

registerExecutor('data:map-fields', (ctx) => {
  const record = objectValue(ctx.inputs.record ?? ctx.inputs.data);
  const fieldMap = objectValue(ctx.inputs.fieldMap ?? ctx.properties.fieldMap);
  const defaults = objectValue(ctx.inputs.defaults ?? ctx.properties.defaults);
  const transforms = objectValue(ctx.inputs.transforms ?? ctx.properties.transforms);
  const keepSource = ctx.properties.keepSource !== false;
  const result: Record<string, unknown> = keepSource ? { ...record, ...defaults } : { ...defaults };
  for (const [target, source] of Object.entries(fieldMap)) result[target] = typeof source === 'string' && source.startsWith('$') ? record[source.slice(1)] : record[String(source)] ?? source;
  for (const [field, transform] of Object.entries(transforms)) {
    if (transform === 'number') result[field] = Number(result[field]);
    else if (transform === 'string') result[field] = String(result[field] ?? '');
    else if (transform === 'trim') result[field] = String(result[field] ?? '').trim();
    else if (transform === 'boolean') result[field] = ['true', '1', 'yes', '是'].includes(String(result[field]).toLowerCase());
  }
  for (const field of stringList(ctx.properties.dropFields)) delete result[field];
  return { record: result, result, fields: Object.keys(result) };
});
