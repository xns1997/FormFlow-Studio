import type { ComponentNode } from '../../models';
import type { SrcTableEntry, WorkflowFile } from '../../project/types';
import type { FormEventExecutionStage, FormEventExecutionTrace, FormLinkageRule } from '../../project/types';
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

export type FormEventCallback = (context: FormEventRuntimeContext, ...args: unknown[]) => unknown | Promise<unknown>;

export interface FormEventRuntimeContext extends FormControlEventContext {
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
  runWorkflow: (
    workflow?: string | WorkflowFile,
    parameters?: Record<string, unknown>,
    options?: { targetNodeId?: string },
  ) => Promise<FlowExecutionResult>;
  runConfiguredWorkflow: (parameters?: Record<string, unknown>) => Promise<FlowExecutionResult>;
  call: (name: string, ...args: unknown[]) => Promise<unknown>;
  callbacks: Record<string, FormEventCallback>;
  console: Pick<Console, 'log' | 'warn' | 'error'>;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

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

export interface ExecuteFormEventOptions {
  workflows: WorkflowFile[];
  tables?: SrcTableEntry[];
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setVisible?: (componentId: string, visible: boolean) => void | Promise<void>;
  setDisabled?: (componentId: string, disabled: boolean) => void | Promise<void>;
  setRequired?: (field: string, required: boolean) => void | Promise<void>;
  showMessage?: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void | Promise<void>;
  code?: string;
  trigger?: FormFlowTriggerConfig;
  linkageRules?: FormLinkageRule[];
  callbacks?: Record<string, FormEventCallback>;
  autoRunConfiguredFlow?: boolean;
  components?: ComponentNode[];
  hostRoot?: HTMLElement | null;
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

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

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
  for (const component of components) {
    const fieldName = String(component.name || component.props.name || component.id);
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
    controls[fieldName] = control as FormEventRuntimeContext['controls'][string];
    controls[component.id] = controls[fieldName];
  }
  return controls;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findComponentField(component: ComponentNode): string {
  return String(component.name || component.props.name || component.id);
}

function findFocusableElement(container: Element | null): HTMLElement | null {
  if (!container) return null;
  const maybeElement = container as HTMLElement & { focus?: () => void };
  if (typeof maybeElement.focus === 'function') return maybeElement;
  return container.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
}

function getHostDocument(hostRoot?: HTMLElement | null): Document | null {
  if (hostRoot?.ownerDocument) return hostRoot.ownerDocument;
  if (typeof document !== 'undefined') return document;
  return null;
}

function scrollElementIntoView(target: Element | null) {
  if (!target || typeof (target as HTMLElement).scrollIntoView !== 'function') return;
  (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

function isFunctionExpression(code: string): boolean {
  const source = code.trim();
  return /^(async\s+)?function\b/.test(source)
    || /^(async\s*)?\([^)]*\)\s*=>/.test(source)
    || /^(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(source);
}

async function executeCallbackCode(
  code: string,
  context: FormEventRuntimeContext,
  callbacks: Record<string, FormEventCallback>,
): Promise<unknown> {
  if (isFunctionExpression(code)) {
    const evaluate = new AsyncFunction('ctx', 'callbacks', `
      const callback = (${code});
      if (typeof callback !== 'function') throw new Error('事件代码必须返回一个回调函数');
      return await callback(ctx);
    `);
    return evaluate(context, callbacks);
  }
  const evaluate = new AsyncFunction('ctx', 'callbacks', `
    with (ctx) {
      return await (async () => { ${code}\n })();
    }
  `);
  return evaluate(context, callbacks);
}

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
  const stages: FormEventExecutionStage[] = [];
  let callbackExecuted = false;
  let callbackResult: unknown;
  let configuredFlowInvoked = false;
  const updatedFields = new Set<string>();
  const updatedComponents = new Set<string>();
  const requiredFields = new Set<string>();
  const messages: Array<{ level: 'info' | 'success' | 'warning' | 'error'; message: string }> = [];
  const visibleByComponent = Object.fromEntries(components.map((component) => [component.id, (component as ComponentNode & { visible?: boolean }).visible ?? true]));
  const disabledByComponent = Object.fromEntries(components.map((component) => [component.id, !!component.props.disabled]));
  const requiredByField = Object.fromEntries(components.map((component) => [findComponentField(component), !!component.props.required]));
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

  const findComponentElement = (componentId: string) => {
    const selector = `[data-component-id="${escapeAttributeValue(componentId)}"]`;
    if (options.hostRoot) return options.hostRoot.querySelector(selector);
    const hostDocument = getHostDocument(options.hostRoot);
    if (!hostDocument) return null;
    return hostDocument.querySelector(selector);
  };

  const focusResolvedComponent = async (componentId: string) => {
    const target = findComponentElement(componentId);
    if (!target) throw new Error(`找不到可聚焦的控件节点: ${componentId}`);
    scrollElementIntoView(target);
    const focusable = findFocusableElement(target);
    if (!focusable) throw new Error(`控件不支持聚焦: ${componentId}`);
    focusable.focus();
  };

  const scrollResolvedComponent = async (componentId: string) => {
    const target = findComponentElement(componentId);
    if (!target) throw new Error(`找不到可滚动定位的控件节点: ${componentId}`);
    scrollElementIntoView(target);
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
    const preferredTabs = [...getAncestorTabs(eventContext.component.id), ...tabsComponents.filter((item) => !getAncestorTabs(eventContext.component.id).some((tab) => tab.id === item.id))];
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
    if (!reference || reference === trigger?.workflowId || (typeof reference === 'object' && reference.id === trigger?.workflowId)) {
      configuredFlowInvoked = true;
    }
    const config: FormFlowTriggerConfig = {
      enabled: true,
      workflowId: workflow.id,
      targetNodeId: runOptions.targetNodeId ?? trigger?.targetNodeId,
      parameterMap: { ...(trigger?.parameterMap || {}), ...parameters },
    };
    const result = await executeFormFlowTrigger(workflow, config, runtimeContext, options.tables || []);
    flowResults.push(result);
    if (!result.success) throw new Error(result.errors.join('\n') || `流程 ${workflow.name} 执行失败`);
    return result;
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
        await options.setValue(field, value);
      },
      setVisible: options.setVisible,
      setDisabled: options.setDisabled,
      setRequired: options.setRequired,
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
      await options.setValue(field, value);
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
      await options.setVisible?.(componentId, visible);
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
      await options.setDisabled?.(componentId, disabled);
    },
    toggleDisabled: async (componentId) => {
      const next = !(disabledByComponent[componentId] ?? false);
      await runtimeContext.setDisabled(componentId, next);
      return next;
    },
    setRequired: async (field, required) => {
      requiredByField[field] = required;
      requiredFields.add(field);
      await options.setRequired?.(field, required);
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
    openTab: async (tabIdOrIndex) => {
      await switchTabInternal(tabIdOrIndex);
    },
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
    runWorkflow,
    runConfiguredWorkflow: (parameters) => runWorkflow(undefined, parameters),
    call: async (name, ...args) => {
      const callback = callbacks[name];
      if (!callback) throw new Error(`找不到自定义回调函数: ${name}`);
      return callback(runtimeContext, ...args);
    },
    callbacks,
    console: {
      log: (...args) => console.log('[Form Event]', ...args),
      warn: (...args) => console.warn('[Form Event]', ...args),
      error: (...args) => console.error('[Form Event]', ...args),
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
    },
  });

