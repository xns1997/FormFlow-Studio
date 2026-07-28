import { registerExecutor } from '../executor-registry';
import { normalizeFlowSideEffect } from '../../src/services/engine/flowSideEffects';
import { buildFillFormPatch, findRowsInTables, validateRequiredFields } from '../../src/services/engine/crudHelpers';
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

function finiteValues(rows: Record<string, unknown>[], field: string) {
  return rows
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter(Number.isFinite);
}

function summarizeDistribution(values: unknown[], limit = 3) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => `${value}×${count}`)
    .join('，');
}

function aggregateNumbers(values: number[], aggregation: string) {
  if (aggregation === 'count') return values.length;
  if (!values.length) return 0;
  if (aggregation === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function groupedKey(row: Record<string, unknown>, fields: string[]) {
  if (!fields.length) return '全部';
  return fields.map((field) => String(row[field] ?? '空值')).join(' / ');
}

function alignedNumericPairs(rows: Record<string, unknown>[], leftField: string, rightField: string) {
  const pairs = rows
    .filter((row) => row[leftField] !== null && row[leftField] !== undefined && row[leftField] !== '' && row[rightField] !== null && row[rightField] !== undefined && row[rightField] !== '')
    .map((row) => [Number(row[leftField]), Number(row[rightField])] as const)
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  return {
    left: pairs.map(([left]) => left),
    right: pairs.map(([, right]) => right),
    count: pairs.length,
    points: pairs.map(([left, right]) => ({ x: left, y: right })),
  };
}

function correlation(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  if (size < 2) return 0;
  const x = left.slice(0, size);
  const y = right.slice(0, size);
  const xMean = x.reduce((sum, value) => sum + value, 0) / size;
  const yMean = y.reduce((sum, value) => sum + value, 0) / size;
  const numerator = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0);
  const denominator = Math.sqrt(
    x.reduce((sum, value) => sum + (value - xMean) ** 2, 0)
    * y.reduce((sum, value) => sum + (value - yMean) ** 2, 0),
  );
  return denominator ? numerator / denominator : 0;
}

function mae(actual: number[], predicted: number[]) {
  if (!actual.length || !predicted.length) return 0;
  const size = Math.min(actual.length, predicted.length);
  return actual.slice(0, size).reduce((sum, value, index) => sum + Math.abs(value - predicted[index]), 0) / size;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values: number[]) {
  if (!values.length) return 0;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
}

function trainTestSplit<T>(items: T[], validationRatio: number) {
  const ratio = Math.max(0.1, Math.min(0.5, validationRatio || 0.2));
  const validationSize = Math.max(1, Math.round(items.length * ratio));
  const train = items.slice(0, Math.max(1, items.length - validationSize));
  const validation = items.slice(train.length);
  return { train, validation };
}

function uniqueValues(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? '空值')))];
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
  const queryFields = stringList(ctx.properties.queryFields);
  const queryMode = String(ctx.properties.queryMode || 'exact');
  const requireUniqueMatch = ctx.properties.requireUniqueMatch !== false;
  const maxMatches = Math.max(1, Number(ctx.properties.maxMatches || 1) || 1);
  const rows = (() => {
    const activeCriteriaEntries = Object.entries(criteria).filter(([, value]) => value !== undefined && value !== null && value !== '');
    const preview = findSheetRows(ctx, tableId, sheetName);
    if (!activeCriteriaEntries.length) return [];
    if (queryMode === 'any' && queryFields.length) {
      return preview.filter((row) => activeCriteriaEntries.some(([field, value]) => queryFields.includes(field) && row[field] === value)).slice(0, Math.max(2, maxMatches + 1));
    }
    return findRowsInTables(ctx.tables, `${tableId}:${sheetName}`, criteria, { limit: Math.max(2, maxMatches + 1) }, { tableId, sheetName });
  })();
  const matchCount = rows.length;
  const unique = matchCount === 1;
  const row = matchCount === 1 || (!requireUniqueMatch && matchCount > 0) ? rows[0] : null;
  const fieldMap = objectValue(ctx.inputs.fieldMap ?? ctx.properties.fieldMap) as Record<string, string>;
  const originalFieldMap = objectValue(ctx.inputs.originalFieldMap ?? ctx.properties.originalFieldMap) as Record<string, string>;
  const result = buildFillFormPatch(row, fieldMap, { originalFieldMap });
  const matchedField = String(ctx.properties.matchedField || '_lookupMatched');
  const uniqueField = String(ctx.properties.uniqueField || '_lookupUnique');
  const matchCountField = String(ctx.properties.matchCountField || '_lookupMatchCount');
  const enableComponentIds = stringList(ctx.properties.enableComponentIds);
  const disableComponentIds = stringList(ctx.properties.disableComponentIds);
  const sideEffects = Object.entries(result.patch).map(([field, value]) => normalizeFlowSideEffect({ kind: 'set-form-value', field, value })!).filter(Boolean);
  for (const [field, value] of Object.entries(result.originalPatch || {})) {
    const effect = normalizeFlowSideEffect({ kind: 'set-form-value', field, value });
    if (effect) sideEffects.push(effect);
  }
  for (const effect of [
    normalizeFlowSideEffect({ kind: 'set-form-value', field: matchedField, value: unique }),
    normalizeFlowSideEffect({ kind: 'set-form-value', field: uniqueField, value: unique }),
    normalizeFlowSideEffect({ kind: 'set-form-value', field: matchCountField, value: matchCount }),
  ]) if (effect) sideEffects.push(effect);
  const nextDisabled = unique ? false : true;
  for (const componentId of unique ? enableComponentIds : disableComponentIds.length ? disableComponentIds : enableComponentIds) {
    const effect = normalizeFlowSideEffect({ kind: 'set-component-disabled', componentId, disabled: nextDisabled });
    if (effect) sideEffects.push(effect);
  }
  if (matchCount === 0 && ctx.properties.notFoundMessage) sideEffects.push(normalizeFlowSideEffect({ kind: 'show-message', message: String(ctx.properties.notFoundMessage), level: 'warning' })!);
  if (requireUniqueMatch && matchCount > maxMatches && ctx.properties.multipleMatchMessage) sideEffects.push(normalizeFlowSideEffect({ kind: 'show-message', message: String(ctx.properties.multipleMatchMessage), level: 'warning' })!);
  return { matched: !!row, unique, matchCount, record: row, patch: result.patch, originalPatch: result.originalPatch, appliedFields: result.appliedFields, sideEffects };
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
  const leftPrefix = String(ctx.properties.leftPrefix || '');
  const rightPrefix = String(ctx.properties.rightPrefix || ctx.properties.prefix || '');
  const joinType = String(ctx.properties.joinType || 'left');
  const maxMatches = Math.max(1, Number(ctx.properties.maxMatches || ctx.properties.queryLimit || 20));
  const resultField = String(ctx.properties.resultField || '');
  const messageField = String(ctx.properties.messageField || '');
  const emptyMessage = String(ctx.properties.emptyMessage || '未找到匹配记录');
  const multipleMessage = String(ctx.properties.multipleMessage || '命中多条记录，请继续收窄查询条件');
  const criteria = objectValue(ctx.inputs.criteria ?? ctx.properties.criteria);
  const sourceKeyFields = objectValue(ctx.properties.sourceKeyFields);
  const leftSourceKeys = stringList(sourceKeyFields.left);
  const rightSourceKeys = stringList(sourceKeyFields.right);
  const rightIndex = new Map<string, Record<string, unknown>[]>();
  for (const row of rightRows) {
    const key = String(row[rightKey] ?? '');
    rightIndex.set(key, [...(rightIndex.get(key) || []), row]);
  }
  const qualifiedRows = leftRows.flatMap((leftRow) => {
    const matches = rightIndex.get(String(leftRow[leftKey] ?? '')) || [];
    if (!matches.length && joinType === 'inner') return [];
    return (matches.length ? matches : [null]).map((rightRow) => {
      const row: Record<string, unknown> = {
        ...Object.fromEntries(Object.entries(leftRow).map(([key, value]) => [`${leftPrefix}${key}`, value])),
        ...(rightRow ? Object.fromEntries(Object.entries(rightRow).map(([key, value]) => [`${rightPrefix}${key}`, value])) : {}),
      };
      const snapshot = Object.fromEntries(Object.entries(row).map(([key, value]) => [`_original_${key}`, value]));
      return {
        ...row,
        ...snapshot,
        __sources: {
          [String(leftPrefix).replace(/\.$/, '') || 'left']: leftSourceKeys.length ? Object.fromEntries(leftSourceKeys.map((key) => [key, leftRow[key]])) : { [leftKey]: leftRow[leftKey] },
          [String(rightPrefix).replace(/\.$/, '') || 'right']: rightRow ? (rightSourceKeys.length ? Object.fromEntries(rightSourceKeys.map((key) => [key, rightRow[key]])) : { [rightKey]: rightRow[rightKey] }) : null,
        },
      } as Record<string, unknown>;
    });
  });
  const filteredRows = qualifiedRows.filter((row) => Object.entries(criteria).every(([field, value]) => value === undefined || value === null || value === '' || row[field] === value));
  const visibleRows = filteredRows.slice(0, maxMatches);
  const matchedCount = filteredRows.filter((row) => row[`${rightPrefix}${rightKey}`] !== undefined).length;
  const message = filteredRows.length === 0
    ? emptyMessage
    : filteredRows.length > maxMatches
      ? `${multipleMessage}（共 ${filteredRows.length} 条）`
      : `已关联 ${filteredRows.length} 条记录，其中 ${matchedCount} 条命中参考表`;
  const sideEffects = [resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: visibleRows }) : null, messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: visibleRows, result: visibleRows, total: filteredRows.length, matchedCount, unique: filteredRows.length === 1, message, sideEffects };
});

