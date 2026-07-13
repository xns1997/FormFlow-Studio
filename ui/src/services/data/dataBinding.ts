import type { DataBindingConfig, DataBindingValueMode, RangeRef } from '../../models';
import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { getRuntimeComponentType } from '../config/controlTypes';
import { resolveRange } from './rangeResolver';
import { resolveSingleKeyField } from './tableKeys';

type LegacyTableBinding = { tableId?: string; sheetName?: string; keyField?: string; keyValue?: unknown; column?: string };

export function normalizeDataBinding(component: Pick<DesignComponent, 'type' | 'props'>): DataBindingConfig | null {
  const configured = component.props.dataBinding;
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    const binding = configured as DataBindingConfig;
    if (binding.version === 1 && binding.source?.kind) return binding;
  }
  const table = component.props.tableBinding as LegacyTableBinding | undefined;
  if (table?.tableId && table.sheetName && table.column) {
    return { version: 1, source: { kind: 'tableCell', tableId: table.tableId, sheetName: table.sheetName, column: table.column, keyField: table.keyField, keyValue: table.keyValue }, direction: 'twoWay', valueMode: 'firstCell' };
  }
  const range = component.props.rangeRef as RangeRef | null | undefined;
  if (range?.tableId && range.sheetName) return { version: 1, source: { kind: 'range', ref: range }, direction: 'dataToUi', valueMode: 'auto' };
  return null;
}

export function canBindingRead(binding: DataBindingConfig | null) {
  return !!binding && binding.direction !== 'uiToData';
}

export function canBindingWrite(binding: DataBindingConfig | null) {
  return !!binding && binding.direction !== 'dataToUi' && binding.source.kind === 'tableCell';
}

function automaticMode(component: Pick<DesignComponent, 'type' | 'props'>): DataBindingValueMode {
  const runtimeType = getRuntimeComponentType(component.type);
  if (runtimeType === 'table' || runtimeType === 'custom') return 'table';
  if (runtimeType === 'checkbox' || runtimeType === 'tagInput' || runtimeType === 'upload' || runtimeType === 'imageUpload' || (runtimeType === 'select' && component.props.multiple)) return 'column';
  return 'firstCell';
}

function selectRangeValue(data: unknown[][], mode: DataBindingValueMode) {
  if (mode === 'table') return data;
  if (mode === 'firstRow') return data[0] || [];
  if (mode === 'column') return data.map((row) => row[0]).filter((value) => value !== undefined);
  return data[0]?.[0];
}

export function resolveDataBindingValue(component: Pick<DesignComponent, 'type' | 'props'>, tables: SrcTableEntry[], formValues: Record<string, unknown> = {}) {
  const binding = normalizeDataBinding(component);
  if (!canBindingRead(binding)) return { found: false as const, binding, value: undefined, diagnostic: null as string | null };
  const source = binding!.source;
  if (source.kind === 'none') return { found: false as const, binding, value: binding!.defaultValue, diagnostic: null as string | null };
  if (source.kind === 'formField') {
    const found = Object.prototype.hasOwnProperty.call(formValues, source.path);
    return { found, binding, value: found ? formValues[source.path] : binding!.defaultValue, diagnostic: found ? null : `字段 ${source.path} 不存在` };
  }
  if (source.kind === 'range') {
    const resolved = resolveRange(source.ref, tables);
    if (!resolved) return { found: false as const, binding, value: binding!.defaultValue, diagnostic: '数据范围已失效' };
    const mode = binding!.valueMode === 'auto' || !binding!.valueMode ? automaticMode(component) : binding!.valueMode;
    return { found: true as const, binding, value: selectRangeValue(resolved.data, mode), diagnostic: null };
  }
  const sheet = tables.find((table) => table.id === source.tableId)?.sheets.find((item) => item.name === source.sheetName);
  if (!sheet) return { found: false as const, binding, value: binding!.defaultValue, diagnostic: '数据表或工作表已失效' };
  const keyField = source.keyField || resolveSingleKeyField(tables, source.tableId, source.sheetName);
  if (!keyField) return { found: false as const, binding, value: binding!.defaultValue, diagnostic: '写回需要唯一键字段' };
  const matches = sheet.preview.filter((row) => row[keyField] === source.keyValue);
  if (matches.length !== 1) return { found: false as const, binding, value: binding!.defaultValue, diagnostic: matches.length ? '定位键不唯一' : '未找到绑定记录' };
  return { found: true as const, binding, value: matches[0][source.column], diagnostic: null };
}

export function resolveBindingWrite(component: Pick<DesignComponent, 'type' | 'props'>, tables: SrcTableEntry[], value: unknown) {
  const binding = normalizeDataBinding(component);
  if (!canBindingWrite(binding) || binding!.source.kind !== 'tableCell') return { ok: false as const, diagnostic: binding?.source.kind === 'none' ? null : binding ? '当前绑定方向不允许写回' : null };
  const source = binding!.source;
  const keyField = source.keyField || resolveSingleKeyField(tables, source.tableId, source.sheetName);
  if (!keyField) return { ok: false as const, diagnostic: '写回需要唯一键字段' };
  const sheet = tables.find((table) => table.id === source.tableId)?.sheets.find((item) => item.name === source.sheetName);
  const matches = sheet?.preview.filter((row) => row[keyField] === source.keyValue) || [];
  if (matches.length !== 1) return { ok: false as const, diagnostic: matches.length ? '定位键不唯一' : '未找到绑定记录' };
  return { ok: true as const, write: { tableId: source.tableId, sheetName: source.sheetName, keyField, keyValue: source.keyValue, column: source.column, value } };
}
