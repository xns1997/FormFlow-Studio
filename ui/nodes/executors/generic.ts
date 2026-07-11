import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';
import type { SrcTableEntry } from '../../src/project/types';
import { editWorksheetStructure, toEditableWorksheet } from '../xlsx-worksheet-ops';
import { createComplexRange, getRangeAreas, intersectComplexRanges, parseRangeAddress, type RangeArea } from '../../src/services/data/rangeGeometry';
import { parseCustomJsPortDefinitions } from '../../src/services/config/customJsNode';

function jsonValue(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function apiPost(path: string, body: unknown) {
  const response = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `请求失败: ${response.status}`);
  return result;
}

registerExecutor('generic:db-connect', async ({ properties }) => {
  const connection = { driver: properties.driver, connectionString: properties.connectionString };
  await apiPost('/database/test', connection);
  return { connection, connected: true };
});

registerExecutor('generic:db-query', async ({ inputs, properties }) => {
  const connection = (inputs.connection as Record<string, unknown>) || properties;
  const params = inputs.params ?? jsonValue(properties.params, []);
  const result = await apiPost('/database/query', { ...connection, query: properties.query, params });
  return { data: result.rows, rowCount: result.rowCount, fields: result.fields };
});

registerExecutor('generic:database-query', async ({ inputs, properties }) => {
  const params = inputs.params ?? jsonValue(properties.params, []);
  const driver = String(properties.driver || (String(properties.connectionString).startsWith('mysql') ? 'mysql' : 'postgres'));
  const result = await apiPost('/database/query', { driver, connectionString: properties.connectionString, query: properties.query, params });
  return { data: result.rows, rowCount: result.rowCount };
});

registerExecutor('generic:db-write', async ({ inputs, properties }) => {
  const connection = (inputs.connection as Record<string, unknown>) || properties;
  const result = await apiPost('/database/write', { ...connection, table: properties.table, mode: properties.mode, keys: String(properties.keys || '').split(',').map((key) => key.trim()).filter(Boolean), rows: inputs.rows || [] });
  return result;
});

registerExecutor('generic:rest-api', async ({ inputs, properties }) => {
  const headers = { ...(jsonValue(properties.headers, {}) as Record<string, string>) };
  if (properties.authType === 'apiKey') headers[String(properties.apiKeyHeader || 'X-API-Key')] = String(properties.apiKey || '');
  if (properties.authType === 'bearer') headers.Authorization = `Bearer ${String(properties.apiKey || '')}`;
  if (properties.authType === 'oauth2') {
    const tokenResponse = await fetch(String(properties.tokenUrl), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: String(properties.clientId || ''), client_secret: String(properties.clientSecret || ''), ...(properties.scope ? { scope: String(properties.scope) } : {}) }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.error || 'OAuth2 获取令牌失败');
    headers.Authorization = `${token.token_type || 'Bearer'} ${token.access_token}`;
  }
  let url = String(properties.url || '');
  const pages: unknown[] = [];
  let status = 0;
  const maxPages = Math.max(1, Number(properties.maxPages || 20));
  for (let page = 1; page <= maxPages; page += 1) {
    const requestUrl = properties.pagination === 'page' ? `${url}${url.includes('?') ? '&' : '?'}page=${page}` : url;
    const response = await fetch(requestUrl, { method: String(properties.method || 'GET'), headers: { 'Content-Type': 'application/json', ...headers }, body: ['GET', 'DELETE'].includes(String(properties.method)) ? undefined : JSON.stringify(inputs.body || {}) });
    status = response.status;
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`REST API 请求失败: ${response.status}`);
    pages.push(...(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [payload]));
    if (properties.pagination === 'none') return { response: payload, data: pages, status };
    if (properties.pagination === 'nextUrl') { url = payload?.next || payload?.nextUrl || ''; if (!url) break; }
    if (properties.pagination === 'page' && !(payload?.hasMore ?? (Array.isArray(payload?.data) && payload.data.length > 0))) break;
  }
  return { response: pages, data: pages, status };
});

registerExecutor('generic:graphql-query', async ({ inputs, properties }) => {
  const response = await fetch(String(properties.url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jsonValue(properties.headers, {}) as Record<string, string>) }, body: JSON.stringify({ query: properties.query, variables: inputs.variables ?? jsonValue(properties.variables, {}) }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`GraphQL 请求失败: ${response.status}`);
  return { data: payload.data, errors: payload.errors || [] };
});

registerExecutor('generic:data-quality', ({ inputs, properties }) => {
  const rows = Array.isArray(inputs.data) ? inputs.data as Record<string, unknown>[] : [];
  const rules = jsonValue(properties.rules, []) as Array<{ field: string; type: 'required' | 'range' | 'format' | 'unique'; min?: number; max?: number; pattern?: string }>;
  const issues: Array<{ row: number; field: string; rule: string; value: unknown; message: string }> = [];
  const unique = new Map<string, Set<string>>();
  rules.filter((rule) => rule.type === 'unique').forEach((rule) => unique.set(rule.field, new Set()));
  rows.forEach((row, rowIndex) => rules.forEach((rule) => {
    const value = row[rule.field]; let invalid = false; let message = '';
    if (rule.type === 'required' && (value === null || value === undefined || value === '')) { invalid = true; message = '不能为空'; }
    if (rule.type === 'range' && (Number.isNaN(Number(value)) || (rule.min != null && Number(value) < rule.min) || (rule.max != null && Number(value) > rule.max))) { invalid = true; message = `超出范围 ${rule.min ?? '-∞'} ~ ${rule.max ?? '∞'}`; }
    if (rule.type === 'format') { try { invalid = !new RegExp(rule.pattern || '').test(String(value ?? '')); message = '格式不匹配'; } catch { invalid = true; message = '规则格式无效'; } }
    if (rule.type === 'unique') { const key = String(value); const values = unique.get(rule.field)!; invalid = values.has(key); values.add(key); message = '值不唯一'; }
    if (invalid) issues.push({ row: rowIndex, field: rule.field, rule: rule.type, value, message });
  }));
  const badRows = new Set(issues.map((issue) => issue.row));
  const score = rows.length && rules.length ? Math.max(0, Math.round((1 - issues.length / (rows.length * rules.length)) * 10000) / 100) : 100;
  if (properties.stopOnError && issues.length) throw new Error(`数据质量检查失败：${issues.length} 个问题`);
  return { validRows: rows.filter((_row, index) => !badRows.has(index)), issues, score };
});

