// 行为引擎 - Trigger/Condition/Action/SideEffect 四元组

import type { RuntimeState, BehaviorLog } from '../../models';
import type { SrcTableEntry } from '../../project/types';
import { createSandboxContext } from '../config/scriptSandbox';

export type TriggerType =
  // 基础事件（原有）
  | 'formLoad' | 'rowLoad' | 'fieldChange' | 'fieldBlur' | 'fieldFocus'
  | 'buttonClick' | 'validate' | 'submit' | 'submitSuccess' | 'submitError'
  | 'dataSourceChange' | 'tabChange'
  // 扩展事件（新增 12 个）
  | 'formReady' | 'formReset' | 'beforeSubmit'
  | 'fieldKeyDown' | 'fieldPaste' | 'fieldClear'
  | 'rowAdd' | 'rowDelete' | 'rowSelect'
  | 'dataImport' | 'dataExport' | 'valueChange';

export type ConditionOperator =
  | '==' | '!=' | '>' | '<' | '>=' | '<='
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'isEmpty' | 'isNotEmpty' | 'regex' | 'custom';

export type ActionType =
  | 'setValue' | 'clearValue' | 'setVisible' | 'setHidden'
  | 'setEnabled' | 'setDisabled' | 'setRequired' | 'setOptional'
  | 'showMessage' | 'logMessage' | 'switchTab' | 'executeScript'
  | 'submitData' | 'callApi' | 'refreshData' | 'navigate'
  | 'runWorkflow';

export interface BehaviorRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: TriggerConfig;
  conditions: ConditionConfig[];
  actions: ActionConfig[];
  sideEffects: SideEffectConfig[];
}

export interface TriggerConfig {
  type: TriggerType;
  fieldName?: string;
  componentName?: string;
  buttonName?: string;
  debounce?: number;
}

export interface ConditionConfig {
  fieldName: string;
  operator: ConditionOperator;
  value: unknown;
  value2?: unknown;
  customExpression?: string;
  logic: 'AND' | 'OR';
  /** 数据源：'form'（默认）| 'flow'（流程输出）| 'behavior'（其他行为结果） */
  dataSource?: 'form' | 'flow' | 'behavior';
  /** 当 dataSource='flow' 时，指定流程输出字段名 */
  flowOutputField?: string;
  /** 当 dataSource='behavior' 时，指定行为名称 */
  behaviorName?: string;
}

export interface ActionConfig {
  type: ActionType;
  targetField?: string;
  targetComponent?: string;
  value?: unknown;
  expression?: string;
  message?: string;
  messageType?: 'info' | 'success' | 'warning' | 'error';
  tabName?: string;
  scriptCode?: string;
  apiUrl?: string;
  apiMethod?: string;
  /** API 请求体（JSON） */
  apiBody?: unknown;
  /** 自定义请求头 */
  apiHeaders?: Record<string, string>;
  /** API 认证类型 */
  apiAuthType?: 'none' | 'bearer' | 'apikey';
  /** API 认证值 */
  apiAuthValue?: string;
  /** 超时毫秒数，默认 10000 */
  apiTimeoutMs?: number;
  /** 重试次数，默认 0 */
  apiRetryCount?: number;
  /** 响应回写映射 { "responseField": "formField" } */
  apiResponseMap?: Record<string, string>;
  /** runWorkflow：要执行的流程 ID */
  workflowId?: string;
  /** runWorkflow：传入流程的参数 */
  workflowParameters?: Record<string, unknown>;
}

export interface SideEffectConfig {
  type: 'log' | 'analytics' | 'notification';
  message?: string;
  data?: Record<string, unknown>;
}

export interface BehaviorExecutionResult {
  success: boolean;
  actionsExecuted: number;
  sideEffectsExecuted: number;
  errors: string[];
  logs: BehaviorLog[];
}

export interface BehaviorExecutionContext {
  flowOutputs?: Record<string, unknown>;
  behaviorResults?: Record<string, unknown>;
  runWorkflow?: (workflowId: string, parameters?: Record<string, unknown>) => Promise<unknown>;
}

const PRIORITY_ORDER: Record<number, string> = {
  0: 'system-default',
  10: 'binding-transform',
  20: 'node-behavior',
  30: 'js-script',
  40: 'user-input',
};

export function getPriorityName(priority: number): string {
  return PRIORITY_ORDER[priority] || `custom-${priority}`;
}

