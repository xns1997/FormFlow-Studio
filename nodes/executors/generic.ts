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

// ── 聚合关联节点 ──────────────────────────────────────

registerExecutor('generic:merge', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const leftCheck = checkType('json-rows', inputs.leftData);
  const rightCheck = checkType('json-rows', inputs.rightData);
  if (!leftCheck.valid || !rightCheck.valid) return { error: '输入数据格式错误' };
  const left = leftCheck.normalized as any[];
  const right = rightCheck.normalized as any[];
  const leftKey = String(properties.leftKey || '');
  const rightKey = String(properties.rightKey || '');
  const joinType = String(properties.joinType || 'inner');

  const rightMap = new Map<any, any[]>();
  for (const row of right) {
    const key = row[rightKey];
    if (!rightMap.has(key)) rightMap.set(key, []);
    rightMap.get(key)!.push(row);
  }

  const result: any[] = [];
  const matchedRight = new Set<any>();

  for (const lRow of left) {
    const key = lRow[leftKey];
    const matches = rightMap.get(key);
    if (matches && matches.length > 0) {
      matchedRight.add(key);
      for (const rRow of matches) {
        result.push({ ...lRow, ...rRow });
      }
    } else if (joinType === 'left' || joinType === 'outer') {
      result.push({ ...lRow });
    }
  }

  if (joinType === 'right' || joinType === 'outer') {
    for (const [key, rows] of rightMap) {
      if (!matchedRight.has(key)) {
        for (const rRow of rows) result.push({ ...rRow });
      }
    }
  }

  if (joinType === 'non-matches') {
    const nonMatch: any[] = [];
    for (const lRow of left) {
      if (!rightMap.has(lRow[leftKey])) nonMatch.push({ ...lRow });
    }
    for (const [key, rows] of rightMap) {
      if (!left.some((l: any) => l[leftKey] === key)) {
        for (const rRow of rows) nonMatch.push({ ...rRow });
      }
    }
    return { data: nonMatch, rowCount: nonMatch.length };
  }

  return { data: result, rowCount: result.length };
});

registerExecutor('generic:append', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const mainCheck = checkType('json-rows', inputs.data);
  const extraCheck = checkType('json-rows', inputs.extra);
  if (!mainCheck.valid || !extraCheck.valid) return { error: '输入数据格式错误' };
  const main = mainCheck.normalized as any[];
  const extra = extraCheck.normalized as any[];
  const deduplicate = properties.deduplicate === true;

  let result = [...main, ...extra];
  if (deduplicate) {
    const seen = new Set<string>();
    result = result.filter(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return { data: result, rowCount: result.length };
});

registerExecutor('generic:group-by', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const groupField = String(properties.groupByField || '');
  const aggField = String(properties.aggField || '');
  const aggFunc = String(properties.aggFunc || 'sum');

  const groups = new Map<any, number[]>();
  for (const row of data) {
    const key = row[groupField];
    if (!groups.has(key)) groups.set(key, []);
    const val = Number(row[aggField]);
    if (!isNaN(val)) groups.get(key)!.push(val);
  }

  const result: any[] = [];
  for (const [key, values] of groups) {
    let aggValue: number;
    switch (aggFunc) {
      case 'sum': aggValue = values.reduce((a, b) => a + b, 0); break;
      case 'avg': aggValue = values.reduce((a, b) => a + b, 0) / values.length; break;
      case 'count': aggValue = values.length; break;
      case 'min': aggValue = Math.min(...values); break;
      case 'max': aggValue = Math.max(...values); break;
      case 'median': {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        aggValue = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        break;
      }
      case 'std': {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        aggValue = Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
        break;
      }
      default: aggValue = values.reduce((a, b) => a + b, 0);
    }
    result.push({ [groupField]: key, [`${aggFunc}_${aggField}`]: Math.round(aggValue * 1000) / 1000 });
  }

  return { data: result };
});