registerExecutor('data:master-detail', (ctx) => {
  const masters = arrayValue<Record<string, unknown>>(ctx.inputs.masters ?? ctx.inputs.left); const details = arrayValue<Record<string, unknown>>(ctx.inputs.details ?? ctx.inputs.right);
  const masterKey = String(ctx.properties.masterKey || 'id'); const detailKey = String(ctx.properties.detailKey || masterKey); const detailField = String(ctx.properties.detailField || '明细');
  const joinType = String(ctx.properties.joinType || 'left');
  const resultField = String(ctx.properties.resultField || ''); const messageField = String(ctx.properties.messageField || ''); const grouped = new Map<string, Record<string, unknown>[]>();
  for (const detail of details) { const key = String(detail[detailKey] ?? ''); grouped.set(key, [...(grouped.get(key) || []), detail]); }
  const rows = masters
    .map((master) => { const children = grouped.get(String(master[masterKey] ?? '')) || []; return { ...master, [detailField]: children, 明细数量: children.length }; })
    .filter((row) => joinType === 'inner' ? Number(row.明细数量 || 0) > 0 : true);
  const detailCount = rows.reduce((total, row) => total + Number(row.明细数量 || 0), 0); const message = `已加载 ${rows.length} 条主记录和 ${detailCount} 条明细`;
  const sideEffects = [resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: rows }) : null, messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows, result: rows, detailCount, message, sideEffects };
});

type TransactionTarget = {
  id?: string;
  tableId?: string;
  sheetName?: string;
  keyField?: string;
  mode?: 'insert' | 'update' | 'upsert';
  existingPolicy?: 'error' | 'skip' | 'update';
  conflictPolicy?: 'error' | 'refresh-and-retry';
  sourceField?: string;
  fieldMap?: Record<string, string>;
  originalFieldMap?: Record<string, string>;
  conflictCheckFields?: string[];
  foreignKey?: { field?: string; fromTarget?: string; fromField?: string };
};

