import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';

registerExecutor('behavior-on-form-load', (ctx) => {
  return { trigger: 'formLoad', executed: true };
});

registerExecutor('behavior-on-field-change', (ctx) => {
  const fieldName = ctx.assertType('string', ctx.properties.fieldName || ctx.inputs.fieldName || '', 'fieldName') as string;
  return { trigger: 'fieldChange', fieldName, value: ctx.inputs.value };
});

registerExecutor('behavior-on-submit', (ctx) => {
  return { trigger: 'submit', executed: true };
});

registerExecutor('behavior-on-validate', (ctx) => {
  return { trigger: 'validate', executed: true };
});

registerExecutor('behavior-on-button-click', (ctx) => {
  const buttonName = ctx.assertType('string', ctx.properties.buttonName || ctx.inputs.buttonName || '', 'buttonName') as string;
  return { trigger: 'buttonClick', buttonName };
});

registerExecutor('behavior-on-row-load', (ctx) => {
  const rowIndex = ctx.assertType('number', ctx.inputs.rowIndex ?? 0, 'rowIndex') as number;
  return { trigger: 'rowLoad', rowIndex };
});

registerExecutor('behavior-condition', (ctx) => {
  const { properties, inputs, checkType } = ctx;
  const fieldName = ctx.assertType('string', properties.fieldName || '', 'fieldName') as string;
  const operator = ctx.assertType('string', properties.operator || '==', 'operator') as string;
  const compareValue = properties.value;
  const fieldValue = inputs[fieldName];

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

  return { result, passed: result, true: result ? fieldValue : undefined, false: !result ? fieldValue : undefined };
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

  return { trigger: inputs.trigger, fieldName, value };
});

registerExecutor('behavior-set-visible', (ctx) => {
  const componentId = ctx.assertType('string', ctx.properties.componentId || ctx.inputs.componentId || '', 'componentId') as string;
  const visible = ctx.assertType('boolean', ctx.properties.visible !== false, 'visible') as boolean;
  return { trigger: ctx.inputs.trigger, componentId, visible };
});

registerExecutor('behavior-set-disabled', (ctx) => {
  const componentId = ctx.assertType('string', ctx.properties.componentId || ctx.inputs.componentId || '', 'componentId') as string;
  const disabled = ctx.assertType('boolean', ctx.properties.disabled !== false, 'disabled') as boolean;
  return { trigger: ctx.inputs.trigger, componentId, disabled };
});

registerExecutor('behavior-set-required', (ctx) => {
  const fieldName = ctx.assertType('string', ctx.properties.fieldName || ctx.inputs.fieldName || '', 'fieldName') as string;
  const required = ctx.assertType('boolean', ctx.properties.required !== false, 'required') as boolean;
  return { trigger: ctx.inputs.trigger, fieldName, required };
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

  return { trigger: inputs.trigger, targetField, value: result };
});

registerExecutor('behavior-show-message', (ctx) => {
  const message = ctx.assertType('string', ctx.properties.message || ctx.inputs.message || '', 'message') as string;
  const messageType = ctx.assertType('string', ctx.properties.messageType || 'info', 'messageType') as string;
  return { trigger: ctx.inputs.trigger, message, messageType };
});

registerExecutor('behavior-validate', (ctx) => {
  const fieldName = ctx.assertType('string', ctx.properties.fieldName || ctx.inputs.fieldName || '', 'fieldName') as string;
  const rule = ctx.assertType('string', ctx.properties.rule || 'required', 'rule') as string;
  return { trigger: ctx.inputs.trigger, fieldName, rule, valid: true };
});

registerExecutor('behavior-submit', (ctx) => {
  return { trigger: ctx.inputs.trigger, submitted: true };
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
  return { trigger: ctx.inputs.trigger, fieldName, value: '' };
});

registerExecutor('behavior-stop', (ctx) => {
  return { trigger: ctx.inputs.trigger, stopped: true };
});

registerExecutor('behavior-filter-data', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const data = inputs.data as any[] || [];
  const fieldName = ctx.assertType('string', properties.fieldName || '', 'fieldName') as string;
  const operator = ctx.assertType('string', properties.operator || '==', 'operator') as string;
  const filterValue = properties.value;

  const dataCheck = checkType('json-rows', data);
  const validData = dataCheck.valid ? (dataCheck.normalized as any[]) : data;

  const filtered = validData.filter(row => {
    const val = row[fieldName];
    switch (operator) {
      case '==': return val == filterValue;
      case '!=': return val != filterValue;
      case '>': return Number(val) > Number(filterValue);
      case '<': return Number(val) < Number(filterValue);
      case 'contains': return String(val).includes(String(filterValue));
      default: return true;
    }
  });

  return { data: filtered, count: filtered.length };
});

registerExecutor('behavior-sort-data', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const data = inputs.data as any[] || [];
  const fieldName = ctx.assertType('string', properties.fieldName || '', 'fieldName') as string;
  const order = ctx.assertType('string', properties.order || 'asc', 'order') as string;

  const dataCheck = checkType('json-rows', data);
  const validData = dataCheck.valid ? (dataCheck.normalized as any[]) : data;

  const sorted = [...validData].sort((a, b) => {
    const va = a[fieldName], vb = b[fieldName];
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return order === 'desc' ? -cmp : cmp;
  });

  return { data: sorted, count: sorted.length };
});
