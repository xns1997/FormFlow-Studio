import React, { useEffect, useState } from 'react';
import { AntdSelectInput, AntdTextAreaInput, AntdTextInput } from '../../../components/AntdFormControls';
import type { PropertyEditorContext } from '../propertyEditorRegistry';
import type { DataBindingConfig, DataBindingSource, RangeRef } from '../../../models';
import { useProjectStore } from '../../../project/store';
import RangeSelector from '../../../components/RangeSelector';
import { rangeToAddress } from '../../../services/data/rangeResolver';

interface OptionRow { label: string; value: string }

export function OptionsVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: OptionRow[]) => void; onValidity: (valid: boolean) => void }) {
  const rows: OptionRow[] = Array.isArray(value) ? value.map((item) => typeof item === 'object' && item ? { label: String((item as any).label ?? ''), value: String((item as any).value ?? '') } : { label: String(item), value: String(item) }) : [];
  const [paste, setPaste] = useState('');
  const duplicates = rows.filter((row, index) => !row.value || rows.findIndex((other) => other.value === row.value) !== index);
  useEffect(() => onValidity(duplicates.length === 0), [duplicates.length, onValidity]);
  const update = (index: number, patch: Partial<OptionRow>) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const move = (index: number, offset: number) => { const next = [...rows]; const target = index + offset; if (target < 0 || target >= rows.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  const importRows = () => { const next = paste.split(/\r?\n/).filter(Boolean).map((line) => { const [label, nextValue = label] = line.split(/,|\t/); return { label: label.trim(), value: nextValue.trim() }; }); onChange([...rows, ...next]); setPaste(''); };
  const importCsvFile = async (file: File) => { const text = await file.text(); const imported = text.split(/\r?\n/).filter(Boolean).map((line) => { const [label, nextValue = label] = line.split(/,|\t/); return { label: label.replace(/^"|"$/g, '').trim(), value: nextValue.replace(/^"|"$/g, '').trim() }; }); onChange([...rows, ...imported]); };
  return <div className="property-editor-stack">
    <div className="property-table-head"><span>标签</span><span>值</span><i>排序</i></div>
    {rows.map((row, index) => <div className="property-table-row" key={index} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) move(from, index - from); }}>
      <AntdTextInput value={row.label} placeholder="显示文字" onChange={(label) => update(index, { label })} />
      <AntdTextInput value={row.value} placeholder="唯一值" onChange={(nextValue) => update(index, { value: nextValue })} />
      <div><button type="button" onClick={() => move(index, -1)}>↑</button><button type="button" onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>
    </div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, { label: '', value: '' }])}>添加选项</button>
    {duplicates.length > 0 && <div className="property-editor-error">选项值不能为空或重复</div>}
    <label className="property-editor-label"><span>批量粘贴（每行“标签,值”，也支持 Tab/CSV）</span><AntdTextAreaInput value={paste} rows={4} onChange={setPaste} /></label>
    <button className="toolbar-btn" type="button" disabled={!paste.trim()} onClick={importRows}>导入到列表</button>
    <label className="property-csv-import"><span>或导入 CSV 文件</span><input type="file" accept=".csv,text/csv,text/tab-separated-values" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCsvFile(file); event.currentTarget.value = ''; }} /></label>
  </div>;
}

export function StringListVisual({ value, onChange, onValidity }: { value: unknown; onChange: (value: string[]) => void; onValidity: (valid: boolean) => void }) {
  const rows = Array.isArray(value) ? value.map((item) => String(item)) : [];
  const [paste, setPaste] = useState('');
  const invalid = rows.some((item) => !item.trim());
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const move = (index: number, offset: number) => { const next = [...rows]; const target = index + offset; if (target < 0 || target >= rows.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <div className="property-editor-stack">
    {rows.map((row, index) => <div className="property-string-row" key={index}><AntdTextInput value={row} placeholder="名称" onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? next : item))} /><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>删除</button></div></div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, ''])}>添加一项</button>
    {invalid && <div className="property-editor-error">名称不能为空</div>}
    <label className="property-editor-label"><span>批量添加（每行一项）</span><AntdTextAreaInput value={paste} rows={4} onChange={setPaste} /></label>
    <button className="toolbar-btn" type="button" disabled={!paste.trim()} onClick={() => { onChange([...rows, ...paste.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)]); setPaste(''); }}>导入列表</button>
  </div>;
}

const ARRAY_EDITOR_COLUMNS: Record<string, Array<{ key: string; label: string; placeholder?: string; options?: Array<{ label: string; value: string }> }>> = {
  'table-columns': [{ key: 'title', label: '列名' }, { key: 'dataIndex', label: '字段' }, { key: 'type', label: '类型', options: ['text', 'number', 'date', 'boolean'].map((value) => ({ label: value, value })) }, { key: 'width', label: '宽度' }, { key: 'format', label: '格式' }, { key: 'visible', label: '显示', options: [{ label: '显示', value: 'show' }, { label: '隐藏', value: 'hide' }] }],
  tabs: [{ key: 'label', label: '标签' }, { key: 'key', label: '标识' }],
  steps: [{ key: 'title', label: '步骤' }, { key: 'description', label: '说明' }],
  filters: [{ key: 'field', label: '字段' }, { key: 'operator', label: '条件' }, { key: 'value', label: '值' }],
  sorting: [{ key: 'field', label: '字段' }, { key: 'direction', label: '方向', options: [{ label: '升序', value: 'asc' }, { label: '降序', value: 'desc' }] }],
};