registerExecutor('generic:pivot', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const rowKey = String(properties.rowKey || '');
  const colKey = String(properties.colKey || '');
  const valueKey = String(properties.valueKey || '');
  const aggFunc = String(properties.aggFunc || 'first');

  const pivotMap = new Map<string, Map<string, any[]>>();
  const colSet = new Set<string>();

  for (const row of data) {
    const rk = String(row[rowKey]);
    const ck = String(row[colKey]);
    colSet.add(ck);
    if (!pivotMap.has(rk)) pivotMap.set(rk, new Map());
    const rowMap = pivotMap.get(rk)!;
    if (!rowMap.has(ck)) rowMap.set(ck, []);
    rowMap.get(ck)!.push(row[valueKey]);
  }

  const columns = [...colSet].sort();
  const result: any[] = [];
  for (const [rk, rowMap] of pivotMap) {
    const outRow: any = { [rowKey]: rk };
    for (const ck of columns) {
      const values = rowMap.get(ck) || [];
      if (values.length === 0) { outRow[ck] = null; continue; }
      switch (aggFunc) {
        case 'sum': outRow[ck] = values.reduce((a: number, b: any) => a + Number(b), 0); break;
        case 'avg': outRow[ck] = values.reduce((a: number, b: any) => a + Number(b), 0) / values.length; break;
        case 'count': outRow[ck] = values.length; break;
        case 'first': outRow[ck] = values[0]; break;
        case 'last': outRow[ck] = values[values.length - 1]; break;
        default: outRow[ck] = values[0];
      }
    }
    result.push(outRow);
  }

  return { data: result };
});

registerExecutor('generic:unpivot', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const idFields = String(properties.idFields || '').split(',').map(s => s.trim()).filter(Boolean);
  const valueName = String(properties.valueName || 'value');
  const keyName = String(properties.keyName || 'variable');

  const result: any[] = [];
  for (const row of data) {
    const idPart: any = {};
    for (const f of idFields) idPart[f] = row[f];
    for (const [k, v] of Object.entries(row)) {
      if (idFields.includes(k)) continue;
      result.push({ ...idPart, [keyName]: k, [valueName]: v });
    }
  }

  return { data: result };
});

registerExecutor('generic:compare', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const aCheck = checkType('json-rows', inputs.dataA);
  const bCheck = checkType('json-rows', inputs.dataB);
  if (!aCheck.valid || !bCheck.valid) return { error: '输入数据格式错误' };
  const dataA = aCheck.normalized as any[];
  const dataB = bCheck.normalized as any[];
  const matchField = String(properties.matchField || '');

  const bMap = new Map<any, any>();
  for (const row of dataB) bMap.set(row[matchField], row);

  const onlyA: any[] = [], same: any[] = [], different: any[] = [];
  const matchedBKeys = new Set<any>();

  for (const aRow of dataA) {
    const key = aRow[matchField];
    const bRow = bMap.get(key);
    if (!bRow) { onlyA.push(aRow); continue; }
    matchedBKeys.add(key);
    const aKeys = Object.keys(aRow).filter(k => k !== matchField);
    const bKeys = Object.keys(bRow).filter(k => k !== matchField);
    const allKeys = [...new Set([...aKeys, ...bKeys])];
    let isDiff = false;
    for (const k of allKeys) {
      if (JSON.stringify(aRow[k]) !== JSON.stringify(bRow[k])) { isDiff = true; break; }
    }
    (isDiff ? different : same).push({ ...aRow, ...bRow });
  }

  const onlyB = dataB.filter(row => !matchedBKeys.has(row[matchField]));

  return { onlyA, same, different, onlyB };
});

registerExecutor('generic:sample', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const mode = String(properties.mode || 'count');
  const count = Number(properties.count || 10);
  const percent = Number(properties.percent || 10);
  const seed = Number(properties.seed || 0);

  const n = mode === 'percent' ? Math.ceil(data.length * percent / 100) : Math.min(count, data.length);

  if (seed > 0) {
    let s = seed;
    const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const shuffled = [...data];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return { data: shuffled.slice(0, n), rowCount: n };
  }

  const shuffled = [...data].sort(() => Math.random() - 0.5);
  return { data: shuffled.slice(0, n), rowCount: n };
});

// ── 清洗转换节点 ──────────────────────────────────────

registerExecutor('generic:type-cast', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const targetType = String(properties.targetType || 'string');
  const onError = String(properties.onError || 'null');

  const result = data.map(row => {
    const newRow = { ...row };
    const val = row[field];
    try {
      switch (targetType) {
        case 'string': newRow[field] = String(val ?? ''); break;
        case 'number': {
          const n = Number(val);
          newRow[field] = isNaN(n) ? (onError === 'default' ? 0 : null) : n;
          break;
        }
        case 'boolean': newRow[field] = val === true || val === 'true' || val === '1' || val === 1; break;
        case 'date': {
          const d = new Date(val);
          newRow[field] = isNaN(d.getTime()) ? (onError === 'default' ? null : null) : d.toISOString();
          break;
        }
      }
    } catch {
      newRow[field] = onError === 'default' ? null : null;
    }
    return newRow;
  });

  return { data: result };
});