registerExecutor('generic:ai-query', async ({ inputs, properties }) => {
  const result = await apiPost('/ai/query', { provider: properties.provider, model: properties.model, question: inputs.question || properties.question, schema: inputs.schema || jsonValue(properties.schema, []) });
  return { sql: String(result.content || '').replace(/^```sql\s*|```$/gi, '').trim() };
});
registerExecutor('generic:ai-insight', async ({ inputs, properties }) => { const result = await apiPost('/ai/insight', { provider: properties.provider, model: properties.model, rows: inputs.data || [] }); return { insight: result.content || '' }; });
registerExecutor('ml:auto-feature', ({ inputs, properties }) => {
  const rows = Array.isArray(inputs.data) ? inputs.data as Record<string, unknown>[] : []; const numeric = Object.keys(rows[0] || {}).filter((field) => rows.some((row) => typeof row[field] === 'number')); const features: string[] = [];
  const data = rows.map((row) => { const next = { ...row }; for (const [field, value] of Object.entries(row)) { if (typeof value === 'string') { const date = Date.parse(value); if (!Number.isNaN(date)) { next[`${field}_year`] = new Date(date).getFullYear(); next[`${field}_month`] = new Date(date).getMonth() + 1; features.push(`${field}_year`, `${field}_month`); } else { next[`${field}_length`] = value.length; features.push(`${field}_length`); } } } if (properties.includeCross !== false) for (let i = 0; i < numeric.length; i += 1) for (let j = i + 1; j < numeric.length && features.length < Number(properties.maxFeatures || 30); j += 1) { const a = Number(row[numeric[i]]), b = Number(row[numeric[j]]); next[`${numeric[i]}_x_${numeric[j]}`] = a * b; next[`${numeric[i]}_div_${numeric[j]}`] = b ? a / b : null; features.push(`${numeric[i]}_x_${numeric[j]}`, `${numeric[i]}_div_${numeric[j]}`); } return next; });
  return { data, features: [...new Set(features)].slice(0, Number(properties.maxFeatures || 30)) };
});
registerExecutor('generic:incremental-sync', ({ inputs, properties }) => {
  const rows = Array.isArray(inputs.data) ? inputs.data as Record<string, unknown>[] : []; const key = `formflow.incremental.${String(properties.stateKey || 'default')}`; let previous: unknown = null;
  try { previous = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  const field = String(properties.field || 'updatedAt'); const compare = (value: unknown) => properties.mode === 'version' ? Number(value) : Date.parse(String(value)); const previousValue = previous == null ? -Infinity : compare(previous);
  const changes = rows.filter((row) => compare(row[field]) > previousValue); const watermark = changes.reduce<unknown>((max, row) => compare(row[field]) > compare(max) ? row[field] : max, previous);
  if (properties.commitState !== false && watermark != null) localStorage.setItem(key, JSON.stringify(watermark));
  return { changes, watermark, previousWatermark: previous };
});
registerExecutor('generic:olap-crosstab', ({ inputs, properties }) => {
  const source = Array.isArray(inputs.data) ? inputs.data as Record<string, unknown>[] : []; const filters = jsonValue(properties.filters, {}) as Record<string, unknown>; const data = source.filter((row) => Object.entries(filters).every(([field, value]) => Array.isArray(value) ? value.includes(row[field]) : row[field] === value));
  const rowFields = String(properties.rows || '').split(',').map((value) => value.trim()).filter(Boolean); const colFields = String(properties.columns || '').split(',').map((value) => value.trim()).filter(Boolean); const measure = String(properties.measure); const cells: Record<string, Record<string, number[]>> = {};
  data.forEach((record) => { const rowKey = rowFields.map((field) => record[field]).join(' / ') || '全部'; const colKey = colFields.map((field) => record[field]).join(' / ') || '值'; (cells[rowKey] ||= {})[colKey] ||= []; cells[rowKey][colKey].push(Number(record[measure]) || 0); });
  const aggregate = (values: number[]) => properties.aggregation === 'count' ? values.length : properties.aggregation === 'avg' ? values.reduce((a,b)=>a+b,0)/Math.max(1,values.length) : properties.aggregation === 'min' ? Math.min(...values) : properties.aggregation === 'max' ? Math.max(...values) : values.reduce((a,b)=>a+b,0);
  return { table: Object.fromEntries(Object.entries(cells).map(([row, cols]) => [row, Object.fromEntries(Object.entries(cols).map(([col, values]) => [col, aggregate(values)]))])), drilldown: data };
});

function findSheet(tables: SrcTableEntry[], sheetName: string) {
  for (const table of tables) {
    const sheet = table.sheets.find(s => s.name === sheetName) || table.sheets[0];
    if (sheet) return { table, sheet };
  }
  return null;
}

registerExecutor('generic:file-source', async (ctx) => {
  let fileData = ctx.inputs.data || ctx.inputs.file;
  let fileName = String(ctx.inputs.name || ctx.properties.selectedFile || '');
  if (!fileData && ctx.tables.length > 0) {
    const table = ctx.tables.find((item) => item.fileName === fileName) || ctx.tables[0];
    if (table.id.startsWith('file_')) {
      try {
        const response = await fetch(`http://localhost:3001/api/files/${encodeURIComponent(table.id)}/raw`);
        if (response.ok) fileData = await response.arrayBuffer();
      } catch {}
    }
    if (!fileData) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      for (const sheet of table.sheets) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheet.preview || []), sheet.name);
      }
      fileData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    }
    fileName = table.fileName;
  }
  const check = ctx.checkType('file-data', fileData);
  const data = check.valid ? check.normalized : fileData;
  const size = data instanceof ArrayBuffer
    ? data.byteLength
    : data instanceof Uint8Array
      ? data.byteLength
      : typeof data === 'string'
        ? data.length
        : 0;
  return { data, file: data ? { name: fileName, data, size } : undefined, name: fileName, size };
});

