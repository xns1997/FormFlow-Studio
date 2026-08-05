import { createHash } from 'node:crypto';
import { COLUMN_TYPE_ALIASES, normalizeColumnType } from '../../../shared/formflow-core/columnTypes';
import {
  compileToolArgumentsPipeline,
  shape,
  type ToolDomainHooks,
  type ToolPreflightError,
} from './tool-argument-contract';

export type DataToolName = 'data_source.create' | 'data_source.import' | 'data_sheet.configure' | 'data_rows.batch';
export type DataArgumentNormalization = { path: string; action: string; from: string; to: string; reason: string };
export type DataPreflightError = ToolPreflightError & { normalizationsApplied: DataArgumentNormalization[] };
export type DataToolPreflightResult =
  | { ok: true; arguments: Record<string, any>; normalizations: DataArgumentNormalization[] }
  | { ok: false; arguments: Record<string, any>; normalizations: DataArgumentNormalization[]; error: DataPreflightError };
export interface DataFailureFingerprint { value: string; toolName: string; code: string; path?: string; argumentShape: unknown; }

const DATA_TOOL_NAMES = new Set<DataToolName>(['data_source.create', 'data_source.import', 'data_sheet.configure', 'data_rows.batch']);
function object(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function record(normalizations: DataArgumentNormalization[], path: string, from: string, to: string, reason: string) { normalizations.push({ path, from, to, reason, action: reason }); }

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
    if (next.type) { const before = String(next.type); const aliased = COLUMN_TYPE_ALIASES[before.toLowerCase()]; if (aliased) { next.type = aliased; record(normalizations, `config.columns[${index}].type`, before, aliased, '规范化列类型别名'); } }
    delete next.id; delete next.dataType; return next;
  });
  const next: Record<string, any> = { ...nested, ...config, ...(keyFields !== undefined ? { keyFields: Array.isArray(keyFields) ? keyFields.map(String) : [String(keyFields)] } : {}), ...(columns.length ? { columns } : {}), readOnly: config.readOnly ?? nested.readOnly ?? (typeof editable === 'boolean' ? !editable : undefined) };
  delete next.sheets; delete next.primaryKey; delete next.key; delete next.editable; delete next.isEditable;
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return next;
}

function looksLikeFieldDefinitions(rows: unknown[]) {
  return rows.length > 0 && rows.every((value) => { const row = object(value); const markers = ['fieldId', 'title', 'type', 'isKey'].filter((key) => key in row); return markers.length >= 2 && ('fieldId' in row || 'title' in row); });
}

function fieldDefinitionSuggestion(args: Record<string, any>, rows: unknown[]) {
  const definitions = rows.map(object); const columns = definitions.map((item) => ({ name: String(item.fieldId || item.name || item.title || ''), ...(item.title ? { title: String(item.title) } : {}), type: normalizeColumnType(item.type || 'string') })).filter((item) => item.name);
  const keys = definitions.filter((item) => item.isKey === true).map((item) => String(item.fieldId || item.name || item.title || '')).filter(Boolean);
  return { ...args, rows: [], config: { ...object(args.config), columns, ...(keys.length ? { keyFields: keys } : {}) } };
}

function receivedShape(args: Record<string, any>) {
  return { keys: Object.keys(args).sort(), rows: Array.isArray(args.rows) ? args.rows.length ? looksLikeFieldDefinitions(args.rows) ? 'field_definitions' : 'business_records' : 'empty' : typeof args.rows, configKeys: Object.keys(object(args.config)).sort() };
}

function failure(argumentsValue: Record<string, any>, normalizations: DataArgumentNormalization[], code: string, message: string, path: string | undefined, expectedShape: unknown, suggestion?: Record<string, unknown>): ToolPreflightError {
  return { code, message, path, expectedShape, receivedShape: receivedShape(argumentsValue), suggestedArguments: suggestion, normalizationsApplied: normalizations };
}