/**
 * Turns one composite form value into a preflighted, all-or-nothing group of
 * table side effects. Preview applies the returned effects to an isolated
 * project clone, so any later conflict leaves every source table untouched.
 */
registerExecutor('data:transaction-write', (ctx) => {
  const formData = objectValue(ctx.inputs.formData ?? ctx.inputs.data);
  const targets = arrayValue<TransactionTarget>(ctx.inputs.targets ?? ctx.properties.targets);
  if (!targets.length) throw new Error('跨表事务至少需要一个写回目标');
  const prepared = new Map<string, Record<string, unknown>[]>();
  const conflicts: Array<{ code: string; target: string; message: string }> = [];
  const diff: Array<{ target: string; mode: string; key: unknown; fields: string[] }> = [];
  const sideEffects: NonNullable<ReturnType<typeof normalizeFlowSideEffect>>[] = [];

  for (const [targetIndex, target] of targets.entries()) {
    const targetId = String(target.id || `target_${targetIndex + 1}`);
    const tableId = String(target.tableId || ''); const sheetName = String(target.sheetName || ''); const keyField = String(target.keyField || '');
    const sheetRows = findSheetRows(ctx, tableId, sheetName);
    if (!tableId || !sheetName || !keyField || !ctx.tables.some((table) => table.id === tableId && table.sheets.some((sheet) => sheet.name === sheetName))) {
      conflicts.push({ code: 'TARGET_NOT_FOUND', target: targetId, message: `写回目标 ${tableId}/${sheetName} 不存在或未配置主键` });
      continue;
    }
    const sourceRows = target.sourceField ? arrayValue<Record<string, unknown>>(formData[target.sourceField]) : [formData];
    const mappedRows = sourceRows.map((source) => {
      const fieldMap = objectValue(target.fieldMap);
      const row = Object.keys(fieldMap).length
        ? Object.fromEntries(Object.entries(fieldMap).map(([column, sourceField]) => [column, source[String(sourceField)]]))
        : { ...source };
      const expectedForeignKey = target.foreignKey?.field
        ? prepared.get(String(target.foreignKey.fromTarget || ''))?.[0]?.[String(target.foreignKey.fromField || keyField)]
        : undefined;
      if (target.foreignKey?.field && (row[target.foreignKey.field] == null || row[target.foreignKey.field] === '')) {
        row[target.foreignKey.field] = expectedForeignKey;
      }
      if ((row[keyField] == null || row[keyField] === '') && target.mode !== 'update') {
        const numericKeys = [...sheetRows, ...[...prepared.values()].flat()].map((item) => Number(item[keyField])).filter(Number.isFinite);
        row[keyField] = numericKeys.length ? Math.max(...numericKeys) + 1 : `${targetId}_${sheetRows.length + 1}`;
      }
      return row;
    });
    prepared.set(targetId, mappedRows);
    for (const row of mappedRows) {
      const keyValue = row[keyField];
      const existing = sheetRows.find((item) => item[keyField] === keyValue);
      const mode = target.mode || 'upsert';
      const existingPolicy = target.existingPolicy || (mode === 'insert' ? 'error' : 'update');
      const originalFieldMap = objectValue(target.originalFieldMap);
      const conflictFields = stringList(target.conflictCheckFields).filter((field) => field !== keyField);
      const sourceRow = sourceRows[mappedRows.indexOf(row)] || {};
      const staleFields = existing && conflictFields.length
        ? conflictFields.filter((field) => existing[field] !== sourceRow[String(originalFieldMap[field] || `_original_${target.tableId}.${field}`)])
        : [];
      const expectedForeignKey = target.foreignKey?.field
        ? prepared.get(String(target.foreignKey.fromTarget || ''))?.[0]?.[String(target.foreignKey.fromField || keyField)]
        : undefined;
      if (keyValue == null || keyValue === '') conflicts.push({ code: 'KEY_REQUIRED', target: targetId, message: `${targetId} 缺少主键 ${keyField}` });
      else if (mode === 'insert' && existing) conflicts.push({ code: 'ROW_ALREADY_EXISTS', target: targetId, message: `${targetId} 的 ${keyField}=${String(keyValue)} 已存在` });
      else if (mode === 'update' && !existing) conflicts.push({ code: 'ROW_NOT_FOUND', target: targetId, message: `${targetId} 的 ${keyField}=${String(keyValue)} 不存在` });
      else if (target.foreignKey?.field && expectedForeignKey !== undefined && row[target.foreignKey.field] !== expectedForeignKey) conflicts.push({ code: 'FOREIGN_KEY_MISMATCH', target: targetId, message: `${targetId} 的 ${String(target.foreignKey.field)}=${String(row[target.foreignKey.field])} 与主记录 ${String(expectedForeignKey)} 不一致` });
      else if (staleFields.length) conflicts.push({ code: 'WRITE_CONFLICT', target: targetId, message: `${targetId} 的 ${keyField}=${String(keyValue)} 已被并发修改：${staleFields.join('、')}` });
      else if (mode === 'upsert' && existing && existingPolicy === 'skip') diff.push({ target: targetId, mode: 'skip', key: keyValue, fields: [] });
      else diff.push({ target: targetId, mode: existing ? 'update' : 'insert', key: keyValue, fields: Object.keys(row).filter((field) => !existing || existing[field] !== row[field]) });
    }
  }

  const statusField = String(ctx.properties.statusField || '_事务状态'); const diffField = String(ctx.properties.diffField || '_变更差异'); const resultField = String(ctx.properties.resultField || '');
  const maxChanges = Math.max(1, Number(ctx.properties.maxChanges || 1000));
  if (diff.length > maxChanges) conflicts.push({ code: 'BATCH_LIMIT_EXCEEDED', target: 'transaction', message: `事务包含 ${diff.length} 项变更，超过上限 ${maxChanges}` });
  if (conflicts.length) {
    const message = `事务未提交：发现 ${conflicts.length} 个冲突`;
    return { success: false, committed: false, conflicts, diff, result: diff, message, sideEffects: [normalizeFlowSideEffect({ kind: 'set-form-value', field: statusField, value: message }), normalizeFlowSideEffect({ kind: 'set-form-value', field: diffField, value: diff }), resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: diff }) : null, normalizeFlowSideEffect({ kind: 'show-message', message, level: 'error' })].filter((effect): effect is NonNullable<typeof effect> => effect != null) };
  }
  if (!diff.some((item) => item.fields.length > 0)) {
    const message = '暂无需要提交的修改';
    return { success: true, committed: false, conflicts: [], diff: [], result: [], message, sideEffects: [normalizeFlowSideEffect({ kind: 'set-form-value', field: statusField, value: message }), normalizeFlowSideEffect({ kind: 'set-form-value', field: diffField, value: [] }), resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: [] }) : null, normalizeFlowSideEffect({ kind: 'show-message', message, level: 'info' })].filter((effect): effect is NonNullable<typeof effect> => effect != null) };
  }
  for (const target of targets) {
    const targetId = String(target.id || `target_${targets.indexOf(target) + 1}`); const tableId = String(target.tableId); const sheetName = String(target.sheetName); const keyField = String(target.keyField); const mode = target.mode || 'upsert';
    for (const row of prepared.get(targetId) || []) {
      const rowDiff = diff.find((item) => item.target === targetId && item.key === row[keyField]);
      if (rowDiff && rowDiff.mode !== 'insert' && rowDiff.mode !== 'skip' && rowDiff.fields.length === 0) continue;
      const existing = findSheetRows(ctx, tableId, sheetName).find((item) => item[keyField] === row[keyField]);
      const existingPolicy = target.existingPolicy || (mode === 'insert' ? 'error' : 'update');
      if (mode === 'upsert' && existing && existingPolicy === 'skip') continue;
      const effectMode = mode === 'upsert' ? (existing ? 'update' : 'insert') : mode;
      const effect = normalizeFlowSideEffect({ kind: `${effectMode}-table-row`, tableId, sheetName, keyField, keyValue: row[keyField], row });
      if (effect) sideEffects.push(effect);
    }
  }
  const message = String(ctx.properties.successMessage || `已准备 ${sideEffects.length} 项跨表变更，提交过程保持原子性`);
  if (ctx.properties.clearSourceFieldsOnSuccess === true) {
    for (const sourceField of [...new Set(targets.map((target) => String(target.sourceField || '')).filter(Boolean))]) {
      const effect = normalizeFlowSideEffect({ kind: 'set-form-value', field: sourceField, value: [] });
      if (effect) sideEffects.push(effect);
    }
  }
  for (const effect of [normalizeFlowSideEffect({ kind: 'set-form-value', field: statusField, value: message }), normalizeFlowSideEffect({ kind: 'set-form-value', field: diffField, value: diff }), resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: diff }) : null, normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' })]) if (effect) sideEffects.push(effect);
  return { success: true, committed: true, conflicts: [], diff, result: diff, message, sideEffects };
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

