import React, { useState, useCallback } from 'react';
import type { ComponentNode, ComponentType, RangeRef } from '../models';
import type { SrcTableEntry } from '../project/types';
import RangeTag from './RangeTag';
import RangeSelector from './RangeSelector';
import ChartWidget, { type MetricConfig } from './ChartWidget';
import { resolveRange } from '../services/rangeResolver';

interface FormRendererProps {
  components: ComponentNode[];
  values: Record<string, unknown>;
  originalValues: Record<string, unknown>;
  componentStates: Record<string, { visible: boolean; disabled: boolean; readonly: boolean }>;
  errors: Record<string, string>;
  onChange: (field: string, value: unknown) => void;
  onBlur?: (field: string) => void;
  onFocus?: (field: string) => void;
  onButtonClick?: (buttonName: string) => void;
  tables?: SrcTableEntry[];
  rangeConnections?: Record<string, RangeRef>;
  onRangeChange?: (componentName: string, ref: RangeRef | null) => void;
}

export default function FormRenderer({
  components, values, originalValues, componentStates, errors, onChange,
  onBlur, onFocus, onButtonClick,
  tables = [], rangeConnections = {}, onRangeChange,
}: FormRendererProps) {
  const [connectingField, setConnectingField] = useState<string | null>(null);

  const handleRangeConfirm = useCallback((ref: RangeRef) => {
    if (connectingField && onRangeChange) onRangeChange(connectingField, ref);
    setConnectingField(null);
  }, [connectingField, onRangeChange]);

  return (
    <div className="lg-form">
      {components.map((comp) => {
        const state = componentStates[comp.id] || { visible: true, disabled: false, readonly: false };
        if (!state.visible) return null;
        const props = normalizeRenderProps(comp);
        const hasError = !!errors[comp.name];
        const rangeRef = rangeConnections[comp.name] || null;
        const showChrome = !['text', 'upload', 'table', 'container', 'tabs', 'custom'].includes(comp.type);
        return (
          <div key={comp.id} className={`lg-field ${state.disabled ? 'disabled' : ''} ${hasError ? 'has-error' : ''}`}>
            {showChrome && (
              <label className="lg-label">
                {comp.label}
                {!!props.required && <span className="lg-required">*</span>}
              </label>
            )}
            <FormFieldInput
              type={comp.type}
              name={comp.name}
              value={values[comp.name]}
              originalValue={originalValues[comp.name]}
              disabled={state.disabled || state.readonly || !!props.disabled || !!props.readonly}
              props={props}
              error={errors[comp.name]}
              onChange={(val) => onChange(comp.name, val)}
              onBlur={() => onBlur?.(comp.name)}
              onFocus={() => onFocus?.(comp.name)}
              onButtonClick={() => onButtonClick?.(comp.name)}
              tables={tables}
            />
            {tables.length > 0 && (
              <RangeTag
                range={rangeRef}
                onConnect={() => setConnectingField(comp.name)}
                onDisconnect={() => onRangeChange?.(comp.name, null)}
              />
            )}
            {errors[comp.name] && <span className="lg-error">{errors[comp.name]}</span>}
          </div>
        );
      })}

      {connectingField && tables.length > 0 && (
        <RangeSelector
          tables={tables}
          value={rangeConnections[connectingField]}
          onConfirm={handleRangeConfirm}
          onCancel={() => setConnectingField(null)}
        />
      )}
    </div>
  );
}

function normalizeRenderProps(comp: ComponentNode): Record<string, unknown> {
  return {
    ...comp.props,
    label: comp.label || comp.props.label,
    name: comp.name || comp.props.name,
  };
}

function toOptions(options: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    if (option && typeof option === 'object') {
      const record = option as Record<string, unknown>;
      const value = record.value ?? record.label ?? '';
      return { label: String(record.label ?? value), value: String(value) };
    }
    return { label: String(option), value: String(option) };
  });
}

