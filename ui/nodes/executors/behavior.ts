import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';
import type { FlowSideEffect } from '../../src/services/engine/flowSideEffects';
import { normalizeFlowSideEffect } from '../../src/services/engine/flowSideEffects';
import { parseCustomJsPortDefinitions } from '../../src/services/config/customJsNode';
import { resolveSingleKeyField } from '../../src/services/data/tableKeys';
import {
  buildFillFormPatch,
  buildResetFormPatch,
  findRowInTables,
  findRowsInTables,
  nextSequenceInTables,
  validateRequiredFields,
} from '../../src/services/engine/crudHelpers';

registerExecutor('behavior-schedule-trigger', async ({ properties }) => {
  const response = await fetch('/api/tasks/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: properties.name, cron: properties.cron, timezone: properties.timezone, enabled: properties.enabled !== false, payload: {} }) });
  const schedule = await response.json();
  if (!response.ok) throw new Error(schedule.error || '创建定时任务失败');
  return { trigger: schedule, scheduledAt: new Date().toISOString() };
});
registerExecutor('behavior-notify', async ({ inputs, properties }) => {
  const status = String(inputs.status || 'completed'); const events = String(properties.events || 'always'); if (events !== 'always' && events !== status) return { sent: { skipped: true } };
  const interpolate = (value: unknown) => String(value || '').replace(/\{\{status\}\}/g, status); const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channels: String(properties.channels || 'inApp').split(',').map((value) => value.trim()), title: interpolate(properties.title), message: interpolate(properties.message), email: properties.email, webhookUrl: properties.webhookUrl, data: inputs.data }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || '通知发送失败'); return { sent: result };
});

registerExecutor('behavior-on-form-load', (ctx) => {
  const { inputs, properties } = ctx;
  return {
    trigger: 'formLoad',
    executed: true,
    timestamp: Date.now(),
    sheetName: inputs.sheetName || properties.sheetName || '',
    rowIndex: inputs.rowIndex ?? 0,
    formData: inputs.formData || inputs.data || {},
    fields: inputs.fields || [],
  };
});