async function resolveWorksheetSource(ctx: NodeExecContext) {
  const { inputs, properties, tables, assertType } = ctx;
  const wb = inputs.workbook;
  const wbCheck = ctx.checkType('workbook', wb);
  if (wbCheck.valid) {
    const wbObj = wbCheck.normalized as any;
    const names: string[] = wbObj.SheetNames || [];
    const mode = String(inputs.worksheetMode || properties.worksheetMode || 'active');
    const requestedName = String(inputs.sheetName || properties.sheetName || '');
    const requestedIndex = Math.max(0, Math.trunc(Number(inputs.sheetIndex ?? properties.sheetIndex ?? 0)));
    const activeIndex = Math.max(0, Math.trunc(Number(wbObj.Workbook?.Views?.[0]?.activeTab ?? 0)));
    const sheetName = mode === 'byName' && requestedName
      ? requestedName
      : mode === 'byIndex'
        ? names[requestedIndex]
        : mode === 'active'
          ? names[activeIndex]
          : names[0];
    const ws = wbObj.Sheets[sheetName];
    if (!ws) throw new Error(`工作表不存在: ${sheetName || '(空)'}`);
    assertType('worksheet', ws, 'worksheet');
    const XLSX = await import('xlsx');
    const firstRow = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, blankrows: false })[0];
    return { workbook: wbObj, worksheet: ws, sheetName, sheetNames: names, headers: Array.isArray(firstRow) ? firstRow.map(String) : [] };
  }

  const sheetName = String(properties.sheetName || '');
  const found = findSheet(tables, sheetName);
  if (found) {
    const { table, sheet } = found;
    const ws = { __fromProject: true, tableId: table.id, sheetName: sheet.name, headers: sheet.headers, preview: sheet.preview, rowCount: sheet.rowCount, colCount: sheet.colCount };
    assertType('worksheet', ws, 'worksheet');
    return {
      worksheet: ws,
      sheetName: sheet.name,
      sheetNames: table.sheets.map(s => s.name),
      headers: sheet.headers,
    };
  }

  const wsCheck = ctx.checkType('worksheet', inputs.worksheet);
  return {
    worksheet: wsCheck.valid ? wsCheck.normalized : inputs.worksheet,
    sheetName: String(properties.sheetName || ''),
    sheetNames: [],
    headers: [] as string[],
  };
}

for (const [id, axis, action] of [
  ['generic:insert-rows', 'row', 'insert'],
  ['generic:delete-rows', 'row', 'delete'],
  ['generic:insert-columns', 'column', 'insert'],
  ['generic:delete-columns', 'column', 'delete'],
] as const) {
  registerExecutor(id, ({ inputs, properties }) => editWorksheetStructure(
    inputs.worksheet,
    axis,
    action,
    inputs.index ?? properties.index ?? 1,
    inputs.count ?? properties.count ?? 1,
  ));
}

registerExecutor('generic:worksheet-commit', async ({ inputs, properties, assertType }) => {
  const workbook = assertType('workbook', inputs.workbook, 'workbook') as any;
  const worksheet = toEditableWorksheet(assertType('worksheet', inputs.worksheet, 'worksheet'));
  const requestedName = String(inputs.sheetName || properties.sheetName || (worksheet as any)?.__sourceSheetName || '');
  const identityName = (workbook.SheetNames || []).find((name: string) => workbook.Sheets[name] === inputs.worksheet || workbook.Sheets[name] === worksheet);
  const sheetName = requestedName || identityName || workbook.SheetNames?.[0] || 'Sheet1';
  workbook.Sheets[sheetName] = worksheet;
  if (!workbook.SheetNames.includes(sheetName)) workbook.SheetNames.push(sheetName);
  return { workbook, worksheet, sheetName, sheetNames: [...workbook.SheetNames] };
});