export function evaluateCondition(value: unknown, condition: ConditionConfig): boolean {
  const { operator, value: cv, value2 } = condition;
  switch (operator) {
    case '==': return value == cv;
    case '!=': return value != cv;
    case '>': return Number(value) > Number(cv);
    case '<': return Number(value) < Number(cv);
    case '>=': return Number(value) >= Number(cv);
    case '<=': return Number(value) <= Number(cv);
    case 'contains': return String(value).includes(String(cv));
    case 'notContains': return !String(value).includes(String(cv));
    case 'startsWith': return String(value).startsWith(String(cv));
    case 'endsWith': return String(value).endsWith(String(cv));
    case 'isEmpty': return value === null || value === undefined || value === '';
    case 'isNotEmpty': return value !== null && value !== undefined && value !== '';
    case 'regex': try { return new RegExp(String(cv)).test(String(value)); } catch { return false; }
    case 'custom': try { return Boolean(new Function('value', `return ${condition.customExpression}`)(value)); } catch { return false; }
    default: return false;
  }
}

export function evaluateConditions(
  conditions: ConditionConfig[],
  formValues: Record<string, unknown>,
  context?: BehaviorExecutionContext,
): boolean {
  if (conditions.length === 0) return true;
  let result = true;
  let currentLogic: 'AND' | 'OR' = 'AND';
  for (const cond of conditions) {
    let value: unknown;
    const source = cond.dataSource || 'form';
    if (source === 'flow' && context?.flowOutputs && cond.flowOutputField) {
      value = context.flowOutputs[cond.flowOutputField];
    } else if (source === 'behavior' && context?.behaviorResults && cond.behaviorName) {
      value = context.behaviorResults[cond.behaviorName];
    } else {
      value = formValues[cond.fieldName];
    }
    const passed = evaluateCondition(value, cond);
    if (currentLogic === 'AND') result = result && passed;
    else result = result || passed;
    currentLogic = cond.logic;
  }
  return result;
}