registerExecutor('data:profile-overview', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const fields = stringList(ctx.inputs.fields ?? ctx.properties.fields);
  const resultField = String(ctx.properties.resultField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const chartField = String(ctx.properties.chartField || '');
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || fields.length || 8));
  const distributionLimit = Math.max(1, Number(ctx.properties.distributionLimit || 3));
  const sampleValueLimit = Math.max(1, Number(ctx.properties.sampleValueLimit || 3));
  const chartMetric = String(ctx.properties.chartMetric || '唯一值');
  const inferredFields = fields.length ? fields : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const profile = inferredFields.map((field) => {
    const values = rows.map((row) => row[field]);
    const valid = values.filter((value) => value !== null && value !== undefined && value !== '');
    const numeric = finiteValues(rows, field);
    return {
      字段: field,
      缺失数: values.length - valid.length,
      唯一值: new Set(valid.map(String)).size,
      非空率: values.length ? valid.length / values.length : 0,
      常量列: valid.length > 0 && new Set(valid.map(String)).size === 1,
      样本值: valid.slice(0, sampleValueLimit).map(String).join('，'),
      分布摘要: summarizeDistribution(valid, distributionLimit),
      ...(numeric.length ? { 均值: numeric.reduce((sum, value) => sum + value, 0) / numeric.length } : {}),
    };
  });
  const summary = {
    rowCount: rows.length,
    fieldCount: inferredFields.length,
    emptyFields: profile.filter((row) => row.非空率 === 0).map((row) => row.字段),
    constantFields: profile.filter((row) => row.常量列).map((row) => row.字段),
  };
  const chartRows = profile.slice(0, chartLimit);
  const chart = {
    labels: chartRows.map((row) => row.字段),
    datasets: [{ label: chartMetric, data: chartRows.map((row) => chartMetric === '缺失数' ? row.缺失数 : row.唯一值) }],
  };
  const message = `已完成 ${rows.length} 行、${inferredFields.length} 个字段的概览分析`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: profile }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { profile, summary, chart, message, result: profile, rows: profile, sideEffects };
});

