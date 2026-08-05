import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ComponentNode, ComponentType, RangeRef } from '../models';
import type { SrcTableEntry } from '../project/types';
import RangeTag from './RangeTag';
import RangeSelector from './RangeSelector';
import ChartWidget, { type MetricConfig } from './ChartWidget';
import { normalizeChartInput } from './ChartWidget';
import AnimatedNumber from './AnimatedNumber';
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
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/data/structuredProperties';
import { resolveRange } from '../services/data/rangeResolver';
import type { FormControlEventContext } from '../services/engine/formFlowTrigger';
import { decodeDateTimeForDisplay, encodeDateTimeForStorage, getRuntimeComponentType, isEditableComponentType, normalizeDateTimeValue, shouldShowFieldChrome } from '../services/config/controlTypes';
import { resolveExpressionValues, resolveRuntimeProperties } from '../services/engine/propertyExpression';
import { compileComponentValidation, validateField } from '../services/engine/validator';
import { resolveDateConstraintState } from '../services/data/dateConvenience';
import { resolveOptionSource } from '../services/data/optionSource';
import EditableTableGrid, { type EditableTableChangeDetail, type TableChangeTracking, validateEditableTableValue } from './EditableTableGrid';
import {
  resolveComponentFieldName,
  normalizeRenderProps,
  WIZARD_FIELD_THRESHOLD,
  WIZARD_STEP_SIZE,
  CARD_GROUP_SIZE,
} from '../services/engine/formEngine';

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

// Constants imported from formEngine

function RuntimeImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return <div className="lg-image-runtime" role="img" aria-label={alt || '图片'}>{state === 'loading' && <span className="lg-image-state" role="status">图片加载中…</span>}{state === 'error' ? <div className="lg-image-state error" role="alert">图片加载失败，请检查地址或重新选择图片。</div> : <img src={src} alt={alt} style={style} onLoad={() => setState('ready')} onError={() => setState('error')} />}</div>;
}

export function generateCodeFromTemplate(template: string, field: string) {
  const source = template.trim();
  if (!source) return '';
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const key = `formflow:sequence:${field}:${source}`;
  let sequence = 1;
  try {
    const current = Number(localStorage.getItem(key) || 0);
    sequence = Number.isFinite(current) ? current + 1 : 1;
    localStorage.setItem(key, String(sequence));
  } catch { /* private mode: use a per-call best effort sequence */ }
  return source.replace(/\{yyyy\}/gi, yyyy).replace(/\{yyyyMM\}/gi, `${yyyy}${mm}`).replace(/\{yyyyMMdd\}/gi, `${yyyy}${mm}${dd}`).replace(/\{n(?::(\d+))?\}/gi, (_match, width) => String(sequence).padStart(Number(width || 1), '0'));
}

