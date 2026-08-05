import type { ComponentNode } from '../../models';
import type { DebugEntry, SrcTableEntry, WorkflowFile } from '../../project/types';
import type { FormEventExecutionStage, FormEventExecutionTrace, FormLinkageOptionsConfig, FormLinkageRule } from '../../project/types';
import {
  executeFormFlowTrigger,
  type FormControlEventContext,
  type FormFlowTriggerConfig,
} from './formFlowTrigger';
import type { FlowExecutionResult } from './flowEngine';
import { executeLinkageRules } from './formLinkage';
import {
  buildFillFormPatch,
  buildResetFormPatch,
  findRowInTables,
  findRowsInTables,
  nextSequenceInTables,
  querySheetRows,
  validateRequiredFields,
  type FillFormOptions,
  type FillFormResult,
  type FindRowOptions,
  type FindRowsOptions,
  type NextSequenceOptions,
  type RequireFieldsOptions,
  type RequireFieldsResult,
  type ResetFormOptions,
  type ResetFormResult,
} from './crudHelpers';
import {
  createScriptExecutionScope,
  executeInjectedScript,
  getNativeConsole,
  type ScriptLogEntry,
} from '../config/scriptRuntime';
import { evaluatePropertyExpression } from './propertyExpression';
import { getFlowComponentField, prepareV2FlowOutputWrites } from './formFlowBindings';
import {
  createFormEventTransaction,
  type FormEventEffect,
  type FormEventEffectSource,
} from './formEventTransaction';
import type { FormEventRuntimeContract } from '../../../../shared/formflow-core/formEventContract';
import { planEventControlKeys, resolveEventControlFieldName } from '../../../../shared/formflow-core/formEventControls';
import { createBrowserDomAdapter, type DomAdapter } from './domAdapter';

export type FormEventCallback = (context: FormEventRuntimeContext, ...args: unknown[]) => unknown | Promise<unknown>;

export interface FormFieldChain extends PromiseLike<void> {
  show(): FormFieldChain;
  hide(): FormFieldChain;
  enable(): FormFieldChain;
  disable(): FormFieldChain;
  required(): FormFieldChain;
  optional(): FormFieldChain;
  clear(): FormFieldChain;
  set(value: unknown): FormFieldChain;
}

export interface FormRequireChain extends PromiseLike<RequireFieldsResult> {
  focusFirstInvalid(): FormRequireChain;
}

export interface FormTableFindChain extends PromiseLike<Record<string, unknown> | null> {
  fillForm(fieldMap?: Record<string, string>, options?: FillFormOptions): Promise<FillFormResult | null>;
}

export interface FormFlowChain extends PromiseLike<FlowExecutionResult> {
  writeBack(): Promise<FlowExecutionResult>;
}

export interface FormEventRuntimeContext extends FormControlEventContext, FormEventRuntimeContract {
  event: string;
  formData: Record<string, unknown>;
  detail?: unknown;
  controls: Record<string, {
    id: string;
    name: string;
    type: string;
    component: ComponentNode;
    value: unknown;
    visible: boolean;
    disabled: boolean;
    required: boolean;
  }>;
  getValue: (field: string) => unknown;
  getValues: (fields: string[]) => Record<string, unknown>;
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setValues: (patch: Record<string, unknown>) => Promise<void>;
  clearValue: (field: string) => Promise<void>;
  clearValues: (fields: string[]) => Promise<void>;
  setVisible: (componentId: string, visible: boolean) => void | Promise<void>;
  toggleVisible: (componentId: string) => Promise<boolean>;
  setDisabled: (componentId: string, disabled: boolean) => void | Promise<void>;
  toggleDisabled: (componentId: string) => Promise<boolean>;
  setRequired: (field: string, required: boolean) => void | Promise<void>;
  setOptions: (field: string, config: FormLinkageOptionsConfig) => void | Promise<void>;
  toggleRequired: (field: string) => Promise<boolean>;
  setFieldState: (
    fieldOrComponentId: string,
    patch: { value?: unknown; visible?: boolean; disabled?: boolean; required?: boolean },
  ) => Promise<void>;
  focusField: (field: string) => Promise<void>;
  focusControl: (componentId: string) => Promise<void>;
  scrollToField: (field: string) => Promise<void>;
  scrollToControl: (componentId: string) => Promise<void>;
  switchTab: (tabIdOrIndex: string | number) => Promise<void>;
  openTab: (tabIdOrIndex: string | number) => Promise<void>;
  showMessage: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void | Promise<void>;
  querySheet: (sheetId: string, filter?: Record<string, unknown>) => Record<string, unknown>[];
  findRows: (sheetId: string, criteria?: Record<string, unknown>, options?: FindRowsOptions) => Record<string, unknown>[];
  findRow: (sheetId: string, criteria: Record<string, unknown>, options?: FindRowOptions) => Record<string, unknown> | null;
  nextSequence: (sheetId: string, column: string, options?: NextSequenceOptions) => number;
  fillForm: (record: Record<string, unknown> | null | undefined, fieldMap?: Record<string, string>, options?: FillFormOptions) => Promise<FillFormResult>;
  requireFields: (fields: string[], options?: RequireFieldsOptions) => Promise<RequireFieldsResult>;
  resetForm: (options?: ResetFormOptions) => Promise<ResetFormResult>;
  evaluate: (expression: string) => unknown;
  fields: (fields: string | string[]) => FormFieldChain;
  form: {
    values: () => Record<string, unknown>;
    require: (fields: string[]) => FormRequireChain;
  };
  table: (sheetId: string) => {
    find: (criteria: Record<string, unknown>, options?: FindRowOptions) => FormTableFindChain;
    rows: (criteria?: Record<string, unknown>, options?: FindRowsOptions) => Record<string, unknown>[];
    upsert: (record: Record<string, unknown>, options: { key: string }) => Promise<{ created: boolean; updated: boolean; key: unknown; record: Record<string, unknown> }>;
  };
  flow: (workflow?: string | WorkflowFile) => {
    run: (parameters?: Record<string, unknown>, options?: { targetNodeId?: string }) => FormFlowChain;
  };
  runWorkflow: (
    workflow?: string | WorkflowFile,
    parameters?: Record<string, unknown>,
    options?: { targetNodeId?: string },
  ) => Promise<FlowExecutionResult>;
  runConfiguredWorkflow: (parameters?: Record<string, unknown>) => Promise<FlowExecutionResult>;
  /** Internal output intent used by linkage actions; committed at the event tail. */
  queueFlowOutput: (field: string, value: unknown) => void;
  call: (name: string, ...args: unknown[]) => Promise<unknown>;
  callbacks: Record<string, FormEventCallback>;
  debug: (label: string, data?: unknown, options?: Partial<DebugEntry>) => void;
  console: Pick<Console, 'log' | 'warn' | 'error' | 'debug'>;
}