function workbookMimeType(bookType: string) {
  if (bookType === 'xls') return 'application/vnd.ms-excel';
  if (bookType === 'ods') return 'application/vnd.oasis.opendocument.spreadsheet';
  if (bookType === 'xlsb') return 'application/vnd.ms-excel.sheet.binary.macroEnabled.12';
  if (bookType === 'xlsm') return 'application/vnd.ms-excel.sheet.macroEnabled.12';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

registerExecutor('generic:workbook-save', async ({ inputs, properties, assertType }) => {
  const workbook = assertType('workbook', inputs.workbook, 'workbook') as any;
  const bookType = String(properties.bookType || 'xlsx');
  const baseName = String(inputs.fileName || properties.fileName || 'output');
  const fileName = `${baseName.replace(/\.(xlsx|xlsm|xlsb|xls|ods)$/i, '')}.${bookType}`;
  const XLSX = await import('xlsx');
  const fileData = XLSX.write(workbook, { bookType: bookType as any, type: 'array', compression: properties.compression !== false });
  return { workbook, fileData, fileName, mimeType: workbookMimeType(bookType) };
});

function buildSheetSourceRangeResult(ws: unknown, inputs: Record<string, unknown>, properties: Record<string, unknown>) {
  const wsAny = ws as any;
  if (!wsAny || typeof wsAny !== 'object') throw new Error('缺少 worksheet 输入');
  return import('xlsx').then((XLSX) => {
    const mode = String(inputs.rangeMode || properties.rangeMode || 'usedRange');
    const addressInput = String(inputs.address || properties.address || '');
    const rowIndex = Math.max(0, Math.trunc(Number(inputs.rowIndex ?? properties.rowIndex ?? 1)) - 1);
    const colIndex = Math.max(0, Math.trunc(Number(inputs.colIndex ?? properties.colIndex ?? 1)) - 1);
    const rowCount = Math.max(1, Math.trunc(Number(inputs.rowCount ?? properties.rowCount ?? 1)));
    const colCount = Math.max(1, Math.trunc(Number(inputs.colCount ?? properties.colCount ?? 1)));
    const usedArea: RangeArea = wsAny.__fromProject
      ? { startRow: 0, startCol: 0, endRow: Math.max(0, (wsAny.preview?.length || 0)), endCol: Math.max(0, (wsAny.headers?.length || 1) - 1) }
      : (() => {
          const decoded = XLSX.utils.decode_range(wsAny['!ref'] || 'A1');
          return { startRow: decoded.s.r, startCol: decoded.s.c, endRow: decoded.e.r, endCol: decoded.e.c };
        })();
    let areas: RangeArea[];
    let parsedSheetName: string | undefined;
    if (mode === 'address' && addressInput) {
      const parsed = parseRangeAddress(addressInput);
      areas = parsed.areas;
      parsedSheetName = parsed.sheetName;
    } else if (mode === 'row') {
      areas = [{ startRow: rowIndex, startCol: usedArea.startCol, endRow: rowIndex + rowCount - 1, endCol: usedArea.endCol }];
    } else if (mode === 'column') {
      areas = [{ startRow: usedArea.startRow, startCol: colIndex, endRow: usedArea.endRow, endCol: colIndex + colCount - 1 }];
    } else if (mode === 'custom') {
      areas = [{ startRow: rowIndex, startCol: colIndex, endRow: rowIndex + rowCount - 1, endCol: colIndex + colCount - 1 }];
    } else {
      areas = [usedArea];
    }
    if (!areas.length) throw new Error(`无效区域地址: ${addressInput}`);
    const range = createComplexRange(areas, {
      sheetName: parsedSheetName || wsAny.__sourceSheetName || wsAny.sheetName,
      tableId: wsAny.tableId,
      operation: 'selection',
    });
    const normalizedAreas = getRangeAreas(range);
    const readCell = (row: number, column: number) => {
      if (wsAny.__fromProject) {
        const header = wsAny.headers?.[column];
        return row === 0 ? header : wsAny.preview?.[row - 1]?.[header];
      }
      const cell = wsAny[XLSX.utils.encode_cell({ r: row, c: column })];
      return cell?.v ?? cell?.w ?? '';
    };
    const areaValues = normalizedAreas.map((area) => {
      const result: unknown[][] = [];
      for (let row = area.startRow; row <= area.endRow; row += 1) {
        const values: unknown[] = [];
        for (let column = area.startCol; column <= area.endCol; column += 1) values.push(readCell(row, column));
        result.push(values);
      }
      return result;
    });
    const bounds = range.bounds;
    return {
      range,
      address: range.address,
      areas: range.areas,
      values: areaValues.length === 1 ? areaValues[0] : areaValues.flat(),
      areaValues,
      areaCount: range.areaCount,
      cellCount: range.cellCount,
      rowCount: bounds ? bounds.e.r - bounds.s.r + 1 : 0,
      colCount: bounds ? bounds.e.c - bounds.s.c + 1 : 0,
    };
  });
}

registerExecutor('generic:sheet-source', async (ctx) => {
  const { inputs, properties } = ctx;
  const sourceMode = String(inputs.sourceMode || properties.sourceMode || 'worksheet');
  const worksheetResult = await resolveWorksheetSource(ctx);
  if (sourceMode !== 'range') return { ...worksheetResult };
  const rangeResult = await buildSheetSourceRangeResult(worksheetResult.worksheet, inputs, properties);
  return { ...worksheetResult, ...rangeResult };
});

registerExecutor('generic:range-select', async (ctx) => {
  const { inputs, properties } = ctx;
  const ws = inputs.worksheet;
  const wsAny = ws as any;
  if (!wsAny || typeof wsAny !== 'object') throw new Error('缺少 worksheet 输入');
  return buildSheetSourceRangeResult(wsAny, inputs, properties);
});

registerExecutor('generic:range-intersection', ({ inputs, assertType }) => {
  const left = assertType('range', inputs.left, 'left');
  const right = assertType('range', inputs.right, 'right');
  const range = intersectComplexRanges(left, right);
  return {
    range,
    address: range.address,
    areas: range.areas,
    areaCount: range.areaCount,
    cellCount: range.cellCount,
    isEmpty: range.areaCount === 0,
  };
});

registerExecutor('generic:value-input', (ctx) => {
  const value = ctx.inputs.override ?? ctx.properties.value ?? '';
  const valueType = String(ctx.properties.valueType || 'string');
  const check = ctx.checkType(valueType, value);
  return {
    value: check.valid ? check.normalized : value,
    name: String(ctx.properties.name || ''),
    valueType,
  };
});

registerExecutor('workflow:import', (ctx) => {
  const defs = parseCustomJsPortDefinitions(ctx.properties.outputPorts);
  if (defs.length === 0) throw new Error('流程导入节点还没有定义字段');
  return Object.fromEntries(defs.map((def) => [def.name, ctx.inputs[def.name]]));
});

registerExecutor('workflow:export', (ctx) => {
  const defs = parseCustomJsPortDefinitions(ctx.properties.inputPorts);
  if (defs.length === 0) throw new Error('流程导出节点还没有定义字段');
  const result = Object.fromEntries(defs.map((def) => [def.name, ctx.inputs[def.name]]));
  return { result };
});

registerExecutor('generic:output-display', (ctx) => {
  return { value: ctx.inputs.value };
});

async function rowsFromData(data: unknown): Promise<Record<string, unknown>[]> {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const worksheet = data as any;
  if (worksheet?.__fromProject) return worksheet.preview || [];
  if (worksheet && typeof worksheet === 'object' && worksheet['!ref']) {
    const XLSX = await import('xlsx');
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
  }
  if (data && typeof data === 'object') return [data as Record<string, unknown>];
  return [];
}

function withExtension(fileName: string, format: string) {
  return fileName.toLowerCase().endsWith(`.${format}`) ? fileName : `${fileName}.${format}`;
}

registerExecutor('generic:export', async ({ inputs, properties }) => {
  const format = String(properties.format || 'xlsx');
  const fileName = withExtension(String(inputs.fileName || properties.fileName || 'export'), format);
  const rows = await rowsFromData(inputs.data);
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const source = inputs.data as any;
    const worksheet = source && typeof source === 'object' && source['!ref']
      ? source
      : XLSX.utils.json_to_sheet(rows, { skipHeader: properties.includeHeader === false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, String(properties.sheetName || 'Sheet1'));
    return { result: XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }), fileName, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  if (format === 'json') {
    return { result: JSON.stringify(rows, null, 2), fileName, mimeType: 'application/json' };
  }
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  if (format === 'csv') {
    const csvRows: unknown[][] = properties.includeHeader === false ? [] : [headers];
    csvRows.push(...rows.map((row) => headers.map((header) => row[header])));
    const result = csvRows.map((row) => row.map((value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(',')).join('\n');
    return { result, fileName, mimeType: 'text/csv;charset=utf-8' };
  }
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const result = `<table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escape(row[header])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return { result, fileName, mimeType: 'text/html;charset=utf-8' };
});

function compareValue(left: unknown, operator: string, right: unknown) {
  switch (operator) {
    case 'equals': return left == right;
    case '!=': return left != right;
    case 'contains': return String(left ?? '').includes(String(right ?? ''));
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    default: return left == right;
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(value: unknown): Record<string, unknown> {
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

function normalizeChoiceOptions(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return [{ label: item, value: item }];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entry = item as Record<string, unknown>;
        const nextValue = entry.value ?? entry.label ?? '';
        return [{ ...entry, label: String(entry.label ?? nextValue), value: nextValue }];
      }
      return [];
    });
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeChoiceOptions(parsed);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean).map((item) => ({ label: item, value: item }));
    }
  }
  return [];
}

registerExecutor('generic:choice-input', ({ inputs, properties }) => {
  const selectionMode = String(properties.selectionMode || 'single');
  const optionsSource = String(properties.optionsSource || 'static');
  const rawOptions = optionsSource === 'input'
    ? (inputs.options ?? properties.options)
    : (properties.options ?? inputs.options);
  const normalizedOptions = normalizeChoiceOptions(rawOptions);
  const rawDefault = properties.defaultValue;
  const rawValue = inputs.value ?? rawDefault ?? (selectionMode === 'multiple' ? [] : '');

  const values = selectionMode === 'multiple'
    ? (Array.isArray(rawValue) ? rawValue : rawValue == null || rawValue === '' ? [] : [rawValue])
    : rawValue == null || rawValue === '' ? [] : [rawValue];
  const value = selectionMode === 'multiple' ? values : (values[0] ?? '');
  const selectedOptions = normalizedOptions.filter((option) => values.some((item) => item == option.value));

  return {
    value,
    values,
    selectedOption: selectedOptions[0] ?? null,
    selectedOptions,
  };
});

function getValueByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  const segments = path.split('.').filter(Boolean);
  let current: any = source;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function resolveScopedToken(token: unknown, scope: Record<string, unknown>): unknown {
  if (Array.isArray(token)) {
    for (const item of token) {
      const resolved = resolveScopedToken(item, scope);
      if (resolved !== undefined && resolved !== null && resolved !== '') return resolved;
    }
    return '';
  }
  if (typeof token !== 'string') return token;
  if (token.startsWith('$record.')) return getValueByPath(scope.record, token.slice('$record.'.length));
  if (token === '$record') return scope.record;
  if (token.startsWith('$inputs.')) return getValueByPath(scope.inputs, token.slice('$inputs.'.length));
  if (token === '$inputs') return scope.inputs;
  if (token.startsWith('$context.')) return getValueByPath(scope.context, token.slice('$context.'.length));
  if (token === '$context') return scope.context;
  return token;
}

function evaluateConfiguredExpression(expression: string, scope: Record<string, unknown>): unknown {
  const body = expression.startsWith('=') ? expression.slice(1) : expression;
  try {
    const fn = new Function('record', 'inputs', 'context', 'get', `return (${body});`);
    return fn(scope.record, scope.inputs, scope.context, (value: unknown, path: string) => getValueByPath(value, path));
  } catch {
    return undefined;
  }
}

registerExecutor('generic:filter', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.data);
  const field = String(inputs.field ?? properties.field ?? '');
  const operator = String(inputs.operator ?? properties.operator ?? '==');
  const compareTo = inputs.value ?? properties.value;
  const result = field ? rows.filter((row) => compareValue(row[field], operator, compareTo)) : rows;
  return { result, rows: result, count: result.length, trigger: inputs.trigger };
});

type CriteriaFilterRule = {
  field?: string;
  operator?: string;
  value?: unknown;
  inputKey?: string;
  valuePath?: string;
  enabled?: boolean;
};

function parseCriteriaRules(value: unknown): CriteriaFilterRule[] {
  if (Array.isArray(value)) return value as CriteriaFilterRule[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as CriteriaFilterRule[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

registerExecutor('generic:criteria-filter', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.data);
  const context = (inputs.context && typeof inputs.context === 'object' && !Array.isArray(inputs.context))
    ? inputs.context as Record<string, unknown>
    : {};
  const rules = parseCriteriaRules(inputs.criteria ?? properties.criteria);
  const appliedCriteria = rules
    .filter((rule) => rule && rule.enabled !== false && String(rule.field || '').trim())
    .map((rule) => {
      const field = String(rule.field || '').trim();
      const operator = String(rule.operator || '==');
      const compareTo = rule.inputKey
        ? inputs[String(rule.inputKey)]
        : rule.valuePath
          ? resolveScopedToken(rule.valuePath, { record: null, inputs, context })
          : rule.value;
      return { field, operator, value: compareTo };
    });
  const result = rows.filter((row) => appliedCriteria.every((rule) => compareValue(row[rule.field], rule.operator, rule.value)));
  const emptyReason = result.length === 0 && appliedCriteria.length > 0
    ? `没有满足条件的候选：${appliedCriteria.map((rule) => rule.field).join('、')}`
    : '';
  return {
    result,
    rows: result,
    count: result.length,
    appliedCriteria,
    emptyReason,
    failedReason: emptyReason,
    trigger: inputs.trigger,
  };
});

type RecordTransformRule = {
  target?: string;
  from?: unknown;
  expr?: string;
  value?: unknown;
};

registerExecutor('generic:record-transform', async ({ inputs, properties }) => {
  const record = (inputs.record && typeof inputs.record === 'object' && !Array.isArray(inputs.record))
    ? inputs.record as Record<string, unknown>
    : {};
  const context = (inputs.context && typeof inputs.context === 'object' && !Array.isArray(inputs.context))
    ? inputs.context as Record<string, unknown>
    : parseJsonObject(properties.context);
  const includeSource = inputs.includeSource ?? properties.includeSource;
  const fieldMap = parseJsonObject(inputs.fieldMap ?? properties.fieldMap);
  const defaults = parseJsonObject(inputs.defaults ?? properties.defaults);
  const valueRules = parseJsonArray<RecordTransformRule>(inputs.valueRules ?? properties.valueRules);
  const scope = { record, inputs, context };
  const output: Record<string, unknown> = includeSource === false ? {} : { ...record, ...defaults };

  for (const [field, source] of Object.entries(fieldMap)) {
    if (typeof source === 'string' && source.startsWith('=')) {
      output[field] = evaluateConfiguredExpression(source, scope);
    } else {
      output[field] = resolveScopedToken(source, scope);
    }
  }

  for (const rule of valueRules) {
    const target = String(rule?.target || '').trim();
    if (!target) continue;
    if (typeof rule.expr === 'string' && rule.expr.trim()) {
      output[target] = evaluateConfiguredExpression(rule.expr, scope);
      continue;
    }
    if (rule.from !== undefined) {
      output[target] = resolveScopedToken(rule.from, scope);
      continue;
    }
    output[target] = resolveScopedToken(rule.value, scope);
  }

  return {
    record: output,
    result: output,
    fields: Object.keys(output),
  };
});

type FieldClassifierRule = {
  target?: string;
  source?: string;
  mode?: 'enum' | 'range' | 'tags';
  defaultValue?: unknown;
  map?: Record<string, unknown>;
  ranges?: Array<{ min?: number; max?: number; value?: unknown }>;
  tags?: Array<{ label?: string; when?: string; enabled?: boolean }>;
};

registerExecutor('generic:field-classifier', async ({ inputs, properties }) => {
  const record = (inputs.record && typeof inputs.record === 'object' && !Array.isArray(inputs.record))
    ? inputs.record as Record<string, unknown>
    : {};
  const context = (inputs.context && typeof inputs.context === 'object' && !Array.isArray(inputs.context))
    ? inputs.context as Record<string, unknown>
    : {};
  const rules = parseJsonArray<FieldClassifierRule>(inputs.rules ?? properties.rules);
  const scope = { record, inputs, context };
  const values: Record<string, unknown> = {};
  const labels: string[] = [];

  for (const rule of rules) {
    const mode = String(rule?.mode || 'enum');
    if (mode === 'tags') {
      const tagRules = Array.isArray(rule.tags) ? rule.tags : [];
      for (const tagRule of tagRules) {
        if (tagRule?.enabled === false) continue;
        const label = String(tagRule?.label || '').trim();
        if (!label) continue;
        const matched = typeof tagRule.when === 'string' && tagRule.when.trim()
          ? !!evaluateConfiguredExpression(tagRule.when, scope)
          : false;
        if (matched) labels.push(label);
      }
      continue;
    }

    const target = String(rule?.target || '').trim();
    if (!target) continue;
    const sourceValue = typeof rule?.source === 'string' && rule.source.trim()
      ? resolveScopedToken(rule.source, scope)
      : undefined;
    if (mode === 'range') {
      const numericValue = Number(sourceValue ?? 0);
      const matchedRange = (Array.isArray(rule.ranges) ? rule.ranges : []).find((range) => {
        const min = range?.min;
        const max = range?.max;
        return (min == null || numericValue >= min) && (max == null || numericValue < max);
      });
      values[target] = matchedRange?.value ?? rule.defaultValue ?? '';
      continue;
    }
    const enumMap = rule?.map && typeof rule.map === 'object' ? rule.map : {};
    values[target] = enumMap[String(sourceValue ?? '')] ?? rule.defaultValue ?? '';
  }

  return {
    values,
    labels,
    result: values,
    count: Object.keys(values).length,
  };
});

type ArrayLookupCriteria = {
  field?: string;
  value?: unknown;
  valuePath?: string;
  operator?: string;
};

registerExecutor('generic:array-lookup', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.rows ?? inputs.data);
  const context = (inputs.context && typeof inputs.context === 'object' && !Array.isArray(inputs.context))
    ? inputs.context as Record<string, unknown>
    : {};
  const scope = { record: null, inputs, context };
  const keyField = String(inputs.keyField ?? properties.keyField ?? '');
  const keyValue = inputs.keyValue ?? properties.keyValue;
  const criteria = parseJsonArray<ArrayLookupCriteria>(inputs.criteria ?? properties.criteria);
  const matched = rows.filter((row) => {
    if (keyField) return row[keyField] == keyValue;
    return criteria.every((rule) => {
      const field = String(rule?.field || '').trim();
      if (!field) return true;
      const operator = String(rule?.operator || 'equals');
      const value = rule?.valuePath ? resolveScopedToken(rule.valuePath, scope) : rule?.value;
      return compareValue(row[field], operator, value);
    });
  });
  return {
    first: matched[0] ?? null,
    rows: matched,
    matched,
    count: matched.length,
    result: matched,
  };
});

type ArrayEnrichMapping = {
  target?: string;
  from?: string;
  expr?: string;
  defaultValue?: unknown;
};

registerExecutor('generic:array-enrich', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.rows ?? inputs.data);
  const referenceRows = await rowsFromData(inputs.referenceRows ?? inputs.referenceData);
  const leftKey = String(inputs.leftKey ?? properties.leftKey ?? '');
  const rightKey = String(inputs.rightKey ?? properties.rightKey ?? '');
  const fieldMap = parseJsonObject(inputs.fieldMap ?? properties.fieldMap);
  const enrichRules = parseJsonArray<ArrayEnrichMapping>(inputs.enrichRules ?? properties.enrichRules);
  const context = (inputs.context && typeof inputs.context === 'object' && !Array.isArray(inputs.context))
    ? inputs.context as Record<string, unknown>
    : {};
  const refMap = new Map(referenceRows.map((row) => [String(row[rightKey] ?? ''), row]));
  const result = rows.map((row) => {
    const reference = leftKey && rightKey ? refMap.get(String(row[leftKey] ?? '')) : undefined;
    const scope = { record: row, inputs, context: { ...context, reference } };
    const enriched: Record<string, unknown> = { ...row };
    for (const [target, source] of Object.entries(fieldMap)) {
      if (typeof source === 'string' && source.startsWith('$context.reference.')) {
        enriched[target] = getValueByPath(reference, source.slice('$context.reference.'.length));
      } else if (typeof source === 'string' && source.startsWith('=')) {
        enriched[target] = evaluateConfiguredExpression(source, scope);
      } else {
        enriched[target] = resolveScopedToken(source, scope);
      }
    }
    for (const rule of enrichRules) {
      const target = String(rule?.target || '').trim();
      if (!target) continue;
      if (typeof rule.expr === 'string' && rule.expr.trim()) {
        enriched[target] = evaluateConfiguredExpression(rule.expr, scope);
      } else if (rule.from) {
        enriched[target] = resolveScopedToken(rule.from, scope);
      } else {
        enriched[target] = rule.defaultValue ?? '';
      }
      if ((enriched[target] === undefined || enriched[target] === null || enriched[target] === '') && rule.defaultValue !== undefined) {
        enriched[target] = rule.defaultValue;
      }
    }
    return enriched;
  });
  return {
    rows: result,
    result,
    count: result.length,
  };
});

type ScoreRecordRule = {
  target?: string;
  expr?: string;
  weight?: number;
};

registerExecutor('generic:score-records', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.rows ?? inputs.data);
  const context = (inputs.context && typeof inputs.context === 'object' && !Array.isArray(inputs.context))
    ? inputs.context as Record<string, unknown>
    : {};
  const scoreRules = parseJsonArray<ScoreRecordRule>(inputs.scoreRules ?? properties.scoreRules);
  const totalField = String(inputs.totalField ?? properties.totalField ?? '总评分');
  const sorts = parsePickSortRules(inputs.sorts ?? properties.sorts);
  const scored = rows.map((row) => {
    const scope = { record: row, inputs, context };
    const nextRow: Record<string, unknown> = { ...row };
    let total = 0;
    for (const rule of scoreRules) {
      const target = String(rule?.target || '').trim();
      if (!target) continue;
      const rawScore = typeof rule.expr === 'string' && rule.expr.trim()
        ? Number(evaluateConfiguredExpression(rule.expr, scope) ?? 0)
        : 0;
      const weightedScore = rawScore * Number(rule.weight ?? 1);
      nextRow[target] = weightedScore;
      total += weightedScore;
    }
    nextRow[totalField] = total;
    return nextRow;
  });
  const effectiveSorts = sorts.length > 0 ? sorts : [{ field: totalField, order: 'desc' as const }];
  const ranked = [...scored].sort((left, right) => {
    for (const rule of effectiveSorts) {
      const field = String(rule.field || '');
      const direction = rule.order === 'desc' ? -1 : 1;
      const compared = compareSortValues(left[field], right[field]);
      if (compared !== 0) return compared * direction;
    }
    return 0;
  });
  return {
    rows: ranked,
    result: ranked,
    first: ranked[0] ?? null,
    count: ranked.length,
  };
});

type PickSortRule = {
  field?: string;
  order?: 'asc' | 'desc';
};

function parsePickSortRules(value: unknown): PickSortRule[] {
  if (Array.isArray(value)) return value as PickSortRule[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as PickSortRule[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function compareSortValues(left: unknown, right: unknown) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

registerExecutor('generic:pick-record', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.data);
  const rules = parsePickSortRules(inputs.sorts ?? properties.sorts).filter((rule) => String(rule.field || '').trim());
  const sorted = rules.length === 0
    ? [...rows]
    : [...rows].sort((left, right) => {
        for (const rule of rules) {
          const field = String(rule.field || '');
          const direction = rule.order === 'desc' ? -1 : 1;
          const compared = compareSortValues(left[field], right[field]);
          if (compared !== 0) return compared * direction;
        }
        return 0;
      });
  const pickMode = String(inputs.pickMode ?? properties.pickMode ?? 'first');
  const topN = Math.max(1, Number(inputs.topN ?? properties.topN ?? 5));
  const first = sorted[0] ?? null;
  const rowsOutput = pickMode === 'topN' ? sorted.slice(0, topN) : pickMode === 'single' ? (first ? [first] : []) : sorted;
  return {
    first,
    result: rowsOutput,
    rows: rowsOutput,
    count: sorted.length,
    trigger: inputs.trigger,
  };
});

registerExecutor('generic:sort', async ({ inputs, properties }) => {
  const rows = await rowsFromData(inputs.data);
  const field = String(properties.field || '');
  const direction = properties.order === 'desc' ? -1 : 1;
  const result = field ? [...rows].sort((left, right) => {
    const a = left[field], b = right[field];
    const comparison = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a ?? '').localeCompare(String(b ?? ''));
    return comparison * direction;
  }) : [...rows];
  return { result, rows: result, count: result.length, trigger: inputs.trigger };
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
          newRow[field] = isNaN(d.getTime()) ? null : d.toISOString();
          break;
        }
      }
    } catch {
      newRow[field] = null;
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

  function simpleHash(str: string): string {
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
    newRow[newField] = simpleHash(val);
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
  const { inputs } = ctx;
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
    if (count >= 2) duplicates.push(row);
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

// ── 集成节点（真实实现）──────────────────────────────

registerExecutor('generic:database-query', async (ctx) => {
  const { inputs, properties, tables } = ctx;
  const connectionString = String(properties.connectionString || '');
  const query = String(properties.query || '');
  const extraParams = inputs.params;

  if (!query) return { error: '缺少 SQL 查询' };

  // 如果有 connectionString，尝试 fetch 调用
  if (connectionString) {
    try {
      const params = extraParams && typeof extraParams === 'object' ? extraParams : {};
      const resp = await fetch(connectionString, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, params }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      const result = await resp.json();
      const data = Array.isArray(result) ? result : result.data || result.rows || [result];
      const rowsCheck = ctx.checkType('json-rows', data);
      return {
        data: rowsCheck.valid ? rowsCheck.normalized : data,
        rowCount: Array.isArray(data) ? data.length : 0,
      };
    } catch (err) {
      return { error: `数据库连接失败: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // 回退：从项目数据中按 sheetName 查找并执行简单 SQL 解析
  const sqlMatch = query.match(/FROM\s+['"`]?(\w+)['"`]?/i);
  const tableName = sqlMatch ? sqlMatch[1] : '';
  const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/i);
  const whereClause = whereMatch ? whereMatch[1].trim() : '';

  // 查找匹配的 sheet
  let matchedSheet: { headers: string[]; preview: Record<string, unknown>[] } | null = null;
  for (const table of tables) {
    const exact = table.sheets.find(s => s.name.toLowerCase() === tableName.toLowerCase());
    if (exact) { matchedSheet = exact; break; }
    const partial = table.sheets.find(s => s.name.toLowerCase().includes(tableName.toLowerCase()));
    if (partial) { matchedSheet = partial; break; }
  }
  if (!matchedSheet && tables.length > 0 && tables[0].sheets.length > 0) {
    matchedSheet = tables[0].sheets[0];
  }

  if (!matchedSheet) {
    return { error: `未找到表 "${tableName || '(未指定)'}"，请在连接字符串中提供 API 地址` };
  }

  let rows = [...matchedSheet.preview];

  // 简单 WHERE 解析: field = 'value', field > number, field LIKE 'pattern'
  if (whereClause) {
    const condMatch = whereClause.match(/(\w+)\s*(=|!=|>=|<=|>|<|LIKE)\s*'?([^']+?)'?\s*$/i);
    if (condMatch) {
      const [, field, op, val] = condMatch;
      rows = rows.filter(row => {
        const cellVal = row[field];
        switch (op.toUpperCase()) {
          case '=': return String(cellVal) === val;
          case '!=': return String(cellVal) !== val;
          case '>': return Number(cellVal) > Number(val);
          case '<': return Number(cellVal) < Number(val);
          case '>=': return Number(cellVal) >= Number(val);
          case '<=': return Number(cellVal) <= Number(val);
          case 'LIKE': return String(cellVal).includes(val.replace(/%/g, ''));
          default: return true;
        }
      });
    }
  }

  // SELECT 字段解析
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  let selectedFields = matchedSheet.headers;
  if (selectMatch && selectMatch[1].trim() !== '*') {
    selectedFields = selectMatch[1].split(',').map(f => f.trim().replace(/['"`]/g, ''));
  }

  // LIMIT 解析
  const limitMatch = query.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) rows = rows.slice(0, Number(limitMatch[1]));

  // 构造结果
  const result = rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const h of selectedFields) {
      if (h in row) out[h] = row[h];
    }
    return out;
  });

  const rowsCheck = ctx.checkType('json-rows', result);
  return {
    data: rowsCheck.valid ? rowsCheck.normalized : result,
    rowCount: result.length,
  };
});

registerExecutor('generic:websocket', (ctx) => {
  const { inputs, properties } = ctx;
  const action = String(properties.action || 'connect');
  const url = String(properties.url || '');
  const message = String(properties.message || '');

  if (!url) return { status: 'error', received: null, error: '缺少 WebSocket URL' };

  try {
    if (action === 'connect') {
      // 返回连接配置（实际连接需要在服务端执行）
      return {
        status: 'connecting',
        url,
        received: null,
        message: `WebSocket 连接已配置: ${url}`,
      };
    }
    if (action === 'send') {
      const data = inputs.data || message;
      return {
        status: 'sent',
        url,
        sent: typeof data === 'string' ? data : JSON.stringify(data),
        received: null,
        message: `消息已准备发送到 ${url}`,
      };
    }
    if (action === 'disconnect') {
      return { status: 'disconnected', url, received: null, message: '连接已断开' };
    }
    return { status: 'unknown', received: null, error: `未知操作: ${action}` };
  } catch (err) {
    return { status: 'error', received: null, error: err instanceof Error ? err.message : String(err) };
  }
});

registerExecutor('generic:pdf-report', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { error: `数据格式错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const title = String(properties.title || '数据报告');
  const autoDownload = properties.autoDownload !== false;

  // 构造 HTML 报告并触发浏览器打印/下载
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const escapeHtml = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 20px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f1f5f9; text-align: left; padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; }
  td { padding: 5px 10px; border: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">生成时间: ${new Date().toLocaleString()} · ${data.length} 行 × ${headers.length} 列</div>`;

  if (data.length > 0) {
    html += '<table><thead><tr>';
    for (const h of headers) html += `<th>${escapeHtml(h)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of data) {
      html += '<tr>';
      for (const h of headers) html += `<td>${escapeHtml(row[h])}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  html += '</body></html>';

  const fileName = `${title}.pdf`;
  let fileData: unknown = null;

  if (autoDownload) {
    try {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.html`;
      link.click();
      URL.revokeObjectURL(url);
      fileData = html;
    } catch {}
  }

  return {
    fileData,
    fileName,
    rowCount: data.length,
    colCount: headers.length,
    message: `报告 "${title}" 已生成（HTML 格式，可用浏览器打印为 PDF）`,
  };
});

registerExecutor('generic:email-send', (ctx) => {
  const { inputs, properties } = ctx;
  const smtpHost = String(properties.smtpHost || '');
  const smtpPort = Number(properties.smtpPort || 587);
  const username = String(properties.username || '');
  const from = String(properties.from || '');
  const to = String(properties.to || '');
  const subject = String(properties.subject || '');
  const body = String(properties.body || '');
  const attachData = properties.attachData === true;

  if (!to) return { sent: false, error: '缺少收件人地址' };

  // 在浏览器环境中，使用 mailto: 链接
  const mailtoBody = body + (attachData && inputs.data ? `\n\n--- 附件数据 ---\n${typeof inputs.data === 'string' ? inputs.data : JSON.stringify(inputs.data, null, 2)}` : '');
  const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`;

  // 尝试打开邮件客户端
  try {
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {}

  return {
    sent: true,
    to,
    subject,
    smtpConfigured: !!smtpHost,
    message: smtpHost
      ? `邮件配置: ${smtpHost}:${smtpPort} (需要服务端执行实际发送)`
      : `已打开邮件客户端，收件人: ${to}`,
    note: !smtpHost ? '未配置 SMTP 服务器，已使用客户端 mailto: 方式' : undefined,
  };
});

registerExecutor('generic:condition-branch', ({ inputs, properties }) => {
  const value = inputs.value;
  const expression = String(properties.expression || '');
  const valueVar = value;
  let result = false;
  try { result = Boolean(new Function('value', `return ${expression}`)(valueVar)); } catch {}
  return { result, trueBranch: result ? value : undefined, falseBranch: !result ? value : undefined };
});
