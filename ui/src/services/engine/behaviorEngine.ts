// 行为引擎 - Trigger/Condition/Action/SideEffect 四元组

import type { RuntimeState, BehaviorLog, ValidationRule } from '../../models';
import type { FormLinkageOptionsConfig, SrcTableEntry } from '../../project/types';
import { createSandboxContext } from '../config/scriptSandbox';
import { evaluatePropertyExpression } from './propertyExpression';
import { validateField } from './validator';
import { comparableValue, sameValue } from './valueUtils';

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
  | 'contains' | 'notContains' | 'startsWith' | 'notStartsWith' | 'endsWith' | 'notEndsWith'
  | 'isEmpty' | 'isNotEmpty' | 'regex' | 'custom';

export type ActionType =
  | 'setValue' | 'clearValue' | 'setVisible' | 'setHidden'
  | 'setEnabled' | 'setDisabled' | 'setRequired' | 'setOptional'
  | 'assertRequired' | 'assertAny' | 'assertValidator' | 'assertRange' | 'assertLength' | 'assertDirty' | 'assertReadonly' | 'assertCompare'
  | 'showMessage' | 'logMessage' | 'switchTab' | 'executeScript'
  | 'submitData' | 'callApi' | 'refreshData' | 'navigate'
  | 'runWorkflow' | 'setOptions';

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
  sourceField?: string;
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
  fields?: string[];
  value?: unknown;
  valueSource?: 'static' | 'event' | 'field';
  sourceField?: string;
  expression?: string;
  message?: string;
  messageType?: 'info' | 'success' | 'warning' | 'error';
  validator?: string;
  pattern?: string;
  operator?: '==' | '!=' | '>' | '<' | '>=' | '<=';
  min?: number | null;
  max?: number | null;
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
  optionsConfig?: FormLinkageOptionsConfig;
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

/** 优先级数字 → 中文名。 */
export function getPriorityName(priority: number): string {
  return PRIORITY_ORDER[priority] || `custom-${priority}`;
}

/** 求值单条条件（字段值 vs 运算符/比较值）。 */
export function evaluateCondition(value: unknown, condition: ConditionConfig): boolean {
  const { operator, value: cv, value2 } = condition;
  switch (operator) {
    case '==': return value === cv;
    case '!=': return value !== cv;
    case '>': return cmp(value) > cmp(cv);
    case '<': return cmp(value) < cmp(cv);
    // 文档 8：`>=` 与 `<`、`<=` 与 `>` 互为严格反向。对 NaN/空值等不可比输入
    // 用“精确取反”定义，保证 when/else 恰有一个分支命中（文档 11.5）。
    case '>=': return !(cmp(value) < cmp(cv));
    case '<=': return !(cmp(value) > cmp(cv));
    case 'contains': return String(value).includes(String(cv));
    case 'notContains': return !String(value).includes(String(cv));
    case 'startsWith': return String(value).startsWith(String(cv));
    case 'notStartsWith': return !String(value).startsWith(String(cv));
    case 'endsWith': return String(value).endsWith(String(cv));
    case 'notEndsWith': return !String(value).endsWith(String(cv));
    case 'isEmpty': return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    case 'isNotEmpty': return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);
    case 'regex': try { return new RegExp(String(cv)).test(String(value)); } catch { return false; }
    case 'custom': try { return Boolean(new Function('value', `return ${condition.customExpression}`)(value)); } catch { return false; }
    default: return false;
  }
}

/** 求值规则全部条件（AND 语义）。 */
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

function isBlankValue(value: unknown) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function cmp(value: unknown): number | string {
  return comparableValue(value) as number | string;
}

/** 与条件求值一致的比较语义：`>=`/`<=` 为 `<`/`>` 的精确取反（文档 8/11.5） */
function compareOperator(left: unknown, operator: NonNullable<ActionConfig['operator']>, right: unknown): boolean {
  switch (operator) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return cmp(left) > cmp(right);
    case '<': return cmp(left) < cmp(right);
    case '>=': return !(cmp(left) < cmp(right));
    case '<=': return !(cmp(left) > cmp(right));
    default: return false;
  }
}

function recordGuardFailure(
  key: string,
  message: string,
  state: RuntimeState,
  setState: (updater: (prev: RuntimeState) => RuntimeState) => void,
): never {
  setState((prev) => ({
    ...prev,
    validationErrors: { ...prev.validationErrors, [key]: message },
    behaviorLogs: [...prev.behaviorLogs, {
      timestamp: Date.now(), level: 'error', source: 'behavior-engine', message,
    }],
  }));
  throw new Error(message);
}