export default function FormRenderer({
  components, values, originalValues, componentStates, errors, onChange,
  onBlur, onFocus, onKeyDown, onPaste, onClear, onButtonClick, onControlEvent,
  tables = [], rangeConnections = {}, onRangeChange,
  autoFocus, autoFocusKey, wizardMode = 'auto', layout = 'flat',
}: FormRendererProps) {
  const [connectingField, setConnectingField] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState(0);
  const [validatingFields, setValidatingFields] = useState<Set<string>>(new Set());
  const restoredLastInputs = useRef(new Set<string>());
  const formRef = useRef<HTMLDivElement>(null);
  const expressionValues = useMemo(() => resolveExpressionValues(components.map((component) => ({
    field: resolveComponentFieldName(component), props: normalizeRenderProps(component),
  })), values, originalValues).values, [components, values, originalValues]);
  const liveValuesRef = useRef(expressionValues);
  liveValuesRef.current = expressionValues;

  useEffect(() => {
    for (const component of components) {
      const props = normalizeRenderProps(component);
      const field = resolveComponentFieldName(component);
      if (props.rememberLastInput !== true || restoredLastInputs.current.has(field) || (values[field] != null && values[field] !== '')) continue;
      if (/密码|身份证|token|secret/i.test(`${field} ${component.label}`)) continue;
      try {
        const raw = localStorage.getItem(`formflow:last-input:${field}`);
        if (raw) { onChange(field, JSON.parse(raw)); restoredLastInputs.current.add(field); }
      } catch { /* private mode or malformed old value */ }
    }
  }, [components, onChange, values]);

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
    const props = normalizeRenderProps(c);
    const field = resolveComponentFieldName(c);
    return resolveRuntimeProperties(props, expressionValues[field], { form: expressionValues, original: originalValues, component: props }).required;
  });
  const filledRequired = requiredFields.filter((c) => {
    const v = expressionValues[resolveComponentFieldName(c)];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  const requiredProgress = requiredFields.length > 0 ? `${filledRequired.length}/${requiredFields.length}` : null;
  const primaryButtons = components.filter((component) => component.type === 'button' && !component.props.disabled && ['submit', 'save', 'query'].includes(String(component.props.action || 'submit')));
  const draftAnchor = components.find((component) => isEditableComponentType(component.type)) || components[0];
  const draftKey = `formflow:draft:${draftAnchor ? resolveComponentFieldName(draftAnchor) : 'form'}`;

  const handleFieldBlur = useCallback((field: string) => {
    setTouched((prev) => new Set(prev).add(field));
  }, []);

  const shouldValidateComponent = useCallback((
    component: ComponentNode,
    runtime: ReturnType<typeof resolveRuntimeProperties>,
    state?: { visible: boolean; disabled: boolean; readonly: boolean },
  ) => {
    if (!isEditableComponentType(component.type) && !(component.type === 'table' && component.props?.editable === true)) return false;
    if (state?.visible === false || runtime.visible === false) return false;
    if (state?.disabled || state?.readonly) return false;
    if (runtime.disabled) return false;
    if (runtime.props.disabled || runtime.props.readonly) return false;
    if (component.props?.valueExpression) return false;
    return true;
  }, []);

  const validationErrors = useMemo(() => Object.fromEntries(components.map((component) => {
    const field = resolveComponentFieldName(component);
    const props = normalizeRenderProps(component);
    const runtime = resolveRuntimeProperties(props, expressionValues[field], { form: expressionValues, original: originalValues, component: props });
    const required = componentStates[component.id]?.visible === false ? false : runtime.required;
    if (!shouldValidateComponent(component, runtime, componentStates[component.id])) return [field, ''];
    if (component.type === 'table') return [field, validateEditableTableValue(runtime.props, expressionValues[field])];
    return [field, validateField(expressionValues[field], compileComponentValidation({ ...runtime.props, required, componentType: component.type }), { ...expressionValues, componentType: component.type }) || ''];
  })), [components, componentStates, expressionValues, originalValues, shouldValidateComponent]);

  const validateBeforeSubmit = useCallback(() => {
    const invalidFields = Object.entries(validationErrors).filter(([, error]) => !!error).map(([field]) => field);
    if (!invalidFields.length) return true;
    setTouched((current) => new Set([...current, ...invalidFields]));
    window.requestAnimationFrame(() => {
      const first = Array.from(formRef.current?.querySelectorAll<HTMLElement>('[data-field-name]') || []).find((element) => element.dataset.fieldName === invalidFields[0]);
      if (!first) return;
      first.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      first.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    });
    return false;
  }, [validationErrors]);

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
    const baseProps = normalizeRenderProps(comp);
    const fieldName = resolveComponentFieldName(comp);
    const runtime = resolveRuntimeProperties(baseProps, expressionValues[fieldName], { form: expressionValues, original: originalValues, component: baseProps });
    if (!state.visible || !runtime.visible) return null;
    const props: Record<string, unknown> = { ...runtime.props, required: runtime.required };
    const fieldError = errors[fieldName] || validationErrors[fieldName];
    const hasError = !!fieldError;
    const isTouched = touched.has(fieldName);
    const isDirty = JSON.stringify(expressionValues[fieldName]) !== JSON.stringify(originalValues[fieldName]);
    const showSuccess = isTouched && !hasError && isDirty && !!props.required;
    const isEmpty = runtime.value == null || runtime.value === '' || (Array.isArray(runtime.value) && runtime.value.length === 0);
    const isValidating = validatingFields.has(fieldName);
    const hasWarning = props.optionLoading === true || (!!props.dataBinding && !isDirty && !isEmpty);
    const rangeRef = rangeConnections[fieldName] || null;
    const showChrome = shouldShowFieldChrome(comp.type);
    const inputKind = String(props.inputKind || '');
    const formatSamples: Record<string, string> = { email: 'name@example.com', phone: '13800138000', idcard: '18 位身份证号', url: 'https://example.com', code: String(props.codeTemplate || '按编号规则输入') };
    const formatHint = formatSamples[inputKind];
    const canCopySample = !!formatHint && !/身份证|密码|token|secret/i.test(`${fieldName} ${comp.label}`);
    const valueIsSensitive = /身份证|密码|token|secret/i.test(`${fieldName} ${comp.label}`);
    return (
      <div
        key={comp.id}
        className={`lg-field ${state.disabled ? 'disabled' : ''} ${hasError && isTouched ? 'has-error' : ''} ${isDirty ? 'dirty-indicator' : ''}`}
        data-component-id={comp.id}
        data-component-type={comp.type}
        data-field-name={fieldName}
        aria-busy={isValidating}
        aria-keyshortcuts="Tab Enter Escape"
        title={!valueIsSensitive && typeof runtime.value === 'string' && runtime.value.length > 24 ? runtime.value : undefined}
      >
        {showChrome && (
          <label className="lg-label">
            {comp.label}
            {!!props.required && <span className="lg-required">*</span>}
            {showSuccess && <span className="lg-valid-check">✓</span>}
            {isValidating && <span className="lg-field-state" role="status">检查中</span>}
            {!isValidating && isEmpty && !props.required && <span className="lg-field-state" role="status">未填写</span>}
            {state.disabled && <span className="lg-field-state" role="status">暂不可用</span>}
            {!state.disabled && (state.readonly || props.readonly === true) && <span className="lg-field-state" role="status">仅查看</span>}
            {!!props.dataBinding && !isDirty && <span className="lg-field-state" role="status">自动带出</span>}
            {props.rememberLastInput === true && !isDirty && !props.dataBinding && <span className="lg-field-state" role="status">上次输入</span>}
            {hasWarning && props.optionLoading === true && <span className="lg-field-state warning" role="status">选项加载中</span>}
          </label>
        )}
        <FormFieldInput
          type={comp.type}
          name={fieldName}
          value={runtime.value}
          values={expressionValues}
          originalValue={originalValues[fieldName]}
          disabled={state.disabled || state.readonly || runtime.disabled || !!props.disabled || !!props.readonly || !!baseProps.valueExpression}
          props={props}
          error={isTouched ? errors[fieldName] : undefined}
          onChange={(val, detail) => {
            const currentValues = liveValuesRef.current;
            const previousValue = currentValues[fieldName];
            const nextValues = { ...currentValues, [fieldName]: val };
            liveValuesRef.current = nextValues;
            onChange(fieldName, val);
            if (props.rememberLastInput === true && !valueIsSensitive) { try { localStorage.setItem(`formflow:last-input:${fieldName}`, JSON.stringify(val)); } catch { /* ignore storage limits */ } }
            void onControlEvent?.({
              eventName: 'onChange', field: fieldName, value: val,
              values: nextValues, originalValues, component: comp, previousValue, timestamp: Date.now(),
              detail,
            });
          }}
          onBlur={() => {
            const currentValues = liveValuesRef.current;
            setValidatingFields((current) => new Set(current).add(fieldName));
            window.setTimeout(() => setValidatingFields((current) => { const next = new Set(current); next.delete(fieldName); return next; }), 180);
            handleFieldBlur(fieldName);
            onBlur?.(fieldName);
            void onControlEvent?.({
              eventName: 'onBlur', field: fieldName, value: currentValues[fieldName],
              values: currentValues, originalValues, component: comp, previousValue: currentValues[fieldName], timestamp: Date.now(),
            });
          }}
          onFocus={() => {
            const currentValues = liveValuesRef.current;
            onFocus?.(fieldName);
            void onControlEvent?.({
              eventName: 'onFocus', field: fieldName, value: currentValues[fieldName],
              values: currentValues, originalValues, component: comp, previousValue: currentValues[fieldName], timestamp: Date.now(),
            });
          }}
          onKeyDown={onKeyDown ? (e) => onKeyDown(fieldName, e) : undefined}
          onPaste={onPaste ? (e) => onPaste(fieldName, e) : undefined}
          onClear={onClear ? () => onClear(fieldName) : undefined}
          onButtonClick={() => {
            if (!validateBeforeSubmit()) return;
            onButtonClick?.(fieldName);
            void onControlEvent?.({
              eventName: 'onClick', field: fieldName, value: expressionValues[fieldName],
              values: expressionValues, originalValues, component: comp, previousValue: expressionValues[fieldName], timestamp: Date.now(),
            });
          }}
          onTableRowClick={(rowIndex, row) => {
            void onControlEvent?.({
              eventName: 'onRowClick',
              field: fieldName,
              value: rowIndex,
              values: expressionValues,
              originalValues,
              component: comp,
              previousValue: expressionValues[fieldName],
              timestamp: Date.now(),
              detail: { rowIndex, row },
            });
          }}
          tables={tables}
        />
        {formatHint && <div className="lg-format-hint" role="note">格式示例：<code title={formatHint}>{formatHint}</code>{canCopySample && <button type="button" onClick={() => { void navigator.clipboard?.writeText(formatHint); }}>复制示例</button>}</div>}
        {(comp.type === 'datePicker' || comp.type === 'timePicker') && <div className="lg-format-hint" role="note">用户看到：{String(props.displayPreset || (props.showSeconds ? '时:分:秒' : '日期/时:分'))} · 系统保存：{String(props.storageFormat || '沿用标准格式')} · 时区：{String(props.timezone || '跟随设备')}</div>}
        {!!props.dataBinding && !isDirty && expressionValues[fieldName] != null && expressionValues[fieldName] !== '' && <button type="button" className="lg-field-clear-source" onClick={() => onChange(fieldName, '')}>清除自动带出</button>}
        {props.rememberLastInput === true && !props.dataBinding && expressionValues[fieldName] != null && expressionValues[fieldName] !== '' && <button type="button" className="lg-field-clear-source" onClick={() => { try { localStorage.removeItem(`formflow:last-input:${fieldName}`); } catch { /* ignore storage limits */ } onChange(fieldName, ''); }}>清除上次输入</button>}
        {tables.length > 0 && (
          <RangeTag
            range={rangeRef}
            onConnect={() => setConnectingField(fieldName)}
            onDisconnect={() => onRangeChange?.(fieldName, null)}
          />
        )}
        {hasError && isTouched && <span className="lg-error" role="alert">{fieldError}</span>}
      </div>
    );
  };

  return (
    <div className={`lg-form ${isWizard ? 'lg-form-wizard' : ''}`} ref={formRef}>
      {primaryButtons.length > 1 && <div className="lg-form-action-warning" role="status">当前表单有 {primaryButtons.length} 个主操作，建议只保留一个“提交/保存/查询”按钮，其余改为次要操作。</div>}
      {isWizard && <div className="lg-draft-actions"><button type="button" onClick={() => { try { localStorage.setItem(draftKey, JSON.stringify(values)); } catch { /* ignore storage limits */ } }}>稍后继续</button><button type="button" onClick={() => { try { const raw = localStorage.getItem(draftKey); if (raw) { const saved = JSON.parse(raw) as Record<string, unknown>; Object.entries(saved).forEach(([field, value]) => onChange(field, value)); } } catch { /* ignore malformed draft */ } }}>恢复草稿</button></div>}
      {/* Required progress */}
      {requiredProgress && (
        <div className="lg-required-progress">
          <div className="lg-required-progress-bar">
            <div className="lg-required-progress-fill" style={{ width: `${(filledRequired.length / requiredFields.length) * 100}%` }} />
          </div>
          <span className="lg-required-progress-text">必填项 {requiredProgress}</span>
          {filledRequired.length < requiredFields.length && <details className="lg-required-missing"><summary>查看未填项</summary><div>{requiredFields.filter((component) => { const value = expressionValues[resolveComponentFieldName(component)]; return value == null || value === '' || (Array.isArray(value) && value.length === 0); }).map((component) => <button key={component.id} type="button" onClick={() => { const node = formRef.current?.querySelector<HTMLElement>(`[data-component-id="${CSS.escape(component.id)}"]`); node?.scrollIntoView({ block: 'center', behavior: 'smooth' }); node?.querySelector<HTMLElement>('input,textarea,select,[tabindex]:not([tabindex="-1"])')?.focus(); }}>{component.label}</button>)}</div></details>}
        </div>
      )}

      {/* Wizard step bar */}
      {isWizard && totalSteps > 1 && (
        <div className="lg-wizard-bar">
          {steps.map((_, i) => (
            <button type="button"
              key={i}
              className={`lg-wizard-step ${i === safeStep ? 'active' : i < safeStep ? 'done' : ''}`}
              onClick={() => setCurrentStep(i)}
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
          {safeStep === totalSteps - 1 && <details className="lg-submit-summary"><summary>提交前检查摘要</summary><div>{requiredFields.slice(0, 5).map((component) => { const field = resolveComponentFieldName(component); const value = expressionValues[field]; return <span key={component.id}>{component.label}：{value == null || value === '' ? '未填写' : Array.isArray(value) ? `${value.length} 项` : String(value)}</span>; })}</div></details>}
          <button type="button"
            className="lg-btn"
            onClick={() => setCurrentStep(Math.max(0, safeStep - 1))}
            disabled={safeStep === 0}
          >
            上一步
          </button>
          <span className="lg-wizard-nav-info">{safeStep + 1} / {totalSteps}</span>
          {safeStep < totalSteps - 1 ? (
            <button type="button"
              className="lg-btn lg-btn-primary"
              onClick={() => setCurrentStep(Math.min(totalSteps - 1, safeStep + 1))}
            >
              下一步
            </button>
          ) : (
            <button className="lg-btn lg-btn-primary" type="button" onClick={() => validateBeforeSubmit() && onButtonClick?.('__submit')}>
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

// normalizeRenderProps and resolveComponentFieldName imported from formEngine

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

function FormFieldInput({ type, name, value, values, originalValue, disabled, props, error, onChange, onBlur, onFocus, onKeyDown, onPaste, onClear, onButtonClick, onTableRowClick, tables }: {
  type: ComponentType; name: string; value: unknown; originalValue: unknown;
  values: Record<string, unknown>;
  disabled: boolean; props: Record<string, unknown>; error?: string;
  onChange: (val: unknown, detail?: EditableTableChangeDetail) => void;
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
  const runtimeOptions = Array.isArray(props.runtimeOptions) ? props.runtimeOptions : null;
  const optionList = toOptions(runtimeOptions || resolveOptionSource(props.options, props.optionSource, tables).options);

  switch (runtimeType) {
    case 'input':
      return (
        <FormAntdProvider>
          <div className="lg-input-with-action">
            <AntdTextInput
              value={String(effectiveValue ?? '')}
              placeholder={props.placeholder as string}
              disabled={disabled}
              readOnly={!!props.readonly}
              style={{ fontFamily: props.fontFamily ? String(props.fontFamily) : undefined, fontSize: Number(props.fontSize) || 15, fontWeight: String(props.fontWeight || 400), color: String(props.color || '#1c1c1e'), lineHeight: props.lineHeight ? Number(props.lineHeight) : undefined, letterSpacing: `${Number(props.letterSpacing) || 0}px`, textAlign: String(props.textAlign || 'left') as React.CSSProperties['textAlign'] }}
              onChange={onChange as (value: string) => void}
              onBlur={onBlur}
              onFocus={onFocus}
            />
            {String(props.inputKind || '') === 'code' && String(props.codeTemplate || '').trim() && <button type="button" className="lg-generate-code" disabled={disabled || !!props.readonly} onClick={() => onChange(generateCodeFromTemplate(String(props.codeTemplate), name))}>生成编号</button>}
          </div>
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
              readOnly={!!props.readonly}
              min={props.min as number}
              max={props.max as number}
              step={props.step as number}
              precision={Number.isFinite(Number(props.precision)) ? Number(props.precision) : undefined}
              prefix={props.prefix as React.ReactNode}
              suffix={props.suffix as React.ReactNode}
              style={{ width: '100%', fontSize: Number(props.fontSize) || 15, fontWeight: String(props.fontWeight || 400), color: String(props.color || '#1c1c1e'), textAlign: String(props.textAlign || 'left') as React.CSSProperties['textAlign'] }}
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
            readOnly={!!props.readonly}
            rows={props.rows as number || 3}
            autoSize={props.autoResize ? { minRows: props.rows as number || 3, maxRows: 8 } : false}
            maxLength={Number(props.maxLength) || undefined}
            showCount={!!props.showCount}
            style={{ fontSize: Number(props.fontSize) || 15, fontWeight: String(props.fontWeight || 400), color: String(props.color || '#1c1c1e'), lineHeight: Number(props.lineHeight) || 1.5 }}
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
            readOnly={!!props.readonly}
            options={optionList}
            multiple={!!props.multiple}
            placeholder={props.placeholder as string || '请选择'}
            style={{ width: '100%', fontSize: Number(props.fontSize) || 15, fontWeight: String(props.fontWeight || 400), color: String(props.color || '#1c1c1e') }}
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
            style={{ fontSize: props.size === 'small' ? 13 : props.size === 'large' ? 17 : Number(props.fontSize) || 15, fontWeight: String(props.fontWeight || 400), color: String(props.color || '#1c1c1e') }}
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
            style={{ fontSize: props.size === 'small' ? 13 : props.size === 'large' ? 17 : Number(props.fontSize) || 15, fontWeight: String(props.fontWeight || 400), color: String(props.color || '#1c1c1e') }}
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
    case 'datePicker': {
      const dateConstraints = resolveDateConstraintState(props.constraintConfig as any, values, props.showTime ? 'datetime' : 'date', props.businessDayConfig as any, { minDate: props.minDate, maxDate: props.maxDate });
      return (
        <FormAntdProvider>
          <AntdDateInput
            value={decodeDateTimeForDisplay(effectiveValue, String(props.timezone || 'local'), props.showTime ? 'datetime' : 'date')}
            placeholder={String(props.placeholder || (props.showTime ? '选择日期时间' : '选择日期'))}
            disabled={disabled}
            showTime={!!props.showTime}
            format={String(props.displayFormat || props.format || (props.showTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'))}
            min={dateConstraints.min}
            max={dateConstraints.max}
            disableWeekends={dateConstraints.weekdaysOnly}
            onChange={(next) => onChange(encodeDateTimeForStorage(next, String(props.timezone || 'local'), props.showTime ? 'datetime' : 'date'))}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    }
    case 'timePicker': {
      const timeConstraints = resolveDateConstraintState(props.constraintConfig as any, values, 'time');
      return (
        <FormAntdProvider>
          <AntdTimeInput
            value={normalizeDateTimeValue(effectiveValue, 'time')}
            placeholder={String(props.placeholder || (props.showSeconds ? 'HH:mm:ss' : 'HH:mm'))}
            disabled={disabled}
            format={String(props.displayFormat || props.format || (props.showSeconds ? 'HH:mm:ss' : 'HH:mm'))}
            showSeconds={!!props.showSeconds}
            min={timeConstraints.min}
            max={timeConstraints.max}
            onChange={(next) => onChange(encodeDateTimeForStorage(next, String(props.timezone || 'local'), 'time'))}
            onBlur={onBlur}
            onFocus={onFocus}
          />
        </FormAntdProvider>
      );
    }
    case 'dateRange': {
      const rangeValue = normalizeDateRangeValue(effectiveValue);
      const rangeConstraints = resolveDateConstraintState(props.constraintConfig as any, values, 'date', props.businessDayConfig as any);
      return (
        <FormAntdProvider>
          <AntdDateRangeInput
            value={rangeValue}
            disabled={disabled}
            placeholder={[
              String(props.startPlaceholder || '开始日期'),
              String(props.endPlaceholder || '结束日期'),
            ]}
            format={String(props.displayFormat || props.format || 'YYYY-MM-DD')}
            min={rangeConstraints.min}
            max={rangeConstraints.max}
            disableWeekends={rangeConstraints.weekdaysOnly}
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
            size={(props.size as 'small' | 'default' | 'large') || 'default'}
            activeColor={String(props.activeColor || '#34c759')}
            inactiveColor={String(props.inactiveColor || 'rgba(118,118,128,0.18)')}
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
            size={(props.size as 'small' | 'default' | 'large') || 'default'}
            color={String(props.activeColor || '#ff9500')}
            inactiveColor={String(props.inactiveColor || '#e5e5ea')}
            allowHalf={!!props.allowHalf}
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
            danger={props.variant === 'danger'}
            block={!!props.fullWidth}
            style={{ fontSize: Number(props.fontSize) || 16, fontWeight: String(props.fontWeight || 650), color: String(props.color || '#fff'), background: props.backgroundColor ? String(props.backgroundColor) : undefined, borderRadius: Number(props.borderRadius) || 0 }}
            onClick={onButtonClick}
          />
        </FormAntdProvider>
      );
    case 'text':
      return <div className="lg-text">{String(effectiveValue ?? props.content ?? '')}</div>;
    case 'animatedNumber':
      return (
        <div className="lg-text">
          <AnimatedNumber
            value={effectiveValue == null || effectiveValue === '' ? (props.content ?? '0') : effectiveValue}
            duration={Number(props.duration) || 1200}
            decimals={Number(props.decimals) || 0}
            prefix={String(props.prefix ?? '')}
            suffix={String(props.suffix ?? '')}
            useGrouping={props.useGrouping !== false}
            style={{
              fontSize: Number(props.fontSize) || 32,
              fontWeight: String(props.fontWeight ?? 'bold') as React.CSSProperties['fontWeight'],
              fontFamily: props.fontFamily ? String(props.fontFamily) : undefined,
              color: String(props.color ?? '#2563eb'),
              textAlign: String(props.textAlign ?? 'left') as React.CSSProperties['textAlign'],
              letterSpacing: `${Number(props.letterSpacing) || 0}px`,
              lineHeight: String(props.lineHeight ?? 1.2),
              textDecoration: String(props.textDecoration ?? 'none') as React.CSSProperties['textDecoration'],
              display: 'inline-block',
              width: '100%',
            }}
          />
        </div>
      );
    case 'image':
      return (() => {
        const resolvedSrc = typeof effectiveValue === 'string' && effectiveValue
          ? effectiveValue
          : effectiveValue && typeof effectiveValue === 'object' && typeof (effectiveValue as Record<string, unknown>).url === 'string'
            ? String((effectiveValue as Record<string, unknown>).url)
            : props.src;
        return resolvedSrc ? (
          <RuntimeImage
            src={String(resolvedSrc)}
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
      })();
    case 'upload':
      return (
        <FormAntdProvider>
          <AntdUploadInput
            disabled={disabled}
            files={normalizeFileList(effectiveValue)}
            constraints={{ accept: String(props.accept || ''), maxFileSizeMb: Number(props.maxFileSizeMb || 0), maxCount: Number(props.maxCount || 0) }}
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
            imageRotate={Number(props.imageRotate || 0)}
            files={normalizeFileList(effectiveValue)}
            constraints={{ accept: String(props.accept || 'image/*'), maxFileSizeMb: Number(props.maxFileSizeMb || 0), maxCount: Number(props.maxCount || 0), minImageWidth: Number(props.minImageWidth || 0), maxImageWidth: Number(props.maxImageWidth || 0), minImageHeight: Number(props.minImageHeight || 0), maxImageHeight: Number(props.maxImageHeight || 0) }}
            onChange={onChange as (files: UploadFileValue[]) => void}
          />
        </FormAntdProvider>
      );
    case 'table': {
      const dataSource = props.dataSource && typeof props.dataSource === 'object' ? props.dataSource as Record<string, unknown> : null;
      const tableData = dataSource
        ? tables.find((table) => table.id === String(dataSource.tableId || ''))?.sheets.find((sheet) => sheet.name === String(dataSource.sheetName || ''))?.preview
        : undefined;
      return (
        <EditableTableGrid
          label={String(props.label || '')}
          columns={props.columns}
          data={tableData || props.data}
          value={effectiveValue}
          editable={props.editable === true}
          disabled={disabled}
          addable={props.addable === true}
          removable={props.removable === true}
          rowKey={String(props.rowKey || '') || undefined}
          changeTracking={(props.changeTracking as TableChangeTracking) || 'fullRows'}
          placeholderRows={Math.max(1, Number(props.rows) || 3)}
          conflictRows={Array.isArray(props.conflictRows) ? props.conflictRows.map(Number).filter(Number.isFinite) : []}
          onRetryRow={(rowIndex) => onChange(value as unknown, { kind: 'cell-update', rowIndex, validationErrors: {} })}
          showGrid={props.showGrid !== false}
          striped={props.striped !== false}
          headerBackground={String(props.headerBackground || '') || undefined}
          headerColor={String(props.headerColor || '') || undefined}
          headerFontWeight={String(props.headerFontWeight || '') || undefined}
          cellColor={String(props.cellColor || '') || undefined}
          onChange={onChange}
          onRowClick={onTableRowClick}
        />
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
        const runtimeChartInput = normalizeChartInput(effectiveValue);
        return (
          <ChartWidget
            chartType={(props.chartType as any) || 'bar'}
            title={String(props.title ?? '')}
            data={runtimeChartInput?.data || (props.chartData as any) || undefined}
            rawData={runtimeChartInput?.rawData || resolved?.data}
            headers={runtimeChartInput?.headers || resolved?.headers}
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
            autoSuggestPolicy="json-contextual"
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
