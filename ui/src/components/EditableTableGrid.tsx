import React, { useMemo, useState } from 'react';
import { Select } from 'antd';

export type TableEditorType = 'text' | 'number' | 'date' | 'boolean' | 'select';
export type TableChangeTracking = 'fullRows' | 'dirtyRows';

export interface EditableTableColumn {
  title: string;
  key: string;
  type: string;
  editor: TableEditorType;
  editable: boolean;
  required: boolean;
  options: Array<{ label: string; value: unknown }>;
  min?: number;
  max?: number;
  width?: number;
  format?: string;
  visible: boolean;
}

export interface EditableTableChangeDetail {
  kind: 'cell-update' | 'row-add' | 'row-remove';
  rowIndex: number;
  rowKey?: unknown;
  column?: string;
  previousValue?: unknown;
  value?: unknown;
  validationErrors: Record<string, string>;
}

interface EditableTableGridProps {
  label?: string;
  columns: unknown;
  data?: unknown;
  value?: unknown;
  editable?: boolean;
  disabled?: boolean;
  addable?: boolean;
  removable?: boolean;
  rowKey?: string;
  changeTracking?: TableChangeTracking;
  placeholderRows?: number;
  loading?: boolean;
  emptyText?: string;
  conflictRows?: number[];
  onRetryRow?: (rowIndex: number) => void;
  showGrid?: boolean;
  striped?: boolean;
  headerBackground?: string;
  headerColor?: string;
  headerFontWeight?: React.CSSProperties['fontWeight'];
  cellColor?: string;
  onChange?: (rows: Record<string, unknown>[], detail: EditableTableChangeDetail) => void;
  onRowClick?: (rowIndex: number, row: Record<string, unknown>) => void;
}

function normalizeOptions(value: unknown): Array<{ label: string; value: unknown }> {
  const source = typeof value === 'string' ? value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) : value;
  return Array.isArray(source) ? source.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const option = item as Record<string, unknown>;
      return { label: String(option.label ?? option.value ?? ''), value: option.value ?? option.label ?? '' };
    }
    return { label: String(item), value: item };
  }) : [];
}

function defaultEditor(type: string): TableEditorType {
  if (type === 'number') return 'number';
  if (type === 'date') return 'date';
  if (type === 'boolean') return 'boolean';
  if (type === 'enum' || type === 'select') return 'select';
  return 'text';
}

function enabledValue(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 1;
}

export function normalizeEditableTableColumns(value: unknown): EditableTableColumn[] {
  const source = Array.isArray(value) ? value : [];
  return source.map((column, index) => {
    if (column && typeof column === 'object' && !Array.isArray(column)) {
      const record = column as Record<string, unknown>;
      const type = String(record.type || 'text');
      const min = record.min === '' || record.min == null ? undefined : Number(record.min);
      const max = record.max === '' || record.max == null ? undefined : Number(record.max);
      return {
        title: String(record.title || record.label || record.dataIndex || record.key || `列${index + 1}`),
        key: String(record.dataIndex || record.key || record.title || `列${index + 1}`),
        type,
        editor: (record.editor || defaultEditor(type)) as TableEditorType,
        editable: enabledValue(record.editable, true),
        required: enabledValue(record.required, false),
        options: normalizeOptions(record.options),
        min: Number.isFinite(min) ? min : undefined,
        max: Number.isFinite(max) ? max : undefined,
        width: Number(record.width) > 0 ? Number(record.width) : undefined,
        format: String(record.format || ''),
        visible: record.visible !== false && record.visible !== 'hide',
      };
    }
    const key = String(column ?? `列${index + 1}`);
    return { title: key, key, type: 'text', editor: 'text' as TableEditorType, editable: true, required: false, options: [], visible: true };
  }).filter((column) => column.visible);
}

export function normalizeEditableTableRows(value: unknown, columns: EditableTableColumn[] = []): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) return { ...(row as Record<string, unknown>) };
    if (Array.isArray(row)) return Object.fromEntries(row.map((cell, index) => [columns[index]?.key || `列${index + 1}`, cell]));
    return { value: row };
  });
}

function comparable(value: unknown) {
  return JSON.stringify(value ?? null);
}

function rowsEqual(left: Record<string, unknown>, right: Record<string, unknown>, columns: EditableTableColumn[]) {
  return columns.every((column) => comparable(left[column.key]) === comparable(right[column.key]));
}

