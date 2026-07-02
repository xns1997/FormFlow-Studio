import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ComponentNode, ComponentType, RangeRef } from '../models';
import type { SrcTableEntry } from '../project/types';
import RangeTag from './RangeTag';
import RangeSelector from './RangeSelector';
import ChartWidget, { type MetricConfig } from './ChartWidget';
import CodeEditor from './CodeEditor';
import { jsonSuggestions } from './codeEditorSuggestions';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/structuredProperties';
import { resolveRange } from '../services/rangeResolver';
import type { FormControlEventContext } from '../services/formFlowTrigger';

interface FormRendererProps {
  components: ComponentNode[];
  values: Record<string, unknown>;
  originalValues: Record<string, unknown>;
  componentStates: Record<string, { visible: boolean; disabled: boolean; readonly: boolean }>;
  errors: Record<string, string>;
  onChange: (field: string, value: unknown) => void;
  onBlur?: (field: string) => void;
  onFocus?: (field: string) => void;
  onKeyDown?: (field: string, e: React.KeyboardEvent) => void;
  onPaste?: (field: string, e: React.ClipboardEvent) => void;
  onClear?: (field: string) => void;
  onButtonClick?: (buttonName: string) => void;
  onControlEvent?: (context: FormControlEventContext) => void | Promise<void>;
  tables?: SrcTableEntry[];
  rangeConnections?: Record<string, RangeRef>;
  onRangeChange?: (componentName: string, ref: RangeRef | null) => void;
  autoFocus?: boolean;
  autoFocusKey?: string | number;
  wizardMode?: 'auto' | 'always' | 'never';
  layout?: 'flat' | 'card';
}

const WIZARD_FIELD_THRESHOLD = 6;
const WIZARD_STEP_SIZE = 4;
const CARD_GROUP_SIZE = 4;

