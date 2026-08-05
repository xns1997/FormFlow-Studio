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

// ── Filter Type Labels (Chinese) ───────────────────────

const FILTER_TYPE_LABELS: Record<string, string> = {
  contains: '包含',
  notContains: '不包含',
  equals: '等于',
  notEqual: '不等于',
  startsWith: '开头是',
  endsWith: '结尾是',
  blank: '为空',
  notBlank: '不为空',
  greaterThan: '大于',
  greaterThanOrEqual: '大于等于',
  lessThan: '小于',
  lessThanOrEqual: '小于等于',
  inRange: '区间内',
};

// Filter types grouped by data type
const FILTER_TYPES_BY_DATA_TYPE: Record<string, string[]> = {
  string: ['contains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'notContains', 'blank', 'notBlank'],
  number: ['equals', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'inRange', 'blank', 'notBlank'],
  date: ['equals', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'inRange', 'blank', 'notBlank'],
  boolean: ['equals', 'blank', 'notBlank'],
  enum: ['equals', 'notEqual', 'blank', 'notBlank'],
  unknown: ['contains', 'equals', 'notEqual', 'blank', 'notBlank'],
};

function getFilterTypesForDataType(dataType?: string): string[] {
  return FILTER_TYPES_BY_DATA_TYPE[dataType || 'unknown'] || FILTER_TYPES_BY_DATA_TYPE.unknown;
}

// ── Types ──────────────────────────────────────────────

export interface FilterRule {
  filterType?: string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  values?: unknown[];
  operator?: 'AND' | 'OR';
  condition1?: FilterRule;
  condition2?: FilterRule;
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
  columns: Array<{ name: string; dataType?: string }>;
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
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
  onApply: (rule: FilterRule) => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function FilterEditor({ field, rule, dataType, onApply, onDelete, onCancel }: FilterEditorProps) {
  const [editType, setEditType] = useState(rule.type || 'contains');
  const [editValue, setEditValue] = useState(String(rule.filter ?? ''));
  const [editValue2, setEditValue2] = useState(String(rule.filterTo ?? ''));

  const availableTypes = getFilterTypesForDataType(dataType);
  const needsValue = !['blank', 'notBlank'].includes(editType);
  const needsValue2 = editType === 'inRange';

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
          onChange={(e) => setEditType(e.target.value)}
        >
          {availableTypes.map((type) => (
            <option key={type} value={type}>{FILTER_TYPE_LABELS[type] || type}</option>
          ))}
        </AntdCompatSelect>
        {needsValue && (
          <input
            autoFocus
            placeholder={needsValue2 ? '最小值' : '筛选值'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApply({ type: editType, filter: editValue, filterTo: needsValue2 ? editValue2 : undefined }); }}
          />
        )}
        {needsValue2 && (
          <input
            placeholder="最大值"
            value={editValue2}
            onChange={(e) => setEditValue2(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onApply({ type: editType, filter: editValue, filterTo: editValue2 }); }}
          />
        )}
      </div>
      <div className="filter-editor-footer">
        <button type="button" className="ui-btn ui-btn-xs" onClick={onCancel}>取消</button>
        <button
          type="button"
          className="ui-btn ui-btn-xs ui-btn-primary"
          onClick={() => onApply({ type: editType, filter: editValue, filterTo: needsValue2 ? editValue2 : undefined })}
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