function rowIdentity(row: Record<string, unknown>, rowKey: string | undefined, index: number) {
  const value = rowKey ? row[rowKey] : undefined;
  return value === null || value === undefined || value === '' ? `__index_${index}` : `key_${String(value)}`;
}

export function collectDirtyTableRows(
  rows: Record<string, unknown>[],
  baselineRows: Record<string, unknown>[],
  columns: EditableTableColumn[],
  rowKey?: string,
) {
  const baselineByKey = new Map(baselineRows.map((row, index) => [rowIdentity(row, rowKey, index), row]));
  return rows.filter((row, index) => {
    const baseline = baselineByKey.get(rowIdentity(row, rowKey, index));
    return !baseline || !rowsEqual(row, baseline, columns);
  });
}

export function mergeEditableTableRows(
  data: unknown,
  value: unknown,
  columns: EditableTableColumn[],
  rowKey?: string,
  changeTracking: TableChangeTracking = 'fullRows',
) {
  const baselineRows = normalizeEditableTableRows(data, columns);
  const valueRows = normalizeEditableTableRows(value, columns);
  if (changeTracking !== 'dirtyRows') {
    return { baselineRows, displayRows: Array.isArray(value) ? valueRows : baselineRows, changeRows: valueRows };
  }
  const changesByKey = new Map(valueRows.map((row, index) => [rowIdentity(row, rowKey, index), row]));
  const displayRows = baselineRows.map((row, index) => ({ ...row, ...(changesByKey.get(rowIdentity(row, rowKey, index)) || {}) }));
  return { baselineRows, displayRows, changeRows: valueRows };
}

export function validateEditableTableRows(rows: Record<string, unknown>[], columns: EditableTableColumn[]) {
  const errors: Record<string, string> = {};
  rows.forEach((row, rowIndex) => {
    columns.forEach((column) => {
      if (!column.editable) return;
      const value = row[column.key];
      const empty = value === '' || value === null || value === undefined;
      let message = '';
      if (column.required && empty) message = `${column.title}不能为空`;
      else if (!empty && column.editor === 'number' && !Number.isFinite(Number(value))) message = `${column.title}必须是数字`;
      else if (!empty && column.editor === 'date' && Number.isNaN(new Date(String(value)).getTime())) message = `${column.title}日期无效`;
      else if (!empty && column.editor === 'select' && column.options.length && !column.options.some((option) => comparable(option.value) === comparable(value))) message = `${column.title}不在可选范围内`;
      else if (!empty && column.min !== undefined && Number(value) < column.min) message = `${column.title}不能小于 ${column.min}`;
      else if (!empty && column.max !== undefined && Number(value) > column.max) message = `${column.title}不能大于 ${column.max}`;
      if (message) errors[`${rowIndex}:${column.key}`] = message;
    });
  });
  return errors;
}

export function validateEditableTableValue(props: Record<string, unknown>, value: unknown): string {
  if (props.editable !== true || props.disabled || props.readonly) return '';
  const columns = normalizeEditableTableColumns(props.columns);
  const merged = mergeEditableTableRows(props.data, value, columns, String(props.rowKey || '') || undefined, (props.changeTracking as TableChangeTracking) || 'fullRows');
  const rows = props.changeTracking === 'dirtyRows' ? merged.changeRows : merged.displayRows;
  const count = Object.keys(validateEditableTableRows(rows, columns)).length;
  return count ? `表格中有 ${count} 个单元格需要修正` : '';
}

function formatCell(value: unknown, type?: string, format?: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    const digits = format?.match(/0\.(0+)/)?.[1].length;
    return new Intl.NumberFormat('zh-CN', digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
  }
  if (type === 'date') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return format === 'datetime' ? date.toLocaleString('zh-CN') : date.toLocaleDateString('zh-CN');
  }
  if (type === 'boolean') return value === true || value === 'true' || value === 1 ? '是' : '否';
  return String(value);
}

