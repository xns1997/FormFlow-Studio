import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultFormWindow, type DebugEntry, type DesignComponent, type FormEventExecutionTrace, type FormWindowConfig, type SrcTableEntry, type WorkflowFile } from '../project/types';
import { getControl } from './registry';
import {
  executeDesignPreviewEvent,
  getDesignComponentField,
  type DesignPreviewEventResult,
} from '../services/engine/designPreviewRuntime';
import { applyProjectWriteBacks, persistProjectTableSideEffects } from '../services/io/projectWriteBack';
import { collectFlowSideEffects } from '../services/engine/flowSideEffects';
import { useProjectStore } from '../project/store';
import { getPreviewInitialValue, getPreviewInitializationSignature } from '../services/display/previewValues';
import DebugDrawer from '../components/DebugDrawer';
import { resolveExpressionValues, resolveRuntimeProperties } from '../services/engine/propertyExpression';
import { compileComponentValidation, validateField } from '../services/engine/validator';
import { canBindingWrite, normalizeDataBinding, resolveBindingWrite, resolveDataBindingValue } from '../services/data/dataBinding';
import { maskRuntimeValues, publishFormRuntimeSnapshot, removeFormRuntimeSnapshot } from '../services/engine/formRuntimeSnapshot';
import { resolveLinkageOptions, resolveOptionSource, syncOptionValue, type OptionItem } from '../services/data/optionSource';
import { describeDateConstraints, describeDateDefaultSource, isEmptyDateValue, resolveDateConstraintState, syncDateValue } from '../services/data/dateConvenience';
import { isEditableComponentType } from '../services/config/controlTypes';
import { FormWindowFrame } from './FormWindowFrame';
import { validateEditableTableValue } from '../components/EditableTableGrid';
import { createFormInteractionMetrics, persistFormInteractionMetrics, recordFormMetric, restoreFormInteractionMetrics } from '../services/engine/formMetrics';

interface PreviewCanvasProps {
  formId?: string;
  components: DesignComponent[];
  zoom: number;
  workflows: WorkflowFile[];
  tables: SrcTableEntry[];
  formWindow?: FormWindowConfig;
  presentation?: 'designer' | 'runtime';
  interactionPolicy?: 'full' | 'local-only';
  onClose?: () => void;
  onTablesChange?: (tables: SrcTableEntry[]) => void;
}

interface EventStatus {
  key: number;
  label: string;
  state: 'running' | 'success' | 'warning' | 'error' | 'canceled';
  cancel?: () => void;
  persisted?: boolean;
  details?: string[];
  retry?: () => void;
}

function supportsDynamicOptions(componentType: string) {
  return componentType === 'select' || componentType === 'radio' || componentType === 'checkbox' || componentType === 'segmented';
}

function supportsDateConvenience(componentType: string) {
  return componentType === 'datePicker' || componentType === 'timePicker' || componentType === 'dateRange';
}

type RuntimeOptionsState = {
  options: OptionItem[];
  source: 'linked' | 'table' | 'range' | 'static';
  clearedCount?: number;
};