function FormFieldInput({ type, name, value, originalValue, disabled, props, error, onChange, onBlur, onFocus, onButtonClick, tables }: {
  type: ComponentType; name: string; value: unknown; originalValue: unknown;
  disabled: boolean; props: Record<string, unknown>; error?: string;
  onChange: (val: unknown) => void;
  onBlur: () => void;
  onFocus: () => void;
  onButtonClick: () => void;
  tables: SrcTableEntry[];
}) {
  const isDirty = JSON.stringify(value) !== JSON.stringify(originalValue);
  const dirtyClass = isDirty ? 'dirty' : '';
  const errorClass = error ? 'error' : '';
  const designType = props.designType as string | undefined;
  const defaultValue = props.defaultValue;
  const effectiveValue = value ?? defaultValue;

  switch (type) {
    case 'input':
      return (
        <input
          type="text"
          className={`lg-input ${dirtyClass} ${errorClass}`}
          value={String(effectiveValue ?? '')}
          placeholder={props.placeholder as string}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
    case 'numberInput':
      return (
        <input
          type="number"
          className={`lg-input ${dirtyClass} ${errorClass}`}
          value={String(effectiveValue ?? '')}
          placeholder={props.placeholder as string}
          disabled={disabled}
          min={props.min as number}
          max={props.max as number}
          step={props.step as number}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
    case 'textarea':
      return (
        <textarea
          className={`lg-textarea ${dirtyClass}`}
          value={String(effectiveValue ?? '')}
          placeholder={props.placeholder as string}
          disabled={disabled}
          rows={props.rows as number || 3}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
    case 'select':
      return (
        <select
          className={`lg-select ${dirtyClass}`}
          value={String(effectiveValue ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
        >
          <option value="">{props.placeholder as string || '请选择'}</option>
          {toOptions(props.options).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      );
    case 'radio':
      return (
        <div className="lg-radio-group">
          {toOptions(props.options).map((opt) => {
            const isSelected = effectiveValue === opt.value;
            return (
              <label
                key={opt.value}
                className={`lg-radio-item ${isSelected ? 'selected' : ''}`}
                onClick={() => { if (!disabled) { onChange(opt.value); onBlur(); } }}
              >
                <input type="radio" name={name} value={opt.value} checked={isSelected} disabled={disabled} readOnly />
                <span className="lg-radio-circle"><span className="lg-radio-dot" /></span>
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    case 'checkbox':
      return (
        <div className="lg-checkbox-group">
          {toOptions(props.options).map((opt) => {
            const current = Array.isArray(effectiveValue) ? effectiveValue : [];
            const isChecked = current.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`lg-checkbox-item ${isChecked ? 'selected' : ''}`}
                onClick={() => {
                  if (disabled) return;
                  const arr = [...current];
                  if (isChecked) arr.splice(arr.indexOf(opt.value), 1); else arr.push(opt.value);
                  onChange(arr);
                  onBlur();
                }}
              >
                <input type="checkbox" checked={isChecked} disabled={disabled} readOnly />
                <span className="lg-checkbox-box">
                  <svg className="lg-checkbox-check" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    case 'datePicker':
      return (
        <input
          type="date"
          className={`lg-input ${dirtyClass}`}
          value={String(effectiveValue ?? '').slice(0, 10)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
    case 'switch':
      return (
        <label className="lg-switch">
          <input
            type="checkbox"
            checked={!!effectiveValue}
            disabled={disabled}
            onChange={(e) => { onChange(e.target.checked); onBlur(); }}
          />
          <span className="lg-switch-track"><span className="lg-switch-thumb" /></span>
        </label>
      );
    case 'rating':
      return (
        <div className="lg-rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`lg-rating-star ${(Number(effectiveValue) || 0) >= n ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => { onChange(n); onBlur(); }}
            >
              ★
            </button>
          ))}
        </div>
      );
    case 'button':
      return (
        <button
          type="button"
          className="lg-btn lg-btn-primary"
          disabled={disabled}
          onClick={onButtonClick}
        >
          {props.label as string || '按钮'}
        </button>
      );
    case 'text':
      return <div className="lg-text">{String(effectiveValue ?? props.content ?? '')}</div>;
    case 'upload':
    case 'imageUpload':
      return props.src ? (
        <img
          src={String(props.src)}
          alt={String(props.alt ?? '')}
          style={{
            width: '100%',
            maxHeight: Number(props.height) || 240,
            objectFit: (props.fit as any) || 'cover',
            borderRadius: Number(props.borderRadius) || 0,
            opacity: Number(props.opacity ?? 1),
          }}
        />
      ) : <div className="lg-text">{String(props.alt ?? '图片')}</div>;
    case 'table': {
      const columns = Array.isArray(props.columns) ? props.columns.map(String) : [];
      const rows = Math.max(1, Number(props.rows) || 3);
      return (
        <table className="lg-render-table">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>{columns.map((column) => <td key={column}>-</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'tabs':
      return (
        <div className="lg-tabs-render">
          {toOptions(props.tabs).map((tab, index) => (
            <span key={tab.value} className={index === Number(props.defaultTab ?? 0) ? 'active' : ''}>{tab.label}</span>
          ))}
        </div>
      );
    case 'container':
      return (
        <section className="lg-container-render">
          <strong>{String(props.title ?? props.label ?? '容器')}</strong>
          {props.subtitle ? <span>{String(props.subtitle)}</span> : null}
        </section>
      );
    case 'custom':
      if (designType === 'chart') {
        const rangeRef = props.rangeRef as RangeRef | null | undefined;
        const resolved = rangeRef ? resolveRange(rangeRef, tables) : null;
        return (
          <ChartWidget
            chartType={(props.chartType as any) || 'bar'}
            title={String(props.title ?? '')}
            data={(props.chartData as any) || undefined}
            rawData={resolved?.data}
            headers={resolved?.headers}
            dimensions={(props.dimensions as number[] | null) || undefined}
            metrics={(props.metrics as MetricConfig[] | null) || undefined}
            barColor={String(props.barColor ?? '#007AFF')}
            lineColor={String(props.lineColor ?? '#FF9500')}
            showLegend={!!props.showLegend}
            showValues={!!props.showValues}
            height={Number(props.height) || 220}
          />
        );
      }
      if (designType === 'divider') return <hr className="lg-divider-render" />;
      return <div className="lg-text">{String(props.title ?? props.label ?? '自定义组件')}</div>;
    default:
      return (
        <input
          type="text"
          className={`lg-input ${dirtyClass}`}
          value={String(effectiveValue ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
  }
}
