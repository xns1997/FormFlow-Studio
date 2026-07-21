import { createHash } from 'node:crypto';

export type DataToolName = 'data_source.create' | 'data_source.import' | 'data_sheet.configure' | 'data_rows.batch';
export interface DataArgumentNormalization { path: string; from: string; to: string; reason: string; }
export interface DataPreflightError {
  code: string;
  message: string;
  path?: string;
  expectedShape: unknown;
  receivedShape: unknown;
  suggestedArguments?: Record<string, unknown>;
  normalizationsApplied: DataArgumentNormalization[];
}
export type DataToolPreflightResult =
  | { ok: true; arguments: Record<string, any>; normalizations: DataArgumentNormalization[] }
  | { ok: false; arguments: Record<string, any>; normalizations: DataArgumentNormalization[]; error: DataPreflightError };
export interface DataFailureFingerprint { value: string; toolName: string; code: string; path?: string; argumentShape: unknown; }

const DATA_TOOL_NAMES = new Set<DataToolName>(['data_source.create', 'data_source.import', 'data_sheet.configure', 'data_rows.batch']);
const TYPE_ALIASES: Record<string, string> = { integer: 'number', float: 'number', double: 'number', datetime: 'date', bool: 'boolean', text: 'string' };

function object(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function record(normalizations: DataArgumentNormalization[], path: string, from: string, to: string, reason: string) { normalizations.push({ path, from, to, reason }); }

function normalizeConfig(original: unknown, sheetName: string, normalizations: DataArgumentNormalization[]) {
  const config = structuredClone(object(original));
  const entries = Array.isArray(config.sheets) ? config.sheets.map(object) : [];
  const entry = entries.find((item) => String(item.name || '') === sheetName) || entries[0] || {};
  const nested = object(entry.config && typeof entry.config === 'object' ? entry.config : entry);
  if (entries.length) record(normalizations, 'config.sheets[0]', 'nested sheet config', 'config', '内联数据源只有一个 Sheet，合并到顶层配置');

  const keySource = config.keyFields !== undefined ? 'config.keyFields' : config.primaryKey !== undefined ? 'config.primaryKey' : config.key !== undefined ? 'config.key' : nested.keyFields !== undefined ? 'config.sheets[0].config.keyFields' : nested.primaryKey !== undefined ? 'config.sheets[0].config.primaryKey' : nested.key !== undefined ? 'config.sheets[0].config.key' : undefined;
  const keyFields = config.keyFields ?? config.primaryKey ?? config.key ?? nested.keyFields ?? nested.primaryKey ?? nested.key;
  if (keySource && keySource !== 'config.keyFields') record(normalizations, keySource, keySource.split('.').at(-1) || 'key', 'config.keyFields', '统一主键字段名称');

  const editableSource = nested.editable !== undefined ? 'config.sheets[0].config.editable' : nested.isEditable !== undefined ? 'config.sheets[0].config.isEditable' : config.editable !== undefined ? 'config.editable' : config.isEditable !== undefined ? 'config.isEditable' : undefined;
  const editable = nested.editable ?? nested.isEditable ?? config.editable ?? config.isEditable;
  if (editableSource && config.readOnly === undefined && nested.readOnly === undefined) record(normalizations, editableSource, 'editable', 'config.readOnly', 'readOnly 与 editable 语义相反');

  const columnsSource = Array.isArray(config.columns) ? config.columns : Array.isArray(nested.columns) ? nested.columns : [];
  const columns = columnsSource.map((value: unknown, index: number) => {
    const column = object(value); const next = { ...column };
    if (!next.name && next.id) { next.name = String(next.id); record(normalizations, `config.columns[${index}].id`, 'id', 'name', '统一列标识字段'); }
    if (!next.type && next.dataType) { next.type = String(next.dataType); record(normalizations, `config.columns[${index}].dataType`, 'dataType', 'type', '统一列类型字段'); }
    if (next.type && TYPE_ALIASES[String(next.type).toLowerCase()]) { const before = String(next.type); next.type = TYPE_ALIASES[before.toLowerCase()]; record(normalizations, `config.columns[${index}].type`, before, next.type, '规范化列类型别名'); }
    delete next.id; delete next.dataType; return next;
  });
  const next = { ...nested, ...config, ...(keyFields !== undefined ? { keyFields: Array.isArray(keyFields) ? keyFields.map(String) : [String(keyFields)] } : {}), ...(columns.length ? { columns } : {}), readOnly: config.readOnly ?? nested.readOnly ?? (typeof editable === 'boolean' ? !editable : undefined) };
  delete next.sheets; delete next.primaryKey; delete next.key; delete next.editable; delete next.isEditable;
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return next;
}

function looksLikeFieldDefinitions(rows: unknown[]) {
  return rows.length > 0 && rows.every((value) => { const row = object(value); const markers = ['fieldId', 'title', 'type', 'isKey'].filter((key) => key in row); return markers.length >= 2 && ('fieldId' in row || 'title' in row); });
}

function fieldDefinitionSuggestion(args: Record<string, any>, rows: unknown[]) {
  const definitions = rows.map(object); const columns = definitions.map((item) => ({ name: String(item.fieldId || item.name || item.title || ''), ...(item.title ? { title: String(item.title) } : {}), type: TYPE_ALIASES[String(item.type || 'string').toLowerCase()] || String(item.type || 'string') })).filter((item) => item.name);
  const keys = definitions.filter((item) => item.isKey === true).map((item) => String(item.fieldId || item.name || item.title || '')).filter(Boolean);
  return { ...args, rows: [], config: { ...object(args.config), columns, ...(keys.length ? { keyFields: keys } : {}) } };
}

function receivedShape(args: Record<string, any>) {
  return { keys: Object.keys(args).sort(), rows: Array.isArray(args.rows) ? args.rows.length ? looksLikeFieldDefinitions(args.rows) ? 'field_definitions' : 'business_records' : 'empty' : typeof args.rows, configKeys: Object.keys(object(args.config)).sort() };
}

function failure(argumentsValue: Record<string, any>, normalizations: DataArgumentNormalization[], code: string, message: string, path: string | undefined, expectedShape: unknown, suggestion?: Record<string, unknown>): DataToolPreflightResult {
  return { ok: false, arguments: argumentsValue, normalizations, error: { code, message, path, expectedShape, receivedShape: receivedShape(argumentsValue), suggestedArguments: suggestion, normalizationsApplied: normalizations } };
}

function compileSource(name: 'data_source.create' | 'data_source.import', original: Record<string, any>) {
  const normalizations: DataArgumentNormalization[] = []; const args = structuredClone(original); args.config = normalizeConfig(args.config, String(args.sheetName || 'Sheet1'), normalizations);
  const rows = args.rows;
  if (Array.isArray(rows) && looksLikeFieldDefinitions(rows)) return failure(args, normalizations, 'DATA_ROWS_LOOK_LIKE_SCHEMA', 'rows 看起来是字段定义而不是业务记录；请改用 config.columns', 'rows', { rows: [{ columnName: '业务值' }], config: { columns: [{ name: 'columnName', type: 'string' }], keyFields: ['columnName'], readOnly: false } }, fieldDefinitionSuggestion(args, rows));
  const hasFile = typeof args.fileId === 'string' && args.fileId.length > 0; const hasCsv = typeof args.csv === 'string'; const hasRows = Array.isArray(rows); const columns = Array.isArray(args.config.columns) ? args.config.columns : [];
  if (!hasFile && !hasCsv && !hasRows && !columns.length) return failure(args, normalizations, 'DATA_SOURCE_INPUT_REQUIRED', '必须提供 fileId、csv、业务 rows 或 config.columns', 'rows', { oneOf: ['fileId', 'csv', 'rows', 'config.columns'] });
  if (hasRows && rows.length === 0 && !columns.length) return failure(args, normalizations, 'DATA_COLUMNS_REQUIRED', '空 rows 必须同时提供 config.columns', 'config.columns', { config: { columns: [{ name: 'id', type: 'string' }], keyFields: ['id'] } });
  const keys: string[] = Array.isArray(args.config.keyFields) ? args.config.keyFields.map(String) : [];
  if (args.config.readOnly !== true && !keys.length) return failure(args, normalizations, 'DATA_KEY_REQUIRED', '可编辑 Sheet 必须配置 config.keyFields', 'config.keyFields', { config: { keyFields: ['id'], readOnly: false } });
  const available = new Set<string>([...columns.map((item: any) => String(item.name || '')).filter(Boolean), ...(hasRows ? rows.flatMap((row: any) => Object.keys(object(row))) : [])]);
  const missing = keys.filter((key) => available.size > 0 && !available.has(key));
  if (missing.length) return failure(args, normalizations, 'DATA_KEY_FIELD_MISSING', `主键列不存在：${missing.join('、')}`, 'config.keyFields', { availableColumns: [...available], config: { ...args.config, keyFields: [...available].slice(0, 1) } });
  if (hasRows && keys.length) {
    const blank = rows.findIndex((row: any) => keys.some((key) => object(row)[key] === '' || object(row)[key] == null));
    if (blank >= 0) return failure(args, normalizations, 'DATA_KEY_VALUE_EMPTY', `第 ${blank + 1} 行主键不能为空`, `rows[${blank}]`, { keyFields: keys });
    const seen = new Set<string>(); for (let index = 0; index < rows.length; index += 1) { const value = JSON.stringify(keys.map((key) => object(rows[index])[key])); if (seen.has(value)) return failure(args, normalizations, 'DATA_KEY_VALUE_DUPLICATE', `第 ${index + 1} 行主键重复`, `rows[${index}]`, { keyFields: keys }); seen.add(value); }
  }
  return { ok: true as const, arguments: args, normalizations };
}

export function compileDataToolArguments(name: string, original: Record<string, any>): DataToolPreflightResult {
  if (!DATA_TOOL_NAMES.has(name as DataToolName)) return { ok: true, arguments: structuredClone(original), normalizations: [] };
  if (name === 'data_source.create' || name === 'data_source.import') return compileSource(name, original);
  const normalizations: DataArgumentNormalization[] = []; const args = structuredClone(original);
  if (name === 'data_sheet.configure') args.config = normalizeConfig(args.config, String(args.sheetName || 'Sheet1'), normalizations);
  if (name === 'data_rows.batch') {
    const changes = ['adds', 'updates', 'deletes'].flatMap((key) => Array.isArray(args[key]) ? args[key] : []);
    if (!changes.length) return failure(args, normalizations, 'DATA_BATCH_EMPTY', '批量写回至少需要一项 adds、updates 或 deletes', undefined, { adds: [], updates: [{ rowKey: 'key:...', changes: {} }], deletes: [] });
    if (changes.length > 1000) return failure(args, normalizations, 'DATA_BATCH_LIMIT_EXCEEDED', '单次批量写回最多 1000 个变更', undefined, { maxChanges: 1000 });
  }
  return { ok: true, arguments: args, normalizations };
}

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, shape(entry)]));
  return typeof value;
}

export function dataFailureFingerprint(toolName: string, error: { code?: string; path?: string }, argumentsValue: Record<string, any>): DataFailureFingerprint {
  const argumentShape = shape(argumentsValue); const code = String(error.code || 'TOOL_FAILED'); const path = error.path ? String(error.path) : undefined;
  const value = createHash('sha256').update(JSON.stringify({ toolName, code, path, argumentShape })).digest('hex').slice(0, 20);
  return { value, toolName, code, path, argumentShape };
}

export function hasRepeatedDataFailure(events: Array<{ data?: any }>, taskId: string, fingerprint: string) {
  return events.some((event) => event.data?.taskId === taskId && event.data?.failureFingerprint === fingerprint);
}