import { sameValue } from './valueUtils';

function createEventDetail(eventContext: FormControlEventContext, previousValue: unknown): Record<string, unknown> {
  const supplied = eventContext.detail && typeof eventContext.detail === 'object'
    ? eventContext.detail as Record<string, unknown>
    : {};
  switch (eventContext.eventName) {
    case 'onChange': return { previousValue, value: eventContext.value, ...supplied };
    case 'onBlur': return { touched: true, ...supplied };
    case 'onReset': return { previousValues: eventContext.values, ...supplied };
    case 'onTabChange': return { index: eventContext.value, previousIndex: previousValue, ...supplied };
    case 'onRowClick': return { rowIndex: eventContext.value, ...supplied };
    case 'onDrop': return { text: eventContext.value, files: [], types: [], ...supplied };
    default: return supplied;
  }
}

export type ExecutionStageType = 'linkage' | 'script' | 'flow';

export interface ExecuteFormEventOptions {
  workflows: WorkflowFile[];
  tables?: SrcTableEntry[];
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setVisible?: (componentId: string, visible: boolean) => void | Promise<void>;
  setDisabled?: (componentId: string, disabled: boolean) => void | Promise<void>;
  setRequired?: (field: string, required: boolean) => void | Promise<void>;
  /** Prefer this adapter when the host can apply all event effects in one state update. */
  applyEffects?: (effects: FormEventEffect[]) => void | Promise<void>;
  setOptions?: (field: string, config: FormLinkageOptionsConfig) => void | Promise<void>;
  showMessage?: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void | Promise<void>;
  upsertRow?: (sheetId: string, record: Record<string, unknown>, options: { key: string }) => void | Promise<void>;
  code?: string;
  trigger?: FormFlowTriggerConfig;
  linkageRules?: FormLinkageRule[];
  callbacks?: Record<string, FormEventCallback>;
  autoRunConfiguredFlow?: boolean;
  components?: ComponentNode[];
  hostRoot?: HTMLElement | null;
  /** DOM 操作适配器；默认使用浏览器 DOM。测试环境可注入 noop 适配器。 */
  domAdapter?: DomAdapter;
  /** 自定义执行顺序，默认 ['linkage', 'script', 'flow'] */
  executionOrder?: ExecutionStageType[];
  /** 流程执行后是否自动将 export 输出回写到表单字段，默认 true */
  autoWriteFlowOutput?: boolean;
}

export interface FormEventExecutionResult {
  callbackExecuted: boolean;
  callbackResult?: unknown;
  flowExecuted: boolean;
  flowResult?: FlowExecutionResult;
  flowResults: FlowExecutionResult[];
  trace: FormEventExecutionTrace;
  error?: Error;
}

function createControlAccessors(
  components: ComponentNode[],
  runtimeValues: Record<string, unknown>,
  state: {
    visibleByComponent: Record<string, boolean>;
    disabledByComponent: Record<string, boolean>;
    requiredByField: Record<string, boolean>;
  },
  helpers: {
    setValue: (field: string, value: unknown) => void | Promise<void>;
    setVisible?: (componentId: string, visible: boolean) => void | Promise<void>;
    setDisabled?: (componentId: string, disabled: boolean) => void | Promise<void>;
    setRequired?: (field: string, required: boolean) => void | Promise<void>;
  },
) {
  const controls: FormEventRuntimeContext['controls'] = {};
  const handles: FormEventRuntimeContext['controls'][string][] = [];
  for (const component of components) {
    const fieldName = resolveEventControlFieldName(component);
    const control: Record<string, unknown> = {
      id: component.id,
      name: fieldName,
      type: component.type,
      component,
    };
    Object.defineProperties(control, {
      value: {
        enumerable: true,
        get: () => runtimeValues[fieldName],
        set: (next) => { void helpers.setValue(fieldName, next); },
      },
      visible: {
        enumerable: true,
        get: () => state.visibleByComponent[component.id] ?? true,
        set: (next) => {
          state.visibleByComponent[component.id] = !!next;
          void helpers.setVisible?.(component.id, !!next);
        },
      },
      disabled: {
        enumerable: true,
        get: () => state.disabledByComponent[component.id] ?? false,
        set: (next) => {
          state.disabledByComponent[component.id] = !!next;
          void helpers.setDisabled?.(component.id, !!next);
        },
      },
      required: {
        enumerable: true,
        get: () => state.requiredByField[fieldName] ?? false,
        set: (next) => {
          state.requiredByField[fieldName] = !!next;
          void helpers.setRequired?.(fieldName, !!next);
        },
      },
    });
    handles.push(control as FormEventRuntimeContext['controls'][string]);
  }
  for (const assignment of planEventControlKeys(components)) {
    controls[assignment.key] = handles[assignment.componentIndex];
  }
  return controls;
}