export function PreviewCanvas({ formId, components, zoom, workflows, tables, formWindow: suppliedFormWindow, presentation = 'designer', interactionPolicy = 'full', onClose, onTablesChange }: PreviewCanvasProps) {
  const formWindow = suppliedFormWindow || createDefaultFormWindow();
  const viewportRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((state) => state.project);
  const persistProject = useProjectStore((state) => state.persistProject);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});
  const [componentVisibility, setComponentVisibility] = useState<Record<string, boolean>>({});
  const [componentDisabled, setComponentDisabled] = useState<Record<string, boolean>>({});
  const [fieldRequired, setFieldRequired] = useState<Record<string, boolean>>({});
  const [componentOptions, setComponentOptions] = useState<Record<string, RuntimeOptionsState>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<EventStatus | null>(null);
  const retryEventRef = useRef<(() => void) | null>(null);
  const canceledEventRef = useRef<number | null>(null);
  const completedOperationKeysRef = useRef(new Set<string>());
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('formflow:completed-operations') || '[]');
      if (Array.isArray(saved)) saved.filter((item): item is string => typeof item === 'string').forEach((item) => completedOperationKeysRef.current.add(item));
    } catch { /* ignore malformed/private storage */ }
  }, []);
  const metricsRef = useRef(createFormInteractionMetrics());
  useEffect(() => { metricsRef.current = (formId ? restoreFormInteractionMetrics(formId) : null) || createFormInteractionMetrics(); }, [formId]);
  const recordMetric = useCallback((event: Parameters<typeof recordFormMetric>[1], controlType?: string) => {
    metricsRef.current = recordFormMetric(metricsRef.current, event, Date.now(), controlType);
    if (formId) persistFormInteractionMetrics(formId, metricsRef.current);
  }, [formId]);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const behaviorSettings = project?.settings?.behavior;
  const debugEnabled = behaviorSettings?.enableDebugDrawer !== false;
  const autoOpenDebug = behaviorSettings?.autoOpenDebugDrawerOnWarnOrError !== false;
  const enableServerDebugApi = behaviorSettings?.enableServerDebugApi !== false;
  const expressionResolution = useMemo(() => resolveExpressionValues(components.map((component) => ({
    field: getDesignComponentField(component), props: component.props,
  })), values, originalValues), [components, values, originalValues]);
  const expressionValues = expressionResolution.values;
  const dirtyFieldsRef = useRef(new Set<string>());
  const componentFieldsRef = useRef(new Map<string, string>());
  const initializationSignaturesRef = useRef(new Map<string, string>());
  const validationSignaturesRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!formId || interactionPolicy === 'local-only') return;
    publishFormRuntimeSnapshot({
      formId,
      capturedAt: new Date().toISOString(),
      source: 'live',
      values: maskRuntimeValues(expressionValues),
      originalValues: maskRuntimeValues(originalValues),
      dirtyFields: [...dirtyFieldsRef.current],
      componentStates: Object.fromEntries(components.map((component) => {
        const field = getDesignComponentField(component);
        return [component.id, {
          visible: componentVisibility[component.id] ?? component.visible !== false,
          disabled: componentDisabled[component.id] ?? Boolean(component.props?.disabled),
          required: fieldRequired[field] ?? Boolean(component.props?.required),
        }];
      })),
      validationErrors: Object.fromEntries(Object.entries(fieldErrors).filter(([, message]) => Boolean(message))),
      recentLogs: debugEntries.slice(-30).map(({ level, title, message, timestamp }) => ({ level, title, message, timestamp })),
    });
  }, [componentDisabled, componentVisibility, components, debugEntries, expressionValues, fieldErrors, fieldRequired, formId, interactionPolicy, originalValues]);

  useEffect(() => () => { if (formId && interactionPolicy !== 'local-only') removeFormRuntimeSnapshot(formId); }, [formId, interactionPolicy]);

  // ── 表单 → 工作表同步（防抖） ──────────────────────
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncsRef = useRef<Array<{ tableId: string; sheetName: string; keyField: string; keyValue: unknown; column: string; value: unknown }>>([]);

  const flushSyncs = useCallback(() => {
    if (interactionPolicy === 'local-only') {
      pendingSyncsRef.current.splice(0);
      return;
    }
    if (pendingSyncsRef.current.length === 0 || !project) return;
    const syncs = pendingSyncsRef.current.splice(0);
    let nextProject = { ...project, srcTable: project.srcTable.map((t) => ({ ...t, sheets: t.sheets.map((s) => ({ ...s, preview: [...s.preview] })) })) };
    let changed = false;
    for (const sync of syncs) {
      const table = nextProject.srcTable.find((t) => t.id === sync.tableId);
      if (!table) continue;
      const sheet = table.sheets.find((s) => s.name === sync.sheetName);
      if (!sheet) continue;
      const row = sheet.preview.find((r) => r[sync.keyField] === sync.keyValue);
      if (row && Object.prototype.hasOwnProperty.call(row, sync.column)) {
        row[sync.column] = sync.value;
        changed = true;
      }
    }
    if (changed) persistProject(nextProject);
  }, [interactionPolicy, project, persistProject]);

  const queueTableSync = useCallback((field: string, value: unknown) => {
    if (interactionPolicy === 'local-only') return;
    const component = components.find((c) => getDesignComponentField(c) === field);
    if (!component) return;
    const binding = normalizeDataBinding(component);
    if (!canBindingWrite(binding)) return;
    const nextValues = { ...expressionValues, [field]: value };
    const runtime = resolveRuntimeProperties(component.props, value, { form: nextValues, original: originalValues, component: component.props });
    const shouldValidate = (isEditableComponentType(component.type) || (component.type === 'table' && component.props.editable === true))
      && !runtime.disabled
      && !runtime.props.disabled
      && !runtime.props.readonly
      && !component.props.valueExpression;
    const validationError = shouldValidate
      ? component.type === 'table'
        ? validateEditableTableValue(runtime.props, value)
        : validateField(value, compileComponentValidation({ ...runtime.props, required: fieldRequired[field] ?? runtime.required }), nextValues)
      : null;
    if (validationError) { setStatus({ key: Date.now(), label: `未写回：${validationError}`, state: 'error', details: [] }); return; }
    const resolved = resolveBindingWrite(component, tables, value);
    if (!resolved.ok || !resolved.write) { if (resolved.diagnostic) setStatus({ key: Date.now(), label: `未写回：${resolved.diagnostic}`, state: 'error', details: [] }); return; }
    pendingSyncsRef.current.push(resolved.write);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushSyncs, 500);
  }, [components, expressionValues, fieldRequired, flushSyncs, interactionPolicy, originalValues, tables]);

  useEffect(() => () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); }, []);

  useEffect(() => {
    const nextFields = new Map<string, string>();
    const nextInitSignatures = new Map<string, string>();
    const nextValidationSignatures = new Map<string, string>();
    const ids = new Set(components.map((component) => component.id));
    const fields = new Set<string>();
    for (const component of components) {
      const field = getDesignComponentField(component);
      fields.add(field); nextFields.set(component.id, field);
      nextInitSignatures.set(component.id, getPreviewInitializationSignature(component));
      nextValidationSignatures.set(component.id, JSON.stringify({ required: component.props.required, requiredExpression: component.props.requiredExpression, validator: component.props.validator, pattern: component.props.pattern, min: component.props.min, max: component.props.max, validationRules: component.props.validationRules }));
    }
    setValues((current) => {
      const next: Record<string, unknown> = {};
      for (const component of components) {
        const field = nextFields.get(component.id)!;
        const previousField = componentFieldsRef.current.get(component.id);
        const renamedValue = previousField && previousField !== field && Object.prototype.hasOwnProperty.call(current, previousField) ? current[previousField] : undefined;
        const dirty = dirtyFieldsRef.current.has(field) || (!!previousField && dirtyFieldsRef.current.has(previousField));
        const initializationChanged = initializationSignaturesRef.current.get(component.id) !== nextInitSignatures.get(component.id);
        next[field] = renamedValue !== undefined ? renamedValue : dirty || (!initializationChanged && Object.prototype.hasOwnProperty.call(current, field)) ? current[field] : getPreviewInitialValue(component, tables, next);
        if (previousField && previousField !== field && dirtyFieldsRef.current.delete(previousField)) dirtyFieldsRef.current.add(field);
      }
      return next;
    });
    setOriginalValues((current) => Object.fromEntries(components.map((component) => {
      const field = nextFields.get(component.id)!;
      const previousField = componentFieldsRef.current.get(component.id);
      const dirty = dirtyFieldsRef.current.has(field);
      return [field, dirty ? (previousField && current[previousField] !== undefined ? current[previousField] : current[field]) : getPreviewInitialValue(component, tables)];
    })));
    setComponentVisibility((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
    setComponentDisabled((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
    setFieldRequired((current) => Object.fromEntries(Object.entries(current).filter(([field]) => fields.has(field))));
    setFieldErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => {
      if (!fields.has(field)) return false;
      const component = components.find((item) => nextFields.get(item.id) === field);
      return !!component && validationSignaturesRef.current.get(component.id) === nextValidationSignatures.get(component.id);
    })));
    dirtyFieldsRef.current = new Set([...dirtyFieldsRef.current].filter((field) => fields.has(field)));
    componentFieldsRef.current = nextFields;
    initializationSignaturesRef.current = nextInitSignatures;
    validationSignaturesRef.current = nextValidationSignatures;
  }, [components, tables]);

  useEffect(() => {
    const defaultPatch: Record<string, unknown> = {};
    const clearPatch: Record<string, unknown> = {};
    const diagnosticEntries: DebugEntry[] = [];
    for (const component of components) {
      if (!supportsDateConvenience(component.type)) continue;
      const field = getDesignComponentField(component);
      const kind = component.type as 'datePicker' | 'timePicker' | 'dateRange';
      const currentValue = expressionValues[field];
      const constraintState = resolveDateConstraintState(
        component.props.constraintConfig as any,
        expressionValues,
        kind === 'timePicker' ? 'time' : component.type === 'datePicker' && component.props.showTime ? 'datetime' : 'date',
        component.props.businessDayConfig as any,
        { minDate: component.props.minDate, maxDate: component.props.maxDate },
      );
      if (!dirtyFieldsRef.current.has(field) && isEmptyDateValue(currentValue, kind)) {
        const fallback = getPreviewInitialValue(component, tables, { ...expressionValues, ...defaultPatch });
        if (!isEmptyDateValue(fallback, kind)) {
          defaultPatch[field] = fallback;
        }
      }
      const synced = syncDateValue(currentValue, kind, constraintState, component.props.rangeLinkagePolicy || 'clearInvalid');
      if (synced.changed) {
        clearPatch[field] = synced.value;
        diagnosticEntries.push({
          id: `preview:date-sync:${component.id}:${field}`,
          timestamp: Date.now(),
          level: 'info',
          source: 'ui',
          channel: 'preview',
          title: `${field} 日期同步`,
          message: synced.reason || '日期值已因约束变化被清空',
          field,
          componentId: component.id,
        });
      }
    }
    if (Object.keys(defaultPatch).length > 0) {
      setValues((current) => ({ ...current, ...defaultPatch }));
      setOriginalValues((current) => ({ ...current, ...defaultPatch }));
    }
    if (Object.keys(clearPatch).length > 0) {
      setValues((current) => ({ ...current, ...clearPatch }));
    }
    if (diagnosticEntries.length > 0) {
      setDebugEntries((current) => [...current, ...diagnosticEntries]);
      if (debugEnabled && autoOpenDebug && diagnosticEntries.some((entry) => entry.level === 'warn' || entry.level === 'error')) {
        setDebugOpen(true);
      }
    }
  }, [autoOpenDebug, components, debugEnabled, expressionValues, tables]);

  const setFieldValue = useCallback((field: string, value: unknown) => {
    dirtyFieldsRef.current.add(field);
    setValues((current) => ({ ...current, [field]: value }));
    queueTableSync(field, value);
  }, [queueTableSync]);

  const setPreviewVisible = useCallback((componentId: string, visible: boolean) => {
    setComponentVisibility((current) => ({ ...current, [componentId]: visible }));
  }, []);

  const setPreviewDisabled = useCallback((componentId: string, disabled: boolean) => {
    setComponentDisabled((current) => ({ ...current, [componentId]: disabled }));
  }, []);

  const setPreviewRequired = useCallback((field: string, required: boolean) => {
    setFieldRequired((current) => ({ ...current, [field]: required }));
  }, []);

  const appendDebugEntries = useCallback((entries: DebugEntry[], forceOpen = false) => {
    if (!entries.length) return;
    setDebugEntries((current) => [...current, ...entries.map((entry) => ({ ...entry, channel: entry.channel || 'preview' }))]);
    if (debugEnabled && (forceOpen || (autoOpenDebug && entries.some((entry) => entry.level === 'warn' || entry.level === 'error')))) {
      setDebugOpen(true);
    }
  }, [autoOpenDebug, debugEnabled]);

  const formatStatusDetails = useCallback((stats: {
    persistedRows?: number;
    formValues?: number;
    visible?: number;
    disabled?: number;
    required?: number;
    messages?: number;
  }) => {
    const details: string[] = [];
    if (stats.persistedRows) details.push(`保存 ${stats.persistedRows} 条数据`);
    if (stats.formValues) details.push(`更新 ${stats.formValues} 个字段值`);
    if (stats.visible) details.push(`切换 ${stats.visible} 个显示状态`);
    if (stats.disabled) details.push(`切换 ${stats.disabled} 个禁用状态`);
    if (stats.required) details.push(`切换 ${stats.required} 个必填状态`);
    if (stats.messages) details.push(`触发 ${stats.messages} 条提示`);
    return details;
  }, []);

  const formatTraceDetails = useCallback((trace: FormEventExecutionTrace) => {
    const details: string[] = [];
    const ruleStages = trace.stages.filter((stage) => stage.type === 'rule');
    const matchedRules = ruleStages.filter((stage) => stage.status === 'success').length;
    if (ruleStages.length > 0) details.push(`规则 ${matchedRules}/${ruleStages.length} 命中`);
    if (trace.stages.some((stage) => stage.type === 'script' && stage.status === 'success')) details.push('已执行高级脚本');
    if (trace.stages.some((stage) => stage.type === 'flow' && stage.status === 'success')) details.push('已执行绑定流程');
    if (trace.effects.messages.length > 0) details.push(`直接提示 ${trace.effects.messages.length} 条`);
    return details;
  }, []);

  const expressionDiagnosticKey = JSON.stringify(expressionResolution.diagnostics);
  useEffect(() => {
    const entries = Object.entries(expressionResolution.diagnostics).flatMap(([field, messages]) => messages.map((message, index) => ({
      id: `preview:expression:${field}:${index}:${message}`,
      timestamp: Date.now(),
      level: 'warn' as const,
      source: 'ui' as const,
      channel: 'preview' as const,
      title: `${field} 表达式诊断`,
      message,
      field,
    })));
    appendDebugEntries(entries);
  }, [appendDebugEntries, expressionDiagnosticKey]);

  const emit = useCallback(async (component: DesignComponent, eventName: string, value?: unknown, detail?: unknown) => {
    const field = getDesignComponentField(component);
    const resetValues = eventName === 'onReset'
      ? Object.fromEntries(components.map((item) => [getDesignComponentField(item), getPreviewInitialValue(item, tables)]))
      : null;
    const nextValue = resetValues ? resetValues : (value === undefined ? expressionValues[field] : value);
    const nextValues = resetValues || (value === undefined ? expressionValues : { ...expressionValues, [field]: value });
    const operationKey = eventName === 'onClick' && component.type === 'button' && ['submit', 'save', 'delete'].includes(String(component.props.action || '')) ? `${formId || 'preview'}:${component.id}:${component.props.action}:${JSON.stringify(nextValues)}` : '';
    if (operationKey && completedOperationKeysRef.current.has(operationKey)) {
      setStatus({ key: Date.now(), label: `${field}.${eventName}`, state: 'success', persisted: true, details: ['该操作已完成，本次不会重复创建。'] });
      return;
    }
    if (eventName === 'onChange') { recordMetric('configure', component.type); recordMetric('change', component.type); }
    if (eventName === 'onClick' && component.type === 'button' && ['submit', 'save'].includes(String(component.props.action || ''))) recordMetric('configure');
    if (eventName === 'onBlur') {
      const resolved = resolveRuntimeProperties(component.props, nextValues[field], { form: nextValues, original: originalValues, component: component.props });
      const required = fieldRequired[field] ?? resolved.required;
      const shouldValidate = (isEditableComponentType(component.type) || (component.type === 'table' && component.props.editable === true))
        && !resolved.disabled
        && !resolved.props.disabled
        && !resolved.props.readonly
        && !component.props.valueExpression;
      const error = shouldValidate
        ? component.type === 'table'
          ? validateEditableTableValue(resolved.props, nextValue)
          : validateField(nextValue, compileComponentValidation({ ...resolved.props, required }), nextValues)
        : null;
      setFieldErrors((current) => ({ ...current, [field]: error || '' }));
    }
    if (eventName === 'onClick' && component.type === 'button') {
      const nextErrors = Object.fromEntries(components.map((item) => {
        const itemField = getDesignComponentField(item);
        const resolved = resolveRuntimeProperties(item.props, nextValues[itemField], { form: nextValues, original: originalValues, component: item.props });
        const required = fieldRequired[itemField] ?? resolved.required;
        const shouldValidate = (isEditableComponentType(item.type) || (item.type === 'table' && item.props.editable === true))
          && !resolved.disabled
          && !resolved.props.disabled
          && !resolved.props.readonly
          && !item.props.valueExpression;
        return [itemField, shouldValidate
          ? item.type === 'table'
            ? validateEditableTableValue(resolved.props, nextValues[itemField])
            : validateField(nextValues[itemField], compileComponentValidation({ ...resolved.props, required }), nextValues) || ''
          : ''];
      }));
      setFieldErrors(nextErrors);
      if (Object.values(nextErrors).some(Boolean)) {
        recordMetric('submit-failure');
        const firstInvalidField = Object.entries(nextErrors).find(([, message]) => Boolean(message))?.[0];
        if (firstInvalidField) {
          const firstInvalidComponent = components.find((item) => getDesignComponentField(item) === firstInvalidField);
          if (firstInvalidComponent) {
            window.requestAnimationFrame(() => {
              const node = viewportRef.current?.querySelector<HTMLElement>(`[data-component-id="${CSS.escape(firstInvalidComponent.id)}"]`);
              node?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
              node?.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
            });
          }
        }
        setStatus({ key: Date.now(), label: '请先修正表单中的校验错误', state: 'error', details: [] });
        return;
      }
      if (interactionPolicy === 'local-only') {
        setStatus({
          key: Date.now(),
          label: '预览模式，不会写入数据',
          state: 'success',
          persisted: false,
          details: ['输入、校验和本地联动可正常体验'],
        });
        return;
      }
    }
    if (resetValues) { dirtyFieldsRef.current.clear(); setValues(resetValues); setOriginalValues(resetValues); }
    else if (value !== undefined) setFieldValue(field, value);
    const key = Date.now();
    retryEventRef.current = () => { void emit(component, eventName, value, detail); };
    canceledEventRef.current = null;
    setStatus({ key, label: `${field}.${eventName}`, state: 'running', details: [], cancel: () => { canceledEventRef.current = key; setStatus({ key, label: `${field}.${eventName}`, state: 'canceled', details: ['已取消本次执行，当前填写内容已保留。'] }); } });
    const directEffects = {
      formValues: new Set<string>(),
      visible: new Set<string>(),
      disabled: new Set<string>(),
      required: new Set<string>(),
      optionRefreshes: [] as string[],
      messages: [] as Array<{ message: string; level: 'info' | 'success' | 'warning' | 'error' }>,
    };
    let result: DesignPreviewEventResult = await executeDesignPreviewEvent({
      eventName, field, value: nextValue, detail, values: nextValues, originalValues, component,
      previousValue: expressionValues[field], timestamp: key, idempotencyKey: operationKey || undefined,
    }, {
      workflows: interactionPolicy === 'local-only' ? [] : workflows,
      tables,
      components,
      setValue: (nextField, nextFieldValue) => {
        directEffects.formValues.add(nextField);
        setFieldValue(nextField, nextFieldValue);
      },
      setVisible: (componentId, visible) => {
        directEffects.visible.add(componentId);
        setPreviewVisible(componentId, visible);
      },
      setDisabled: (componentId, disabled) => {
        directEffects.disabled.add(componentId);
        setPreviewDisabled(componentId, disabled);
      },
      setRequired: (nextField, required) => {
        directEffects.required.add(nextField);
        setPreviewRequired(nextField, required);
      },
      setOptions: (nextField, config) => {
        const target = components.find((item) => getDesignComponentField(item) === nextField);
        if (!target || !supportsDynamicOptions(target.type)) return;
        const options = resolveLinkageOptions(config, tables);
        const synced = syncOptionValue(expressionValues[nextField], options, target.type === 'checkbox' || (target.type === 'select' && !!target.props.multiple));
        const clearedCount = synced.changed
          ? Array.isArray(expressionValues[nextField]) && Array.isArray(synced.value)
            ? Math.max(0, expressionValues[nextField].length - synced.value.length)
            : 1
          : 0;
        setComponentOptions((current) => ({ ...current, [target.id]: { options, source: 'linked', clearedCount } }));
        if (synced.changed) {
          directEffects.formValues.add(nextField);
          setFieldValue(nextField, synced.value);
        }
        directEffects.optionRefreshes.push(`刷新 ${nextField} 选项（${options.length} 项${clearedCount > 0 ? `，清空 ${clearedCount} 个失效值` : ''}）`);
      },
      showMessage: (message, level = 'info') => {
        directEffects.messages.push({ message, level });
      },
    });
    if (canceledEventRef.current === key) return;
    appendDebugEntries(result.trace.effects.debugLogs);
    let persisted = false;
    let successLabel = directEffects.messages[directEffects.messages.length - 1]?.message || `${field}.${eventName}`;
    let successDetails = formatStatusDetails({
      formValues: directEffects.formValues.size,
      visible: directEffects.visible.size,
      disabled: directEffects.disabled.size,
      required: directEffects.required.size,
      messages: directEffects.messages.length,
    });
    successDetails = [...successDetails, ...directEffects.optionRefreshes];
    successDetails = [...successDetails, ...formatTraceDetails(result.trace)];
    if (interactionPolicy !== 'local-only' && !result.error && result.flowResults?.length && project) {
      try {
        let nextProject = { ...project, srcTable: tables };
        const sideEffects = result.flowResults.flatMap((flowResult) => collectFlowSideEffects(flowResult));
        const persistedTableResult = await persistProjectTableSideEffects(project.config.id, sideEffects, tables);
        const effectResult = applyProjectWriteBacks(nextProject, {
          success: true,
          errors: [],
          finalOutputs: {},
          nodeResults: new Map(),
          sideEffects,
          totalDuration: 0,
        });
        nextProject = effectResult.project;
        if (Object.keys(effectResult.formValuePatches).length > 0) {
          setValues((current) => {
            const merged = { ...current, ...effectResult.formValuePatches };
            if (effectResult.applied > 0) setOriginalValues(merged);
            return merged;
          });
        } else if (effectResult.applied > 0) {
          setOriginalValues((current) => ({ ...current, ...nextValues }));
        }
        if (Object.keys(effectResult.componentVisibilityPatches).length > 0) {
          setComponentVisibility((current) => ({ ...current, ...effectResult.componentVisibilityPatches }));
        }
        if (Object.keys(effectResult.componentDisabledPatches).length > 0) {
          setComponentDisabled((current) => ({ ...current, ...effectResult.componentDisabledPatches }));
        }
        if (Object.keys(effectResult.fieldRequiredPatches).length > 0) {
          setFieldRequired((current) => ({ ...current, ...effectResult.fieldRequiredPatches }));
        }
        if (effectResult.messages.length > 0) {
          successLabel = `${field}.${eventName}: ${effectResult.messages[effectResult.messages.length - 1].message}`;
        } else if (directEffects.messages.length > 0) {
          successLabel = `${field}.${eventName}: ${directEffects.messages[directEffects.messages.length - 1].message}`;
        }
        const applied = effectResult.applied;
        successDetails = formatStatusDetails({
          persistedRows: applied,
          formValues: new Set([...directEffects.formValues, ...Object.keys(effectResult.formValuePatches)]).size,
          visible: new Set([...directEffects.visible, ...Object.keys(effectResult.componentVisibilityPatches)]).size,
          disabled: new Set([...directEffects.disabled, ...Object.keys(effectResult.componentDisabledPatches)]).size,
          required: new Set([...directEffects.required, ...Object.keys(effectResult.fieldRequiredPatches)]).size,
          messages: effectResult.messages.length + directEffects.messages.length,
        });
        successDetails = [...successDetails, ...formatTraceDetails(result.trace)];
        if (applied > 0) {
          if (persistedTableResult.applied > 0) onTablesChange?.(effectResult.project.srcTable);
          else await persistProject(nextProject);
          persisted = true;
        }
      } catch (cause) {
        result = { ...result, error: cause instanceof Error ? cause : new Error(String(cause)) };
      }
    }
    if (result.error) {
      if (eventName === 'onClick' && component.type === 'button') recordMetric('submit-failure');
      appendDebugEntries([{
        id: `preview:error:${key}`,
        timestamp: Date.now(),
        level: 'error',
        source: 'ui',
        channel: 'preview',
        title: `${field}.${eventName}`,
        message: result.error.message,
        field,
        componentId: component.id,
        eventName,
      }], true);
    }
    const flowPartial = !result.error && !!result.flowResults?.length && result.flowResults.some((flow) => flow.success) && result.flowResults.some((flow) => !flow.success);
    if (flowPartial) successDetails = [...successDetails, '部分步骤已完成，失败步骤可从调试详情中重新运行。'];
    const hasWarning = !result.error && (flowPartial || [...directEffects.messages, ...(result.trace.effects.messages || [])].some((message) => message.level === 'warning'));
    const failureHint = result.error && /冲突|过期|expired|conflict/i.test(result.error.message) ? '数据状态已变化，请刷新实例后再重试；当前填写内容已保留。' : result.error ? '请检查输入或网络后重试；当前填写内容已保留。' : '';
    setStatus((current) => current?.key === key ? {
      key,
      label: result.error ? `${field}.${eventName}: ${result.error.message}` : successLabel,
      state: result.error ? 'error' : hasWarning ? 'warning' : 'success',
      persisted,
      details: result.error ? [failureHint] : successDetails,
      retry: result.error ? () => { recordMetric('retry'); retryEventRef.current?.(); } : undefined,
    } : current);
    if (!result.error && eventName === 'onClick' && component.type === 'button' && ['submit', 'save'].includes(String(component.props.action || ''))) recordMetric('submit-success', component.type);
    if (!result.error && operationKey) {
      completedOperationKeysRef.current.add(operationKey);
      try { localStorage.setItem('formflow:completed-operations', JSON.stringify([...completedOperationKeysRef.current].slice(-100))); } catch { /* ignore storage limits */ }
    }
  }, [appendDebugEntries, components, interactionPolicy, originalValues, persistProject, project, tables, values, expressionValues, workflows, setFieldValue, setPreviewVisible, setPreviewDisabled, setPreviewRequired, formatStatusDetails, formatTraceDetails, onTablesChange, recordMetric]);

  const bounds = useMemo(() => {
    if (presentation === 'runtime') {
      return {
        width: Math.max(320, Number(formWindow.width) || 320),
        height: Math.max(240, Number(formWindow.height) || 240),
      };
    }
    const maxX = Math.max(960, formWindow.x + formWindow.width + 80);
    const maxY = Math.max(720, formWindow.y + formWindow.height + 80);
    return { width: maxX, height: maxY };
  }, [formWindow, presentation]);

  const formWindowComponent = useMemo<DesignComponent>(() => ({
    id: '__formflow_form_window__',
    type: 'formWindow',
    x: formWindow.x,
    y: formWindow.y,
    width: formWindow.width,
    height: formWindow.height,
    props: formWindow.props,
  }), [formWindow]);

  const effectiveZoom = presentation === 'runtime' ? 1 : zoom;
  return (
    <div ref={viewportRef} className={`designer-preview-viewport is-${presentation}${debugOpen ? ' is-debug-open' : ''}`} data-testid="designer-preview">
      <div className="designer-preview-stage-wrap" style={{ width: bounds.width * effectiveZoom, height: bounds.height * effectiveZoom }}>
        <div className="designer-preview-stage" style={{ width: bounds.width, height: bounds.height, transform: `scale(${effectiveZoom})` }}>
          <div
            className="form-window-placement"
            style={{
              position: 'absolute',
              left: presentation === 'runtime' ? 0 : formWindow.x,
              top: presentation === 'runtime' ? 0 : formWindow.y,
              width: formWindow.width,
              height: formWindow.height,
            }}
          >
            <FormWindowFrame
              formWindow={formWindow}
              mode={presentation === 'runtime' ? 'runtime' : 'preview'}
              onClose={onClose}
              onReset={() => { void emit(formWindowComponent, 'onReset', {}); }}
              onSubmit={() => { void emit(formWindowComponent, 'onSubmit', expressionValues); }}
            >
              {components.map((component) => {
            const control = getControl(component.type);
            if (!control) return null;
            const Control = control.render;
            const field = getDesignComponentField(component);
            const bound = resolveDataBindingValue(component, tables, expressionValues);
            const inputValue = !dirtyFieldsRef.current.has(field) && bound.found ? bound.value : expressionValues[field];
            const resolved = resolveRuntimeProperties(component.props, inputValue, { form: expressionValues, original: originalValues, component: component.props });
            const isHidden = (componentVisibility[component.id] ?? component.visible) === false || !resolved.visible;
            const isDisabled = !!(componentDisabled[component.id] ?? component.props.disabled) || resolved.disabled || !!component.props.valueExpression;
            const isRequired = !!(fieldRequired[field] ?? resolved.required);
            const sourceOptions = supportsDynamicOptions(component.type)
              ? resolveOptionSource(resolved.props.options, resolved.props.optionSource, tables)
              : null;
            const runtimeOptionState = componentOptions[component.id];
            const runtimeWidth = component.width;
            const runtimeHeight = component.height;
            const runtimeOptions = runtimeOptionState?.options || sourceOptions?.options || undefined;
            const dateConstraintState = supportsDateConvenience(component.type)
              ? resolveDateConstraintState(
                  resolved.props.constraintConfig as any,
                  expressionValues,
                  component.type === 'timePicker' ? 'time' : component.type === 'datePicker' && resolved.props.showTime ? 'datetime' : 'date',
                  resolved.props.businessDayConfig as any,
                  { minDate: resolved.props.minDate, maxDate: resolved.props.maxDate },
                )
              : null;
            const patchedComponent = {
              ...component,
              width: runtimeWidth,
              height: runtimeHeight,
              props: {
                ...resolved.props,
                ...(component.type === 'table' && resolved.props.dataSource && typeof resolved.props.dataSource === 'object'
                  ? {
                      data: tables
                        .find((table) => table.id === String((resolved.props.dataSource as Record<string, unknown>).tableId || ''))
                        ?.sheets.find((sheet) => sheet.name === String((resolved.props.dataSource as Record<string, unknown>).sheetName || ''))
                        ?.preview || resolved.props.data,
                    }
                  : {}),
                ...(runtimeOptions ? { runtimeOptions } : {}),
                ...(sourceOptions?.dynamic ? { optionSourceState: sourceOptions.mode } : {}),
                ...(runtimeOptionState ? { runtimeOptionSource: runtimeOptionState.source, runtimeOptionsClearedCount: runtimeOptionState.clearedCount || 0 } : {}),
                ...(dateConstraintState ? {
                  dateConvenienceState: {
                    defaultSource: describeDateDefaultSource(resolved.props.defaultValueConfig as any),
                    constraints: describeDateConstraints(dateConstraintState),
                  },
                } : {}),
                disabled: isDisabled,
                required: isRequired,
              },
              visible: componentVisibility[component.id] ?? component.visible,
            };
            return (
              <div
                key={component.id}
                className={`designer-preview-control${isHidden ? ' is-hidden' : ''}${isDisabled ? ' is-disabled' : ''}${isRequired ? ' is-required' : ''}`}
                data-component-id={component.id}
                data-component-type={component.type}
                data-hidden={isHidden || undefined}
                data-disabled={isDisabled || undefined}
                data-required={isRequired || undefined}
                style={{
                  left: component.x,
                  top: component.y,
                  width: runtimeWidth,
                  height: runtimeHeight,
                  zIndex: component.zIndex ?? 0,
                }}
              >
                <Control
                  component={patchedComponent}
            mode={presentation === 'runtime' ? 'runtime' : 'preview'}
                  runtime={{
                    value: resolved.value,
                    values: expressionValues,
                    setValue: (value) => setFieldValue(field, value),
                    emit: (eventName, value, detail) => { void emit(component, eventName, value, detail); },
                  }}
                />
                {presentation !== 'runtime' && supportsDynamicOptions(component.type) && (
                  <div className="designer-preview-option-meta">
                    <span>{runtimeOptionState ? '联动覆盖' : sourceOptions?.dynamic ? (sourceOptions.mode === 'range' ? '范围来源' : '表来源') : '静态选项'}</span>
                    <span>{runtimeOptions?.length || 0} 项</span>
                    {!!runtimeOptionState?.clearedCount && <span>已清理 {runtimeOptionState.clearedCount} 项</span>}
                  </div>
                )}
                {presentation !== 'runtime' && supportsDateConvenience(component.type) && dateConstraintState && (
                  <div className="designer-preview-option-meta">
                    <span>{describeDateDefaultSource(resolved.props.defaultValueConfig as any)}</span>
                    <span>{describeDateConstraints(dateConstraintState).join('；') || '无额外限制'}</span>
                  </div>
                )}
                {!!fieldErrors[field] && <div className="designer-preview-field-error">{fieldErrors[field]}</div>}
                {(isHidden || isDisabled) && (
                  <div className="designer-preview-control-indicators" aria-hidden="true">
                    {isHidden && <span className="designer-preview-control-indicator hidden" title="当前为隐藏状态" />}
                    {!isHidden && isDisabled && <span className="designer-preview-control-indicator disabled" title="当前不可编辑" />}
                  </div>
                )}
                {isDisabled && <div className="designer-preview-control-overlay" aria-hidden="true" />}
              </div>
            );
              })}
            </FormWindowFrame>
          </div>
        </div>
      </div>
      {status && (
        <div className={`designer-preview-event-status ${status.state}`} role={status.state === 'error' ? 'alert' : 'status'} aria-live={status.state === 'error' ? 'assertive' : 'polite'}>
          <div className="designer-preview-event-status-title">
            {status.state === 'running' ? '执行中' : status.state === 'success' ? (status.persisted ? '已保存' : '已执行') : status.state === 'warning' ? '已完成但有提醒' : status.state === 'canceled' ? '已取消' : '执行失败'} · {status.label}
          </div>
          {!!status.details?.length && (
            <div className="designer-preview-event-status-details">
              {status.details.map((detail) => <span key={detail}>{detail}</span>)}
            </div>
          )}
          {status.state === 'running' && status.cancel && <button type="button" className="ui-btn ui-btn-xs" onClick={status.cancel}>取消</button>}
          {status.state === 'error' && status.retry && <button type="button" className="ui-btn ui-btn-xs" onClick={status.retry}>重试</button>}
        </div>
      )}
      {debugEnabled && interactionPolicy !== 'local-only' && (
        <DebugDrawer
          entries={debugEntries}
          open={debugOpen}
          onToggle={setDebugOpen}
          title="预览调试"
          enableServerLogs={enableServerDebugApi}
          portalToBody={presentation === 'runtime'}
        />
      )}
    </div>
  );
}