registerExecutor('behavior-on-field-change', (ctx) => {
  const { inputs, properties } = ctx;
  const fieldName = ctx.assertType('string', properties.fieldName || inputs.fieldName || '', 'fieldName') as string;
  return {
    trigger: 'fieldChange',
    fieldName,
    value: inputs.value ?? properties.value ?? '',
    oldValue: inputs.oldValue ?? '',
    rowIndex: inputs.rowIndex ?? 0,
    sheetName: inputs.sheetName || '',
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-on-submit', (ctx) => {
  const { inputs } = ctx;
  return {
    trigger: 'submit',
    executed: true,
    formData: inputs.formData || inputs.data || {},
    rowIndex: inputs.rowIndex ?? 0,
    sheetName: inputs.sheetName || '',
    changedFields: inputs.changedFields || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-on-validate', (ctx) => {
  const { inputs } = ctx;
  return {
    trigger: 'validate',
    executed: true,
    formData: inputs.formData || inputs.data || {},
    errors: inputs.errors || {},
    rowIndex: inputs.rowIndex ?? 0,
    sheetName: inputs.sheetName || '',
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-on-button-click', (ctx) => {
  const { inputs, properties } = ctx;
  const buttonName = ctx.assertType('string', properties.buttonName || inputs.buttonName || '', 'buttonName') as string;
  return {
    trigger: 'buttonClick',
    buttonName,
    formData: inputs.formData || {},
    rowIndex: inputs.rowIndex ?? 0,
    sheetName: inputs.sheetName || '',
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-on-row-load', (ctx) => {
  const { inputs } = ctx;
  const rowIndex = ctx.assertType('number', inputs.rowIndex ?? 0, 'rowIndex') as number;
  return {
    trigger: 'rowLoad',
    rowIndex,
    rowData: inputs.rowData || inputs.data || {},
    sheetName: inputs.sheetName || '',
    totalRows: inputs.totalRows ?? 0,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-condition', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const fieldName = ctx.assertType('string', properties.fieldName || '', 'fieldName') as string;
  const operator = ctx.assertType('string', properties.operator || '==', 'operator') as string;
  const compareValue = properties.value;
  const fieldValue = inputs[fieldName] ?? inputs.data ?? inputs.value;

  let result = false;
  switch (operator) {
    case '==': result = fieldValue == compareValue; break;
    case '!=': result = fieldValue != compareValue; break;
    case '>': result = checkType('number', fieldValue).valid && checkType('number', compareValue).valid && Number(fieldValue) > Number(compareValue); break;
    case '<': result = checkType('number', fieldValue).valid && checkType('number', compareValue).valid && Number(fieldValue) < Number(compareValue); break;
    case '>=': result = checkType('number', fieldValue).valid && checkType('number', compareValue).valid && Number(fieldValue) >= Number(compareValue); break;
    case '<=': result = checkType('number', fieldValue).valid && checkType('number', compareValue).valid && Number(fieldValue) <= Number(compareValue); break;
    case 'contains': result = checkType('string', fieldValue).valid && String(fieldValue).includes(String(compareValue)); break;
    case 'isEmpty': result = fieldValue === null || fieldValue === undefined || fieldValue === ''; break;
    case 'isNotEmpty': result = fieldValue !== null && fieldValue !== undefined && fieldValue !== ''; break;
  }

  return {
    result,
    passed: result,
    true: result ? fieldValue : undefined,
    false: !result ? fieldValue : undefined,
    fieldName,
    operator,
    compareValue,
    fieldValue,
    trigger: inputs.trigger,
  };
});

registerExecutor('behavior-set-default', (ctx) => {
  const fieldName = String(ctx.inputs.fieldName ?? ctx.properties.fieldName ?? '');
  const value = ctx.inputs.defaultValue ?? ctx.properties.defaultValue ?? '';
  return {
    trigger: { event: 'setDefault', fieldName, value, timestamp: Date.now(), source: ctx.inputs.trigger },
    fieldName,
    value,
    sideEffects: fieldName ? [{ kind: 'set-form-value', field: fieldName, value }] : [],
  };
});

registerExecutor('behavior-set-value', (ctx) => {
  const { properties, inputs, checkType } = ctx;
  const fieldName = ctx.assertType('string', inputs.fieldName || properties.fieldName || '', 'fieldName') as string;
  const valueType = ctx.assertType('string', properties.valueType || 'static', 'valueType') as string;

  let value: unknown;
  if (valueType === 'fromInput') {
    value = inputs.value;
  } else if (valueType === 'expression') {
    try {
      const fn = new Function('inputs', 'properties', `return ${properties.expression}`);
      value = fn(inputs, properties);
    } catch { value = properties.staticValue; }
  } else {
    value = properties.staticValue ?? '';
  }

  return {
    trigger: inputs.trigger,
    fieldName,
    value,
    sideEffects: fieldName ? [{ kind: 'set-form-value', field: fieldName, value }] : [],
  };
});

function parsePatchConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resolveSetValuesToken(token: unknown, sources: {
  record: Record<string, unknown> | null;
  records: unknown[];
  count: unknown;
  message: unknown;
}): unknown {
  if (Array.isArray(token)) {
    for (const item of token) {
      const resolved = resolveSetValuesToken(item, sources);
      if (resolved !== undefined && resolved !== null && resolved !== '') return resolved;
    }
    return '';
  }
  if (typeof token !== 'string') return token;
  if (token === '$records') return sources.records;
  if (token === '$count') return sources.count;
  if (token === '$message') return sources.message;
  if (token.startsWith('$record.')) return sources.record?.[token.slice('$record.'.length)];
  return token;
}

function interpolateTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const trimmed = String(key || '').trim();
    const value = values[trimmed];
    return value == null ? '' : String(value);
  });
}

registerExecutor('behavior-set-values', (ctx) => {
  const record = (ctx.inputs.record && typeof ctx.inputs.record === 'object' && !Array.isArray(ctx.inputs.record))
    ? ctx.inputs.record as Record<string, unknown>
    : null;
  const records = Array.isArray(ctx.inputs.records) ? ctx.inputs.records : [];
  const count = ctx.inputs.count ?? records.length;
  const message = ctx.inputs.message ?? '';
  const fieldMap = parsePatchConfig(ctx.inputs.fieldMap ?? ctx.properties.fieldMap);
  const staticPatch = parsePatchConfig(ctx.inputs.staticPatch ?? ctx.properties.staticPatch);
  const emptyPatch = parsePatchConfig(ctx.inputs.emptyPatch ?? ctx.properties.emptyPatch);
  const shouldUseEmptyPatch = !record && records.length === 0;
  const patch: Record<string, unknown> = { ...staticPatch };

  if (shouldUseEmptyPatch) {
    for (const [field, source] of Object.entries(emptyPatch)) {
      patch[field] = resolveSetValuesToken(source, { record, records, count, message });
    }
  } else {
    for (const [field, source] of Object.entries(fieldMap)) {
      patch[field] = resolveSetValuesToken(source, { record, records, count, message });
    }
  }

  const sideEffects = Object.entries(patch).map(([field, value]) => ({
    kind: 'set-form-value' as const,
    field,
    value,
  }));
  return {
    trigger: ctx.inputs.trigger,
    appliedFields: Object.keys(patch),
    patch,
    sideEffects,
  };
});

registerExecutor('behavior-compose-message', (ctx) => {
  const template = String(ctx.inputs.template ?? ctx.properties.template ?? '');
  const values = parsePatchConfig(ctx.inputs.values ?? ctx.properties.values);
  const record = (ctx.inputs.record && typeof ctx.inputs.record === 'object' && !Array.isArray(ctx.inputs.record))
    ? ctx.inputs.record as Record<string, unknown>
    : {};
  const mergedValues = { ...record, ...values } as Record<string, unknown>;
  const message = interpolateTemplate(template, mergedValues);
  const messageField = String(ctx.properties.messageField || '');
  const messageType = String(ctx.properties.messageType || 'info');
  const sideEffects: FlowSideEffect[] = [];
  if (messageField) sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message })!);
  if (message) sideEffects.push(normalizeFlowSideEffect({ kind: 'show-message', message, level: messageType })!);
  return { message, sideEffects };
});