  try {
    if (Array.isArray(linkageRules) && linkageRules.length > 0) {
      const linkage = await executeLinkageRules(linkageRules, runtimeContext);
      stages.push(...linkage.stages);
    }
    if (code) {
      callbackExecuted = true;
      const scriptStage: FormEventExecutionStage = {
        id: `script:${eventContext.eventName}`,
        type: 'script',
        label: '高级脚本',
        status: 'success',
        details: [],
      };
      callbackResult = await executeCallbackCode(code, runtimeContext, callbacks);
      scriptStage.details = callbackResult === undefined ? ['已执行'] : ['已执行并返回结果'];
      stages.push(scriptStage);
    }
    if (options.autoRunConfiguredFlow !== false && trigger?.enabled && trigger.workflowId && !configuredFlowInvoked) {
      await runWorkflow();
    }
    if (flowResults.length > 0) {
      stages.push({
        id: `flow:${trigger?.workflowId || 'runtime'}`,
        type: 'flow',
        label: trigger?.workflowId ? `流程 ${trigger.workflowId}` : '流程执行',
        status: 'success',
        details: [`执行 ${flowResults.length} 次`],
      });
    }
    return {
      callbackExecuted,
      callbackResult,
      flowExecuted: flowResults.length > 0,
      flowResult: flowResults[flowResults.length - 1],
      flowResults,
      trace: buildTrace(),
    };
  } catch (cause) {
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