function normalizeDataToolArguments(name: string, original: Record<string, any>): { arguments: Record<string, any>; normalizations: DataArgumentNormalization[] } | undefined {
  if (!DATA_TOOL_NAMES.has(name as DataToolName)) return undefined;
  const normalizations: DataArgumentNormalization[] = [];
  const args = structuredClone(original);
  if (name === 'data_source.create' || name === 'data_source.import' || name === 'data_sheet.configure') {
    args.config = normalizeConfig(args.config, String(args.sheetName || 'Sheet1'), normalizations);
  }
  if (name === 'data_source.create' || name === 'data_source.import') {
    const rows = args.rows;
    const hasRows = Array.isArray(rows);
    const columns = Array.isArray(args.config.columns) ? args.config.columns : [];
    const available = new Set<string>([...columns.map((item: any) => String(item.name || '')).filter(Boolean), ...(hasRows ? rows.flatMap((row: any) => Object.keys(object(row))) : [])]);
    const keys: string[] = Array.isArray(args.config.keyFields) ? args.config.keyFields.map(String) : [];
    if (args.config.readOnly !== true && !keys.length) {
      const candidate = [...available].find((columnName) => /编号|id|code|号/i.test(columnName)) || ([...available].length === 1 ? [...available][0] : undefined);
      if (candidate) {
        args.config = { ...args.config, keyFields: [candidate], readOnly: false };
        record(normalizations, 'config.keyFields', '（缺失）', candidate, '自动推断主键（可编辑表必须有主键）');
      }
    }
  }
  return { arguments: args, normalizations };
}