registerExecutor('data:kpi-dashboard', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const metrics = stringList(ctx.inputs.metrics ?? ctx.properties.metrics);
  const dimensions = stringList(ctx.inputs.dimensions ?? ctx.properties.dimensions);
  const aggregation = String(ctx.properties.aggregation || 'average');
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || 8));
  const resultField = String(ctx.properties.resultField || '');
  const chartField = String(ctx.properties.chartField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const inferredMetrics = metrics.length
    ? metrics
    : [...new Set(rows.flatMap((row) => Object.keys(row)).filter((field) => finiteValues(rows, field).length > 0))];
  const summaryRows = inferredMetrics.map((metric) => {
    const values = finiteValues(rows, metric);
    return {
      指标: metric,
      汇总值: aggregateNumbers(values, 'sum'),
      均值: aggregateNumbers(values, 'average'),
      最小值: aggregateNumbers(values, 'min'),
      最大值: aggregateNumbers(values, 'max'),
      有效记录数: aggregation === 'count' ? rows.filter((row) => row[metric] !== null && row[metric] !== undefined && row[metric] !== '').length : values.length,
      当前值: aggregateNumbers(aggregation === 'count' ? rows.filter((row) => row[metric] !== null && row[metric] !== undefined && row[metric] !== '').map(() => 1) : values, aggregation),
    };
  });
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) groups.set(groupedKey(row, dimensions.slice(0, 1)), [...(groups.get(groupedKey(row, dimensions.slice(0, 1))) || []), row]);
  const groupedRows: Array<Record<string, unknown> & { 分组: string; 记录数: number }> = dimensions.length
    ? [...groups.entries()].map(([group, members]) => ({
      分组: group,
      ...Object.fromEntries(inferredMetrics.map((metric) => [metric, aggregateNumbers(aggregation === 'count' ? members.filter((row) => row[metric] !== null && row[metric] !== undefined && row[metric] !== '').map(() => 1) : finiteValues(members, metric), aggregation)])),
      记录数: members.length,
    }))
    : [];
  const chart = dimensions.length
    ? {
      labels: groupedRows.slice(0, chartLimit).map((row) => String(row.分组)),
      datasets: inferredMetrics.slice(0, 3).map((metric, index) => ({ label: metric, data: groupedRows.slice(0, chartLimit).map((row) => Number(row[metric]) || 0), borderColor: ['#007aff', '#ff9500', '#34c759'][index % 3], backgroundColor: ['rgba(0,122,255,0.28)', 'rgba(255,149,0,0.28)', 'rgba(52,199,89,0.28)'][index % 3] })),
    }
    : {
      labels: summaryRows.slice(0, chartLimit).map((row) => String(row.指标)),
      datasets: [{ label: aggregation, data: summaryRows.slice(0, chartLimit).map((row) => Number(row.当前值) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.28)' }],
    };
  const result = dimensions.length ? groupedRows : summaryRows;
  const summary = {
    rowCount: rows.length,
    metricCount: inferredMetrics.length,
    dimensionCount: dimensions.length,
    aggregation,
  };
  const message = dimensions.length
    ? `已完成 ${rows.length} 行数据的 KPI 分组汇总（${dimensions[0]}，${aggregation}）`
    : `已完成 ${rows.length} 行数据的 KPI 汇总（${aggregation}）`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { summaryRows, groupedRows, summary, chart, message, result, sideEffects };
});

registerExecutor('data:group-aggregate', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const dimensions = stringList(ctx.inputs.dimensions ?? ctx.properties.dimensions);
  const metrics = stringList(ctx.inputs.metrics ?? ctx.properties.metrics);
  const aggregation = String(ctx.properties.aggregation || 'sum');
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || 8));
  const resultField = String(ctx.properties.resultField || '');
  const chartField = String(ctx.properties.chartField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = groupedKey(row, dimensions);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const result = [...groups.entries()].flatMap(([group, members]) => metrics.map((metric) => ({
    分组: group,
    指标: metric,
    聚合值: aggregateNumbers(aggregation === 'count' ? members.filter((row) => row[metric] !== null && row[metric] !== undefined && row[metric] !== '').map(() => 1) : finiteValues(members, metric), aggregation),
    记录数: members.length,
    维度: dimensions.join('、'),
  })));
  const chartRows = result.filter((row) => row.指标 === metrics[0]).slice(0, chartLimit);
  const chart = {
    labels: chartRows.map((row) => String(row.分组)),
    datasets: [{ label: `${aggregation}(${metrics[0] || '指标'})`, data: chartRows.map((row) => Number(row.聚合值) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.28)' }],
  };
  const summary = { rowCount: rows.length, groupCount: groups.size, metricCount: metrics.length, aggregation };
  const message = `已按 ${dimensions.join('、') || '默认分组'} 对 ${metrics.length} 个指标完成 ${aggregation} 聚合`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: result, result, chart, summary, message, sideEffects };
});

registerExecutor('data:pivot-matrix', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const rowDimension = String(ctx.inputs.rowDimension ?? ctx.properties.rowDimension ?? '');
  const columnDimension = String(ctx.inputs.columnDimension ?? ctx.properties.columnDimension ?? '');
  const metric = String(ctx.inputs.metric ?? ctx.properties.metric ?? '');
  const aggregation = String(ctx.properties.aggregation || 'sum');
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || 8));
  const resultField = String(ctx.properties.resultField || '');
  const chartField = String(ctx.properties.chartField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const rowValues = [...new Set(rows.map((row) => String(row[rowDimension] ?? '空值')))];
  const columnValues = [...new Set(rows.map((row) => String(row[columnDimension] ?? '空值')))].slice(0, chartLimit);
  const result = rowValues.map((rowValue) => ({
    [rowDimension]: rowValue,
    ...Object.fromEntries(columnValues.map((columnValue) => [
      columnValue,
      aggregateNumbers(
        aggregation === 'count'
          ? rows.filter((row) => String(row[rowDimension] ?? '空值') === rowValue && String(row[columnDimension] ?? '空值') === columnValue && row[metric] !== null && row[metric] !== undefined && row[metric] !== '').map(() => 1)
          : finiteValues(rows.filter((row) => String(row[rowDimension] ?? '空值') === rowValue && String(row[columnDimension] ?? '空值') === columnValue), metric),
        aggregation,
      ),
    ])),
  }));
  const chart = {
    labels: rowValues,
    datasets: columnValues.map((columnValue, index) => ({ label: columnValue, data: result.map((row) => Number(row[columnValue]) || 0), borderColor: ['#007aff', '#ff9500', '#34c759'][index % 3], backgroundColor: ['rgba(0,122,255,0.28)', 'rgba(255,149,0,0.28)', 'rgba(52,199,89,0.28)'][index % 3] })),
  };
  const summary = { rowCount: rows.length, matrixRows: rowValues.length, matrixColumns: columnValues.length, aggregation, metric };
  const message = `已生成 ${rowDimension} × ${columnDimension} 的透视矩阵`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: result, result, chart, summary, message, sideEffects };
});

