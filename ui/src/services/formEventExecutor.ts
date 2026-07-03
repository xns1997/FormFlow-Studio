import type { SrcTableEntry, WorkflowFile } from '../project/types';
import type { FormEventExecutionStage, FormEventExecutionTrace, FormLinkageRule } from '../project/types';
import {
  executeFormFlowTrigger,
  type FormControlEventContext,
  type FormFlowTriggerConfig,
} from './formFlowTrigger';
import type { FlowExecutionResult } from './flowEngine';
import { executeLinkageRules } from './formLinkage';

export type FormEventCallback = (context: FormEventRuntimeContext, ...args: unknown[]) => unknown | Promise<unknown>;

export interface FormEventRuntimeContext extends FormControlEventContext {
  event: string;
  formData: Record<string, unknown>;
  detail?: unknown;
  getValue: (field: string) => unknown;
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setVisible: (componentId: string, visible: boolean) => void | Promise<void>;
  setDisabled: (componentId: string, disabled: boolean) => void | Promise<void>;
  setRequired: (field: string, required: boolean) => void | Promise<void>;
  showMessage: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void | Promise<void>;
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

  const findWorkflow = (reference?: string | WorkflowFile) => {
    if (reference && typeof reference === 'object') return reference;
    const key = reference || trigger?.workflowId;
    const workflow = options.workflows.find((item) => item.id === key || item.name === key);
    if (!workflow) throw new Error(key ? `找不到事件绑定的流程: ${key}` : '当前事件没有配置流程');
    return workflow;
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
    originalValues,
    previousValue,
    timestamp: eventContext.timestamp ?? Date.now(),
    dirty: eventContext.dirty ?? !sameValue(eventContext.value, previousValue),
    changedFields,
    componentId: eventContext.componentId || eventContext.component.id,
    componentType: eventContext.componentType || eventContext.component.type,
    getValue: (field) => runtimeValues[field],
    setValue: async (field, value) => {
      runtimeValues[field] = value;
      updatedFields.add(field);
      await options.setValue(field, value);
    },
    setVisible: async (componentId, visible) => {
      updatedComponents.add(componentId);
      await options.setVisible?.(componentId, visible);
    },
    setDisabled: async (componentId, disabled) => {
      updatedComponents.add(componentId);
      await options.setDisabled?.(componentId, disabled);
    },
    setRequired: async (field, required) => {
      requiredFields.add(field);
      await options.setRequired?.(field, required);
    },
    showMessage: async (message, level = 'info') => {
      messages.push({ message, level });
      await options.showMessage?.(message, level);
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