registerExecutor('generic:handle-missing', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const strategy = String(properties.strategy || 'fill');
  const fillValue = properties.fillValue ?? '';

  const fields = field ? [field] : (data.length > 0 ? Object.keys(data[0]) : []);
  let result = [...data];
  let removedCount = 0;

  switch (strategy) {
    case 'fill':
      result = result.map(row => {
        const newRow = { ...row };
        for (const f of fields) {
          if (newRow[f] === null || newRow[f] === undefined || newRow[f] === '') {
            newRow[f] = fillValue;
            removedCount++;
          }
        }
        return newRow;
      });
      break;
    case 'forward':
      for (let i = 1; i < result.length; i++) {
        for (const f of fields) {
          if (result[i][f] === null || result[i][f] === undefined || result[i][f] === '') {
            result[i] = { ...result[i], [f]: result[i - 1][f] };
            removedCount++;
          }
        }
      }
      break;
    case 'backward':
      for (let i = result.length - 2; i >= 0; i--) {
        for (const f of fields) {
          if (result[i][f] === null || result[i][f] === undefined || result[i][f] === '') {
            result[i] = { ...result[i], [f]: result[i + 1][f] };
            removedCount++;
          }
        }
      }
      break;
    case 'drop_row':
      result = result.filter(row => {
        for (const f of fields) {
          if (row[f] === null || row[f] === undefined || row[f] === '') { removedCount++; return false; }
        }
        return true;
      });
      break;
    case 'drop_col':
      if (field) {
        result = result.map(row => {
          const newRow = { ...row };
          delete newRow[field];
          return newRow;
        });
        removedCount = 1;
      }
      break;
    default:
      result = result.map(row => {
        const newRow = { ...row };
        for (const f of fields) {
          if (newRow[f] === null || newRow[f] === undefined || newRow[f] === '') {
            newRow[f] = fillValue;
            removedCount++;
          }
        }
        return newRow;
      });
  }

  return { data: result, removedCount };
});

registerExecutor('generic:string-manip', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const operation = String(properties.operation || 'trim');
  const param1 = String(properties.param1 || '');
  const param2 = String(properties.param2 || '');
  const newField = String(properties.newField || '') || field;

  const result = data.map(row => {
    const newRow = { ...row };
    const val = String(row[field] ?? '');
    let out: string;
    switch (operation) {
      case 'trim': out = val.trim(); break;
      case 'lower': out = val.toLowerCase(); break;
      case 'upper': out = val.toUpperCase(); break;
      case 'replace': out = val.split(param1).join(param2); break;
      case 'extract': {
        try { const m = val.match(new RegExp(param1)); out = m ? m[0] : ''; } catch { out = ''; }
        break;
      }
      case 'concat': out = val + param1; break;
      case 'split': out = val.split(param1)[Number(param2) || 0] ?? ''; break;
      case 'pad_left': out = val.padStart(Number(param1) || 2, param2 || ' '); break;
      case 'pad_right': out = val.padEnd(Number(param1) || 2, param2 || ' '); break;
      case 'substring': out = val.substring(Number(param1) || 0, Number(param2) || undefined); break;
      default: out = val;
    }
    newRow[newField] = out;
    return newRow;
  });

  return { data: result };
});

registerExecutor('generic:date-time', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const operation = String(properties.operation || 'extract');
  const unit = String(properties.unit || 'day');
  const amount = Number(properties.amount || 1);
  const newField = String(properties.newField || '') || field;

  const result = data.map(row => {
    const newRow = { ...row };
    const val = row[field];
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) { newRow[newField] = null; return newRow; }

    switch (operation) {
      case 'add': {
        const nd = new Date(d);
        if (unit === 'year') nd.setFullYear(nd.getFullYear() + amount);
        else if (unit === 'month') nd.setMonth(nd.getMonth() + amount);
        else if (unit === 'day') nd.setDate(nd.getDate() + amount);
        else if (unit === 'hour') nd.setHours(nd.getHours() + amount);
        else if (unit === 'minute') nd.setMinutes(nd.getMinutes() + amount);
        else if (unit === 'second') nd.setSeconds(nd.getSeconds() + amount);
        else if (unit === 'week') nd.setDate(nd.getDate() + amount * 7);
        newRow[newField] = nd.toISOString();
        break;
      }
      case 'subtract': {
        const nd = new Date(d);
        if (unit === 'year') nd.setFullYear(nd.getFullYear() - amount);
        else if (unit === 'month') nd.setMonth(nd.getMonth() - amount);
        else if (unit === 'day') nd.setDate(nd.getDate() - amount);
        else if (unit === 'hour') nd.setHours(nd.getHours() - amount);
        else if (unit === 'minute') nd.setMinutes(nd.getMinutes() - amount);
        else if (unit === 'second') nd.setSeconds(nd.getSeconds() - amount);
        else if (unit === 'week') nd.setDate(nd.getDate() - amount * 7);
        newRow[newField] = nd.toISOString();
        break;
      }
      case 'extract': {
        switch (unit) {
          case 'year': newRow[newField] = d.getFullYear(); break;
          case 'month': newRow[newField] = d.getMonth() + 1; break;
          case 'day': newRow[newField] = d.getDate(); break;
          case 'hour': newRow[newField] = d.getHours(); break;
          case 'minute': newRow[newField] = d.getMinutes(); break;
          case 'second': newRow[newField] = d.getSeconds(); break;
          case 'week': newRow[newField] = Math.ceil(d.getDate() / 7); break;
          default: newRow[newField] = d.toISOString();
        }
        break;
      }
      case 'now': newRow[newField] = new Date().toISOString(); break;
      default: newRow[newField] = d.toISOString();
    }
    return newRow;
  });

  return { data: result };
});

