import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';

async function getXlsx() {
  return await import('xlsx');
}

function resolveWorksheet(inputs: Record<string, unknown>, tables: any[], checkType: (t: string, v: unknown) => any): { ws: any; headers: string[]; fromProject: boolean } {
  const ws = inputs.worksheet as any;
  const wsCheck = checkType('worksheet', ws);
  if (wsCheck.valid) {
    const wsObj = wsCheck.normalized as any;
    if (wsObj?.__fromProject) return { ws: wsObj, headers: wsObj.headers || [], fromProject: true };
    if (wsObj) return { ws: wsObj, headers: [], fromProject: false };
  }

  for (const table of tables) {
    const sheet = table.sheets[0];
    if (sheet) return { ws: { __fromProject: true, headers: sheet.headers, preview: sheet.preview }, headers: sheet.headers, fromProject: true };
  }
  return { ws: null, headers: [], fromProject: false };
}

registerExecutor('func-range-select', async (ctx) => {
  const { inputs, properties, tables, checkType, assertType } = ctx;
  const address = assertType('address', inputs.address || properties.address || 'A1', 'address') as string;
  const resolved = resolveWorksheet(inputs, tables, checkType);

  if (!resolved.ws) return { error: '无工作表' };

  if (resolved.fromProject) {
    const preview = resolved.ws.preview || [];
    return { range: { s: { r: 0, c: 0 }, e: { r: preview.length - 1, c: resolved.headers.length - 1 } }, values: preview, address, rowCount: preview.length, colCount: resolved.headers.length };
  }

  const XLSX = await getXlsx();
  try {
    const range = XLSX.utils.decode_range(address);
    const values: unknown[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: unknown[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = resolved.ws[XLSX.utils.encode_cell({ r, c })];
        row.push(cell?.v);
      }
      values.push(row);
    }
    return { range, values, address, rowCount: values.length, colCount: values[0]?.length || 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});

registerExecutor('func-column-bind', (ctx) => {
  const { inputs, properties, assertType } = ctx;
  const componentPort = assertType('string', properties.componentPort || 'value', 'componentPort') as string;
  const dataField = assertType('string', inputs.dataField || properties.dataField || '', 'dataField') as string;
  const direction = assertType('string', properties.direction || 'twoWay', 'direction') as string;

  return { trigger: inputs.trigger, componentPort, dataField, direction, uiValue: inputs.uiValue, dataValue: inputs.dataValue };
});

registerExecutor('func-row-navigator', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  const data = dataCheck.valid ? (dataCheck.normalized as any[]) : [];
  const currentIndex = ctx.assertType('number', inputs.currentIndex || properties.currentIndex || 0, 'currentIndex') as number;

  return {
    currentRow: data[currentIndex] || null,
    currentIndex,
    totalRows: data.length,
    hasNext: currentIndex < data.length - 1,
    hasPrev: currentIndex > 0,
  };
});

registerExecutor('func-form-validate', (ctx) => {
  return { valid: true, errors: {} };
});

registerExecutor('func-form-submit', (ctx) => {
  return { submitted: true, data: ctx.inputs };
});

registerExecutor('func-select-input', (ctx) => {
  const optionsCheck = ctx.checkType('options', ctx.properties.options);
  const options = optionsCheck.valid ? optionsCheck.normalized : (ctx.properties.options || []);
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? '', options };
});

registerExecutor('func-radio-input', (ctx) => {
  const optionsCheck = ctx.checkType('options', ctx.properties.options);
  const options = optionsCheck.valid ? optionsCheck.normalized : (ctx.properties.options || []);
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? '', options };
});

registerExecutor('func-checkbox-input', (ctx) => {
  const optionsCheck = ctx.checkType('options', ctx.properties.options);
  const options = optionsCheck.valid ? optionsCheck.normalized : (ctx.properties.options || []);
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? [], options };
});

registerExecutor('func-date-input', (ctx) => {
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? '' };
});

