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

registerExecutor('scenario:cell-address-toolkit', (ctx) => {
  const addrCheck = ctx.checkType('address', ctx.inputs.address);
  const cellCheck = ctx.checkType('cell', ctx.inputs.coords);
  return {
    address: addrCheck.valid ? addrCheck.normalized : ctx.inputs.address,
    coords: cellCheck.valid ? cellCheck.normalized : ctx.inputs.coords,
  };
});