function validateDataToolArguments(name: string, args: Record<string, any>, normalizations: DataArgumentNormalization[]): ToolPreflightError | undefined {
  if (!DATA_TOOL_NAMES.has(name as DataToolName)) return undefined;
  if (name === 'data_source.create' || name === 'data_source.import') {
    const rows = args.rows;
    if (Array.isArray(rows) && looksLikeFieldDefinitions(rows)) return failure(args, normalizations, 'DATA_ROWS_LOOK_LIKE_SCHEMA', 'rows 看起来是字段定义而不是业务记录；请改用 config.columns', 'rows', { rows: [{ columnName: '业务值' }], config: { columns: [{ name: 'columnName', type: 'string' }], keyFields: ['columnName'], readOnly: false } }, fieldDefinitionSuggestion(args, rows));
    const hasFile = typeof args.fileId === 'string' && args.fileId.length > 0; const hasCsv = typeof args.csv === 'string'; const hasRows = Array.isArray(rows); const columns = Array.isArray(args.config.columns) ? args.config.columns : [];
    const suppliedSources = [hasFile ? 'fileId' : '', hasCsv ? 'csv' : '', hasRows ? 'rows' : ''].filter(Boolean);
    if (suppliedSources.length > 1) return failure(args, normalizations, 'DATA_SOURCE_INPUT_AMBIGUOUS', `fileId、csv、rows 只能提供一种；当前同时提供了 ${suppliedSources.join('、')}`, suppliedSources[1], { exactlyOneOf: ['fileId', 'csv', 'rows', 'config.columns（仅空表）'] });
    if (!hasFile && !hasCsv && !hasRows && !columns.length) return failure(args, normalizations, 'DATA_SOURCE_INPUT_REQUIRED', '必须提供 fileId、csv、业务 rows 或 config.columns', 'rows', { oneOf: ['fileId', 'csv', 'rows', 'config.columns'] });
    if (hasRows && rows.length === 0 && !columns.length) return failure(args, normalizations, 'DATA_COLUMNS_REQUIRED', '空 rows 必须同时提供 config.columns', 'config.columns', { config: { columns: [{ name: 'id', type: 'string' }], keyFields: ['id'] } });
    const keys: string[] = Array.isArray(args.config.keyFields) ? args.config.keyFields.map(String) : [];
    const available = new Set<string>([...columns.map((item: any) => String(item.name || '')).filter(Boolean), ...(hasRows ? rows.flatMap((row: any) => Object.keys(object(row))) : [])]);
    if (args.config.readOnly !== true && !keys.length) return failure(args, normalizations, 'DATA_KEY_REQUIRED', '可编辑 Sheet 必须配置 config.keyFields', 'config.keyFields', { availableColumns: [...available], config: { keyFields: ['id'], readOnly: false } });
    const missing = keys.filter((key) => available.size > 0 && !available.has(key));
    if (missing.length) return failure(args, normalizations, 'DATA_KEY_FIELD_MISSING', `主键列不存在：${missing.join('、')}`, 'config.keyFields', { availableColumns: [...available], config: { ...args.config, keyFields: [...available].slice(0, 1) } });
    if (hasRows && keys.length) {
      const blank = rows.findIndex((row: any) => keys.some((key) => object(row)[key] === '' || object(row)[key] == null));
      if (blank >= 0) return failure(args, normalizations, 'DATA_KEY_VALUE_EMPTY', `第 ${blank + 1} 行主键不能为空`, `rows[${blank}]`, { keyFields: keys });
      const seen = new Set<string>(); for (let index = 0; index < rows.length; index += 1) { const value = JSON.stringify(keys.map((key) => object(rows[index])[key])); if (seen.has(value)) return failure(args, normalizations, 'DATA_KEY_VALUE_DUPLICATE', `第 ${index + 1} 行主键重复`, `rows[${index}]`, { keyFields: keys }); seen.add(value); }
    }
    return undefined;
  }
  if (name === 'data_rows.batch') {
    const changes = ['adds', 'updates', 'deletes'].flatMap((key) => Array.isArray(args[key]) ? args[key] : []);
    if (!changes.length) return failure(args, normalizations, 'DATA_BATCH_EMPTY', '批量写回至少需要一项 adds、updates 或 deletes', undefined, { adds: [], updates: [{ rowKey: 'key:...', changes: {} }], deletes: [] });
    if (changes.length > 1000) return failure(args, normalizations, 'DATA_BATCH_LIMIT_EXCEEDED', '单次批量写回最多 1000 个变更', undefined, { maxChanges: 1000 });
  }
  return undefined;
}

/**
 * Data-domain hooks for the unified argument pipeline: config normalization
 * (sheets merge, key fields, editable/readOnly inversion, column aliases) and
 * source/key-integrity validation.
 */
export const dataToolDomainHooks: ToolDomainHooks = {
  normalize: normalizeDataToolArguments,
  validate(name, args, normalizations) {
    return validateDataToolArguments(name, args, normalizations as DataArgumentNormalization[]);
  },
};

/** Wrapper kept for tests and callers that preflight data arguments directly. */
export function compileDataToolArguments(name: string, original: Record<string, any>): DataToolPreflightResult {
  return compileToolArgumentsPipeline(name, original, undefined, dataToolDomainHooks) as DataToolPreflightResult;
}

/** 数据失败指纹（工具/错误码/参数）。 */
export function dataFailureFingerprint(toolName: string, error: { code?: string; path?: string }, argumentsValue: Record<string, any>): DataFailureFingerprint {
  const argumentShape = shape(argumentsValue); const code = String(error.code || 'TOOL_FAILED'); const path = error.path ? String(error.path) : undefined;
  const value = createHash('sha256').update(JSON.stringify({ toolName, code, path, argumentShape })).digest('hex').slice(0, 20);
  return { value, toolName, code, path, argumentShape };
}

/** 同一失败指纹是否反复出现。 */
export function hasRepeatedDataFailure(events: Array<{ data?: any }>, taskId: string, fingerprint: string) {
  return events.some((event) => event.data?.taskId === taskId && event.data?.failureFingerprint === fingerprint);
}