export default function FormRenderer({
  components, values, originalValues, componentStates, errors, onChange,
  onBlur, onFocus, onKeyDown, onPaste, onClear, onButtonClick, onControlEvent,
  tables = [], rangeConnections = {}, onRangeChange,
  autoFocus, autoFocusKey, wizardMode = 'auto', layout = 'flat',
}: FormRendererProps) {
  const [connectingField, setConnectingField] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  const handleRangeConfirm = useCallback((ref: RangeRef) => {
    if (connectingField && onRangeChange) onRangeChange(connectingField, ref);
    setConnectingField(null);
  }, [connectingField, onRangeChange]);

  // Auto-focus first editable input
  useEffect(() => {
    if (!autoFocus || !formRef.current) return;
    const timer = setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])'
      );
      el?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [autoFocus, autoFocusKey]);

  // Required field progress
  const requiredFields = components.filter((c) => {
    const state = componentStates[c.id] || { visible: true };
    if (!state.visible) return false;
    return !!normalizeRenderProps(c).required;
  });
  const filledRequired = requiredFields.filter((c) => {
    const v = values[c.name];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  const requiredProgress = requiredFields.length > 0 ? `${filledRequired.length}/${requiredFields.length}` : null;

  const handleFieldBlur = useCallback((field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  }, []);

  // ── Wizard mode: group visible editable components into steps ──
  const visibleComponents = components.filter((c) => {
    const state = componentStates[c.id] || { visible: true };
    return state.visible;
  });
  const editableTypes = new Set(['input', 'numberInput', 'textarea', 'select', 'radio', 'checkbox', 'datePicker', 'switch', 'rating']);
  const editableCount = visibleComponents.filter((c) => editableTypes.has(c.type)).length;
  const isWizard = wizardMode === 'always' || (wizardMode === 'auto' && editableCount > WIZARD_FIELD_THRESHOLD);

  const steps: ComponentNode[][] = useMemo(() => {
    if (!isWizard) return [components];
    const result: ComponentNode[][] = [];
    let current: ComponentNode[] = [];
    for (const comp of components) {
      current.push(comp);
      if (current.length >= WIZARD_STEP_SIZE && editableTypes.has(comp.type)) {
        result.push(current);
        current = [];
      }
    }
    if (current.length > 0) result.push(current);
    return result;
  }, [components, isWizard]);

  const totalSteps = steps.length;
  const safeStep = Math.min(currentStep, totalSteps - 1);
  const stepComponents = isWizard ? steps[safeStep] || [] : components;

  // Reset step when components change significantly
  useEffect(() => {
    if (currentStep >= totalSteps) setCurrentStep(0);
  }, [totalSteps, currentStep]);

  // ── Render a single field ──
  const renderField = (comp: ComponentNode) => {
    const state = componentStates[comp.id] || { visible: true, disabled: false, readonly: false };
    if (!state.visible) return null;
    const props = normalizeRenderProps(comp);
    const hasError = !!errors[comp.name];
    const isTouched = touched.has(comp.name);
    const isDirty = JSON.stringify(values[comp.name]) !== JSON.stringify(originalValues[comp.name]);
    const showSuccess = isTouched && !hasError && isDirty && !!props.required;
    const rangeRef = rangeConnections[comp.name] || null;
    const showChrome = !['text', 'upload', 'table', 'container', 'tabs', 'custom'].includes(comp.type);
    return (
      <div key={comp.id} className={`lg-field ${state.disabled ? 'disabled' : ''} ${hasError && isTouched ? 'has-error' : ''} ${isDirty ? 'dirty-indicator' : ''}`}>
        {showChrome && (
          <label className="lg-label">
            {comp.label}
            {!!props.required && <span className="lg-required">*</span>}
            {showSuccess && <span className="lg-valid-check">✓</span>}
          </label>
        )}
        <FormFieldInput
          type={comp.type}
          name={comp.name}
          value={values[comp.name]}
          originalValue={originalValues[comp.name]}
          disabled={state.disabled || state.readonly || !!props.disabled || !!props.readonly}
          props={props}
          error={isTouched ? errors[comp.name] : undefined}
          onChange={(val) => {
            const nextValues = { ...values, [comp.name]: val };
            onChange(comp.name, val);
            void onControlEvent?.({
              eventName: 'onChange', field: comp.name, value: val,
              values: nextValues, originalValues, component: comp, previousValue: values[comp.name], timestamp: Date.now(),
            });
          }}
          onBlur={() => {
            handleFieldBlur(comp.name);
            onBlur?.(comp.name);
            void onControlEvent?.({
              eventName: 'onBlur', field: comp.name, value: values[comp.name],
              values, originalValues, component: comp, previousValue: values[comp.name], timestamp: Date.now(),
            });
          }}
          onFocus={() => {
            onFocus?.(comp.name);
            void onControlEvent?.({
              eventName: 'onFocus', field: comp.name, value: values[comp.name],
              values, originalValues, component: comp, previousValue: values[comp.name], timestamp: Date.now(),
            });
          }}
          onKeyDown={onKeyDown ? (e) => onKeyDown(comp.name, e) : undefined}
          onPaste={onPaste ? (e) => onPaste(comp.name, e) : undefined}
          onClear={onClear ? () => onClear(comp.name) : undefined}
          onButtonClick={() => {
            onButtonClick?.(comp.name);
            void onControlEvent?.({
              eventName: 'onClick', field: comp.name, value: values[comp.name],
              values, originalValues, component: comp, previousValue: values[comp.name], timestamp: Date.now(),
            });
          }}
          tables={tables}
        />
        {tables.length > 0 && (
          <RangeTag
            range={rangeRef}
            onConnect={() => setConnectingField(comp.name)}
            onDisconnect={() => onRangeChange?.(comp.name, null)}
          />
        )}
        {hasError && isTouched && <span className="lg-error">{errors[comp.name]}</span>}
      </div>
    );
  };

  return (
    <div className={`lg-form ${isWizard ? 'lg-form-wizard' : ''}`} ref={formRef}>
      {/* Required progress */}
      {requiredProgress && (
        <div className="lg-required-progress">
          <div className="lg-required-progress-bar">
            <div className="lg-required-progress-fill" style={{ width: `${(filledRequired.length / requiredFields.length) * 100}%` }} />
          </div>
          <span className="lg-required-progress-text">必填项 {requiredProgress}</span>
        </div>
      )}

      {/* Wizard step bar */}
      {isWizard && totalSteps > 1 && (
        <div className="lg-wizard-bar">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`lg-wizard-step ${i === safeStep ? 'active' : i < safeStep ? 'done' : ''}`}
              onClick={() => setCurrentStep(i)}
              type="button"
            >
              <span className="lg-wizard-step-num">{i < safeStep ? '✓' : i + 1}</span>
              <span className="lg-wizard-step-label">步骤 {i + 1}</span>
            </button>
          ))}
        </div>
      )}

      {/* Fields */}
      <div className={isWizard ? 'lg-wizard-body' : ''}>
        {layout === 'card' ? (
          <CardGroup components={stepComponents} renderField={renderField} groupSize={CARD_GROUP_SIZE} />
        ) : (
          stepComponents.map(renderField)
        )}
      </div>

      {/* Wizard navigation */}
      {isWizard && totalSteps > 1 && (
        <div className="lg-wizard-nav">
          <button
            className="lg-btn"
            onClick={() => setCurrentStep(Math.max(0, safeStep - 1))}
            disabled={safeStep === 0}
            type="button"
          >
            上一步
          </button>
          <span className="lg-wizard-nav-info">{safeStep + 1} / {totalSteps}</span>
          {safeStep < totalSteps - 1 ? (
            <button
              className="lg-btn lg-btn-primary"
              onClick={() => setCurrentStep(Math.min(totalSteps - 1, safeStep + 1))}
              type="button"
            >
              下一步
            </button>
          ) : (
            <button className="lg-btn lg-btn-primary" type="button" onClick={() => onButtonClick?.('__submit')}>
              完成
            </button>
          )}
        </div>
      )}

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