function findComponentField(component: ComponentNode): string {
  return getFlowComponentField(component);
}

async function executeCallbackCode(
  code: string,
  context: FormEventRuntimeContext,
  callbacks: Record<string, FormEventCallback>,
  writeLog: (entry: ScriptLogEntry) => void,
): Promise<unknown> {
  const scope = createScriptExecutionScope(context as unknown as Record<string, unknown>, {
    callbacks,
    writeLog,
  });
  return executeInjectedScript(code, scope);
}

/** 执行控件事件（上下文构造 + 规则/脚本联动）。 */
export async function executeFormControlEvent(
  eventContext: FormControlEventContext,
  options: ExecuteFormEventOptions,
): Promise<FormEventExecutionResult> {
  const code = String(options.code ?? (eventContext.component.props?.events as Record<string, unknown> | undefined)?.[eventContext.eventName] ?? '').trim();
  const trigger = options.trigger ?? (eventContext.component.props?.flowTriggers as Record<string, FormFlowTriggerConfig> | undefined)?.[eventContext.eventName];
  const linkageRules = options.linkageRules ?? (eventContext.component.props?.linkageRules as Record<string, FormLinkageRule[]> | undefined)?.[eventContext.eventName] ?? [];
  const callbacks = options.callbacks || {};
  const components = options.components || [eventContext.component];
  const runtimeValues = { ...eventContext.values };
  const originalValues = eventContext.originalValues || {};
  const previousValue = eventContext.previousValue ?? originalValues[eventContext.field];
  const changedFields = eventContext.changedFields || [...new Set([...Object.keys(originalValues), ...Object.keys(runtimeValues)])]
    .filter((field) => !sameValue(runtimeValues[field], originalValues[field]));
  const detail = createEventDetail(eventContext, previousValue);
  const flowResults: FlowExecutionResult[] = [];
  const configuredFlowRuns: Array<{ workflow: WorkflowFile; result: FlowExecutionResult }> = [];
  const explicitFlowOutputs: Array<{ field: string; value: unknown }> = [];
  const stages: FormEventExecutionStage[] = [];
  let callbackExecuted = false;
  let callbackResult: unknown;
  let configuredFlowInvoked = false;
  const updatedFields = new Set<string>();
  const updatedComponents = new Set<string>();
  const requiredFields = new Set<string>();
  const messages: Array<{ level: 'info' | 'success' | 'warning' | 'error'; message: string }> = [];
  const debugLogs: DebugEntry[] = [];
  const debugRequestId = `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const visibleByComponent = Object.fromEntries(components.map((component) => [component.id, (component as ComponentNode & { visible?: boolean }).visible ?? true]));
  const disabledByComponent = Object.fromEntries(components.map((component) => [component.id, !!component.props.disabled]));
  const requiredByField = Object.fromEntries(components.map((component) => [findComponentField(component), !!component.props.required]));
  let currentEffectSource: FormEventEffectSource = 'system';
  const transaction = createFormEventTransaction({
    values: runtimeValues,
    apply: async (effects) => {
      if (options.applyEffects) {
        await options.applyEffects(effects);
        return;
      }
      for (const effect of effects) {
        switch (effect.kind) {
          case 'value': await options.setValue(effect.field, effect.value); break;
          case 'visible': await options.setVisible?.(effect.componentId, effect.value); break;
          case 'disabled': await options.setDisabled?.(effect.componentId, effect.value); break;
          case 'required': await options.setRequired?.(effect.field, effect.value); break;
        }
      }
    },
  });
  const componentById = new Map(components.map((component) => [component.id, component] as const));
  const componentByField = new Map<string, ComponentNode>();
  const componentByName = new Map<string, ComponentNode>();
  for (const component of components) {
    const fieldName = findComponentField(component);
    if (fieldName && !componentByField.has(fieldName)) componentByField.set(fieldName, component);
    const rawName = String(component.props.name || component.name || '').trim();
    if (rawName && !componentByName.has(rawName)) componentByName.set(rawName, component);
  }

  const findWorkflow = (reference?: string | WorkflowFile) => {
    if (reference && typeof reference === 'object') return reference;
    const key = reference || trigger?.workflowId;
    const workflow = options.workflows.find((item) => item.id === key || item.name === key);
    if (!workflow) throw new Error(key ? `找不到事件绑定的流程: ${key}` : '当前事件没有配置流程');
    return workflow;
  };

  const getRequiredFieldTarget = (field: string) => {
    const component = componentByField.get(field) || componentByName.get(field);
    return { fieldName: field, component };
  };

  const resolveFieldComponent = (field: string) => {
    const component = componentByField.get(field) || componentByName.get(field);
    if (!component) throw new Error(`找不到字段对应的控件: ${field}`);
    return component;
  };

  const resolveComponent = (componentId: string) => {
    const component = componentById.get(componentId);
    if (!component) throw new Error(`找不到控件: ${componentId}`);
    return component;
  };

  const resolveFieldStateTarget = (fieldOrComponentId: string) => {
    const byComponent = componentById.get(fieldOrComponentId);
    if (byComponent) {
      return {
        component: byComponent,
        fieldName: findComponentField(byComponent),
      };
    }
    const byField = componentByField.get(fieldOrComponentId) || componentByName.get(fieldOrComponentId);
    if (byField) {
      return {
        component: byField,
        fieldName: fieldOrComponentId,
      };
    }
    return {
      component: undefined,
      fieldName: fieldOrComponentId,
    };
  };

  const dom = options.domAdapter || createBrowserDomAdapter(options.hostRoot);

  const focusResolvedComponent = async (componentId: string) => {
    const target = dom.findComponentElement(componentId);
    if (!target) throw new Error(`找不到可聚焦的控件节点: ${componentId}`);
    dom.scrollIntoView(target);
    dom.focusElement(target);
  };

  const scrollResolvedComponent = async (componentId: string) => {
    const target = dom.findComponentElement(componentId);
    if (!target) throw new Error(`找不到可滚动定位的控件节点: ${componentId}`);
    dom.scrollIntoView(target);
  };

  const getAncestorTabs = (componentId: string) => {
    const result: ComponentNode[] = [];
    let current = componentById.get(componentId);
    while (current) {
      const parentId = String(current.props.parentId || '');
      if (!parentId) break;
      const parent = componentById.get(parentId);
      if (!parent) break;
      if (parent.type === 'tabs') result.push(parent);
      current = parent;
    }
    return result;
  };

  const getTabOptions = (component: ComponentNode) => {
    const raw = Array.isArray(component.props.tabs) ? component.props.tabs : [];
    return raw.map((item, index) => {
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return {
          index,
          value: record.value == null ? String(index) : String(record.value),
          label: String(record.label ?? record.name ?? record.value ?? `选项 ${index + 1}`),
        };
      }
      return {
        index,
        value: String(item ?? index),
        label: String(item ?? `选项 ${index + 1}`),
      };
    });
  };

  const switchTabInternal = async (tabIdOrIndex: string | number) => {
    const tabsComponents = components.filter((component) => component.type === 'tabs');
    if (tabsComponents.length === 0) throw new Error('当前表单中没有可切换的 tabs 控件');
    const ancestorTabs = getAncestorTabs(eventContext.component.id);
    const preferredTabs = [...ancestorTabs, ...tabsComponents.filter((item) => !ancestorTabs.some((tab) => tab.id === item.id))];
    if (typeof tabIdOrIndex === 'number') {
      const targetTabs = preferredTabs[0];
      if (!targetTabs) throw new Error('找不到可作用的 tabs 控件');
      const options = getTabOptions(targetTabs);
      if (tabIdOrIndex < 0 || tabIdOrIndex >= options.length) {
        throw new Error(`tabs 索引超出范围: ${tabIdOrIndex}`);
      }
      await runtimeContext.setValue(findComponentField(targetTabs), tabIdOrIndex);
      return;
    }
    const tabKey = String(tabIdOrIndex).trim();
    if (!tabKey) throw new Error('tabs 目标不能为空');
    for (const tabs of preferredTabs) {
      const options = getTabOptions(tabs);
      const hit = options.find((option) => option.value === tabKey || option.label === tabKey);
      if (!hit) continue;
      await runtimeContext.setValue(findComponentField(tabs), hit.index);
      return;
    }
    throw new Error(`找不到目标页签: ${tabKey}`);
  };

  let runtimeContext!: FormEventRuntimeContext;
  const runWorkflow: FormEventRuntimeContext['runWorkflow'] = async (reference, parameters = {}, runOptions = {}) => {
    const workflow = findWorkflow(reference);
    const isConfiguredReference = !reference
      || reference === trigger?.workflowId
      || (typeof reference === 'object' && reference.id === trigger?.workflowId);
    if (isConfiguredReference) {
      configuredFlowInvoked = true;
    }
    const config: FormFlowTriggerConfig = {
      enabled: true,
      workflowId: workflow.id,
      targetNodeId: runOptions.targetNodeId ?? trigger?.targetNodeId,
      parameterMap: { ...(trigger?.parameterMap || {}), ...parameters },
      ...(isConfiguredReference && trigger?.bindings ? { bindings: trigger.bindings } : {}),
    };
    const result = await executeFormFlowTrigger(workflow, config, runtimeContext, options.tables || []);
    if (result.debug) {
      result.debug.workflowId = workflow.id;
      result.debug.requestId = result.debug.requestId || debugRequestId;
      for (const entry of result.debug.events) {
        debugLogs.push({
          ...entry,
          workflowId: entry.workflowId || workflow.id,
          requestId: entry.requestId || result.debug.requestId,
          eventName: eventContext.eventName,
          field: eventContext.field,
          componentId: eventContext.component.id,
        });
      }
    }
    debugLogs.push({
      id: `${debugRequestId}:workflow:${workflow.id}`,
      timestamp: Date.now(),
      level: result.success ? 'info' : 'error',
      source: 'flow',
      title: `流程 ${workflow.name}`,
      message: result.success ? '流程执行完成' : '流程执行失败',
      workflowId: workflow.id,
      requestId: result.debug?.requestId || debugRequestId,
      eventName: eventContext.eventName,
      field: eventContext.field,
      componentId: eventContext.component.id,
      context: {
        executedNodeCount: result.debug?.executedNodeCount ?? result.nodeResults.size,
        exportKeys: result.debug?.exportKeys ?? Object.keys(result.finalOutputs),
        duration: result.totalDuration,
        errors: result.errors,
      },
    });
    flowResults.push(result);
    if (!result.success) throw new Error(result.errors.join('\n') || `流程 ${workflow.name} 执行失败`);
    if (isConfiguredReference) configuredFlowRuns.push({ workflow, result });
    return result;
  };

  const writeDebug = (entry: Omit<DebugEntry, 'id' | 'timestamp'>) => {
    debugLogs.push({
      id: `${debugRequestId}:${debugLogs.length + 1}`,
      timestamp: Date.now(),
      eventName: entry.eventName || eventContext.eventName,
      field: entry.field || eventContext.field,
      componentId: entry.componentId || eventContext.component.id,
      ...entry,
    });
  };

  runtimeContext = {
    ...eventContext,
    event: eventContext.eventName,
    eventName: eventContext.eventName,
    detail,
    values: runtimeValues,
    formData: runtimeValues,
    controls: createControlAccessors(components, runtimeValues, {
      visibleByComponent,
      disabledByComponent,
      requiredByField,
    }, {
      setValue: async (field, value) => {
        runtimeValues[field] = value;
        updatedFields.add(field);
        transaction.setValue(field, value, currentEffectSource);
      },
      setVisible: (componentId, visible) => transaction.setVisible(componentId, visible, currentEffectSource),
      setDisabled: (componentId, disabled) => transaction.setDisabled(componentId, disabled, currentEffectSource),
      setRequired: (field, required) => transaction.setRequired(field, required, currentEffectSource),
    }),
    originalValues,
    previousValue,
    timestamp: eventContext.timestamp ?? Date.now(),
    dirty: eventContext.dirty ?? !sameValue(eventContext.value, previousValue),
    changedFields,
    componentId: eventContext.componentId || eventContext.component.id,
    componentType: eventContext.componentType || eventContext.component.type,
    getValue: (field) => runtimeValues[field],
    getValues: (fields) => Object.fromEntries(fields.map((field) => [field, runtimeValues[field]])),
    setValue: async (field, value) => {
      runtimeValues[field] = value;
      updatedFields.add(field);
      transaction.setValue(field, value, currentEffectSource);
    },
    setValues: async (patch) => {
      for (const [field, value] of Object.entries(patch)) {
        await runtimeContext.setValue(field, value);
      }
    },
    clearValue: async (field) => {
      await runtimeContext.setValue(field, '');
    },
    clearValues: async (fields) => {
      for (const field of fields) {
        await runtimeContext.clearValue(field);
      }
    },
    setVisible: async (componentId, visible) => {
      resolveComponent(componentId);
      visibleByComponent[componentId] = visible;
      updatedComponents.add(componentId);
      transaction.setVisible(componentId, visible, currentEffectSource);
    },
    toggleVisible: async (componentId) => {
      const next = !(visibleByComponent[componentId] ?? true);
      await runtimeContext.setVisible(componentId, next);
      return next;
    },
    setDisabled: async (componentId, disabled) => {
      resolveComponent(componentId);
      disabledByComponent[componentId] = disabled;
      updatedComponents.add(componentId);
      transaction.setDisabled(componentId, disabled, currentEffectSource);
    },
    toggleDisabled: async (componentId) => {
      const next = !(disabledByComponent[componentId] ?? false);
      await runtimeContext.setDisabled(componentId, next);
      return next;
    },
    setRequired: async (field, required) => {
      requiredByField[field] = required;
      requiredFields.add(field);
      transaction.setRequired(field, required, currentEffectSource);
    },
    setOptions: async (field, config) => {
      await options.setOptions?.(field, config);
    },
    toggleRequired: async (field) => {
      const { fieldName } = getRequiredFieldTarget(field);
      const next = !(requiredByField[fieldName] ?? false);
      await runtimeContext.setRequired(fieldName, next);
      return next;
    },
    setFieldState: async (fieldOrComponentId, patch) => {
      const target = resolveFieldStateTarget(fieldOrComponentId);
      if ('value' in patch) {
        await runtimeContext.setValue(target.fieldName, patch.value);
      }
      if ('visible' in patch) {
        if (!target.component) throw new Error(`找不到用于设置 visible 的控件: ${fieldOrComponentId}`);
        await runtimeContext.setVisible(target.component.id, !!patch.visible);
      }
      if ('disabled' in patch) {
        if (!target.component) throw new Error(`找不到用于设置 disabled 的控件: ${fieldOrComponentId}`);
        await runtimeContext.setDisabled(target.component.id, !!patch.disabled);
      }
      if ('required' in patch) {
        await runtimeContext.setRequired(target.fieldName, !!patch.required);
      }
    },
    focusField: async (field) => {
      const component = resolveFieldComponent(field);
      await focusResolvedComponent(component.id);
    },
    focusControl: async (componentId) => {
      resolveComponent(componentId);
      await focusResolvedComponent(componentId);
    },
    scrollToField: async (field) => {
      const component = resolveFieldComponent(field);
      await scrollResolvedComponent(component.id);
    },
    scrollToControl: async (componentId) => {
      resolveComponent(componentId);
      await scrollResolvedComponent(componentId);
    },
    switchTab: async (tabIdOrIndex) => {
      await switchTabInternal(tabIdOrIndex);
    },
    openTab: async (tabIdOrIndex) => runtimeContext.switchTab(tabIdOrIndex),
    showMessage: async (message, level = 'info') => {
      messages.push({ message, level });
      await options.showMessage?.(message, level);
    },
    querySheet: (sheetId, filter) => querySheetRows(options.tables || [], sheetId, filter),
    findRows: (sheetId, criteria = {}, findOptions = {}) => findRowsInTables(options.tables || [], sheetId, criteria, findOptions),
    findRow: (sheetId, criteria, findOptions = {}) => findRowInTables(options.tables || [], sheetId, criteria, findOptions),
    nextSequence: (sheetId, column, sequenceOptions = {}) => nextSequenceInTables(options.tables || [], sheetId, column, sequenceOptions),
    fillForm: async (record, fieldMap, fillOptions = {}) => {
      const result = buildFillFormPatch(record, fieldMap, fillOptions);
      for (const [field, value] of Object.entries(result.patch)) {
        await runtimeContext.setValue(field, value);
      }
      for (const [field, value] of Object.entries(result.originalPatch)) {
        await runtimeContext.setValue(field, value);
      }
      for (const componentId of result.enableComponentIds) {
        await runtimeContext.setDisabled(componentId, false);
      }
      return result;
    },
    requireFields: async (fields, requireOptions = {}) => {
      const result = validateRequiredFields(runtimeValues, fields, requireOptions);
      if (!result.valid) {
        if (result.message) await runtimeContext.showMessage(result.message, requireOptions.level || 'error');
        if ((requireOptions.focus ?? true) && result.firstMissingField) {
          await runtimeContext.focusField(result.firstMissingField);
        }
      }
      return result;
    },
    resetForm: async (resetOptions = {}) => {
      const result = buildResetFormPatch(runtimeValues, resetOptions);
      await runtimeContext.setValues(result.patch);
      if (result.message) await runtimeContext.showMessage(result.message, 'info');
      if (result.focusedField) await runtimeContext.focusField(result.focusedField);
      return result;
    },
    evaluate: (expression) => {
      const result = evaluatePropertyExpression(expression, {
        form: runtimeValues,
        row: originalValues,
        event: { ...eventContext, detail: createEventDetail(eventContext, previousValue) },
        table: Object.fromEntries((options.tables || []).flatMap((table) => table.sheets.map((sheet) => [sheet.name, sheet.preview]))),
      });
      if (!result.ok) throw new Error(result.error);
      return result.value;
    },
    fields: (fieldOrFields) => {
      const fields = Array.isArray(fieldOrFields) ? fieldOrFields : [fieldOrFields];
      let pending = Promise.resolve();
      const chainOp = (fn: (field: string) => Promise<void> | void) => { pending = pending.then(async () => { for (const field of fields) await fn(field); }); return chain; };
      const resolveAnd = (fn: (componentId: string) => Promise<void> | void) => chainOp((field) => { const target = resolveFieldStateTarget(field); if (!target.component) throw new Error(`找不到控件: ${field}`); return fn(target.component.id); });
      const chain: FormFieldChain = {
        show: () => resolveAnd((id) => runtimeContext.setVisible(id, true)),
        hide: () => resolveAnd((id) => runtimeContext.setVisible(id, false)),
        enable: () => resolveAnd((id) => runtimeContext.setDisabled(id, false)),
        disable: () => resolveAnd((id) => runtimeContext.setDisabled(id, true)),
        required: () => chainOp((field) => runtimeContext.setRequired(field, true)),
        optional: () => chainOp((field) => runtimeContext.setRequired(field, false)),
        clear: () => chainOp((field) => runtimeContext.clearValue(field)),
        set: (value) => chainOp((field) => runtimeContext.setValue(field, value)),
        then: (onfulfilled, onrejected) => pending.then(onfulfilled, onrejected),
      };
      return chain;
    },
    form: {
      values: () => ({ ...runtimeValues }),
      require: (fields) => {
        let focus = false;
        const run = () => runtimeContext.requireFields(fields, { focus });
        const chain: FormRequireChain = {
          focusFirstInvalid: () => { focus = true; return chain; },
          then: (onfulfilled, onrejected) => run().then(onfulfilled, onrejected),
        };
        return chain;
      },
    },
    table: (sheetId) => ({
      rows: (criteria = {}, findOptions = {}) => runtimeContext.findRows(sheetId, criteria, findOptions),
      find: (criteria, findOptions = {}) => {
        const run = async () => runtimeContext.findRow(sheetId, criteria, findOptions);
        const chain: FormTableFindChain = {
          fillForm: async (fieldMap, fillOptions) => {
            const row = await run();
            return row ? runtimeContext.fillForm(row, fieldMap, fillOptions) : null;
          },
          then: (onfulfilled, onrejected) => run().then(onfulfilled, onrejected),
        };
        return chain;
      },
      upsert: async (record, upsertOptions) => {
        const keyField = String(upsertOptions?.key || '').trim();
        if (!keyField) throw new Error('upsert 需要 key 字段');
        const keyValue = record[keyField];
        if (keyValue == null || keyValue === '') throw new Error(`upsert 主键为空: ${keyField}`);
        const sheet = (options.tables || []).flatMap((table) => table.sheets.map((item) => ({ table, sheet: item }))).find(({ table, sheet }) => sheetId === table.id || sheetId === sheet.name || sheetId === `${table.id}:${sheet.name}` || sheetId === `${table.id}::${sheet.name}`)?.sheet;
        const index = sheet?.preview.findIndex((item) => item[keyField] === keyValue) ?? -1;
        if (sheet) {
          if (index >= 0) sheet.preview[index] = { ...sheet.preview[index], ...record };
          else sheet.preview.push({ ...record });
        }
        await options.upsertRow?.(sheetId, record, { key: keyField });
        return { created: index < 0, updated: index >= 0, key: keyValue, record: { ...record } };
      },
    }),
    flow: (workflow) => ({
      run: (parameters = {}, runOptions = {}) => {
        const run = () => runtimeContext.runWorkflow(workflow, parameters, runOptions);
        const chain: FormFlowChain = {
          writeBack: async () => {
            // Kept as a source-compatible alias. Output writes are exclusively
            // controlled by the configured V2 binding at the event tail.
            return run();
          },
          then: (onfulfilled, onrejected) => run().then(onfulfilled, onrejected),
        };
        return chain;
      },
    }),
    runWorkflow,
    runConfiguredWorkflow: (parameters) => runWorkflow(undefined, parameters),
    queueFlowOutput: (field, value) => {
      explicitFlowOutputs.push({ field, value });
    },
    call: async (name, ...args) => {
      const callback = callbacks[name];
      if (!callback) throw new Error(`找不到自定义回调函数: ${name}`);
      return callback(runtimeContext, ...args);
    },
    callbacks,
    debug: (label, data, debugOptions = {}) => {
      writeDebug({
        level: debugOptions.level || 'debug',
        source: debugOptions.source || 'script',
        channel: debugOptions.channel,
        title: label,
        message: typeof data === 'string' ? data : label,
        format: debugOptions.format,
        context: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : (Array.isArray(data) ? { rows: data } : undefined),
        workflowId: debugOptions.workflowId,
        nodeId: debugOptions.nodeId,
        requestId: debugOptions.requestId || debugRequestId,
      });
    },
    console: {
      log: (...args) => {
        getNativeConsole().log('[Form Event]', ...args);
        writeDebug({ level: 'info', source: 'script', title: '[console]', message: args.map(String).join(' ') });
      },
      warn: (...args) => {
        getNativeConsole().warn('[Form Event]', ...args);
        writeDebug({ level: 'warn', source: 'script', title: '[console]', message: args.map(String).join(' ') });
      },
      error: (...args) => {
        getNativeConsole().error('[Form Event]', ...args);
        writeDebug({ level: 'error', source: 'script', title: '[console]', message: args.map(String).join(' ') });
      },
      debug: (...args) => {
        getNativeConsole().debug('[Form Event]', ...args);
        writeDebug({ level: 'debug', source: 'script', title: '[console]', message: args.map(String).join(' ') });
      },
    },
  };

  const buildTrace = (): FormEventExecutionTrace => ({
    eventName: eventContext.eventName,
    field: eventContext.field,
    stages,
    effects: {
      updatedFields: [...updatedFields],
      updatedComponents: [...updatedComponents],
      requiredFields: [...requiredFields],
      messages,
      debugLogs,
    },
  });

  try {
    const order = options.executionOrder || ['linkage', 'script', 'flow'];

    for (const stage of order) {
      currentEffectSource = stage === 'linkage' ? 'linkage' : stage === 'script' ? 'script' : 'flow';
      switch (stage) {
        case 'linkage':
          if (Array.isArray(linkageRules) && linkageRules.length > 0) {
            const linkage = await executeLinkageRules(linkageRules, runtimeContext);
            stages.push(...linkage.stages);
          }
          break;
        case 'script':
          if (code) {
            callbackExecuted = true;
            const scriptStage: FormEventExecutionStage = {
              id: `script:${eventContext.eventName}`,
              type: 'script',
              label: '高级脚本',
              status: 'success',
              details: [],
            };
            callbackResult = await executeCallbackCode(code, runtimeContext, callbacks, (entry) => {
              writeDebug({
                ...entry,
                source: entry.source || 'script',
                requestId: entry.requestId || debugRequestId,
              });
            });
            scriptStage.details = callbackResult === undefined ? ['已执行'] : ['已执行并返回结果'];
            stages.push(scriptStage);
          }
          break;
        case 'flow':
          if (options.autoRunConfiguredFlow !== false && trigger?.enabled && trigger.workflowId && !configuredFlowInvoked) {
            await runWorkflow();
          }
          break;
      }
    }

    if (flowResults.length > 0) {
      stages.push({
        id: `flow:${trigger?.workflowId || 'runtime'}`,
        type: 'flow',
        label: trigger?.workflowId ? `流程 ${trigger.workflowId}` : '流程执行',
        status: 'success',
        details: [`执行 ${flowResults.length} 次`],
      });

      // ── 流程输出回写表单字段 ──
      if (options.autoWriteFlowOutput !== false) {
        const configuredRun = configuredFlowRuns[configuredFlowRuns.length - 1];
        if (trigger?.bindings?.version === 2 && configuredRun?.result.success) {
          const prepared = prepareV2FlowOutputWrites(
            trigger.bindings,
            configuredRun.workflow,
            configuredRun.result.finalOutputs,
            runtimeContext,
            components,
          );
          const configuredTargets = new Set(prepared.writes.map((write) => write.field));
          const explicitTargets = new Set<string>();
          for (const write of explicitFlowOutputs) {
            if (explicitTargets.has(write.field) || configuredTargets.has(write.field)) {
              throw new Error(`流程输出重复指向表单字段: ${write.field}`);
            }
            if (!componentByField.has(write.field) && !componentByName.has(write.field)) {
              throw new Error(`流程输出目标字段已失效: ${write.field}`);
            }
            explicitTargets.add(write.field);
          }
          prepared.writes.unshift(...explicitFlowOutputs.map((write) => {
            const component = componentByField.get(write.field) || componentByName.get(write.field)!;
            return { ...write, componentId: component.id, output: 'result' };
          }));
          const flowModifiedFields: string[] = [];
          for (const write of prepared.writes) {
            if (sameValue(runtimeValues[write.field], write.value)) continue;
            flowModifiedFields.push(write.field);
            runtimeValues[write.field] = write.value;
            updatedFields.add(write.field);
          }
          for (const write of prepared.writes) {
            if (flowModifiedFields.includes(write.field)) transaction.setValue(write.field, write.value, 'flow');
          }
          if (flowModifiedFields.length > 0 || prepared.skipped.length > 0) {
            stages.push({
              id: `flow-post:${trigger.workflowId}`,
              type: 'flow',
              label: '流程输出回写',
              status: 'success',
              details: [
                ...(flowModifiedFields.length ? [`回写字段: ${flowModifiedFields.join(', ')}`] : []),
                ...(prepared.skipped.length ? [`跳过无结果输出: ${prepared.skipped.join(', ')}`] : []),
              ],
            });
          }
          for (const field of flowModifiedFields) {
            debugLogs.push({
              id: `${debugRequestId}:flow-output:${field}`,
              timestamp: Date.now(),
              level: 'info',
              source: 'flow',
              title: '流程输出回写',
              message: `字段 "${field}" 已被流程输出更新`,
              workflowId: trigger.workflowId,
              requestId: debugRequestId,
              field,
              context: { value: runtimeValues[field], atomic: true },
            });
          }
        } else if (!trigger?.bindings) {
          const configuredRun = configuredFlowRuns[configuredFlowRuns.length - 1];
          if (!configuredRun?.result.success) {
            // 旧配置沿用原行为：失败流程不回写。
          } else {
          const exportOutputs = configuredRun.result.finalOutputs;
          const flowModifiedFields: string[] = [];
          for (const write of explicitFlowOutputs) {
            if (flowModifiedFields.includes(write.field)) throw new Error(`流程输出重复指向表单字段: ${write.field}`);
            if (!componentByField.has(write.field) && !componentByName.has(write.field)) throw new Error(`流程输出目标字段已失效: ${write.field}`);
            if (!sameValue(runtimeValues[write.field], write.value)) {
              flowModifiedFields.push(write.field);
              runtimeValues[write.field] = write.value;
              updatedFields.add(write.field);
              transaction.setValue(write.field, write.value, 'flow');
            }
          }
          for (const [key, value] of Object.entries(exportOutputs)) {
            if (explicitFlowOutputs.length) continue;
            if (key.startsWith('__') || (key === 'result' && value && typeof value === 'object')) continue;
            if (!sameValue(runtimeValues[key], value)) {
              flowModifiedFields.push(key);
              runtimeValues[key] = value;
              updatedFields.add(key);
              transaction.setValue(key, value, 'flow');
            }
          }
          if (flowModifiedFields.length > 0) {
            stages.push({
              id: `flow-post:${trigger?.workflowId || 'runtime'}`,
              type: 'flow',
              label: '流程输出回写',
              status: 'success',
              details: [`回写字段: ${flowModifiedFields.join(', ')}`],
            });
            for (const field of flowModifiedFields) {
              debugLogs.push({
                id: `${debugRequestId}:flow-output:${field}`,
                timestamp: Date.now(),
                level: 'info',
                source: 'flow',
                title: '流程输出回写',
                message: `字段 "${field}" 已被流程输出更新`,
                workflowId: trigger?.workflowId,
                requestId: debugRequestId,
                field,
                context: { value: runtimeValues[field] },
              });
            }
          }
          }
        }
      }
    }

    currentEffectSource = 'system';
    await transaction.commit();
    return {
      callbackExecuted,
      callbackResult,
      flowExecuted: flowResults.length > 0,
      flowResult: flowResults[flowResults.length - 1],
      flowResults,
      trace: buildTrace(),
    };
  } catch (cause) {
    transaction.abort();
    const error = cause instanceof Error ? cause : new Error(String(cause));
    console.error(`[Form Event Error] ${eventContext.field}.${eventContext.eventName}:`, error);
    if (code && !stages.some((stage) => stage.type === 'script')) {
      stages.push({
        id: `script:${eventContext.eventName}`,
        type: 'script',
        label: '高级脚本',
        status: 'error',
        details: [error.message],
      });
    }
    if (flowResults.length > 0 && !stages.some((stage) => stage.type === 'flow')) {
      stages.push({
        id: `flow:${trigger?.workflowId || 'runtime'}`,
        type: 'flow',
        label: trigger?.workflowId ? `流程 ${trigger.workflowId}` : '流程执行',
        status: 'error',
        details: [error.message],
      });
    }
    return {
      callbackExecuted,
      callbackResult,
      flowExecuted: flowResults.length > 0,
      flowResult: flowResults[flowResults.length - 1],
      flowResults,
      trace: buildTrace(),
      error,
    };
  }
}
