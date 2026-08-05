/**
 * FilterBar Component
 *
 * Displays active filters as chips below the toolbar.
 * Only responsible for displaying, editing and deleting existing filters;
 * the bar is hidden entirely when there are no active filters.
 * Adding filters happens in the column header cell.
 * Chinese labels for all filter types, grouped by data type.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AntdCompatSelect } from './AntdFormControls';
import {
  FILTER_TYPE_LABELS,
  FILTER_TYPES_BY_DATA_TYPE,
  filterTypesForDataType,
  type FilterRule,
} from '../../../shared/formflow-core/previewFilter';

// ── Filter Type Labels (Chinese) ───────────────────────
const getFilterTypesForDataType = filterTypesForDataType;

/** 返回今天（或偏移 N 天）的 YYYY-MM-DD。 */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface FilterChip {
  field: string;
  rule: FilterRule;
  label: string;
}

export interface FilterBarProps {
  /** Current filter model from AG Grid */
  filterModel: Record<string, unknown>;
  /** Available columns with their data types */
  columns: Array<{ name: string; dataType?: string; sampleValues?: string[] }>;
  /** Called when a filter is added or modified */
  onFilterChange: (field: string, rule: FilterRule | null) => void;
  /** Called when all filters are cleared */
  onClearAll: () => void;
}

// ── Component ──────────────────────────────────────────