// ── Card grouping ──────────────────────────────────────────
const editableCardTypes = new Set(['input', 'numberInput', 'textarea', 'select', 'radio', 'checkbox', 'datePicker', 'switch', 'rating']);

function CardGroup({ components, renderField, groupSize }: {
  components: ComponentNode[];
  renderField: (comp: ComponentNode) => React.ReactNode;
  groupSize: number;
}) {
  const groups: ComponentNode[][] = useMemo(() => {
    const result: ComponentNode[][] = [];
    let current: ComponentNode[] = [];
    for (const comp of components) {
      current.push(comp);
      if (editableCardTypes.has(comp.type) && current.length >= groupSize) {
        result.push(current);
        current = [];
      }
    }
    if (current.length > 0) result.push(current);
    return result;
  }, [components, groupSize]);

  return (
    <div className="lg-card-groups">
      {groups.map((group, i) => (
        <div key={i} className="lg-card">
          {group.map(renderField)}
        </div>
      ))}
    </div>
  );
}

function FormFieldInput({ type, name, value, originalValue, disabled, props, error, onChange, onBlur, onFocus, onKeyDown, onPaste, onClear, onButtonClick, tables }: {
  type: ComponentType; name: string; value: unknown; originalValue: unknown;
  disabled: boolean; props: Record<string, unknown>; error?: string;
  onChange: (val: unknown) => void;
  onBlur: () => void;
  onFocus: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onClear?: () => void;
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
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      );
    case 'numberInput':
      return (
        <>
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
          {(props.min != null || props.max != null) && (
            <span className="lg-hint">范围：{props.min != null ? String(props.min) : '—'} ~ {props.max != null ? String(props.max) : '—'}</span>
          )}
        </>
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
    default: {
      if (isStructuredProperty(undefined, effectiveValue)) {
        const jsonStr = formatStructuredProperty(effectiveValue);
        return (
          <CodeEditor
            value={jsonStr}
            onChange={(next) => {
              const parsed = parseStructuredProperty(next);
              if (!parsed.error) onChange(parsed.value);
            }}
            language="json"
            title={name}
            disabled={disabled}
            theme="light"
            height={150}
            minHeight={80}
            lineNumbers
            suggestions={jsonSuggestions}
            suggestionTriggerCharacters={['"', ':', ',', '{', '[']}
            options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
            compact
            fullscreen={!disabled}
          />
        );
      }
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
}