export function ArrayRowsVisual({ kind, value, fields, onChange, onValidity }: { kind: string; value: unknown; fields: string[]; onChange: (value: unknown[]) => void; onValidity: (valid: boolean) => void }) {
  const columns = ARRAY_EDITOR_COLUMNS[kind] || [{ key: 'value', label: '内容' }];
  const rows: Record<string, unknown>[] = Array.isArray(value) ? value.map((item) => typeof item === 'object' && item ? item as Record<string, unknown> : kind === 'table-columns' ? { title: String(item), dataIndex: String(item), visible: 'show' } : { value: item }) : [];
  const identityKey = kind === 'table-columns' ? 'dataIndex' : kind === 'filters' || kind === 'sorting' ? 'field' : columns[0]?.key;
  const invalid = rows.some((row, index) => !String(row[identityKey] || '').trim() || (kind !== 'filters' && rows.findIndex((other) => String(other[identityKey] || '') === String(row[identityKey] || '')) !== index));
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= rows.length) return; const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  return <div className="property-editor-stack">
    {rows.map((row, index) => <div className="property-array-card" key={index}><div className="property-array-card-head"><strong>{index + 1}</strong><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>删除</button></div></div><div className="property-array-grid">{columns.map((column) => <label key={column.key}><span>{column.label}</span>{column.options || (column.key === 'field' || column.key === 'dataIndex') && fields.length ? <AntdSelectInput value={String(row[column.key] ?? '')} options={column.options || fields.map((field) => ({ label: field, value: field }))} onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [column.key]: next } : item))} /> : <AntdTextInput value={String(row[column.key] ?? '')} placeholder={column.placeholder} onChange={(next) => onChange(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [column.key]: next } : item))} />}</label>)}</div></div>)}
    <button className="toolbar-btn" type="button" onClick={() => onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, '']))])}>添加一项</button>
    {invalid && <div className="property-editor-error">字段不能为空或重复</div>}
  </div>;
}