export async function executeAction(action: ActionConfig, state: RuntimeState, setState: (updater: (prev: RuntimeState) => RuntimeState) => void, tables?: any[], onSubmit?: () => void, context?: BehaviorExecutionContext): Promise<void> {
  switch (action.type) {
    case 'setValue':
      if (action.targetField) setState((prev) => {
        const formValues = { ...prev.formValues, [action.targetField!]: action.value };
        return { ...prev, formValues };
      });
      break;
    case 'clearValue':
      if (action.targetField) setState((prev) => {
        const formValues = { ...prev.formValues, [action.targetField!]: '' };
        return { ...prev, formValues };
      });
      break;
    case 'setVisible':
      if (action.targetComponent) setState((prev) => {
        const cs = { ...prev.componentStates };
        cs[action.targetComponent!] = { ...cs[action.targetComponent!], visible: true };
        return { ...prev, componentStates: cs };
      });
      break;
    case 'setHidden':
      if (action.targetComponent) setState((prev) => {
        const cs = { ...prev.componentStates };
        cs[action.targetComponent!] = { ...cs[action.targetComponent!], visible: false };
        return { ...prev, componentStates: cs };
      });
      break;
    case 'setEnabled':
      if (action.targetComponent) setState((prev) => {
        const cs = { ...prev.componentStates };
        cs[action.targetComponent!] = { ...cs[action.targetComponent!], disabled: false };
        return { ...prev, componentStates: cs };
      });
      break;
    case 'setDisabled':
      if (action.targetComponent) setState((prev) => {
        const cs = { ...prev.componentStates };
        cs[action.targetComponent!] = { ...cs[action.targetComponent!], disabled: true };
        return { ...prev, componentStates: cs };
      });
      break;
    case 'setRequired':
      if (action.targetField) setState((prev) => {
        const cs = { ...prev.componentStates };
        const current = cs[action.targetField!] || { visible: true, disabled: false, readonly: false, loading: false };
        cs[action.targetField!] = { ...current, required: true } as any;
        return {
          ...prev,
          componentStates: cs,
          behaviorLogs: [...prev.behaviorLogs, {
            timestamp: Date.now(), level: 'info', source: 'behavior-engine',
            message: `setRequired("${action.targetField}", true)`,
          }],
        };
      });
      break;
    case 'setOptional':
      if (action.targetField) setState((prev) => {
        const cs = { ...prev.componentStates };
        const current = cs[action.targetField!] || { visible: true, disabled: false, readonly: false, loading: false };
        cs[action.targetField!] = { ...current, required: false } as any;
        return {
          ...prev,
          componentStates: cs,
          behaviorLogs: [...prev.behaviorLogs, {
            timestamp: Date.now(), level: 'info', source: 'behavior-engine',
            message: `setRequired("${action.targetField}", false)`,
          }],
        };
      });
      break;
    case 'switchTab':
      if (action.tabName) setState((prev) => ({
        ...prev,
        behaviorLogs: [...prev.behaviorLogs, {
          timestamp: Date.now(), level: 'info', source: 'behavior-engine',
          message: `switchTab("${action.tabName}")`,
        }],
      }));
      break;
    case 'submitData':
      if (onSubmit) {
        setState((prev) => ({
          ...prev,
          behaviorLogs: [...prev.behaviorLogs, {
            timestamp: Date.now(), level: 'info', source: 'behavior-engine',
            message: 'submitData 触发',
          }],
        }));
        onSubmit();
      }
      break;
    case 'callApi':
      if (action.apiUrl) {
        const method = action.apiMethod || 'GET';
        const timeoutMs = action.apiTimeoutMs ?? 10000;
        const retryCount = action.apiRetryCount ?? 0;
        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...action.apiHeaders };
        if (action.apiAuthType === 'bearer' && action.apiAuthValue) {
          headers['Authorization'] = `Bearer ${action.apiAuthValue}`;
        } else if (action.apiAuthType === 'apikey' && action.apiAuthValue) {
          headers['X-API-Key'] = action.apiAuthValue;
        }
        setState((prev) => ({
          ...prev,
          behaviorLogs: [...prev.behaviorLogs, {
            timestamp: Date.now(), level: 'info', source: 'behavior-engine',
            message: `callApi ${method} ${action.apiUrl}`,
          }],
        }));
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= retryCount; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const fetchOptions: RequestInit = { method, signal: controller.signal, headers };
            if (action.apiBody && method !== 'GET') {
              fetchOptions.body = JSON.stringify(action.apiBody);
            }
            const response = await fetch(action.apiUrl!, fetchOptions);
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (action.apiResponseMap && typeof data === 'object' && data !== null) {
              for (const [respKey, formField] of Object.entries(action.apiResponseMap)) {
                const parts = respKey.split('.');
                let val: any = data;
                for (const part of parts) val = val?.[part];
                if (val !== undefined) {
                  setState((prev) => ({
                    ...prev,
                    formValues: { ...prev.formValues, [formField]: val },
                  }));
                }
              }
            }
            setState((prev) => ({
              ...prev,
              behaviorLogs: [...prev.behaviorLogs, {
                timestamp: Date.now(), level: 'info', source: 'behavior-engine',
                message: `callApi 成功: ${method} ${action.apiUrl}`,
                data,
              }],
            }));
            lastError = null;
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < retryCount) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
        }
        if (lastError) {
          setState((prev) => ({
            ...prev,
            behaviorLogs: [...prev.behaviorLogs, {
              timestamp: Date.now(), level: 'error', source: 'behavior-engine',
              message: `callApi 失败: ${lastError!.message}`,
            }],
          }));
        }
      }
      break;
    case 'refreshData':
      setState((prev) => ({
        ...prev,
        behaviorLogs: [...prev.behaviorLogs, {
          timestamp: Date.now(), level: 'info', source: 'behavior-engine',
          message: 'refreshData 触发（重新加载当前行）',
        }],
      }));
      break;
    case 'navigate':
      if (action.value) {
        const url = String(action.value);
        setState((prev) => ({
          ...prev,
          behaviorLogs: [...prev.behaviorLogs, {
            timestamp: Date.now(), level: 'info', source: 'behavior-engine',
            message: `navigate → ${url}`,
          }],
        }));
        if (typeof window !== 'undefined') {
          window.location.href = url;
        }
      }
      break;
    case 'showMessage':
      setState((prev) => ({
        ...prev,
        behaviorLogs: [...prev.behaviorLogs, {
          timestamp: Date.now(),
          level: action.messageType as any || 'info',
          source: 'behavior-engine',
          message: action.message || '',
        }],
      }));
      break;
    case 'logMessage':
      setState((prev) => ({
        ...prev,
        behaviorLogs: [...prev.behaviorLogs, {
          timestamp: Date.now(),
          level: 'info',
          source: 'behavior-engine',
          message: action.message || '',
          data: action.value,
        }],
      }));
      break;
    case 'executeScript':
      if (action.scriptCode) {
        try {
          const ctx = createSandboxContext(state, setState, (tables || []) as SrcTableEntry[], onSubmit);
          const fn = new Function('ctx', action.scriptCode);
          fn(ctx);
        } catch (e) {
          setState((prev) => ({
            ...prev,
            behaviorLogs: [...prev.behaviorLogs, {
              timestamp: Date.now(),
              level: 'error',
              source: 'behavior-engine',
              message: `脚本执行错误: ${e instanceof Error ? e.message : String(e)}`,
            }],
          }));
        }
      }
      break;
    case 'runWorkflow':
      if (action.workflowId && context?.runWorkflow) {
        setState((prev) => ({
          ...prev,
          behaviorLogs: [...prev.behaviorLogs, {
            timestamp: Date.now(), level: 'info', source: 'behavior-engine',
            message: `runWorkflow: ${action.workflowId}`,
          }],
        }));
        try {
          const result = await context.runWorkflow(action.workflowId, action.workflowParameters);
          if (result && typeof result === 'object' && 'finalOutputs' in result) {
            const outputs = (result as { finalOutputs: Record<string, unknown> }).finalOutputs;
            for (const [key, value] of Object.entries(outputs)) {
              if (key.startsWith('__')) continue;
              setState((prev) => ({
                ...prev,
                formValues: { ...prev.formValues, [key]: value },
              }));
            }
          }
          setState((prev) => ({
            ...prev,
            behaviorLogs: [...prev.behaviorLogs, {
              timestamp: Date.now(), level: 'info', source: 'behavior-engine',
              message: `runWorkflow 完成: ${action.workflowId}`,
            }],
          }));
        } catch (e) {
          setState((prev) => ({
            ...prev,
            behaviorLogs: [...prev.behaviorLogs, {
              timestamp: Date.now(), level: 'error', source: 'behavior-engine',
              message: `runWorkflow 失败: ${e instanceof Error ? e.message : String(e)}`,
            }],
          }));
        }
      }
      break;
  }
}

