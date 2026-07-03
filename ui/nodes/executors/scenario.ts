import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';

async function getXlsx() {
  return await import('xlsx');
}

registerExecutor('scenario:excel-to-json-schema', async (ctx) => {
  const XLSX = await getXlsx();
  const dataCheck = ctx.checkType('file-data', ctx.inputs.fileData);
  if (!dataCheck.valid) return { error: `文件数据类型错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as ArrayBuffer;

  const wb = XLSX.read(data, { type: 'array' });
  const wbCheck = ctx.checkType('workbook', wb);
  const validWb = wbCheck.valid ? wbCheck.normalized : wb;

  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  const rowsCheck = ctx.checkType('json-rows', jsonData);

  return { workbook: validWb, jsonData: rowsCheck.valid ? rowsCheck.normalized : jsonData, schema: {} };
});

registerExecutor('scenario:json-to-xlsx-export', async (ctx) => {
  const XLSX = await getXlsx();
  const dataCheck = ctx.checkType('json-rows', ctx.inputs.jsonData);
  if (!dataCheck.valid) return { error: `JSON 数据类型错误: ${dataCheck.error}` };
  const jsonData = dataCheck.normalized as any[];

  const ws = XLSX.utils.json_to_sheet(jsonData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  const fileCheck = ctx.checkType('file-data', out);
  return { fileData: fileCheck.valid ? fileCheck.normalized : out };
});

registerExecutor('scenario:append-rows', async (ctx) => {
  const XLSX = await getXlsx();
  const wsCheck = ctx.checkType('worksheet', ctx.inputs.worksheet);
  if (!wsCheck.valid) return { error: `工作表类型错误: ${wsCheck.error}` };
  const ws = wsCheck.normalized as any;

  const rowsCheck = ctx.checkType('json-rows', ctx.inputs.rows);
  if (!rowsCheck.valid) return { error: `行数据类型错误: ${rowsCheck.error}` };
  const rows = rowsCheck.normalized as any[];

  if (ws.__fromProject) {
    const merged = { ...ws, preview: [...(ws.preview || []), ...rows] };
    return { worksheet: merged };
  }

  XLSX.utils.sheet_add_json(ws, rows, { origin: -1 });
  return { worksheet: ws };
});

registerExecutor('scenario:sheet-preview', async (ctx) => {
  const wsCheck = ctx.checkType('worksheet', ctx.inputs.worksheet);
  if (!wsCheck.valid) return { error: `工作表类型错误: ${wsCheck.error}` };
  const ws = wsCheck.normalized as any;

  if (ws.__fromProject) {
    const preview = ws.preview || [];
    const csvCheck = ctx.checkType('csv-string', preview.map((r: any) => Object.values(r).join(',')).join('\n'));
    return {
      jsonPreview: preview,
      csvPreview: csvCheck.valid ? csvCheck.normalized : '',
      htmlPreview: '<table>' + preview.map((r: any) => '<tr>' + Object.values(r).map(v => `<td>${v}</td>`).join('') + '</tr>').join('') + '</table>',
    };
  }

  const XLSX = await getXlsx();
  const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const csvData = XLSX.utils.sheet_to_csv(ws);
  const htmlData = XLSX.utils.sheet_to_html(ws);

  return {
    jsonPreview: ctx.checkType('json-rows', jsonData).normalized ?? jsonData,
    csvPreview: ctx.checkType('csv-string', csvData).normalized ?? csvData,
    htmlPreview: ctx.checkType('html-string', htmlData).normalized ?? htmlData,
  };
});

registerExecutor('scenario:cell-address-toolkit', async (ctx) => {
  const XLSX = await getXlsx();
  const operation = String(ctx.inputs.operation || ctx.properties.operation || 'decodeCell');
  const value = ctx.inputs.value;
  let result: unknown;
  switch (operation) {
    case 'encodeCell': result = XLSX.utils.encode_cell(value as any); break;
    case 'decodeCell': result = XLSX.utils.decode_cell(String(value)); break;
    case 'encodeRange': result = XLSX.utils.encode_range(value as any); break;
    case 'decodeRange': result = XLSX.utils.decode_range(String(value)); break;
    case 'encodeRow': result = XLSX.utils.encode_row(Number(value)); break;
    case 'decodeRow': result = XLSX.utils.decode_row(String(value)); break;
    case 'encodeColumn': result = XLSX.utils.encode_col(Number(value)); break;
    case 'decodeColumn': result = XLSX.utils.decode_col(String(value)); break;
    case 'splitCell': result = (XLSX.utils as any).split_cell(String(value)); break;
    default: throw new Error(`未知地址操作: ${operation}`);
  }
  return {
    result,
    ...(typeof result === 'string' ? { address: result } : {}),
    ...(result && typeof result === 'object' && !Array.isArray(result) ? { coords: result } : {}),
  };
});