registerExecutor('behavior-upsert-table-row', (ctx) => {
  const tableId = String(ctx.inputs.tableId ?? ctx.properties.tableId ?? '');
  const sheetName = String(ctx.inputs.sheetName ?? ctx.properties.sheetName ?? '');
  const row = (ctx.inputs.row && typeof ctx.inputs.row === 'object' && !Array.isArray(ctx.inputs.row))
    ? ctx.inputs.row as Record<string, unknown>
    : {};
  const keyField = String(ctx.inputs.keyField ?? ctx.properties.keyField ?? '')
    || resolveSingleKeyField(ctx.tables, tableId, sheetName)
    || '';
  const keyValueExpr = String(ctx.inputs.keyValueExpr ?? ctx.properties.keyValueExpr ?? '');
  const keyValue = keyValueExpr && keyValueExpr.startsWith('$row.')
    ? row[keyValueExpr.slice('$row.'.length)]
    : (ctx.inputs.keyValue ?? ctx.properties.keyValue ?? row[keyField]);
  if (!tableId || !sheetName || !keyField || keyValue == null || keyValue === '') {
    throw new Error('表写回配置不完整');
  }
  const writeBack = normalizeFlowSideEffect({
    kind: 'upsert-table-row',
    tableId,
    sheetName,
    keyField,
    keyValue,
    row,
  });
  const sideEffects = writeBack ? [writeBack] : [];
  return { row, keyField, keyValue, writeBack, sideEffects };
});