registerExecutor('data:correlation-matrix', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const fields = stringList(ctx.inputs.fields ?? ctx.properties.fields);
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || 8));
  const resultField = String(ctx.properties.resultField || '');
  const chartField = String(ctx.properties.chartField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const pairs: Record<string, unknown>[] = [];
  for (let left = 0; left < fields.length; left += 1) {
    for (let right = left + 1; right < fields.length; right += 1) {
      const aligned = alignedNumericPairs(rows, fields[left], fields[right]);
      pairs.push({
        '字段 A': fields[left],
        '字段 B': fields[right],
        相关系数: correlation(aligned.left, aligned.right),
        样本数: aligned.count,
        不可计算: aligned.count < 2,
      });
    }
  }
  const chartRows = pairs.slice(0, chartLimit);
  const chart = {
    labels: chartRows.map((row) => `${row['字段 A']} × ${row['字段 B']}`),
    datasets: [{ label: '相关系数', data: chartRows.map((row) => Number(row.相关系数) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.28)' }],
  };
  const summary = {
    fieldCount: fields.length,
    pairCount: pairs.length,
    insufficientPairs: pairs.filter((row) => row.不可计算).map((row) => `${row['字段 A']} × ${row['字段 B']}`),
  };
  const message = `已完成 ${fields.length} 个字段的相关性分析`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: pairs }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: pairs, result: pairs, chart, summary, message, sideEffects };
});

registerExecutor('data:anomaly-score', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const fields = stringList(ctx.inputs.fields ?? ctx.properties.fields);
  const contamination = Math.max(0, Math.min(0.5, Number(ctx.properties.contamination ?? 0.1) || 0.1));
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || rows.length || 8));
  const resultField = String(ctx.properties.resultField || '');
  const chartField = String(ctx.properties.chartField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const stats = Object.fromEntries(fields.map((field) => {
    const values = finiteValues(rows, field);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;
    return [field, { mean, std: Math.sqrt(variance) || 1 }];
  }));
  const scored = rows.map((row, index) => {
    const score = fields.reduce((total, field) => {
      const value = Number(row[field]);
      if (!Number.isFinite(value)) return total;
      const stat = stats[field] as { mean: number; std: number };
      return total + Math.abs((value - stat.mean) / stat.std);
    }, 0);
    return { 记录: index + 1, ...Object.fromEntries(fields.map((field) => [field, row[field]])), 异常得分: score, 判定: '正常', 复核状态: '待复核' };
  }).sort((left, right) => Number(right.异常得分) - Number(left.异常得分));
  const flaggedCount = Math.min(scored.length, Math.max(1, Math.round(scored.length * contamination)));
  const result = scored.map((row, index) => ({ ...row, 判定: index < flaggedCount ? '异常' : '正常' }));
  const chartRows = result.slice(0, chartLimit);
  const chart = {
    labels: chartRows.map((row) => String(row.记录)),
    datasets: [{ label: '异常得分', data: chartRows.map((row) => Number(row.异常得分) || 0), borderColor: '#ff3b30', backgroundColor: 'rgba(255,59,48,0.22)' }],
  };
  const summary = {
    rowCount: rows.length,
    fieldCount: fields.length,
    contamination,
    flaggedCount,
  };
  const message = `已完成 ${rows.length} 行数据的异常检测，标记 ${flaggedCount} 条疑似异常`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: result, result, chart, summary, message, sideEffects };
});

