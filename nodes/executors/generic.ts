import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';
import type { SrcTableEntry } from '../../src/project/types';

function findSheet(tables: SrcTableEntry[], sheetName: string) {
  for (const table of tables) {
    const sheet = table.sheets.find(s => s.name === sheetName) || table.sheets[0];
    if (sheet) return { table, sheet };
  }
  return null;
}

registerExecutor('generic:file-picker', (ctx) => {
  const fileData = ctx.inputs.data || ctx.inputs.file;
  const check = ctx.checkType('file-data', fileData);
  return { data: check.valid ? check.normalized : fileData, name: ctx.inputs.name || '' };
});

registerExecutor('generic:worksheet-select', (ctx) => {
  const { inputs, properties, tables, assertType } = ctx;
  const wb = inputs.workbook;

  // 检查输入是否是 workbook
  const wbCheck = ctx.checkType('workbook', wb);
  if (wbCheck.valid) {
    const wbObj = wbCheck.normalized as any;
    const sheetName = String(properties.sheetName || wbObj.SheetNames[0]);
    const ws = wbObj.Sheets[sheetName];
    assertType('worksheet', ws, 'worksheet');
    return { worksheet: ws, sheetNames: wbObj.SheetNames };
  }

  // 从项目数据加载
  const sheetName = String(properties.sheetName || '');
  const found = findSheet(tables, sheetName);
  if (found) {
    const { table, sheet } = found;
    const ws = { __fromProject: true, tableId: table.id, sheetName: sheet.name, headers: sheet.headers, preview: sheet.preview, rowCount: sheet.rowCount, colCount: sheet.colCount };
    assertType('worksheet', ws, 'worksheet');
    return {
      worksheet: ws,
      sheetNames: table.sheets.map(s => s.name),
      headers: sheet.headers,
    };
  }

  // 回退：检查已有 worksheet 输入
  const wsCheck = ctx.checkType('worksheet', inputs.worksheet);
  return { worksheet: wsCheck.valid ? wsCheck.normalized : inputs.worksheet, sheetNames: [] };
});

registerExecutor('generic:range-select', (ctx) => {
  const { inputs, properties, tables, checkType } = ctx;
  const ws = inputs.worksheet;
  const address = String(inputs.address || properties.address || 'A1');

  // 校验地址格式
  const addrCheck = checkType('address', address);

  const wsAny = ws as any;
  if (wsAny?.__fromProject) {
    const headers: string[] = wsAny.headers || [];
    const preview = wsAny.preview || [];
    return {
      range: { s: { r: 0, c: 0 }, e: { r: preview.length - 1, c: headers.length - 1 } },
      values: preview,
      address: addrCheck.valid ? addrCheck.normalized : address,
      rowCount: preview.length,
      colCount: headers.length,
    };
  }

  return { range: inputs.range, values: inputs.values, address: addrCheck.valid ? addrCheck.normalized : address, rowCount: inputs.rowCount, colCount: inputs.colCount };
});

registerExecutor('generic:variable-input', (ctx) => {
  const value = ctx.inputs.override ?? ctx.properties.varValue ?? '';
  const varType = String(ctx.properties.varType || 'string');
  const check = ctx.checkType(varType, value);
  return { value: check.valid ? check.normalized : value, varName: ctx.properties.varName };
});

registerExecutor('generic:text-input', (ctx) => {
  const raw = ctx.inputs.override ?? ctx.properties.value ?? '';
  const check = ctx.checkType('string', raw);
  return { value: check.valid ? check.normalized : raw };
});

registerExecutor('generic:number-input', (ctx) => {
  const raw = ctx.inputs.override ?? ctx.properties.value ?? 0;
  const check = ctx.checkType('number', raw);
  if (!check.valid) return { value: 0, error: check.error };
  return { value: check.normalized };
});

registerExecutor('generic:boolean-switch', (ctx) => {
  const raw = ctx.inputs.override ?? ctx.properties.value ?? false;
  const check = ctx.checkType('boolean', raw);
  return { value: check.valid ? check.normalized : !!raw };
});

registerExecutor('generic:output-display', (ctx) => {
  return { value: ctx.inputs.value };
});