registerExecutor('behavior-set-visible', (ctx) => {
  const componentId = ctx.assertType('string', ctx.properties.componentId || ctx.inputs.componentId || '', 'componentId') as string;
  const visible = ctx.assertType('boolean', ctx.properties.visible !== false, 'visible') as boolean;
  return {
    trigger: ctx.inputs.trigger,
    componentId,
    visible,
    sideEffects: componentId ? [{ kind: 'set-component-visible', componentId, visible }] : [],
  };
});

registerExecutor('behavior-set-disabled', (ctx) => {
  const componentId = ctx.assertType('string', ctx.properties.componentId || ctx.inputs.componentId || '', 'componentId') as string;
  const disabled = ctx.assertType('boolean', ctx.properties.disabled !== false, 'disabled') as boolean;
  return {
    trigger: ctx.inputs.trigger,
    componentId,
    disabled,
    sideEffects: componentId ? [{ kind: 'set-component-disabled', componentId, disabled }] : [],
  };
});

registerExecutor('behavior-set-required', (ctx) => {
  const fieldName = ctx.assertType('string', ctx.properties.fieldName || ctx.inputs.fieldName || '', 'fieldName') as string;
  const required = ctx.assertType('boolean', ctx.properties.required !== false, 'required') as boolean;
  return {
    trigger: ctx.inputs.trigger,
    fieldName,
    required,
    sideEffects: fieldName ? [{ kind: 'set-field-required', field: fieldName, required }] : [],
  };
});

registerExecutor('behavior-calculate', (ctx) => {
  const { properties, inputs, checkType } = ctx;
  const expression = ctx.assertType('string', properties.expression || '', 'expression') as string;
  const targetField = ctx.assertType('string', properties.targetField || '', 'targetField') as string;

  let result: unknown;
  try {
    const fn = new Function('inputs', 'properties', `return ${expression}`);
    result = fn(inputs, properties);
  } catch { result = null; }

  return {
    trigger: inputs.trigger,
    targetField,
    result,
    value: result,
    sideEffects: targetField ? [{ kind: 'set-form-value', field: targetField, value: result }] : [],
  };
});

registerExecutor('behavior-show-message', (ctx) => {
  const message = ctx.assertType('string', ctx.properties.message || ctx.inputs.message || '', 'message') as string;
  const messageType = ctx.assertType('string', ctx.properties.messageType || 'info', 'messageType') as string;
  return {
    trigger: ctx.inputs.trigger,
    message,
    messageType,
    sideEffects: message ? [{ kind: 'show-message', message, level: messageType }] : [],
  };
});

registerExecutor('behavior-validate', (ctx) => {
  const fieldName = ctx.assertType('string', ctx.properties.fieldName || ctx.inputs.fieldName || '', 'fieldName') as string;
  const rule = ctx.assertType('string', ctx.properties.rule || 'required', 'rule') as string;
  return { trigger: ctx.inputs.trigger, fieldName, rule, valid: true };
});