registerExecutor('data:qualified-join-group', (ctx) => {
  const leftRows = arrayValue<Record<string, unknown>>(ctx.inputs.left ?? ctx.inputs.rows);
  const rightRows = arrayValue<Record<string, unknown>>(ctx.inputs.right ?? ctx.inputs.reference);
  const leftKey = String(ctx.properties.leftKey || 'id');
  const rightKey = String(ctx.properties.rightKey || leftKey);
  const leftPrefix = String(ctx.properties.leftPrefix || 'left.');
  const rightPrefix = String(ctx.properties.rightPrefix || 'right.');
  const dimensions = stringList(ctx.properties.dimensions);
  const metrics = stringList(ctx.properties.metrics);
  const aggregation = String(ctx.properties.aggregation || 'sum');
  const joinType = String(ctx.properties.joinType || 'left');
  const chartLimit = Math.max(1, Number(ctx.properties.chartLimit || 8));
  const resultField = String(ctx.properties.resultField || '');
  const chartField = String(ctx.properties.chartField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const messageField = String(ctx.properties.messageField || '');
  const rightIndex = new Map<string, Record<string, unknown>[]>();
  for (const row of rightRows) {
    const key = String(row[rightKey] ?? '');
    rightIndex.set(key, [...(rightIndex.get(key) || []), row]);
  }
  const joinedRows = leftRows.flatMap((left) => {
    const matches = rightIndex.get(String(left[leftKey] ?? '')) || [];
    if (!matches.length) return joinType === 'inner' ? [] : [{ ...Object.fromEntries(Object.entries(left).map(([key, value]) => [`${leftPrefix}${key}`, value])) }];
    return matches.map((right) => ({
      ...Object.fromEntries(Object.entries(left).map(([key, value]) => [`${leftPrefix}${key}`, value])),
      ...Object.fromEntries(Object.entries(right).map(([key, value]) => [`${rightPrefix}${key}`, value])),
    }));
  });
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of joinedRows) {
    const key = groupedKey(row, dimensions);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const result = [...groups.entries()].flatMap(([group, members]) => metrics.map((metric) => ({
    分组: group,
    指标: metric,
    聚合值: aggregateNumbers(aggregation === 'count' ? members.filter((row) => row[metric] !== null && row[metric] !== undefined && row[metric] !== '').map(() => 1) : finiteValues(members, metric), aggregation),
    来源记录: members.length,
  })));
  const chartRows = result.filter((row) => row.指标 === metrics[0]).slice(0, chartLimit);
  const chart = {
    labels: chartRows.map((row) => String(row.分组)),
    datasets: [{ label: `${aggregation}(${metrics[0] || '指标'})`, data: chartRows.map((row) => Number(row.聚合值) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.28)' }],
  };
  const summary = { joinedRowCount: joinedRows.length, groupCount: groups.size, metricCount: metrics.length, aggregation };
  const message = `已完成跨表 Join 与汇总，得到 ${groups.size} 个分组`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: 'success' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: result, result, joinedRows, chart, summary, message, sideEffects };
});

registerExecutor('ml:regression-evaluate', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const target = String(ctx.inputs.target ?? ctx.properties.target ?? '');
  const features = stringList(ctx.inputs.features ?? ctx.properties.features);
  const validationRatio = Math.max(0.1, Math.min(0.5, Number(ctx.properties.validationRatio ?? 0.2) || 0.2));
  const resultField = String(ctx.properties.resultField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const chartField = String(ctx.properties.chartField || '');
  const messageField = String(ctx.properties.messageField || '');
  const usableThreshold = Number(ctx.properties.usableThreshold ?? 0.95);
  const usableRows = rows.filter((row) => Number.isFinite(Number(row[target])) && features.every((feature) => Number.isFinite(Number(row[feature]))));
  const { train, validation } = trainTestSplit(usableRows, validationRatio);
  const targetTrain = train.map((row) => Number(row[target]));
  const targetMean = mean(targetTrain);
  const featureMeans = Object.fromEntries(features.map((feature) => [feature, mean(train.map((row) => Number(row[feature])))]));
  const featureVars = Object.fromEntries(features.map((feature) => [feature, variance(train.map((row) => Number(row[feature]))) || 1]));
  const targetVar = variance(targetTrain) || 1;
  const weights = Object.fromEntries(features.map((feature) => {
    const featureValues = train.map((row) => Number(row[feature]));
    const cov = featureValues.reduce((sum, value, index) => sum + (value - Number(featureMeans[feature])) * (targetTrain[index] - targetMean), 0) / Math.max(1, featureValues.length);
    return [feature, cov / (Number(featureVars[feature]) || 1)];
  }));
  const predict = (row: Record<string, unknown>) => targetMean + features.reduce((sum, feature) => sum + Number(weights[feature] || 0) * (Number(row[feature]) - Number(featureMeans[feature] || 0)), 0);
  const validationActual = validation.map((row) => Number(row[target]));
  const validationPredicted = validation.map((row) => predict(row));
  const baselinePredicted = validation.map(() => targetMean);
  const modelMae = mae(validationActual, validationPredicted);
  const baselineMae = mae(validationActual, baselinePredicted);
  const usable = modelMae <= baselineMae * usableThreshold;
  const result = [
    { 指标: 'MAE', 模型值: modelMae, 基线值: baselineMae, 结论: usable ? '优于基线' : '未优于基线' },
    { 指标: '训练样本', 模型值: train.length, 基线值: validation.length, 结论: `特征 ${features.join('、')}` },
  ];
  const chart = {
    labels: validation.map((_row, index) => String(index + 1)),
    datasets: [
      { label: '实际值', data: validationActual, borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.18)' },
      { label: '模型预测', data: validationPredicted, borderColor: '#34c759', backgroundColor: 'rgba(52,199,89,0.18)' },
      { label: '基线预测', data: baselinePredicted, borderColor: '#ff9500', backgroundColor: 'rgba(255,149,0,0.18)' },
    ],
  };
  const summary = { target, features, validationRatio, modelMae, baselineMae, usable, trainSize: train.length, validationSize: validation.length };
  const message = usable ? `回归模型已通过基线门禁（MAE ${modelMae.toFixed(3)}）` : `回归模型未优于基线（MAE ${modelMae.toFixed(3)}）`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: usable ? 'success' : 'warning' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: result, result, summary, chart, usable, predictions: validationPredicted, sideEffects };
});

registerExecutor('ml:classification-evaluate', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const target = String(ctx.inputs.target ?? ctx.properties.target ?? '');
  const features = stringList(ctx.inputs.features ?? ctx.properties.features);
  const validationRatio = Math.max(0.1, Math.min(0.5, Number(ctx.properties.validationRatio ?? 0.2) || 0.2));
  const resultField = String(ctx.properties.resultField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const chartField = String(ctx.properties.chartField || '');
  const messageField = String(ctx.properties.messageField || '');
  const usableRows = rows.filter((row) => row[target] !== null && row[target] !== undefined && row[target] !== '');
  const { train, validation } = trainTestSplit(usableRows, validationRatio);
  const classes = uniqueValues(train.map((row) => row[target]));
  const counts = new Map<string, number>();
  for (const row of train) counts.set(String(row[target]), (counts.get(String(row[target])) || 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const centroids = Object.fromEntries(classes.map((clazz) => [
    clazz,
    Object.fromEntries(features.map((feature) => {
      const classRows = train.filter((row) => String(row[target]) === clazz && Number.isFinite(Number(row[feature])));
      return [feature, mean(classRows.map((row) => Number(row[feature])))];
    })),
  ]));
  const predict = (row: Record<string, unknown>) => {
    if (!features.length) return majority;
    return classes
      .map((clazz) => ({
        clazz,
        distance: features.reduce((sum, feature) => {
          const value = Number(row[feature]);
          const center = Number((centroids[clazz] as Record<string, number>)[feature] || 0);
          return sum + (Number.isFinite(value) ? (value - center) ** 2 : 0);
        }, 0),
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.clazz || majority;
  };
  const validationActual = validation.map((row) => String(row[target]));
  const predicted = validation.map((row) => predict(row));
  const baselinePredicted = validation.map(() => majority);
  const metrics = classes.map((clazz) => {
    const tp = validationActual.filter((actual, index) => actual === clazz && predicted[index] === clazz).length;
    const fp = validationActual.filter((actual, index) => actual !== clazz && predicted[index] === clazz).length;
    const fn = validationActual.filter((actual, index) => actual === clazz && predicted[index] !== clazz).length;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { 类别: clazz, 精确率: precision, 召回率: recall, F1: f1, 样本数: validationActual.filter((actual) => actual === clazz).length };
  });
  const baselineCorrect = baselinePredicted.filter((value, index) => value === validationActual[index]).length;
  const modelCorrect = predicted.filter((value, index) => value === validationActual[index]).length;
  const baselineAccuracy = validationActual.length ? baselineCorrect / validationActual.length : 0;
  const accuracy = validationActual.length ? modelCorrect / validationActual.length : 0;
  const usable = accuracy >= baselineAccuracy;
  const chart = {
    labels: metrics.map((item) => item.类别),
    datasets: [
      { label: '精确率', data: metrics.map((item) => item.精确率), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.28)' },
      { label: '召回率', data: metrics.map((item) => item.召回率), borderColor: '#34c759', backgroundColor: 'rgba(52,199,89,0.28)' },
    ],
  };
  const summary = { target, features, validationRatio, accuracy, baselineAccuracy, usable, majorityClass: majority, classCount: classes.length };
  const message = usable ? `分类模型已达到基线（准确率 ${accuracy.toFixed(3)}）` : `分类模型未达到基线（准确率 ${accuracy.toFixed(3)}）`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: metrics }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: usable ? 'success' : 'warning' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: metrics, result: metrics, summary, chart, usable, predictions: predicted, sideEffects };
});

registerExecutor('ml:time-series-backtest', (ctx) => {
  const rows = arrayValue<Record<string, unknown>>(ctx.inputs.rows ?? ctx.inputs.data);
  const timeField = String(ctx.inputs.timeField ?? ctx.properties.timeField ?? '');
  const target = String(ctx.inputs.target ?? ctx.properties.target ?? '');
  const horizon = Math.max(1, Number(ctx.properties.horizon || 6));
  const resultField = String(ctx.properties.resultField || '');
  const summaryField = String(ctx.properties.summaryField || '');
  const chartField = String(ctx.properties.chartField || '');
  const messageField = String(ctx.properties.messageField || '');
  const ordered = rows
    .filter((row) => row[timeField] !== undefined && row[timeField] !== null && row[target] !== undefined && row[target] !== null && row[target] !== '')
    .sort((left, right) => String(left[timeField]).localeCompare(String(right[timeField])));
  const values = ordered.map((row) => Number(row[target])).filter(Number.isFinite);
  const backtestStart = Math.max(1, ordered.length - horizon);
  const trainValues = values.slice(0, backtestStart);
  const validationValues = values.slice(backtestStart);
  const baselinePredictions = validationValues.map((_value, index) => Number(values[Math.max(0, backtestStart + index - 1)] ?? trainValues[trainValues.length - 1] ?? 0));
  const modelPredictions = validationValues.map((_value, index) => mean(values.slice(Math.max(0, backtestStart + index - 3), backtestStart + index)) || baselinePredictions[index] || 0);
  const modelMae = mae(validationValues, modelPredictions);
  const baselineMae = mae(validationValues, baselinePredictions);
  const usable = modelMae <= baselineMae;
  const futureBase = modelPredictions[modelPredictions.length - 1] ?? values[values.length - 1] ?? 0;
  const forecastRows = Array.from({ length: horizon }, (_unused, index) => {
    const point = futureBase;
    return {
      时间: `预测+${index + 1}`,
      实际值: null,
      预测值: point,
      预测区间: [point - Math.max(modelMae, 1), point + Math.max(modelMae, 1)],
    };
  });
  const result = [
    ...ordered.slice(backtestStart).map((row, index) => ({
      时间: row[timeField],
      实际值: Number(row[target]),
      预测值: modelPredictions[index] ?? null,
      预测区间: [Number((modelPredictions[index] ?? 0) - Math.max(modelMae, 1)), Number((modelPredictions[index] ?? 0) + Math.max(modelMae, 1))],
    })),
    ...forecastRows,
  ];
  const chart = {
    labels: result.map((row) => String(row.时间)),
    datasets: [
      { label: '实际值', data: result.map((row) => row.实际值), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.18)' },
      { label: '预测值', data: result.map((row) => row.预测值), borderColor: '#34c759', backgroundColor: 'rgba(52,199,89,0.18)' },
    ],
  };
  const summary = { timeField, target, horizon, modelMae, baselineMae, usable, trainSize: trainValues.length, backtestSize: validationValues.length };
  const message = usable ? `时间序列模型已通过基线门禁（MAE ${modelMae.toFixed(3)}）` : `时间序列模型未优于基线（MAE ${modelMae.toFixed(3)}）`;
  const sideEffects = [
    resultField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: result }) : null,
    summaryField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: summaryField, value: summary }) : null,
    chartField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: chartField, value: chart }) : null,
    messageField ? normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message }) : null,
    normalizeFlowSideEffect({ kind: 'show-message', message, level: usable ? 'success' : 'warning' }),
  ].filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
  return { rows: result, result, summary, chart, usable, sideEffects };
});