registerExecutor('generic:export-excel', async (ctx) => {
  const XLSX = await import('xlsx');
  const { inputs, properties, checkType, assertType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据类型错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const fileName = assertType('string', inputs.fileName || properties.fileName || 'export.xlsx', 'fileName') as string;
  const sheetName = assertType('string', properties.sheetName || 'Sheet1', 'sheetName') as string;
  const includeHeader = properties.includeHeader !== false;

  const ws = XLSX.utils.json_to_sheet(data, { skipHeader: !includeHeader });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fileData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  return {
    fileData,
    fileName,
    size: fileData.byteLength || fileData.length || 0,
  };
});

registerExecutor('generic:export-csv', (ctx) => {
  const { inputs, properties, checkType, assertType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据类型错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const fileName = assertType('string', inputs.fileName || properties.fileName || 'export.csv', 'fileName') as string;
  const delimiter = assertType('string', properties.delimiter || ',', 'delimiter') as string;
  const includeHeader = properties.includeHeader !== false;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const rows = includeHeader
    ? [headers, ...data.map(row => headers.map(h => row[h]))]
    : data.map(row => headers.map(h => row[h]));

  const csvText = rows.map(row =>
    row.map(cell => {
      const str = String(cell ?? '');
      return str.includes(delimiter) || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(delimiter)
  ).join('\n');

  return { csvText, fileName, size: csvText.length };
});

registerExecutor('generic:export-json', (ctx) => {
  const { inputs, properties, assertType } = ctx;
  const data = inputs.data;
  const fileName = assertType('string', inputs.fileName || properties.fileName || 'export.json', 'fileName') as string;
  const pretty = properties.pretty !== false;
  const indent = Number(properties.indent ?? 2);
  const rootKey = String(properties.rootKey || '');

  let output = data;
  if (rootKey && typeof data === 'object' && !Array.isArray(data)) {
    output = { [rootKey]: data };
  } else if (rootKey && Array.isArray(data)) {
    output = { [rootKey]: data };
  }

  const jsonText = pretty ? JSON.stringify(output, null, indent) : JSON.stringify(output);
  return { jsonText, fileName, size: jsonText.length };
});

registerExecutor('generic:export-html', (ctx) => {
  const { inputs, properties, checkType, assertType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据类型错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const fileName = assertType('string', inputs.fileName || properties.fileName || 'export.html', 'fileName') as string;
  const title = assertType('string', properties.title || '数据导出', 'title') as string;
  const style = assertType('string', properties.style || 'default', 'style') as string;

  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  const tableStyle = style === 'striped'
    ? 'border-collapse:collapse;width:100%;'
    : style === 'bordered'
      ? 'border-collapse:collapse;width:100%;border:1px solid #ddd;'
      : style === 'minimal'
        ? 'border-collapse:collapse;'
        : 'border-collapse:collapse;width:100%;border:1px solid #ddd;';

  const cellStyle = 'padding:8px;border:1px solid #ddd;text-align:left;';
  const headerStyle = 'padding:8px;border:1px solid #ddd;text-align:left;background:#f5f5f5;font-weight:bold;';

  const htmlText = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; }
    h1 { color: #333; }
    table { ${tableStyle} }
    th { ${headerStyle} }
    td { ${cellStyle} }
    tr:nth-child(even) { background: ${style === 'striped' ? '#f9f9f9' : 'transparent'}; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${data.length} 行 × ${headers.length} 列</p>
  <table>
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${data.map(row => `<tr>${headers.map(h => `<td>${String(row[h] ?? '')}</td>`).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</body>
</html>`;

  return { htmlText, fileName, size: htmlText.length };
});

registerExecutor('generic:display-table', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据类型错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const maxRows = Number(properties.maxRows || 0);
  const displayData = maxRows > 0 ? data.slice(0, maxRows) : data;

  return {
    data: displayData,
    rowCount: data.length,
    colCount: data.length > 0 ? Object.keys(data[0]).length : 0,
  };
});

registerExecutor('generic:display-stats', (ctx) => {
  const { inputs, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  const data = dataCheck.valid ? (dataCheck.normalized as any[]) : [];
  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  const columnTypes: Record<string, string> = {};
  for (const h of headers) {
    const values = data.map(row => row[h]).filter(v => v !== null && v !== undefined && v !== '');
    const types = new Set(values.map(v => typeof v));
    columnTypes[h] = types.size === 1 ? [...types][0] : 'mixed';
  }

  const stats = {
    rowCount: data.length,
    colCount: headers.length,
    headers,
    columnTypes,
  };

  return {
    stats,
    rowCount: data.length,
    colCount: headers.length,
    headers,
  };
});