registerExecutor('behavior:submit', async (ctx) => {
  const formData = (ctx.inputs.formData || {}) as Record<string, unknown>;
  const originalData = (ctx.inputs.originalData || {}) as Record<string, unknown>;
  const changeLog = Object.fromEntries(Object.entries(formData)
    .filter(([key, value]) => originalData[key] !== value)
    .map(([key, value]) => [key, { oldValue: originalData[key], newValue: value }]));
  const target = String(ctx.properties.target || 'changeLog');
  let fileData: unknown;
  if (target === 'json') fileData = JSON.stringify(formData, null, 2);
  if (target === 'csv') {
    const headers = Object.keys(formData);
    const escape = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    fileData = `${headers.map(escape).join(',')}\n${headers.map((header) => escape(formData[header])).join(',')}`;
  }
  if (target === 'newExcel') {
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet([formData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FormData');
    fileData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  }
  let writeBack: Record<string, unknown> | undefined;
  if (ctx.properties.writeBackMode === 'upsert') {
    const rawMap = ctx.properties.writeBackFieldMap;
    const fieldMap = typeof rawMap === 'string' ? JSON.parse(rawMap || '{}') : (rawMap || {});
    const row = Object.fromEntries(Object.entries(fieldMap as Record<string, string>)
      .filter(([, column]) => !!column)
      .map(([formField, column]) => [column, formData[formField]]));
    const keyField = String(ctx.properties.writeBackKeyField || '')
      || resolveSingleKeyField(
        ctx.tables,
        String(ctx.properties.writeBackTableId || ''),
        String(ctx.properties.writeBackSheetName || ''),
      )
      || '';
    const keyFormField = String(ctx.properties.writeBackKeyFormField || '');
    const keyValue = row[keyField] ?? formData[keyFormField];
    if (!ctx.properties.writeBackTableId || !ctx.properties.writeBackSheetName || !keyField || keyValue == null) {
      throw new Error('元数据写回配置不完整');
    }
    writeBack = {
      kind: 'upsert-table-row',
      tableId: String(ctx.properties.writeBackTableId),
      sheetName: String(ctx.properties.writeBackSheetName),
      keyField,
      keyValue,
      row,
    };
  }
  const sideEffects = writeBack ? [normalizeFlowSideEffect(writeBack)].filter(Boolean) as FlowSideEffect[] : [];
  return {
    success: { event: 'submitSuccess', trigger: ctx.inputs.trigger, timestamp: Date.now() },
    error: undefined,
    changeLog,
    fileData,
    writeBack,
    sideEffects,
  };
});

registerExecutor('behavior-api-request', (ctx) => {
  const url = ctx.assertType('string', ctx.properties.url || '', 'url') as string;
  const method = ctx.assertType('string', ctx.properties.method || 'GET', 'method') as string;
  return { trigger: ctx.inputs.trigger, url, method, pending: true };
});

registerExecutor('behavior-js-script', (ctx) => {
  const code = ctx.assertType('string', ctx.properties.script || ctx.properties.code || ctx.properties.scriptCode || '', 'script') as string;
  const inputDefs = parseCustomJsPortDefinitions(ctx.properties.inputPorts);
  const outputDefs = parseCustomJsPortDefinitions(ctx.properties.outputPorts);
  const scopedInputs = inputDefs.length > 0
    ? Object.fromEntries(inputDefs.map((entry) => [entry.name, ctx.inputs[entry.name]]))
    : ctx.inputs;
  try {
    const fn = new Function('inputs', 'properties', 'ctx', code);
    const result = fn(scopedInputs, ctx.properties, { inputs: scopedInputs, properties: ctx.properties });
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as NodeExecResult;
    }
    if (outputDefs.length > 0) {
      return { [outputDefs[0].name]: result };
    }
    return { result };
  } catch (e) {
    return { trigger: ctx.inputs.trigger, error: e instanceof Error ? e.message : String(e) };
  }
});

registerExecutor('behavior-loop', (ctx) => {
  const items = ctx.inputs.items || ctx.inputs.data;
  const count = ctx.assertType('number', Array.isArray(items) ? items.length : Number(ctx.properties.count || 0), 'count') as number;
  return { trigger: ctx.inputs.trigger, items, count, index: 0 };
});

registerExecutor('behavior-data-query', (ctx) => {
  const { properties, inputs, tables, checkType } = ctx;
  const sheetName = ctx.assertType('string', properties.sheetName || inputs.sheetName || '', 'sheetName') as string;
  const tableId = String(properties.tableId || inputs.tableId || '');
  const filter = inputs.filter as Record<string, unknown> || {};

  const sourceTables = tableId
    ? tables.filter((table) => table.id === tableId)
    : tables;

  for (const table of sourceTables) {
    const sheet = sheetName
      ? table.sheets.find((item) => item.name === sheetName)
      : table.sheets[0];
    if (!sheet) continue;
    let rows = sheet.preview;
    if (Object.keys(filter).length > 0) {
      rows = rows.filter(row => Object.entries(filter).every(([k, v]) => row[k] === v));
    }
    const rowsCheck = checkType('json-rows', rows);
    const normalizedRows = rowsCheck.valid ? rowsCheck.normalized : rows;
    return {
      data: normalizedRows,
      result: normalizedRows,
      rows: normalizedRows,
      count: rows.length,
      headers: sheet.headers,
      tableId: table.id,
      sheetName: sheet.name,
    };
  }
  return { data: [], result: [], rows: [], count: 0, headers: [], tableId, sheetName };
});

registerExecutor('behavior-row-lookup', (ctx) => {
  const tableId = String(ctx.properties.tableId || '');
  const sheetName = String(ctx.properties.sheetName || '');
  const filter = (ctx.inputs.filter && typeof ctx.inputs.filter === 'object' ? ctx.inputs.filter : {}) as Record<string, unknown>;
  const fieldMap = typeof ctx.properties.fieldMap === 'string' ? JSON.parse(ctx.properties.fieldMap || '{}') : (ctx.properties.fieldMap || {});
  const originalFieldMap = typeof ctx.properties.originalFieldMap === 'string' ? JSON.parse(ctx.properties.originalFieldMap || '{}') : (ctx.properties.originalFieldMap || {});
  const loadedFieldName = String(ctx.properties.loadedFieldName || 'loadedRowId');
  const loadedColumn = String(ctx.properties.loadedColumn || '');
  const enableComponentId = String(ctx.properties.enableComponentId || '');
  const successMessage = String(ctx.properties.successMessage || '已加载记录');
  const notFoundMessage = String(ctx.properties.notFoundMessage || '未找到匹配记录');
  const multipleMessage = String(ctx.properties.multipleMessage || '匹配到多条记录，请收窄条件');

  const table = ctx.tables.find((item) => item.id === tableId);
  const sheet = table?.sheets.find((item) => item.name === sheetName);
  if (!table || !sheet) {
    throw new Error(`查找目标不存在: ${tableId || '(table)'} / ${sheetName || '(sheet)'}`);
  }

  const rows = sheet.preview.filter((row) => Object.entries(filter).every(([key, value]) => row[key] === value));
  const matched = rows.length === 1;
  const row = matched ? rows[0] : undefined;
  const message = rows.length === 0 ? notFoundMessage : rows.length > 1 ? multipleMessage : successMessage;
  const sideEffects: FlowSideEffect[] = [];

  if (matched && row) {
    for (const [column, field] of Object.entries(fieldMap as Record<string, string>)) {
      if (!field) continue;
      sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field, value: row[column] })!);
    }
    for (const [column, field] of Object.entries(originalFieldMap as Record<string, string>)) {
      if (!field) continue;
      sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field, value: row[column] })!);
    }
    if (loadedFieldName) {
      const keyValue = loadedColumn ? row[loadedColumn] : '';
      sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field: loadedFieldName, value: keyValue ?? '' })!);
    }
    if (enableComponentId) {
      sideEffects.push(normalizeFlowSideEffect({ kind: 'set-component-disabled', componentId: enableComponentId, disabled: false })!);
    }
  } else {
    if (loadedFieldName) {
      sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field: loadedFieldName, value: '' })!);
    }
    if (enableComponentId) {
      sideEffects.push(normalizeFlowSideEffect({ kind: 'set-component-disabled', componentId: enableComponentId, disabled: true })!);
    }
  }

  if (message) {
    sideEffects.push(normalizeFlowSideEffect({
      kind: 'show-message',
      message,
      level: matched ? 'success' : 'warning',
    })!);
  }

  return { matched, row, message, sideEffects };
});