registerExecutor('generic:regex-extract', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const pattern = String(properties.pattern || '');
  const group = Number(properties.group || 0);
  const newField = String(properties.newField || 'extracted');

  let regex: RegExp;
  try { regex = new RegExp(pattern); } catch { return { error: '正则表达式无效' }; }

  const result = data.map(row => {
    const newRow = { ...row };
    const val = String(row[field] ?? '');
    const match = val.match(regex);
    newRow[newField] = match ? (match[group] ?? '') : '';
    return newRow;
  });

  return { data: result };
});

registerExecutor('generic:rename-columns', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  let mapping: Record<string, string> = {};
  try { mapping = JSON.parse(String(properties.mapping || '{}')); } catch {}

  const result = data.map(row => {
    const newRow: any = {};
    for (const [k, v] of Object.entries(row)) {
      newRow[mapping[k] ?? k] = v;
    }
    return newRow;
  });

  return { data: result };
});

registerExecutor('generic:flatten', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const separator = String(properties.separator || '.');
  const maxDepth = Number(properties.maxDepth || 5);

  function flattenObj(obj: any, prefix = '', depth = 0): any {
    if (depth >= maxDepth) return { [prefix]: obj };
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}${separator}${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(result, flattenObj(v, key, depth + 1));
      } else {
        result[key] = v;
      }
    }
    return result;
  }

  const result = data.map(row => flattenObj(row));
  return { data: result };
});

registerExecutor('generic:hash', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const newField = String(properties.newField || 'hash');

  function simpleHash(str: string, algo: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  const result = data.map(row => {
    const newRow = { ...row };
    const val = String(row[field] ?? '');
    newRow[newField] = simpleHash(val, String(properties.algorithm || 'md5'));
    return newRow;
  });

  return { data: result };
});

registerExecutor('generic:encode', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const encoding = String(properties.encoding || 'base64_encode');
  const newField = String(properties.newField || '') || field;

  const result = data.map(row => {
    const newRow = { ...row };
    const val = String(row[field] ?? '');
    try {
      switch (encoding) {
        case 'base64_encode': newRow[newField] = btoa(unescape(encodeURIComponent(val))); break;
        case 'base64_decode': newRow[newField] = decodeURIComponent(escape(atob(val))); break;
        case 'url_encode': newRow[newField] = encodeURIComponent(val); break;
        case 'url_decode': newRow[newField] = decodeURIComponent(val); break;
        case 'html_escape': newRow[newField] = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); break;
        case 'html_unescape': newRow[newField] = val.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'); break;
        default: newRow[newField] = val;
      }
    } catch { newRow[newField] = val; }
    return newRow;
  });

  return { data: result };
});

// ── 校验节点 ──────────────────────────────────────────

