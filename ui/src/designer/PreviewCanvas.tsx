import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DebugEntry, DesignComponent, FormEventExecutionTrace, SrcTableEntry, WorkflowFile } from '../project/types';
import { getControl } from './registry';
import {
  executeDesignPreviewEvent,
  getDesignComponentField,
  type DesignPreviewEventResult,
} from '../services/engine/designPreviewRuntime';
import { applyProjectWriteBacks } from '../services/io/projectWriteBack';
import { collectFlowSideEffects } from '../services/engine/flowSideEffects';
import { useProjectStore } from '../project/store';
import { getPreviewInitialValue } from '../services/display/previewValues';
import DebugDrawer from '../components/DebugDrawer';
import { resolveExpressionValues, resolveRuntimeProperties } from '../services/engine/propertyExpression';
import { compileComponentValidation, validateField } from '../services/engine/validator';
import { resolveBindingWrite, resolveDataBindingValue } from '../services/data/dataBinding';

interface PreviewCanvasProps {
  components: DesignComponent[];
  zoom: number;
  workflows: WorkflowFile[];
  tables: SrcTableEntry[];
}

interface EventStatus {
  key: number;
  label: string;
  state: 'running' | 'success' | 'error';
  persisted?: boolean;
  details?: string[];
}

export function PreviewCanvas({ components, zoom, workflows, tables }: PreviewCanvasProps) {
  const project = useProjectStore((state) => state.project);
  const persistProject = useProjectStore((state) => state.persistProject);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});
  const [componentVisibility, setComponentVisibility] = useState<Record<string, boolean>>({});
  const [componentDisabled, setComponentDisabled] = useState<Record<string, boolean>>({});
  const [fieldRequired, setFieldRequired] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<EventStatus | null>(null);
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

  // ── 表单 → 工作表同步（防抖） ──────────────────────
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncsRef = useRef<Array<{ tableId: string; sheetName: string; keyField: string; keyValue: unknown; column: string; value: unknown }>>([]);

  const flushSyncs = useCallback(() => {
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
  }, [project, persistProject]);

  const queueTableSync = useCallback((field: string, value: unknown) => {
    const component = components.find((c) => getDesignComponentField(c) === field);
    if (!component) return;
    const nextValues = { ...expressionValues, [field]: value };
    const runtime = resolveRuntimeProperties(component.props, value, { form: nextValues, original: originalValues, component: component.props });
    const validationError = validateField(value, compileComponentValidation({ ...runtime.props, required: fieldRequired[field] ?? runtime.required }), nextValues);
    if (validationError) { setStatus({ key: Date.now(), label: `未写回：${validationError}`, state: 'error', details: [] }); return; }
    const resolved = resolveBindingWrite(component, tables, value);
    if (!resolved.ok || !resolved.write) { if (resolved.diagnostic) setStatus({ key: Date.now(), label: `未写回：${resolved.diagnostic}`, state: 'error', details: [] }); return; }
    pendingSyncsRef.current.push(resolved.write);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushSyncs, 500);
  }, [components, expressionValues, fieldRequired, flushSyncs, originalValues, tables]);

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
      nextInitSignatures.set(component.id, JSON.stringify({ defaultValue: component.props.defaultValue, value: component.props.value, dataBinding: component.props.dataBinding, tableBinding: component.props.tableBinding, rangeRef: component.props.rangeRef }));
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
        next[field] = renamedValue !== undefined ? renamedValue : dirty || (!initializationChanged && Object.prototype.hasOwnProperty.call(current, field)) ? current[field] : getPreviewInitialValue(component, tables);
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

  const appendDebugEntries = useCallback((entries: DebugEntry[], forceOpen = false) => {
    if (!entries.length) return;
    setDebugEntries((current) => [...current, ...entries.map((entry) => ({ ...entry, channel: entry.channel || 'preview' }))]);
    if (debugEnabled && (forceOpen || (autoOpenDebug && entries.some((entry) => entry.level === 'warn' || entry.level === 'error')))) {
      setDebugOpen(true);
    }
  }, [autoOpenDebug, debugEnabled]);

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
    if (eventName === 'onBlur') {
      const resolved = resolveRuntimeProperties(component.props, nextValues[field], { form: nextValues, original: originalValues, component: component.props });
      const required = fieldRequired[field] ?? resolved.required;
      const error = validateField(nextValue, compileComponentValidation({ ...resolved.props, required }), nextValues);
      setFieldErrors((current) => ({ ...current, [field]: error || '' }));
    }
    if (eventName === 'onClick' && component.type === 'button') {
      const nextErrors = Object.fromEntries(components.map((item) => {
        const itemField = getDesignComponentField(item);
        const resolved = resolveRuntimeProperties(item.props, nextValues[itemField], { form: nextValues, original: originalValues, component: item.props });
        const required = fieldRequired[itemField] ?? resolved.required;
        return [itemField, validateField(nextValues[itemField], compileComponentValidation({ ...resolved.props, required }), nextValues) || ''];
      }));
      setFieldErrors(nextErrors);
      if (Object.values(nextErrors).some(Boolean)) {
        setStatus({ key: Date.now(), label: '请先修正表单中的校验错误', state: 'error', details: [] });
        return;
      }
    }
    if (resetValues) { dirtyFieldsRef.current.clear(); setValues(resetValues); setOriginalValues(resetValues); }
    else if (value !== undefined) setFieldValue(field, value);
    const key = Date.now();
    setStatus({ key, label: `${field}.${eventName}`, state: 'running', details: [] });
    const directEffects = {
      formValues: new Set<string>(),
      visible: new Set<string>(),
      disabled: new Set<string>(),
      required: new Set<string>(),
      messages: [] as Array<{ message: string; level: 'info' | 'success' | 'warning' | 'error' }>,
    };
    let result: DesignPreviewEventResult = await executeDesignPreviewEvent({
      eventName, field, value: nextValue, detail, values: nextValues, originalValues, component,
      previousValue: expressionValues[field], timestamp: key,
    }, {
      workflows,
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
      showMessage: (message, level = 'info') => {
        directEffects.messages.push({ message, level });
      },
    });
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
    successDetails = [...successDetails, ...formatTraceDetails(result.trace)];
    if (!result.error && result.flowResults?.length && project) {
      try {
        let nextProject = project;
        const sideEffects = result.flowResults.flatMap((flowResult) => collectFlowSideEffects(flowResult));
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
          await persistProject(nextProject);
          persisted = true;
        }
      } catch (cause) {
        result = { ...result, error: cause instanceof Error ? cause : new Error(String(cause)) };
      }
    }
    if (result.error) {
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
    setStatus((current) => current?.key === key ? {
      key,
      label: result.error ? `${field}.${eventName}: ${result.error.message}` : successLabel,
      state: result.error ? 'error' : 'success',
      persisted,
      details: result.error ? [] : successDetails,
    } : current);
  }, [appendDebugEntries, components, originalValues, persistProject, project, tables, values, expressionValues, workflows, setFieldValue, setPreviewVisible, setPreviewDisabled, setPreviewRequired, formatStatusDetails, formatTraceDetails]);

  const bounds = useMemo(() => {
    const maxX = Math.max(960, ...components.map((component) => component.x + component.width + 80));
    const maxY = Math.max(720, ...components.map((component) => component.y + component.height + 80));
    return { width: maxX, height: maxY };
  }, [components]);

  return (
    <div className="designer-preview-viewport" data-testid="designer-preview">
      <div className="designer-preview-stage-wrap" style={{ width: bounds.width * zoom, height: bounds.height * zoom }}>
        <div className="designer-preview-stage" style={{ width: bounds.width, height: bounds.height, transform: `scale(${zoom})` }}>
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
            const patchedComponent = {
              ...component,
              props: {
                ...resolved.props,
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
                  width: component.width,
                  height: component.height,
                  zIndex: component.zIndex ?? 0,
                }}
              >
                <Control
                  component={patchedComponent}
                  mode="preview"
                  runtime={{
                    value: resolved.value,
                    values: expressionValues,
                    setValue: (value) => setFieldValue(field, value),
                    emit: (eventName, value, detail) => { void emit(component, eventName, value, detail); },
                  }}
                />
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
        </div>
      </div>
      {status && (
        <div className={`designer-preview-event-status ${status.state}`} role="status">
          <div className="designer-preview-event-status-title">
            {status.state === 'running' ? '执行中' : status.state === 'success' ? (status.persisted ? '已保存' : '已执行') : '执行失败'} · {status.label}
          </div>
          {!!status.details?.length && (
            <div className="designer-preview-event-status-details">
              {status.details.map((detail) => <span key={detail}>{detail}</span>)}
            </div>
          )}
        </div>
      )}
      {debugEnabled && (
        <DebugDrawer
          entries={debugEntries}
          open={debugOpen}
          onToggle={setDebugOpen}
          title="预览调试"
          enableServerLogs={enableServerDebugApi}
        />
      )}
    </div>
  );
}