registerExecutor('behavior-query-list', (ctx) => {
  const tableId = String(ctx.properties.tableId || '');
  const sheetName = String(ctx.properties.sheetName || '');
  const resultField = String(ctx.properties.resultField || '');
  const messageField = String(ctx.properties.messageField || '');
  const emptyMessage = String(ctx.properties.emptyMessage || '未找到匹配记录');
  const successMessage = String(ctx.properties.successMessage || '已加载记录');
  const criteria = (ctx.inputs.criteria && typeof ctx.inputs.criteria === 'object' && !Array.isArray(ctx.inputs.criteria))
    ? ctx.inputs.criteria as Record<string, unknown>
    : {};
  const rows = findRowsInTables(ctx.tables, `${tableId}:${sheetName}`, criteria, {}, { tableId, sheetName });
  const count = rows.length;
  const message = count === 0 ? emptyMessage : successMessage.replace('{count}', String(count));
  const sideEffects: FlowSideEffect[] = [];
  if (resultField) sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field: resultField, value: rows })!);
  if (messageField) sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: message })!);
  if (message) sideEffects.push(normalizeFlowSideEffect({ kind: 'show-message', message, level: count === 0 ? 'warning' : 'success' })!);
  return { rows, count, message, sideEffects };
});

registerExecutor('behavior-next-sequence', (ctx) => {
  const tableId = String(ctx.properties.tableId || '');
  const sheetName = String(ctx.properties.sheetName || '');
  const column = String(ctx.properties.column || '');
  const targetField = String(ctx.properties.targetField || '');
  const start = Number(ctx.properties.start ?? 1);
  const step = Number(ctx.properties.step ?? 1);
  const value = nextSequenceInTables(ctx.tables, `${tableId}:${sheetName}`, column, { start, step }, { tableId, sheetName });
  const sideEffects = targetField
    ? [normalizeFlowSideEffect({ kind: 'set-form-value', field: targetField, value })!]
    : [];
  return { value, sideEffects };
});

