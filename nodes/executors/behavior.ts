import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';
import type { FlowSideEffect } from '../../src/services/flowSideEffects';
import { normalizeFlowSideEffect } from '../../src/services/flowSideEffects';

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

registerExecutor('behavior-set-value', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const fieldName = ctx.assertType('string', inputs.fieldName || properties.fieldName || '', 'fieldName') as string;
  const valueType = ctx.assertType('string', properties.valueType || 'static', 'valueType') as string;

  let value: unknown;
  if (valueType === 'fromInput') {
    value = inputs.value ?? inputs.data;
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
    valueType,
    oldValue: inputs[fieldName] ?? inputs.oldValue ?? '',
    expression: properties.expression || '',
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-set-visible', (ctx) => {
  const { inputs, properties } = ctx;
  const componentId = ctx.assertType('string', properties.componentId || inputs.componentId || '', 'componentId') as string;
  const visible = ctx.assertType('boolean', properties.visible !== false, 'visible') as boolean;
  return {
    trigger: inputs.trigger,
    componentId,
    visible,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-set-disabled', (ctx) => {
  const { inputs, properties } = ctx;
  const componentId = ctx.assertType('string', properties.componentId || inputs.componentId || '', 'componentId') as string;
  const disabled = ctx.assertType('boolean', properties.disabled !== false, 'disabled') as boolean;
  return {
    trigger: inputs.trigger,
    componentId,
    disabled,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-set-required', (ctx) => {
  const { inputs, properties } = ctx;
  const fieldName = ctx.assertType('string', properties.fieldName || inputs.fieldName || '', 'fieldName') as string;
  const required = ctx.assertType('boolean', properties.required !== false, 'required') as boolean;
  return {
    trigger: inputs.trigger,
    fieldName,
    required,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-calculate', (ctx) => {
  const { inputs, properties, checkType } = ctx;
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
    value: result,
    expression,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-show-message', (ctx) => {
  const { inputs, properties } = ctx;
  const message = ctx.assertType('string', properties.message || inputs.message || '', 'message') as string;
  const messageType = ctx.assertType('string', properties.messageType || 'info', 'messageType') as string;
  return {
    trigger: inputs.trigger,
    message,
    messageType,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-validate', (ctx) => {
  const { inputs, properties } = ctx;
  const fieldName = ctx.assertType('string', properties.fieldName || inputs.fieldName || '', 'fieldName') as string;
  const rule = ctx.assertType('string', properties.rule || 'required', 'rule') as string;
  const fieldValue = inputs[fieldName] ?? inputs.value;
  return {
    trigger: inputs.trigger,
    fieldName,
    rule,
    fieldValue,
    valid: true,
    errors: {},
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-api-request', (ctx) => {
  const { inputs, properties } = ctx;
  const url = ctx.assertType('string', properties.url || '', 'url') as string;
  const method = ctx.assertType('string', properties.method || 'GET', 'method') as string;
  return {
    trigger: inputs.trigger,
    url,
    method,
    headers: properties.headers || {},
    body: properties.body || inputs.data,
    pending: true,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-js-script', (ctx) => {
  const { inputs, properties } = ctx;
  const code = ctx.assertType('string', properties.code || properties.scriptCode || '', 'code') as string;
  let result: unknown;
  try {
    const fn = new Function('ctx', code);
    result = fn({ inputs: inputs, properties: properties, data: inputs.data, formData: inputs.formData });
  } catch (e) {
    return {
      trigger: inputs.trigger,
      error: e instanceof Error ? e.message : String(e),
      code,
      formData: inputs.formData || {},
      timestamp: Date.now(),
    };
  }
  return {
    trigger: inputs.trigger,
    result,
    code,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-loop', (ctx) => {
  const { inputs, properties } = ctx;
  const items = inputs.items || inputs.data || [];
  const count = ctx.assertType('number', Array.isArray(items) ? items.length : Number(properties.count || 0), 'count') as number;
  return {
    trigger: inputs.trigger,
    items,
    count,
    index: 0,
    currentItem: Array.isArray(items) && items.length > 0 ? items[0] : null,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-data-query', (ctx) => {
  const { inputs, properties, tables, checkType } = ctx;
  const sheetName = ctx.assertType('string', properties.sheetName || inputs.sheetName || '', 'sheetName') as string;
  const filter = inputs.filter as Record<string, unknown> || {};

  for (const table of tables) {
    const sheet = table.sheets.find(s => s.name === sheetName) || table.sheets[0];
    if (sheet) {
      let rows = sheet.preview;
      if (Object.keys(filter).length > 0) {
        rows = rows.filter(row => Object.entries(filter).every(([k, v]) => row[k] === v));
      }
      const rowsCheck = checkType('json-rows', rows);
      return {
        data: rowsCheck.valid ? rowsCheck.normalized : rows,
        count: rows.length,
        headers: sheet.headers,
        sheetName: sheet.name,
        filter,
        trigger: inputs.trigger,
        timestamp: Date.now(),
      };
    }
  }
  return { data: [], count: 0, headers: [], sheetName, filter, trigger: inputs.trigger, timestamp: Date.now() };
});

registerExecutor('behavior-switch-tab', (ctx) => {
  const { inputs, properties } = ctx;
  const tabName = ctx.assertType('string', properties.tabName || inputs.tabName || '', 'tabName') as string;
  return {
    trigger: inputs.trigger,
    tabName,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-refresh-data', (ctx) => {
  const { inputs } = ctx;
  return {
    trigger: inputs.trigger,
    refreshed: true,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-log', (ctx) => {
  const { inputs, properties } = ctx;
  const message = ctx.assertType('string', properties.message || inputs.message || '', 'message') as string;
  const level = ctx.assertType('string', properties.level || 'info', 'level') as string;
  return {
    trigger: inputs.trigger,
    message,
    level,
    data: inputs.data,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-delay', (ctx) => {
  const { inputs, properties } = ctx;
  const ms = ctx.assertType('number', properties.ms || properties.delay || 0, 'ms') as number;
  return {
    trigger: inputs.trigger,
    delay: ms,
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-clear-field', (ctx) => {
  const { inputs, properties } = ctx;
  const fieldName = ctx.assertType('string', properties.fieldName || inputs.fieldName || '', 'fieldName') as string;
  return {
    trigger: inputs.trigger,
    fieldName,
    value: '',
    oldValue: inputs[fieldName] ?? '',
    formData: inputs.formData || {},
    timestamp: Date.now(),
  };
});

registerExecutor('behavior-stop', (ctx) => {
  const { inputs } = ctx;
  return {
    trigger: inputs.trigger,
    stopped: true,
    formData: inputs.formData || {},
    timestamp: Date.now(),
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
    const keyField = String(ctx.properties.writeBackKeyField || '');
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
  const code = ctx.assertType('string', ctx.properties.code || ctx.properties.scriptCode || '', 'code') as string;
  let result: unknown;
  try {
    const fn = new Function('ctx', code);
    result = fn({ inputs: ctx.inputs, properties: ctx.properties });
  } catch (e) {
    return { trigger: ctx.inputs.trigger, error: e instanceof Error ? e.message : String(e) };
  }
  return { trigger: ctx.inputs.trigger, result };
});

registerExecutor('behavior-loop', (ctx) => {
  const items = ctx.inputs.items || ctx.inputs.data;
  const count = ctx.assertType('number', Array.isArray(items) ? items.length : Number(ctx.properties.count || 0), 'count') as number;
  return { trigger: ctx.inputs.trigger, items, count, index: 0 };
});

registerExecutor('behavior-data-query', (ctx) => {
  const { properties, inputs, tables, checkType } = ctx;
  const sheetName = ctx.assertType('string', properties.sheetName || inputs.sheetName || '', 'sheetName') as string;
  const filter = inputs.filter as Record<string, unknown> || {};

  for (const table of tables) {
    const sheet = table.sheets.find(s => s.name === sheetName) || table.sheets[0];
    if (sheet) {
      let rows = sheet.preview;
      if (Object.keys(filter).length > 0) {
        rows = rows.filter(row => Object.entries(filter).every(([k, v]) => row[k] === v));
      }
      const rowsCheck = checkType('json-rows', rows);
      return { data: rowsCheck.valid ? rowsCheck.normalized : rows, count: rows.length, headers: sheet.headers };
    }
  }
  return { data: [], count: 0, headers: [] };
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