/** 执行单个动作（set/clear/runWorkflow/showMessage 等），副作用经 setState 提交。 */
export async function executeAction(action: ActionConfig, state: RuntimeState, setState: (updater: (prev: RuntimeState) => RuntimeState) => void, tables?: any[], onSubmit?: () => void, context?: BehaviorExecutionContext): Promise<void> {
  switch (action.type) {
    case 'setValue':
      if (action.targetField) setState((prev) => {
        const evaluated = action.expression ? evaluatePropertyExpression(action.expression, {
          form: prev.formValues,
          row: prev.originalValues,
          flow: context?.flowOutputs,
          event: context,
        }) : { ok: true, value: action.value };
        const formValues = { ...prev.formValues, [action.targetField!]: evaluated.ok ? evaluated.value : action.value };
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
    case 'assertRequired': {
      const fields = (action.fields || []).filter(Boolean);
      const missing = fields.filter((field) => isBlankValue(state.formValues[field]));
      if (!missing.length) break;
      recordGuardFailure(missing[0]!, action.message || `请填写以下字段：${missing.join('、')}`, state, setState);
      break;
    }
    case 'assertAny': {
      const fields = (action.fields || []).filter(Boolean);
      if (fields.some((field) => !isBlankValue(state.formValues[field]))) break;
      recordGuardFailure(fields[0] || 'form', action.message || `请至少填写以下字段之一：${fields.join('、')}`, state, setState);
      break;
    }
    case 'assertValidator': {
      const field = String(action.targetField || '').trim();
      if (!field) break;
      const validator = String(action.validator || '').trim();
      const rules: ValidationRule[] = validator === 'pattern'
        ? [{ type: 'pattern', param: String(action.pattern || ''), message: action.message || `${field} 格式不正确` }]
        : [{ type: validator as ValidationRule['type'], message: action.message || `${field} 格式不正确` }];
      const error = validateField(state.formValues[field], rules, state.formValues);
      if (!error) break;
      recordGuardFailure(field, error, state, setState);
      break;
    }
    case 'assertRange': {
      const field = String(action.targetField || '').trim();
      if (!field || isBlankValue(state.formValues[field])) break;
      const rules: ValidationRule[] = [];
      if (action.min != null) rules.push({ type: 'min', param: String(action.min), message: action.message || `${field} 不能小于 ${action.min}` });
      if (action.max != null) rules.push({ type: 'max', param: String(action.max), message: action.message || `${field} 不能大于 ${action.max}` });
      const error = validateField(state.formValues[field], rules, state.formValues);
      if (!error) break;
      recordGuardFailure(field, error, state, setState);
      break;
    }
    case 'assertLength': {
      const field = String(action.targetField || '').trim();
      if (!field || isBlankValue(state.formValues[field])) break;
      const rules: ValidationRule[] = [];
      if (action.min != null) rules.push({ type: 'minLength', param: String(action.min), message: action.message || `${field} 最少 ${action.min} 个字符` });
      if (action.max != null) rules.push({ type: 'maxLength', param: String(action.max), message: action.message || `${field} 最多 ${action.max} 个字符` });
      const error = validateField(state.formValues[field], rules, state.formValues);
      if (!error) break;
      recordGuardFailure(field, error, state, setState);
      break;
    }
    case 'assertDirty': {
      const fields = (action.fields || []).filter(Boolean);
      const original = state.originalValues || {};
      if (fields.some((field) => !sameValue(state.formValues[field], original[field]))) break;
      recordGuardFailure(fields[0] || 'form', action.message || `请至少修改以下字段之一：${fields.join('、')}`, state, setState);
      break;
    }
    case 'assertReadonly': {
      const fields = (action.fields || []).filter(Boolean);
      const original = state.originalValues || {};
      const changed = fields.filter((field) => !sameValue(state.formValues[field], original[field]));
      if (!changed.length) break;
      recordGuardFailure(changed[0]!, action.message || `只读字段不允许修改：${changed.join('、')}`, state, setState);
      break;
    }
    case 'assertCompare': {
      const field = String(action.targetField || '').trim();
      const operator = action.operator;
      if (!field || !operator) break;
      const left = state.formValues[field];
      const right = action.valueSource === 'field' && action.sourceField ? state.formValues[action.sourceField] : action.value;
      if (isBlankValue(left) || isBlankValue(right)) break;
      if (compareOperator(left, operator, right)) break;
      const rightLabel = action.valueSource === 'field' && action.sourceField ? action.sourceField : String(right ?? '');
      recordGuardFailure(field, action.message || `${field} 需要满足 ${operator} ${rightLabel}`, state, setState);
      break;
    }
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

/** 执行非异步副作用（写回表格等）。 */
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

/** 执行单条规则：条件通过后依次执行动作。 */
export async function executeBehaviorRule(
  rule: BehaviorRule,
  triggerType: TriggerType,
  state: RuntimeState,
  setState: (updater: (prev: RuntimeState) => RuntimeState) => void,
  tables?: SrcTableEntry[],
  onSubmit?: () => void,
  context?: BehaviorExecutionContext,
  eventField?: string,
): Promise<BehaviorExecutionResult> {
  const result: BehaviorExecutionResult = { success: true, actionsExecuted: 0, sideEffectsExecuted: 0, errors: [], logs: [] };

  if (!rule.enabled) return result;
  if (rule.trigger.type !== triggerType) return result;
  // 字段变化事件必须命中触发字段（文档 11.4：字段变化触发该字段的 when/else/on change/compute）
  const isFieldTrigger = triggerType === 'fieldChange' || triggerType === 'valueChange';
  if (isFieldTrigger && rule.trigger.fieldName && rule.trigger.fieldName !== eventField) return result;

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

/** 按优先级稳定顺序执行全部规则。 */
export async function executeAllRules(
  rules: BehaviorRule[],
  triggerType: TriggerType,
  state: RuntimeState,
  setState: (updater: (prev: RuntimeState) => RuntimeState) => void,
  tables?: SrcTableEntry[],
  onSubmit?: () => void,
  context?: BehaviorExecutionContext,
  eventField?: string,
): Promise<BehaviorExecutionResult> {
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
  const totalResult: BehaviorExecutionResult = { success: true, actionsExecuted: 0, sideEffectsExecuted: 0, errors: [], logs: [] };

  for (const rule of sortedRules) {
    const result = await executeBehaviorRule(rule, triggerType, state, setState, tables, onSubmit, context, eventField);
    totalResult.actionsExecuted += result.actionsExecuted;
    totalResult.sideEffectsExecuted += result.sideEffectsExecuted;
    totalResult.errors.push(...result.errors);
    totalResult.logs.push(...result.logs);
    if (!result.success) totalResult.success = false;
  }

  return totalResult;
}