registerExecutor('behavior-fill-form', (ctx) => {
  const record = (ctx.inputs.record && typeof ctx.inputs.record === 'object' && !Array.isArray(ctx.inputs.record))
    ? ctx.inputs.record as Record<string, unknown>
    : null;
  const fieldMap = parsePatchConfig(ctx.inputs.fieldMap ?? ctx.properties.fieldMap);
  const originalFieldMap = parsePatchConfig(ctx.inputs.originalFieldMap ?? ctx.properties.originalFieldMap);
  const rawEnableComponentIds = ctx.inputs.enableComponentIds ?? ctx.properties.enableComponentIds;
  const enableComponentIds = Array.isArray(rawEnableComponentIds)
    ? rawEnableComponentIds as string[]
    : String(rawEnableComponentIds || '').split(',').map((item) => item.trim()).filter(Boolean);
  const messageField = String(ctx.properties.messageField || '');
  const result = buildFillFormPatch(record, fieldMap as Record<string, string>, {
    originalFieldMap: originalFieldMap as Record<string, string>,
    enableComponentIds,
  });
  const sideEffects: FlowSideEffect[] = [];
  for (const [field, value] of Object.entries(result.patch)) {
    sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field, value })!);
  }
  for (const [field, value] of Object.entries(result.originalPatch)) {
    sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field, value })!);
  }
  for (const componentId of result.enableComponentIds) {
    sideEffects.push(normalizeFlowSideEffect({ kind: 'set-component-disabled', componentId, disabled: false })!);
  }
  if (messageField) {
    sideEffects.push(normalizeFlowSideEffect({ kind: 'set-form-value', field: messageField, value: record ? '已回填记录' : '未找到记录' })!);
  }
  return { matched: !!record, appliedFields: result.appliedFields, patch: { ...result.patch, ...result.originalPatch }, sideEffects };
});