registerExecutor('generic:validate-json', (ctx) => {
  const { inputs, properties } = ctx;
  const data = inputs.data;
  let schema: any;
  try { schema = JSON.parse(String(properties.schema || '{}')); } catch { return { error: 'Schema 格式错误' }; }

  const errors: any[] = [];
  if (schema.type && typeof data !== schema.type) {
    errors.push({ field: 'root', message: `期望类型 ${schema.type}，实际 ${typeof data}` });
  }
  if (schema.required && Array.isArray(schema.required)) {
    const dataObj = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    for (const key of schema.required) {
      if (!(key in dataObj)) errors.push({ field: key, message: `缺少必填字段 ${key}` });
    }
  }
  if (schema.properties && typeof data === 'object') {
    for (const [key, propSchema] of Object.entries(schema.properties as any)) {
      const val = (data as any)[key];
      if (val !== undefined && (propSchema as any).type && typeof val !== (propSchema as any).type) {
        errors.push({ field: key, message: `字段 ${key} 期望 ${(propSchema as any).type}，实际 ${typeof val}` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
});

registerExecutor('generic:validate-xml', (ctx) => {
  const { inputs, properties } = ctx;
  const data = String(inputs.data || '');
  const errors: any[] = [];

  const tagMatch = data.match(/<(\w+)[\s>]/);
  if (!tagMatch) errors.push({ message: '未找到有效的 XML 标签' });

  const openTags = [...data.matchAll(/<(\w+)[^\/]*>/g)].map(m => m[1]);
  const closeTags = [...data.matchAll(/<\/(\w+)>/g)].map(m => m[1]);
  if (openTags.length !== closeTags.length) {
    errors.push({ message: `标签不匹配: ${openTags.length} 个开始标签, ${closeTags.length} 个结束标签` });
  }

  return { valid: errors.length === 0, errors };
});

registerExecutor('generic:validate-csv', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const csvCheck = checkType('csv-string', inputs.data);
  if (!csvCheck.valid) return { error: '输入不是有效的 CSV' };
  const csv = String(csvCheck.normalized || '');
  const delimiter = String(properties.delimiter || ',');
  const requiredFields = String(properties.requiredFields || '').split(',').map(s => s.trim()).filter(Boolean);

  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { valid: false, errors: [{ message: 'CSV 至少需要表头和一行数据' }] };

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const errors: any[] = [];

  for (const f of requiredFields) {
    if (!headers.includes(f)) errors.push({ field: f, message: `缺少必填列 ${f}` });
  }

  return { valid: errors.length === 0, errors, headers, rowCount: lines.length - 1 };
});

registerExecutor('generic:unique-check', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');

  const seen = new Map<any, number>();
  const duplicates: any[] = [];

  for (const row of data) {
    const val = row[field];
    const count = (seen.get(val) || 0) + 1;
    seen.set(val, count);
    if (count === 2) duplicates.push(row);
    else if (count > 2) duplicates.push(row);
  }

  return {
    isUnique: duplicates.length === 0,
    duplicates,
    duplicateCount: duplicates.length,
  };
});

registerExecutor('generic:range-check', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const field = String(properties.field || '');
  const minValue = properties.minValue;
  const maxValue = properties.maxValue;
  const dataType = String(properties.dataType || 'number');

  const passed: any[] = [];
  const failed: any[] = [];

  for (const row of data) {
    const val = row[field];
    let inRange = true;

    if (dataType === 'number') {
      const n = Number(val);
      if (minValue !== '' && n < Number(minValue)) inRange = false;
      if (maxValue !== '' && n > Number(maxValue)) inRange = false;
    } else if (dataType === 'date') {
      const d = new Date(val);
      if (minValue && d < new Date(String(minValue))) inRange = false;
      if (maxValue && d > new Date(String(maxValue))) inRange = false;
    } else {
      const s = String(val);
      if (minValue && s < String(minValue)) inRange = false;
      if (maxValue && s > String(maxValue)) inRange = false;
    }

    (inRange ? passed : failed).push(row);
  }

  const passRate = data.length > 0 ? Math.round(passed.length / data.length * 100) : 0;
  return { passed, failed, passRate };
});

// ── 集成节点 ──────────────────────────────────────────

registerExecutor('generic:database-query', (ctx) => {
  const { inputs, properties } = ctx;
  return { error: '数据库查询需要服务端支持，当前为客户端环境' };
});

registerExecutor('generic:websocket', (ctx) => {
  const { inputs, properties } = ctx;
  const action = String(properties.action || 'connect');
  const url = String(properties.url || '');
  return { status: action === 'connect' ? 'connecting' : action, received: null };
});

registerExecutor('generic:pdf-report', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: '输入数据格式错误' };
  const data = dataCheck.normalized as any[];
  const title = String(properties.title || '数据报告');
  return { fileData: null, fileName: `${title}.pdf`, error: 'PDF 生成需要服务端支持' };
});

registerExecutor('generic:email-send', (ctx) => {
  const { inputs, properties } = ctx;
  return { sent: false, error: '邮件发送需要服务端支持' };
});