export function KeyValueVisual({ value, fields, onChange, onValidity }: { value: unknown; fields: string[]; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const rows = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
  const invalid = rows.some(([key], index) => !key || rows.findIndex(([other]) => other === key) !== index);
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  return <div className="property-editor-stack">{rows.map(([key, rowValue], index) => <div className="property-table-row" key={index}><AntdTextInput value={key} placeholder="键 / 参数" onChange={(nextKey) => onChange(Object.fromEntries(rows.map(([currentKey, currentValue], rowIndex) => [rowIndex === index ? nextKey : currentKey, currentValue])))} /><AntdTextInput value={String(rowValue ?? '')} placeholder="值 / 字段路径" onChange={(nextValue) => onChange(Object.fromEntries(rows.map(([currentKey, currentValue], rowIndex) => [currentKey, rowIndex === index ? nextValue : currentValue])))} /><div><button type="button" onClick={() => onChange(Object.fromEntries(rows.filter((_, rowIndex) => rowIndex !== index)))}>×</button></div></div>)}<button className="toolbar-btn" type="button" onClick={() => onChange({ ...(value as object || {}), [`key${rows.length + 1}`]: fields[0] || '' })}>添加映射</button>{invalid && <div className="property-editor-error">键不能为空或重复</div>}</div>;
}

export function DataBindingVisual({ value, context, onChange, onValidity }: { value: unknown; context: PropertyEditorContext; onChange: (value: Record<string, unknown>) => void; onValidity: (valid: boolean) => void }) {
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const initial = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<DataBindingConfig> : {};
  const source = initial.source as DataBindingSource | undefined;
  const sourceKind = source?.kind || 'none';
  const [rangeOpen, setRangeOpen] = useState(false);
  const binding: DataBindingConfig = { version: 1, direction: initial.direction || 'dataToUi', valueMode: initial.valueMode || 'auto', source: source || { kind: 'none' }, defaultValue: initial.defaultValue };
  const emit = (patch: Partial<DataBindingConfig>) => onChange({ ...binding, ...patch });
  const setSource = (next: DataBindingSource) => emit({ source: next });
  const componentFields = (context.fieldCatalog || []).filter((item) => item.source === 'component');
  const field = sourceKind === 'formField' ? componentFields.find((item) => item.path === (source as any)?.path) : undefined;
  const table = sourceKind === 'tableCell' ? tables.find((item) => item.id === (source as any).tableId) : undefined;
  const sheet = sourceKind === 'tableCell' ? table?.sheets.find((item) => item.name === (source as any).sheetName) : undefined;
  const writeMismatch = binding.direction !== 'dataToUi' && sourceKind !== 'tableCell';
  const invalid = writeMismatch || (sourceKind === 'none' ? false : sourceKind === 'formField' ? !(source as any)?.path || !field
    : sourceKind === 'range' ? !(source as any)?.ref?.tableId
      : !(source as any)?.tableId || !(source as any)?.sheetName || !(source as any)?.column);
  useEffect(() => onValidity(!invalid), [invalid, onValidity]);
  const changeKind = (value: string | string[]) => { const kind = String(value); setSource(kind === 'range' ? { kind: 'range', ref: null as unknown as RangeRef } : kind === 'tableCell' ? { kind: 'tableCell', tableId: tables[0]?.id || '', sheetName: tables[0]?.sheets[0]?.name || '', column: '' } : kind === 'formField' ? { kind: 'formField', path: '' } : { kind: 'none' }); };
  return <div className="property-editor-stack">
    <div className="property-composite-grid"><label><span>来源类型</span><AntdSelectInput value={sourceKind} options={[{ label: '不绑定', value: 'none' }, { label: '表单字段', value: 'formField' }, { label: '数据范围', value: 'range' }, { label: '表格单元格', value: 'tableCell' }]} onChange={changeKind} /></label><label><span>绑定方向</span><AntdSelectInput value={binding.direction} options={[{ label: '数据 → 控件', value: 'dataToUi' }, { label: '控件 → 数据', value: 'uiToData' }, { label: '双向', value: 'twoWay' }]} onChange={(next) => emit({ direction: next as DataBindingConfig['direction'] })} /></label></div>
    {sourceKind === 'formField' && <label className="property-editor-label"><span>来源字段</span><AntdSelectInput value={String((source as any)?.path || '')} options={componentFields.map((item) => ({ label: `${item.label} · ${item.type} · ${item.sourceLabel || '当前表单'}`, value: item.path }))} onChange={(path) => setSource({ kind: 'formField', path: String(path) })} /></label>}
    {sourceKind === 'range' && <><button type="button" className="toolbar-btn" onClick={() => setRangeOpen(true)}>{(source as any)?.ref?.tableId ? `重新选择 · ${rangeToAddress((source as any).ref)}` : '选择数据范围'}</button>{rangeOpen && <RangeSelector tables={tables} value={(source as any)?.ref || null} onConfirm={(ref) => { setSource({ kind: 'range', ref }); setRangeOpen(false); }} onCancel={() => setRangeOpen(false)} />}</>}
    {sourceKind === 'tableCell' && <div className="property-composite-grid"><label><span>数据表</span><AntdSelectInput value={String((source as any)?.tableId || '')} options={tables.map((item) => ({ label: item.fileName, value: item.id }))} onChange={(tableId) => { const nextTable = tables.find((item) => item.id === tableId); setSource({ kind: 'tableCell', tableId: String(tableId), sheetName: nextTable?.sheets[0]?.name || '', column: '' }); }} /></label><label><span>工作表</span><AntdSelectInput value={String((source as any)?.sheetName || '')} options={(table?.sheets || []).map((item) => ({ label: item.name, value: item.name }))} onChange={(sheetName) => setSource({ ...(source as any), kind: 'tableCell', sheetName: String(sheetName), column: '' })} /></label><label><span>目标列</span><AntdSelectInput value={String((source as any)?.column || '')} options={(sheet?.headers || []).map((item) => ({ label: item, value: item }))} onChange={(column) => setSource({ ...(source as any), kind: 'tableCell', column: String(column) })} /></label><label><span>键字段</span><AntdSelectInput value={String((source as any)?.keyField || '')} options={(sheet?.headers || []).map((item) => ({ label: item, value: item }))} onChange={(keyField) => setSource({ ...(source as any), kind: 'tableCell', keyField: String(keyField) })} /></label><label><span>键值</span><AntdTextInput value={String((source as any)?.keyValue ?? '')} onChange={(keyValue) => setSource({ ...(source as any), kind: 'tableCell', keyValue })} /></label></div>}
    <div className="property-composite-grid"><label><span>取值方式</span><AntdSelectInput value={binding.valueMode || 'auto'} options={['auto', 'firstCell', 'firstRow', 'column', 'table'].map((mode) => ({ label: mode, value: mode }))} onChange={(valueMode) => emit({ valueMode: valueMode as DataBindingConfig['valueMode'] })} /></label><label><span>空值回退</span><AntdTextInput value={String(binding.defaultValue ?? '')} onChange={(defaultValue) => emit({ defaultValue })} /></label></div>
    {field && <div className="property-impact"><b>数据来源</b><span>{field.sourceLabel || '当前表单'} · {field.type}{field.sample !== undefined ? ` · 示例 ${String(field.sample)}` : ''}</span></div>}{writeMismatch && <div className="property-editor-warning">只有按键定位的表格单元格支持写回，请改为“数据 → 控件”或更换来源。</div>}{invalid && !writeMismatch && <div className="property-editor-warning">绑定不完整或来源已失效。旧配置不会被自动清除。</div>}
  </div>;
}