registerExecutor('behavior-require-fields', (ctx) => {
  const rawFields = ctx.inputs.fields ?? ctx.properties.fields;
  const fields = Array.isArray(rawFields)
    ? rawFields as string[]
    : String(rawFields || '').split(',').map((item) => item.trim()).filter(Boolean);
  const values = (ctx.inputs.formData && typeof ctx.inputs.formData === 'object' && !Array.isArray(ctx.inputs.formData))
    ? ctx.inputs.formData as Record<string, unknown>
    : ((ctx.inputs.values && typeof ctx.inputs.values === 'object' && !Array.isArray(ctx.inputs.values))
      ? ctx.inputs.values as Record<string, unknown>
      : {});
  const messageTemplate = String(ctx.properties.messageTemplate || '请填写以下字段：{fields}');
  const result = validateRequiredFields(values, fields, { messageTemplate });
  const sideEffects = !result.valid && result.message
    ? [normalizeFlowSideEffect({ kind: 'show-message', message: result.message, level: 'error' })!]
    : [];
  return { valid: result.valid, missingFields: result.missingFields, firstMissingField: result.firstMissingField, sideEffects };
});

registerExecutor('behavior-reset-form', (ctx) => {
  const rawClearFields = ctx.inputs.clearFields ?? ctx.properties.clearFields;
  const clearFields = Array.isArray(rawClearFields)
    ? rawClearFields as string[]
    : String(rawClearFields || '').split(',').map((item) => item.trim()).filter(Boolean);
  const rawPreserveFields = ctx.inputs.preserveFields ?? ctx.properties.preserveFields;
  const preserveFields = Array.isArray(rawPreserveFields)
    ? rawPreserveFields as string[]
    : String(rawPreserveFields || '').split(',').map((item) => item.trim()).filter(Boolean);
  const defaults = parsePatchConfig(ctx.inputs.defaults ?? ctx.properties.defaults);
  const currentValues = (ctx.inputs.formData && typeof ctx.inputs.formData === 'object' && !Array.isArray(ctx.inputs.formData))
    ? ctx.inputs.formData as Record<string, unknown>
    : ((ctx.inputs.values && typeof ctx.inputs.values === 'object' && !Array.isArray(ctx.inputs.values))
      ? ctx.inputs.values as Record<string, unknown>
      : {});
  const result = buildResetFormPatch(currentValues, {
    clearFields,
    preserveFields,
    defaults,
    message: String(ctx.properties.message || ''),
    focusField: String(ctx.properties.focusField || ''),
  });
  const sideEffects: FlowSideEffect[] = Object.entries(result.patch).map(([field, value]) =>
    normalizeFlowSideEffect({ kind: 'set-form-value', field, value })!).filter(Boolean) as FlowSideEffect[];
  if (result.message) {
    sideEffects.push(normalizeFlowSideEffect({ kind: 'show-message', message: result.message, level: 'info' })!);
  }
  return { patch: result.patch, sideEffects };
});

registerExecutor('behavior-switch-tab', (ctx) => {
  const tabName = ctx.assertType('string', ctx.properties.tabName || ctx.inputs.tabName || '', 'tabName') as string;
  return { trigger: ctx.inputs.trigger, tabName };
});

registerExecutor('behavior-refresh-data', (ctx) => {
  return { trigger: ctx.inputs.trigger, refreshed: true };
});

registerExecutor('behavior-log', (ctx) => {
  const message = ctx.assertType('string', ctx.properties.message || ctx.inputs.message || '', 'message') as string;
  const level = ctx.assertType('string', ctx.properties.level || 'info', 'level') as string;
  return { trigger: ctx.inputs.trigger, message, level };
});

registerExecutor('behavior-delay', (ctx) => {
  const ms = ctx.assertType('number', ctx.properties.ms || ctx.properties.delay || 0, 'ms') as number;
  return { trigger: ctx.inputs.trigger, delay: ms };
});

registerExecutor('behavior-clear-field', (ctx) => {
  const fieldName = ctx.assertType('string', ctx.properties.fieldName || ctx.inputs.fieldName || '', 'fieldName') as string;
  return {
    trigger: ctx.inputs.trigger,
    fieldName,
    value: '',
    sideEffects: fieldName ? [{ kind: 'set-form-value', field: fieldName, value: '' }] : [],
  };
});

registerExecutor('behavior-stop', (ctx) => {
  return { trigger: ctx.inputs.trigger, stopped: true };
});
