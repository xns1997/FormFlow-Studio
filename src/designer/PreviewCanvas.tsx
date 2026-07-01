import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { getControl } from './registry';
import {
  executeDesignPreviewEvent,
  getDesignComponentField,
  type DesignPreviewEventResult,
} from '../services/designPreviewRuntime';
import { applyProjectWriteBacks } from '../services/projectWriteBack';
import { collectFlowSideEffects } from '../services/flowSideEffects';
import { useProjectStore } from '../project/store';
import { getPreviewInitialValue } from '../services/previewValues';

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
  const [status, setStatus] = useState<EventStatus | null>(null);

  useEffect(() => {
    const initial = Object.fromEntries(components.map((component) => [getDesignComponentField(component), getPreviewInitialValue(component, tables)]));
    setValues(initial);
    setOriginalValues(initial);
    setComponentVisibility({});
    setComponentDisabled({});
    setFieldRequired({});
    setStatus(null);
  }, [components, tables]);

  const setFieldValue = useCallback((field: string, value: unknown) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

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

  const emit = useCallback(async (component: DesignComponent, eventName: string, value?: unknown, detail?: unknown) => {
    const field = getDesignComponentField(component);
    const resetValues = eventName === 'onReset'
      ? Object.fromEntries(components.map((item) => [getDesignComponentField(item), getPreviewInitialValue(item, tables)]))
      : null;
    const nextValue = resetValues ? resetValues : (value === undefined ? values[field] : value);
    const nextValues = resetValues || (value === undefined ? values : { ...values, [field]: value });
    if (resetValues) setValues(resetValues);
    else if (value !== undefined) setFieldValue(field, value);
    const key = Date.now();
    setStatus({ key, label: `${field}.${eventName}`, state: 'running', details: [] });
    const directEffects = {
      formValues: new Set<string>(),
      visible: new Set<string>(),
      disabled: new Set<string>(),
      required: new Set<string>(),
    };
    let result: DesignPreviewEventResult = await executeDesignPreviewEvent({
      eventName, field, value: nextValue, detail, values: nextValues, originalValues, component,
    }, {
      workflows,
      tables,
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
    });
    let persisted = false;
    let successLabel = `${field}.${eventName}`;
    let successDetails = formatStatusDetails({
      formValues: directEffects.formValues.size,
      visible: directEffects.visible.size,
      disabled: directEffects.disabled.size,
      required: directEffects.required.size,
    });
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
        }
        const applied = effectResult.applied;
        successDetails = formatStatusDetails({
          persistedRows: applied,
          formValues: new Set([...directEffects.formValues, ...Object.keys(effectResult.formValuePatches)]).size,
          visible: new Set([...directEffects.visible, ...Object.keys(effectResult.componentVisibilityPatches)]).size,
          disabled: new Set([...directEffects.disabled, ...Object.keys(effectResult.componentDisabledPatches)]).size,
          required: new Set([...directEffects.required, ...Object.keys(effectResult.fieldRequiredPatches)]).size,
          messages: effectResult.messages.length,
        });
        if (applied > 0) {
          await persistProject(nextProject);
          persisted = true;
        }
      } catch (cause) {
        result = { ...result, error: cause instanceof Error ? cause : new Error(String(cause)) };
      }
    }
    setStatus((current) => current?.key === key ? {
      key,
      label: result.error ? `${field}.${eventName}: ${result.error.message}` : successLabel,
      state: result.error ? 'error' : 'success',
      persisted,
      details: result.error ? [] : successDetails,
    } : current);
  }, [components, originalValues, persistProject, project, tables, values, workflows, setFieldValue, setPreviewVisible, setPreviewDisabled, setPreviewRequired, formatStatusDetails]);

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
            const isHidden = (componentVisibility[component.id] ?? component.visible) === false;
            const isDisabled = !!(componentDisabled[component.id] ?? component.props.disabled);
            const isRequired = !!(fieldRequired[field] ?? component.props.required);
            const patchedComponent = {
              ...component,
              props: {
                ...component.props,
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
                    value: values[field],
                    values,
                    setValue: (value) => setFieldValue(field, value),
                    emit: (eventName, value, detail) => { void emit(component, eventName, value, detail); },
                  }}
                />
                {isHidden && <div className="designer-preview-control-badge hidden">已隐藏</div>}
                {!isHidden && isDisabled && <div className="designer-preview-control-badge disabled">已禁用</div>}
                {!isHidden && isRequired && <div className="designer-preview-control-badge required">必填</div>}
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
    </div>
  );
}
