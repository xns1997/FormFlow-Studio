import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ComponentNode, ComponentType, RangeRef } from '../models';
import type { SrcTableEntry } from '../project/types';
import RangeTag from './RangeTag';
import RangeSelector from './RangeSelector';
import ChartWidget, { type MetricConfig } from './ChartWidget';
import CodeEditor from './CodeEditor';
import {
  AntdActionButton,
  AntdCheckboxInput,
  AntdDateInput,
  AntdDateRangeInput,
  AntdNumberInput,
  AntdRadioInput,
  AntdRateInput,
  AntdSegmentedInput,
  AntdSelectInput,
  AntdSwitchInput,
  AntdTagInput,
  AntdTextAreaInput,
  AntdTextInput,
  AntdTimeInput,
  AntdUploadInput,
  FormAntdProvider,
  toOptions,
  type UploadFileValue,
} from './AntdFormControls';
import { jsonSuggestions } from './codeEditorSuggestions';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/structuredProperties';
import { resolveRange } from '../services/rangeResolver';
import type { FormControlEventContext } from '../services/formFlowTrigger';
import { getRuntimeComponentType, isEditableComponentType, normalizeDateTimeValue, shouldShowFieldChrome } from '../services/controlTypes';

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
  const editableCount = visibleComponents.filter((c) => isEditableComponentType(c.type)).length;
  const isWizard = wizardMode === 'always' || (wizardMode === 'auto' && editableCount > WIZARD_FIELD_THRESHOLD);

  const steps: ComponentNode[][] = useMemo(() => {
    if (!isWizard) return [components];
    const result: ComponentNode[][] = [];
    let current: ComponentNode[] = [];
    for (const comp of components) {
      current.push(comp);
      if (current.length >= WIZARD_STEP_SIZE && isEditableComponentType(comp.type)) {
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
    const showChrome = shouldShowFieldChrome(comp.type);
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
          onTableRowClick={(rowIndex, row) => {
            void onControlEvent?.({
              eventName: 'onRowClick',
              field: comp.name,
              value: rowIndex,
              values,
              originalValues,
              component: comp,
              previousValue: values[comp.name],
              timestamp: Date.now(),
              detail: { rowIndex, row },
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

function normalizeFileList(files: unknown): UploadFileValue[] {
  return Array.isArray(files) ? files.filter((item) => item && typeof item === 'object').map((item) => {
    const record = item as Record<string, unknown>;
    return {
      name: String(record.name ?? '未命名文件'),
      size: Number(record.size ?? 0),
      type: String(record.type ?? ''),
      url: typeof record.url === 'string' ? record.url : undefined,
    };
  }) : [];
}

function normalizeDateRangeValue(value: unknown): { start: string; end: string } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      start: normalizeDateTimeValue(record.start, 'date'),
      end: normalizeDateTimeValue(record.end, 'date'),
    };
  }
  return { start: '', end: '' };
}

// ── Card grouping ──────────────────────────────────────────
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
      if (isEditableComponentType(comp.type)) {
        if (current.length >= groupSize) {
          result.push(current);
          current = [];
        }
      } else if (current.length >= groupSize) {
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

function FormFieldInput({ type, name, value, originalValue, disabled, props, error, onChange, onBlur, onFocus, onKeyDown, onPaste, onClear, onButtonClick, onTableRowClick, tables }: {
  type: ComponentType; name: string; value: unknown; originalValue: unknown;
  disabled: boolean; props: Record<string, unknown>; error?: string;
  onChange: (val: unknown) => void;
  onBlur: () => void;
  onFocus: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onClear?: () => void;
  onButtonClick: () => void;
  onTableRowClick?: (rowIndex: number, row: Record<string, unknown>) => void;
  tables: SrcTableEntry[];
}) {
  const isDirty = JSON.stringify(value) !== JSON.stringify(originalValue);
  const dirtyClass = isDirty ? 'dirty' : '';
  const errorClass = error ? 'error' : '';
  const designType = props.designType as string | undefined;
  const runtimeType = getRuntimeComponentType(type);
  const defaultValue = props.defaultValue;
  const effectiveValue = value ?? defaultValue;
  const optionList = toOptions(props.options);

  switch (runtimeType) {
    case 'input':
      return (
        <FormAntdProvider>
          <AntdTextInput
            value={String(effectiveValue ?? '')}
            placeholder={props.placeholder as string}
            disabled={disabled}
            onChange={onChange as (value: string) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    case 'numberInput':
      return (
        <>
          <FormAntdProvider>
            <AntdNumberInput
              value={effectiveValue === '' ? '' : (effectiveValue as number | string | null)}
              placeholder={props.placeholder as string}
              disabled={disabled}
              min={props.min as number}
              max={props.max as number}
              step={props.step as number}
              style={{ width: '100%' }}
              onChange={(next) => onChange(next === '' ? '' : Number(next))}
              onBlur={onBlur}
              onFocus={onFocus}
            />
          </FormAntdProvider>
          {(props.min != null || props.max != null) && (
            <span className="lg-hint">范围：{props.min != null ? String(props.min) : '—'} ~ {props.max != null ? String(props.max) : '—'}</span>
          )}
        </>
      );
    case 'textarea':
      return (
        <FormAntdProvider>
          <AntdTextAreaInput
            value={String(effectiveValue ?? '')}
            placeholder={props.placeholder as string}
            disabled={disabled}
            rows={props.rows as number || 3}
            autoSize={props.autoResize ? { minRows: props.rows as number || 3, maxRows: 8 } : false}
            onChange={onChange as (value: string) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    case 'select':
      return (
        <FormAntdProvider>
          <AntdSelectInput
            value={Array.isArray(effectiveValue) ? effectiveValue.map(String) : String(effectiveValue ?? '')}
            disabled={disabled}
            options={optionList}
            multiple={!!props.multiple}
            placeholder={props.placeholder as string || '请选择'}
            onChange={onChange as (value: string | string[]) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    case 'segmented':
      return (
        <FormAntdProvider>
          <AntdSegmentedInput
            value={String(effectiveValue ?? '')}
            disabled={disabled}
            options={optionList}
            block
            onChange={(next) => { onChange(next); onBlur(); }}
          />
        </FormAntdProvider>
      );
    case 'radio':
      return (
        <FormAntdProvider>
          <AntdRadioInput
            value={String(effectiveValue ?? '')}
            disabled={disabled}
            options={optionList}
            direction={(props.direction as 'vertical' | 'horizontal') || 'vertical'}
            onChange={(next) => { onChange(next); onBlur(); }}
          />
        </FormAntdProvider>
      );
    case 'checkbox':
      return (
        <FormAntdProvider>
          <AntdCheckboxInput
            value={Array.isArray(effectiveValue) ? effectiveValue.map(String) : []}
            disabled={disabled}
            options={optionList}
            direction={(props.direction as 'vertical' | 'horizontal') || 'vertical'}
            onChange={(next) => { onChange(next); onBlur(); }}
          />
        </FormAntdProvider>
      );
    case 'tagInput':
      return (
        <FormAntdProvider>
          <AntdTagInput
            disabled={disabled}
            value={Array.isArray(effectiveValue) ? effectiveValue.map(String) : []}
            placeholder={String(props.placeholder || '输入后按 Enter 添加标签')}
            onChange={onChange as (value: string[]) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    case 'datePicker':
      return (
        <FormAntdProvider>
          <AntdDateInput
            value={normalizeDateTimeValue(effectiveValue, props.showTime ? 'datetime' : 'date')}
            placeholder={String(props.placeholder || (props.showTime ? '选择日期时间' : '选择日期'))}
            disabled={disabled}
            showTime={!!props.showTime}
            format={String(props.format || (props.showTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'))}
            min={normalizeDateTimeValue(props.minDate, props.showTime ? 'datetime' : 'date')}
            max={normalizeDateTimeValue(props.maxDate, props.showTime ? 'datetime' : 'date')}
            onChange={onChange as (value: string) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    case 'timePicker':
      return (
        <FormAntdProvider>
          <AntdTimeInput
            value={normalizeDateTimeValue(effectiveValue, 'time')}
            placeholder={String(props.placeholder || (props.showSeconds ? 'HH:mm:ss' : 'HH:mm'))}
            disabled={disabled}
            format={String(props.format || (props.showSeconds ? 'HH:mm:ss' : 'HH:mm'))}
            showSeconds={!!props.showSeconds}
            onChange={onChange as (value: string) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    case 'dateRange': {
      const rangeValue = normalizeDateRangeValue(effectiveValue);
      return (
        <FormAntdProvider>
          <AntdDateRangeInput
            value={rangeValue}
            disabled={disabled}
            placeholder={[
              String(props.startPlaceholder || '开始日期'),
              String(props.endPlaceholder || '结束日期'),
            ]}
            format={String(props.format || 'YYYY-MM-DD')}
            onChange={onChange as (value: { start: string; end: string }) => void}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    }
    case 'switch':
      return (
        <FormAntdProvider>
          <AntdSwitchInput
            checked={!!effectiveValue}
            disabled={disabled}
            onChange={(next) => { onChange(next); onBlur(); }}
          />
        </FormAntdProvider>
      );
    case 'rating':
      return (
        <FormAntdProvider>
          <AntdRateInput
            value={Number(effectiveValue) || 0}
            count={Number(props.max) || 5}
            disabled={disabled}
            onChange={(next) => { onChange(next); onBlur(); }}
          />
        </FormAntdProvider>
      );
    case 'button':
      return (
        <FormAntdProvider>
          <AntdActionButton
            label={props.label as string || '按钮'}
            disabled={disabled}
            variant={props.variant === 'ghost' ? 'ghost' : props.variant === 'default' ? 'outline' : 'solid'}
            onClick={onButtonClick}
          />
        </FormAntdProvider>
      );
    case 'text':
      return <div className="lg-text">{String(effectiveValue ?? props.content ?? '')}</div>;
    case 'image':
      return props.src ? (
        <img
          src={String(props.src)}
          alt={String(props.alt ?? '')}
          style={{
            width: '100%',
            maxHeight: Number(props.height) || 240,
            objectFit: (props.fit as any) || 'cover',
            borderRadius: Number(props.borderRadius) || 18,
            opacity: Number(props.opacity ?? 1),
          }}
        />
      ) : <div className="lg-text">{String(props.alt ?? '图片')}</div>;
    case 'upload':
      return (
        <FormAntdProvider>
          <AntdUploadInput
            disabled={disabled}
            files={normalizeFileList(effectiveValue)}
            onChange={onChange as (files: UploadFileValue[]) => void}
          />
        </FormAntdProvider>
      );
    case 'imageUpload':
      return (
        <FormAntdProvider>
          <AntdUploadInput
            disabled={disabled}
            imageOnly
            files={normalizeFileList(effectiveValue)}
            onChange={onChange as (files: UploadFileValue[]) => void}
          />
        </FormAntdProvider>
      );
    case 'table': {
      const configuredColumns = Array.isArray(props.columns) ? props.columns.map(String) : [];
      const rawRows = Array.isArray(effectiveValue)
        ? effectiveValue
        : Array.isArray(props.data)
          ? props.data
          : [];
      const normalizedRows = rawRows
        .map((row) => {
          if (row && typeof row === 'object' && !Array.isArray(row)) return row as Record<string, unknown>;
          if (Array.isArray(row)) {
            return Object.fromEntries(row.map((cell, index) => [configuredColumns[index] || `列${index + 1}`, cell]));
          }
          return { value: row };
        });
      const derivedColumns = normalizedRows.length > 0
        ? [...new Set(normalizedRows.flatMap((row) => Object.keys(row)))]
        : [];
      const columns = configuredColumns.length > 0 ? configuredColumns : derivedColumns;
      const placeholderRows = Math.max(1, Number(props.rows) || 3);
      const displayRows = normalizedRows.length > 0
        ? normalizedRows
        : Array.from({ length: placeholderRows }, () => Object.fromEntries(columns.map((column) => [column, '-'])));
      return (
        <table className="lg-render-table">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onTableRowClick?.(rowIndex, row)}
                style={{ cursor: onTableRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((column) => <td key={column}>{String(row[column] ?? '-')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'tabs':
      return (
        <div className="lg-tabs-render">
          {toOptions(props.tabs).map((tab, index) => (
            <button
              key={tab.value}
              type="button"
              className={index === Number(effectiveValue ?? props.defaultTab ?? 0) ? 'active' : ''}
              disabled={disabled}
              onClick={() => { if (!disabled) onChange(index); }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      );
    case 'steps':
      return (
        <div className="lg-steps-render">
          {toOptions(props.steps || props.tabs).map((step, index) => {
            const activeIndex = Number(effectiveValue ?? props.defaultStep ?? 0);
            const done = index < activeIndex;
            const active = index === activeIndex;
            return (
              <button
                key={step.value}
                type="button"
                className={`lg-step-item ${active ? 'active' : ''} ${done ? 'done' : ''}`}
                disabled={disabled}
                onClick={() => { if (!disabled) onChange(index); }}
              >
                <span className="lg-step-dot">{done ? '✓' : index + 1}</span>
                <span className="lg-step-label">{step.label}</span>
              </button>
            );
          })}
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
        <AntdTextInput
          value={String(effectiveValue ?? '')}
          disabled={disabled}
          onChange={(next) => onChange(next)}
          onBlur={onBlur}
          onFocus={onFocus}
        />
      );
    }
  }
}
