import type { SrcTableEntry, WorkflowFile } from '../project/types';
import {
  executeFormFlowTrigger,
  type FormControlEventContext,
  type FormFlowTriggerConfig,
} from './formFlowTrigger';
import type { FlowExecutionResult } from './flowEngine';

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

export interface ExecuteFormEventOptions {
  workflows: WorkflowFile[];
  tables?: SrcTableEntry[];
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setVisible?: (componentId: string, visible: boolean) => void | Promise<void>;
  setDisabled?: (componentId: string, disabled: boolean) => void | Promise<void>;
  setRequired?: (field: string, required: boolean) => void | Promise<void>;
  code?: string;
  trigger?: FormFlowTriggerConfig;
  callbacks?: Record<string, FormEventCallback>;
  autoRunConfiguredFlow?: boolean;
}

export interface FormEventExecutionResult {
  callbackExecuted: boolean;
  callbackResult?: unknown;
  flowExecuted: boolean;
  flowResult?: FlowExecutionResult;
  flowResults: FlowExecutionResult[];
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
  const callbacks = options.callbacks || {};
  const runtimeValues = { ...eventContext.values };
  const flowResults: FlowExecutionResult[] = [];
  let callbackExecuted = false;
  let callbackResult: unknown;
  let configuredFlowInvoked = false;

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
    detail: eventContext.detail,
    values: runtimeValues,
    formData: runtimeValues,
    originalValues: eventContext.originalValues || {},
    getValue: (field) => runtimeValues[field],
    setValue: async (field, value) => {
      runtimeValues[field] = value;
      await options.setValue(field, value);
    },
    setVisible: async (componentId, visible) => {
      await options.setVisible?.(componentId, visible);
    },
    setDisabled: async (componentId, disabled) => {
      await options.setDisabled?.(componentId, disabled);
    },
    setRequired: async (field, required) => {
      await options.setRequired?.(field, required);
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

  try {
    if (code) {
      callbackExecuted = true;
      callbackResult = await executeCallbackCode(code, runtimeContext, callbacks);
    }
    if (options.autoRunConfiguredFlow !== false && trigger?.enabled && trigger.workflowId && !configuredFlowInvoked) {
      await runWorkflow();
    }
    return {
      callbackExecuted,
      callbackResult,
      flowExecuted: flowResults.length > 0,
      flowResult: flowResults[flowResults.length - 1],
      flowResults,
    };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    console.error(`[Form Event Error] ${eventContext.field}.${eventContext.eventName}:`, error);
    return {
      callbackExecuted,
      callbackResult,
      flowExecuted: flowResults.length > 0,
      flowResult: flowResults[flowResults.length - 1],
      flowResults,
      error,
    };
  }
}