export function executeSideEffect(sideEffect: SideEffectConfig, setState: (updater: (prev: RuntimeState) => RuntimeState) => void): void {
  switch (sideEffect.type) {
    case 'log':
      setState((prev) => ({
        ...prev,
        behaviorLogs: [...prev.behaviorLogs, {
          timestamp: Date.now(),
          level: 'info',
          source: 'side-effect',
          message: sideEffect.message || '',
          data: sideEffect.data,
        }],
      }));
      break;
  }
}

export async function executeBehaviorRule(
  rule: BehaviorRule,
  triggerType: TriggerType,
  state: RuntimeState,
  setState: (updater: (prev: RuntimeState) => RuntimeState) => void,
  tables?: SrcTableEntry[],
  onSubmit?: () => void,
  context?: BehaviorExecutionContext,
): Promise<BehaviorExecutionResult> {
  const result: BehaviorExecutionResult = { success: true, actionsExecuted: 0, sideEffectsExecuted: 0, errors: [], logs: [] };

  if (!rule.enabled) return result;
  if (rule.trigger.type !== triggerType) return result;

  const conditionsPassed = evaluateConditions(rule.conditions, state.formValues, context);
  if (!conditionsPassed) return result;

  try {
    for (const action of rule.actions) {
      await executeAction(action, state, setState, tables, onSubmit, context);
      result.actionsExecuted++;
    }
    for (const sideEffect of rule.sideEffects) {
      executeSideEffect(sideEffect, setState);
      result.sideEffectsExecuted++;
    }
    result.logs.push({
      timestamp: Date.now(),
      level: 'info',
      source: 'behavior-engine',
      message: `规则 "${rule.name}" 执行完成: ${result.actionsExecuted} 动作, ${result.sideEffectsExecuted} 副作用`,
    });
  } catch (e) {
    result.success = false;
    result.errors.push(e instanceof Error ? e.message : String(e));
    result.logs.push({
      timestamp: Date.now(),
      level: 'error',
      source: 'behavior-engine',
      message: `规则 "${rule.name}" 执行失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return result;
}

export async function executeAllRules(
  rules: BehaviorRule[],
  triggerType: TriggerType,
  state: RuntimeState,
  setState: (updater: (prev: RuntimeState) => RuntimeState) => void,
  tables?: SrcTableEntry[],
  onSubmit?: () => void,
  context?: BehaviorExecutionContext,
): Promise<BehaviorExecutionResult> {
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const totalResult: BehaviorExecutionResult = { success: true, actionsExecuted: 0, sideEffectsExecuted: 0, errors: [], logs: [] };

  for (const rule of sortedRules) {
    const result = await executeBehaviorRule(rule, triggerType, state, setState, tables, onSubmit, context);
    totalResult.actionsExecuted += result.actionsExecuted;
    totalResult.sideEffectsExecuted += result.sideEffectsExecuted;
    totalResult.errors.push(...result.errors);
    totalResult.logs.push(...result.logs);
    if (!result.success) totalResult.success = false;
  }

  return totalResult;
}