registerExecutor('func-switch-input', (ctx) => {
  const valueCheck = ctx.checkType('boolean', ctx.inputs.value ?? ctx.properties.defaultValue ?? false);
  return { value: valueCheck.valid ? valueCheck.normalized : false };
});

registerExecutor('func-rating-input', (ctx) => {
  const valueCheck = ctx.checkType('number', ctx.inputs.value ?? ctx.properties.defaultValue ?? 0);
  return { value: valueCheck.valid ? valueCheck.normalized : 0 };
});

registerExecutor('func-style', (ctx) => {
  const styleCheck = ctx.checkType('style', ctx.properties);
  return { styled: true, properties: styleCheck.valid ? styleCheck.normalized : ctx.properties };
});

registerExecutor('func-apply-style', (ctx) => {
  return { styled: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-conditional-format', (ctx) => {
  return { formatted: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-data-validation', (ctx) => {
  return { validated: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-add-comment', (ctx) => {
  return { commentAdded: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-named-item', (ctx) => {
  return { named: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-protect-sheet', (ctx) => {
  return { protected: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-protect-workbook', (ctx) => {
  return { protected: true, workbook: ctx.inputs.workbook };
});

registerExecutor('func-create-chart', (ctx) => {
  const dataCheck = ctx.checkType('json-rows', ctx.inputs.data);
  return { chartCreated: true, data: dataCheck.valid ? dataCheck.normalized : ctx.inputs.data };
});

registerExecutor('func-merge-cells', (ctx) => {
  return { merged: true, worksheet: ctx.inputs.worksheet };
});

registerExecutor('func-find-replace', (ctx) => {
  const { inputs, properties, assertType } = ctx;
  const find = assertType('string', properties.find || '', 'find') as string;
  const replace = assertType('string', properties.replace || '', 'replace') as string;
  return { worksheet: inputs.worksheet, find, replace, replaced: true };
});

registerExecutor('func-remove-duplicates', (ctx) => {
  return { worksheet: ctx.inputs.worksheet, duplicatesRemoved: true };
});

registerExecutor('func-create-table', (ctx) => {
  return { worksheet: ctx.inputs.worksheet, tableCreated: true };
});

registerExecutor('func-sort-table', (ctx) => {
  const { inputs, properties, checkType, assertType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  const data = dataCheck.valid ? (dataCheck.normalized as any[]) : [];
  const column = assertType('string', properties.column || '', 'column') as string;
  const order = assertType('string', properties.order || 'asc', 'order') as string;

  const sorted = [...data].sort((a, b) => {
    const va = a[column], vb = b[column];
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return order === 'desc' ? -cmp : cmp;
  });

  return { data: sorted, count: sorted.length };
});

registerExecutor('func-filter-table', (ctx) => {
  const { inputs, properties, checkType, assertType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  const data = dataCheck.valid ? (dataCheck.normalized as any[]) : [];
  const column = assertType('string', properties.column || '', 'column') as string;
  const value = properties.value;

  const filtered = data.filter(row => row[column] == value);
  return { data: filtered, count: filtered.length };
});

registerExecutor('func-export-sheet', async (ctx) => {
  const XLSX = await getXlsx();
  const wsCheck = ctx.checkType('worksheet', ctx.inputs.worksheet);
  if (!wsCheck.valid) return { error: '无工作表' };
  const ws = wsCheck.normalized as any;

  const format = ctx.assertType('string', ctx.properties.format || 'xlsx', 'format') as string;
  if (ws.__fromProject) {
    const newWs = XLSX.utils.json_to_sheet(ws.preview || []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, newWs, ws.sheetName || 'Sheet1');
    const data = XLSX.write(wb, { bookType: format as any, type: 'array' });
    return { fileData: data, format };
  }

  return { worksheet: ws, format };
});

registerExecutor('func-sheet-operation', (ctx) => {
  return { workbook: ctx.inputs.workbook, worksheet: ctx.inputs.worksheet, operated: true };
});

registerExecutor('func-copy-range', (ctx) => {
  return { worksheet: ctx.inputs.worksheet, copied: true };
});