export function FilterBar({ filterModel, columns, onFilterChange, onClearAll }: FilterBarProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Build chip list from filter model
  const chips: FilterChip[] = Object.entries(filterModel)
    .filter(([, rule]) => rule != null && typeof rule === 'object')
    .map(([field, rule]) => ({
      field,
      rule: rule as FilterRule,
      label: buildFilterLabel(field, rule as FilterRule),
    }));

  // Close popover on outside click
  useEffect(() => {
    if (!editingField) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (popoverRef.current && target && !popoverRef.current.contains(target)) {
        if (target instanceof Element && target.closest('input, textarea, select, option, [contenteditable="true"], .ant-select-dropdown')) return;
        setEditingField(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editingField]);

  const handleDeleteChip = useCallback((field: string) => {
    onFilterChange(field, null);
  }, [onFilterChange]);

  const handleEditChip = useCallback((field: string) => {
    setEditingField(field);
  }, []);

  if (chips.length === 0) return null;

  return (
    <div className="filter-bar">
      {chips.map((chip) => (
        <div key={chip.field} className="filter-bar-chip" onClick={() => handleEditChip(chip.field)}>
          <span className="filter-bar-chip-label">{chip.label}</span>
          <button
            type="button"
            className="filter-bar-chip-delete"
            onClick={(e) => { e.stopPropagation(); handleDeleteChip(chip.field); }}
            aria-label={`删除筛选: ${chip.label}`}
          >
            ×
          </button>
          {editingField === chip.field && (
            <div ref={popoverRef} className="filter-bar-popover" onClick={(e) => e.stopPropagation()}>
              <FilterEditor
                field={chip.field}
                rule={chip.rule}
                dataType={columns.find((c) => c.name === chip.field)?.dataType}
                options={columns.find((c) => c.name === chip.field)?.sampleValues}
                popupContainer={() => popoverRef.current}
                onApply={(rule) => { onFilterChange(chip.field, rule); setEditingField(null); }}
                onDelete={() => { onFilterChange(chip.field, null); setEditingField(null); }}
                onCancel={() => setEditingField(null)}
              />
            </div>
          )}
        </div>
      ))}

      {chips.length > 0 && (
        <button type="button" className="filter-bar-clear-btn" onClick={onClearAll}>
          清除全部
        </button>
      )}
    </div>
  );
}

// ── Filter Editor ──────────────────────────────────────

export interface FilterEditorProps {
  field: string;
  rule: FilterRule;
  dataType?: string;
  /** 枚举列的可选值（用于快捷选择已有值） */
  options?: string[];
  /** 自定义下拉弹层挂载容器，避免选择时被当作“点击外部”关闭 */
  popupContainer?: () => HTMLElement | null;
  onApply: (rule: FilterRule) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function FilterEditor({ field, rule, dataType, options, popupContainer, onApply, onDelete, onCancel }: FilterEditorProps) {
  const [editType, setEditType] = useState(rule.type || 'contains');
  const [editValue, setEditValue] = useState(String(rule.filter ?? ''));
  const [editValue2, setEditValue2] = useState(String(rule.filterTo ?? ''));

  const availableTypes = getFilterTypesForDataType(dataType);
  const needsValue = !['blank', 'notBlank'].includes(editType);
  const needsValue2 = editType === 'inRange';

  const applyRule = (type: string, filter?: unknown, filterTo?: unknown) => {
    onApply({ type, filter, filterTo });
  };

  return (
    <div className="filter-editor">
      <div className="filter-editor-header">
        <strong>{field}</strong>
        <button type="button" className="filter-editor-delete" onClick={onDelete} title="删除此筛选">删除</button>
      </div>
      <div className="filter-editor-body">
        <AntdCompatSelect
          aria-label="筛选类型"
          value={editType}
          getPopupContainer={popupContainer ? () => popupContainer() || document.body : undefined}
          onChange={(e) => setEditType(e.target.value)}
        >
          {availableTypes.map((type) => (
            <option key={type} value={type}>{FILTER_TYPE_LABELS[type] || type}</option>
          ))}
        </AntdCompatSelect>
        {!needsValue && <p className="filter-editor-hint">此筛选无需填写值</p>}
        {needsValue && dataType === 'number' && (
          <>
            <input
              autoFocus
              type="number"
              step="any"
              placeholder={needsValue2 ? '最小值' : '筛选值'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyRule(editType, editValue, needsValue2 ? editValue2 : undefined); }}
            />
            {needsValue2 && (
              <input
                type="number"
                step="any"
                placeholder="最大值"
                value={editValue2}
                onChange={(e) => setEditValue2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyRule(editType, editValue, editValue2); }}
              />
            )}
            <div className="filter-editor-quick">
              <button type="button" onClick={() => applyRule('greaterThanOrEqual', '0')}>≥ 0</button>
              <button type="button" onClick={() => applyRule('greaterThan', '0')}>&gt; 0</button>
            </div>
          </>
        )}
        {needsValue && dataType === 'date' && (
          <>
            <input
              autoFocus
              type="date"
              placeholder={needsValue2 ? '最小值' : '筛选值'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyRule(editType, editValue, needsValue2 ? editValue2 : undefined); }}
            />
            {needsValue2 && (
              <input
                type="date"
                placeholder="最大值"
                value={editValue2}
                onChange={(e) => setEditValue2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyRule(editType, editValue, editValue2); }}
              />
            )}
            <div className="filter-editor-quick">
              <button type="button" onClick={() => applyRule('equals', isoDate(0))}>今天</button>
              <button type="button" onClick={() => applyRule('inRange', isoDate(-6), isoDate(0))}>最近 7 天</button>
              <button type="button" onClick={() => applyRule('inRange', isoDate(-29), isoDate(0))}>最近 30 天</button>
              <button type="button" onClick={() => applyRule('inRange', isoDate(-89), isoDate(0))}>最近 90 天</button>
            </div>
          </>
        )}
        {needsValue && dataType === 'boolean' && (
          <div className="filter-editor-boolean">
            <button
              type="button"
              className={editValue === 'true' ? 'is-active' : ''}
              onClick={() => setEditValue('true')}
            >
              是
            </button>
            <button
              type="button"
              className={editValue === 'false' ? 'is-active' : ''}
              onClick={() => setEditValue('false')}
            >
              否
            </button>
          </div>
        )}
        {needsValue && dataType !== 'number' && dataType !== 'date' && dataType !== 'boolean' && (
          <>
            {dataType === 'enum' && options && options.length > 0 && (
              <AntdCompatSelect
                aria-label="选择已有值"
                value={editValue}
                getPopupContainer={popupContainer ? () => popupContainer() || document.body : undefined}
                onChange={(e) => setEditValue(e.target.value)}
              >
                {options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                {editValue && !options.includes(editValue) && (
                  <option value={editValue}>{editValue}（当前值）</option>
                )}
              </AntdCompatSelect>
            )}
            <input
              autoFocus
              placeholder={needsValue2 ? '最小值' : '筛选值'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyRule(editType, editValue, needsValue2 ? editValue2 : undefined); }}
            />
            {needsValue2 && (
              <input
                placeholder="最大值"
                value={editValue2}
                onChange={(e) => setEditValue2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyRule(editType, editValue, editValue2); }}
              />
            )}
          </>
        )}
      </div>
      <div className="filter-editor-footer">
        <button type="button" className="ui-btn ui-btn-xs" onClick={onCancel}>取消</button>
        <button
          type="button"
          className="ui-btn ui-btn-xs ui-btn-primary"
          onClick={() => applyRule(editType, editValue, needsValue2 ? editValue2 : undefined)}
        >
          应用
        </button>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────

function buildFilterLabel(field: string, rule: FilterRule): string {
  const type = rule.type || 'contains';
  const label = FILTER_TYPE_LABELS[type] || type;
  if (type === 'blank' || type === 'notBlank') return `${field} ${label}`;
  if (type === 'inRange') return `${field} ${label} ${rule.filter}~${rule.filterTo}`;
  return `${field} ${label} ${rule.filter}`;
}

export { FILTER_TYPE_LABELS, FILTER_TYPES_BY_DATA_TYPE, getFilterTypesForDataType };
export type { FilterRule };