export default function EditableTableGrid({
  label, columns: rawColumns, data, value, editable = false, disabled = false,
  addable = false, removable = false, rowKey, changeTracking = 'fullRows',
  placeholderRows = 3, loading = false, emptyText = '暂无记录', conflictRows = [], onRetryRow, showGrid = true, striped = true,
  headerBackground, headerColor, headerFontWeight, cellColor, onChange, onRowClick,
}: EditableTableGridProps) {
  const configuredColumns = useMemo(() => normalizeEditableTableColumns(rawColumns), [rawColumns]);
  const derivedRows = normalizeEditableTableRows(Array.isArray(value) ? value : data);
  const derivedKeys = [...new Set(derivedRows.flatMap((row) => Object.keys(row)))];
  const columns: EditableTableColumn[] = configuredColumns.length ? configuredColumns : derivedKeys.map((key) => ({
    title: key, key, type: 'text', editor: 'text', editable: true, required: false, options: [], visible: true,
  }));
  const merged = mergeEditableTableRows(data, value, columns, rowKey, changeTracking);
  const canEdit = editable && !disabled;
  const displayRows = merged.displayRows.length
    ? merged.displayRows
    : canEdit ? [] : Array.from({ length: Math.max(1, placeholderRows) }, () => Object.fromEntries(columns.map((column) => [column.key, '—'])));
  const validationRows = changeTracking === 'dirtyRows' ? merged.changeRows : displayRows;
  const validationErrors = validateEditableTableRows(validationRows, columns);
  const baselineByKey = new Map(merged.baselineRows.map((row, index) => [rowIdentity(row, rowKey, index), row]));
  const [pasteUndoRows, setPasteUndoRows] = useState<Record<string, unknown>[] | null>(null);
  const [pastePreviewRows, setPastePreviewRows] = useState<Record<string, unknown>[] | null>(null);

  const emitRows = (nextDisplayRows: Record<string, unknown>[], detail: Omit<EditableTableChangeDetail, 'validationErrors'>) => {
    let nextRows = nextDisplayRows;
    if (changeTracking === 'dirtyRows') {
      nextRows = collectDirtyTableRows(nextDisplayRows, merged.baselineRows, columns, rowKey);
    }
    onChange?.(nextRows, { ...detail, validationErrors: validateEditableTableRows(nextRows, columns) });
  };
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!canEdit || changeTracking !== 'fullRows') return;
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\n') && !text.includes('\t')) return;
    event.preventDefault();
    const lines = text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
    if (!lines.length) return;
    const headerMap = new Map(columns.map((column, index) => [column.title, index]));
    const hasHeader = lines[0].some((cell) => headerMap.has(cell.trim()));
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const nextRows = dataLines.map((cells) => Object.fromEntries(columns.map((column, index) => [column.key, cells[index] ?? ''])));
    setPastePreviewRows(nextRows);
  };

  return (
    <div className="editable-table-grid">
      {(label || canEdit) && (
        <div className="editable-table-toolbar">
          <strong title={label}>{label || '表格数据'}</strong>
          <div className="editable-table-toolbar-actions">
            {changeTracking === 'dirtyRows' && <span className="editable-table-change-count" role="status">✎ 已修改 {merged.changeRows.length} 行</span>}
            {pasteUndoRows && <button type="button" onClick={() => { emitRows(pasteUndoRows, { kind: 'cell-update', rowIndex: 0 }); setPasteUndoRows(null); }}>撤销粘贴</button>}
            {pastePreviewRows && <><span className="editable-table-paste-preview" role="status">待导入 {pastePreviewRows.length} 行</span><button type="button" onClick={() => { setPasteUndoRows(displayRows); emitRows([...displayRows, ...pastePreviewRows], { kind: 'row-add', rowIndex: displayRows.length }); setPastePreviewRows(null); }}>确认导入</button><button type="button" onClick={() => setPastePreviewRows(null)}>取消</button></>}
            {canEdit && addable && changeTracking === 'fullRows' && (
              <button type="button" aria-label={`在${label || '表格'}中新增一行`} onClick={() => {
                const next = [...displayRows, Object.fromEntries(columns.map((column) => [column.key, column.editor === 'boolean' ? false : '']))];
                emitRows(next, { kind: 'row-add', rowIndex: next.length - 1 });
              }}>+ 新增行</button>
            )}
          </div>
        </div>
      )}
      {pastePreviewRows && <div className="editable-table-paste-preview" role="status"><strong>粘贴预览</strong><span>将按当前列顺序导入；首行已按列名匹配时会自动跳过。</span><div>{pastePreviewRows.slice(0, 3).map((row, index) => <code key={index}>{columns.map((column) => `${column.title}=${String(row[column.key] ?? '')}`).join(' · ')}</code>)}</div></div>}
      {loading && <div className="editable-table-loading" role="status">正在加载表格数据…</div>}
      <div className="editable-table-scroll" onPaste={handlePaste} aria-busy={loading}>
        <table>
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key} style={{ width: column.width, background: headerBackground, color: headerColor, fontWeight: headerFontWeight }}>{column.title}{column.required && canEdit ? ' *' : ''}</th>)}
              {canEdit && (removable || onRetryRow) && changeTracking === 'fullRows' && <th className="editable-table-action-column">操作</th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => {
              const identity = rowIdentity(row, rowKey, rowIndex);
              const baseline = baselineByKey.get(identity);
              const dirtyRow = changeTracking === 'dirtyRows' && (!baseline || !rowsEqual(row, baseline, columns));
              const conflict = conflictRows.includes(rowIndex);
              return (
                <tr key={identity} className={`${striped && rowIndex % 2 ? 'is-striped' : ''}${dirtyRow ? ' is-dirty' : ''}${conflict ? ' is-conflict' : ''}`} onClick={() => onRowClick?.(rowIndex, row)}>
                  {columns.map((column) => {
                    const dirtyCell = !!baseline && comparable(row[column.key]) !== comparable(baseline[column.key]);
                    const error = validationErrors[`${changeTracking === 'dirtyRows' ? merged.changeRows.findIndex((item, index) => rowIdentity(item, rowKey, index) === identity) : rowIndex}:${column.key}`];
                    const inputId = `table-cell-${rowIndex}-${column.key.replace(/[^\w\u4e00-\u9fff-]/g, '-')}`;
                    const update = (nextValue: unknown) => {
                      const previousValue = row[column.key];
                      const next = displayRows.map((current, index) => index === rowIndex ? { ...current, [column.key]: nextValue } : current);
                      emitRows(next, { kind: 'cell-update', rowIndex, rowKey: rowKey ? row[rowKey] : undefined, column: column.key, previousValue, value: nextValue });
                    };
                    return (
                      <td key={column.key} className={`${showGrid ? 'has-grid' : ''}${dirtyCell ? ' is-dirty-cell' : ''}`} style={{ color: cellColor }}>
                        {canEdit && column.editable ? (
                          <div className="editable-table-cell-editor">
                            {column.editor === 'select' ? (
                              <Select
                                id={inputId}
                                aria-label={`${column.title}，第 ${rowIndex + 1} 行`}
                                status={error ? 'error' : undefined}
                                value={row[column.key] == null || row[column.key] === '' ? undefined : row[column.key]}
                                placeholder={!column.required ? '请选择' : undefined}
                                options={column.options}
                                onChange={(nextValue) => update(nextValue)}
                                popupMatchSelectWidth={false}
                                allowClear={!column.required}
                              />
                            ) : column.editor === 'boolean' ? (
                              <input id={inputId} aria-label={`${column.title}，第 ${rowIndex + 1} 行`} aria-invalid={!!error} type="checkbox" checked={row[column.key] === true || row[column.key] === 'true' || row[column.key] === 1} onChange={(event) => update(event.target.checked)} />
                            ) : (
                              <input
                                id={inputId}
                                aria-label={`${column.title}，第 ${rowIndex + 1} 行`}
                                aria-invalid={!!error}
                                aria-describedby={error ? `${inputId}-error` : undefined}
                                type={column.editor}
                                min={column.min}
                                max={column.max}
                                value={String(row[column.key] ?? '')}
                                onChange={(event) => update(column.editor === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                              />
                            )}
                            {error && <span id={`${inputId}-error`} className="editable-table-cell-error" role="alert">⚠ {error}</span>}
                          </div>
                        ) : <span className={dirtyCell ? 'editable-table-dirty-value' : undefined}>{formatCell(row[column.key], column.type, column.format)}</span>}
                      </td>
                    );
                  })}
                  {canEdit && (removable || onRetryRow) && changeTracking === 'fullRows' && (
                    <td className="editable-table-action-column">
                      {conflict && onRetryRow && <button type="button" aria-label={`重试第 ${rowIndex + 1} 行`} onClick={(event) => { event.stopPropagation(); onRetryRow(rowIndex); }}>重试</button>}
                      <button type="button" aria-label={`删除第 ${rowIndex + 1} 行`} onClick={(event) => {
                        event.stopPropagation();
                        emitRows(displayRows.filter((_row, index) => index !== rowIndex), { kind: 'row-remove', rowIndex, rowKey: rowKey ? row[rowKey] : undefined });
                      }}>删除</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !displayRows.length && <div className="editable-table-empty" role="status">{emptyText}{addable ? '，可新增一行开始录入。' : '。'}</div>}
      </div>
      {Object.keys(validationErrors).length > 0 && <div className="editable-table-summary-error" role="alert">⚠ 表格中有 {Object.keys(validationErrors).length} 个单元格需要修正</div>}
    </div>
  );
}
