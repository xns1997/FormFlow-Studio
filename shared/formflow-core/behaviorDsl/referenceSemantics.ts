import type { BehaviorRule, ConditionConfig } from './types';
import { evaluatePropertyExpression } from '../propertyExpression';

/**
 * 参考语义（Phase 3）：按 docs/behavior-rule-syntax.md 11.x 执行逻辑实现的
 * 确定性参考解释器，作为差分测试 oracle 与模型检查的迁移函数。
 *
 * 语义口径与产品运行时（behaviorEngine / formLinkage）一致：
 * isEmpty/isNotEmpty 遵循文档（null/undefined/''/[] 均为空）。
 * - `cascade: true`（默认）模拟字段变化触发链（docs 11.6 compute 触发链）；
 *   `cascade: false` 只处理当前事件命中的规则，用于与 executeAllRules 差分。
 */

export type ReferenceEventType = 'fieldChange' | 'formLoad' | 'buttonClick' | 'beforeSubmit' | 'submit';

export interface ReferenceEvent {
  type: ReferenceEventType;
  field?: string;
  value?: unknown;
  buttonName?: string;
}

export interface ComponentState {
  visible: boolean;
  disabled: boolean;
  required: boolean;
}

export interface ReferenceState {
  formValues: Record<string, unknown>;
  originalValues: Record<string, unknown>;
  componentStates: Record<string, ComponentState>;
  messages: Array<{ level: string; message: string }>;
  workflowRuns: Array<{ workflowId?: string }>;
  optionsRefreshes: Array<{ targetField: string; table?: string }>;
  guardFailures: string[];
}

export interface ReferenceTraceStep {
  event: ReferenceEvent;
  executedRules: string[];
  actions: Array<{ ruleId: string; actionType: string; target?: string }>;
}

export interface ReferenceRunOptions {
  cascade?: boolean;
  maxSteps?: number;
  emptyArrayIsEmpty?: boolean;
  /** 跨事件累计的初始状态（差分 harness 用），formValues 始终以 initialValues 为准 */
  initialState?: ReferenceState;
}

export interface ReferenceRunResult {
  state: ReferenceState;
  trace: ReferenceTraceStep[];
  /** 是否在 maxSteps 内耗尽事件（false = 检测到疑似无限循环并截断） */
  terminated: boolean;
}

export function createReferenceState(formValues: Record<string, unknown> = {}): ReferenceState {
  return {
    formValues: { ...formValues },
    originalValues: {},
    componentStates: {},
    messages: [],
    workflowRuns: [],
    optionsRefreshes: [],
    guardFailures: [],
  };
}

import { comparableValue, sameValue } from '../valueComparison';

function cmp(value: unknown): number | string {
  return comparableValue(value) as number | string;
}

export function evaluateConditionValue(value: unknown, condition: ConditionConfig, emptyArrayIsEmpty = true): boolean {
  const { operator, value: cv } = condition;
  const isEmptyValue = (input: unknown) => input === null || input === undefined || input === '' || (emptyArrayIsEmpty && Array.isArray(input) && input.length === 0);
  switch (operator) {
    case '==': return value === cv;
    case '!=': return value !== cv;
    case '>': return cmp(value) > cmp(cv);
    case '<': return cmp(value) < cmp(cv);
    // 文档 8/11.5：`>=` 与 `<`、`<=` 与 `>` 互为严格反向；
    // 对 NaN/空值等不可比输入用“精确取反”定义，保证 when/else 恰有一个分支命中。
    case '>=': return !(cmp(value) < cmp(cv));
    case '<=': return !(cmp(value) > cmp(cv));
    case 'contains': return String(value).includes(String(cv));
    case 'notContains': return !String(value).includes(String(cv));
    case 'startsWith': return String(value).startsWith(String(cv));
    case 'notStartsWith': return !String(value).startsWith(String(cv));
    case 'endsWith': return String(value).endsWith(String(cv));
    case 'notEndsWith': return !String(value).endsWith(String(cv));
    case 'isEmpty': return isEmptyValue(value);
    case 'isNotEmpty': return !isEmptyValue(value);
    case 'regex': try { return new RegExp(String(cv)).test(String(value)); } catch { return false; }
    default: return false;
  }
}

export function evaluateConditionsValue(conditions: ConditionConfig[], formValues: Record<string, unknown>, emptyArrayIsEmpty = true): boolean {
  if (conditions.length === 0) return true;
  let result = true;
  let currentLogic: 'AND' | 'OR' = 'AND';
  for (const condition of conditions) {
    const passed = evaluateConditionValue(formValues[condition.fieldName], condition, emptyArrayIsEmpty);
    if (currentLogic === 'AND') result = result && passed;
    else result = result || passed;
    currentLogic = condition.logic;
  }
  return result;
}

function evaluateExpression(expression: string, state: ReferenceState) {
  return evaluatePropertyExpression(expression, { form: state.formValues });
}

export function applyGuardAction(action: { type: string; fields?: string[]; targetField?: string; min?: number | null; max?: number | null; validator?: string; pattern?: string; operator?: string; value?: unknown; valueSource?: string; sourceField?: string; message?: string }, state: ReferenceState): void {
  const fields = action.fields || (action.targetField ? [action.targetField] : []);
  const fieldValues = fields.map((field) => ({ field, value: state.formValues[field] }));
  const empty = (value: unknown) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  // 与 formLinkage 的守卫提示措辞逐字对齐，保证运行时差分可精确比较；
  // 守卫失败同时记入 guardFailures 与 messages（运行时可观察行为一致）。
  const fail = (message: string) => {
    state.guardFailures.push(message);
    state.messages.push({ level: 'error', message });
  };
  switch (action.type) {
    case 'assertRequired':
      {
        const missing = fieldValues.filter(({ value }) => empty(value)).map(({ field }) => field);
        if (missing.length) fail(action.message || `请填写以下字段：${missing.join('、')}`);
      }
      break;
    case 'assertAny':
      if (!fieldValues.some(({ value }) => !empty(value))) fail(action.message || `请至少填写以下字段之一：${fields.join('、')}`);
      break;
    case 'assertDirty':
      if (fieldValues.every(({ field }) => sameValue(state.formValues[field], (state.originalValues || {})[field]))) {
        fail(action.message || `请至少修改以下字段之一：${fields.join('、')}`);
      }
      break;
    case 'assertReadonly': {
      const original = state.originalValues || {};
      const changed = fieldValues.filter(({ field }) => !sameValue(state.formValues[field], original[field])).map(({ field }) => field);
      if (changed.length) fail(action.message || `只读字段不允许修改：${changed.join('、')}`);
      break;
    }
    case 'assertValidator': {
      // formLinkage 把 `action.message || "${field} 格式不正确"` 作为规则消息传入
      // validateField，validateField 优先返回 rule.message —— 参考语义逐字镜像。
      const field = String(action.targetField || '').trim();
      const value = state.formValues[field];
      if (!field || empty(value)) break;
      const validator = String(action.validator || '').trim();
      const message = action.message || `${field} 格式不正确`;
      let failed = false;
      if (validator === 'pattern' && action.pattern) {
        try { failed = !new RegExp(action.pattern).test(String(value)); } catch { failed = true; }
      } else if (validator === 'email') {
        failed = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
      } else if (validator === 'phone' || validator === 'mobile') {
        failed = !/^1\d{10}$/.test(String(value));
      }
      // 其他校验器名在 validator.ts 无匹配类型 → 校验通过
      if (failed) fail(message);
      break;
    }
    case 'assertRange': {
      const value = Number(state.formValues[action.targetField || '']);
      const min = action.min === null || action.min === undefined ? -Infinity : Number(action.min);
      const max = action.max === null || action.max === undefined ? Infinity : Number(action.max);
      if (!Number.isNaN(value)) {
        if (min !== -Infinity && value < min) fail(action.message || `不能小于 ${min}`);
        if (max !== Infinity && value > max) fail(action.message || `不能大于 ${max}`);
      }
      break;
    }
    case 'assertLength': {
      const value = String(state.formValues[action.targetField || ''] ?? '');
      const min = action.min === null || action.min === undefined ? 0 : Number(action.min);
      const max = action.max === null || action.max === undefined ? Infinity : Number(action.max);
      if (min !== 0 && value.length < min) fail(action.message || `最少 ${min} 个字符`);
      if (max !== Infinity && value.length > max) fail(action.message || `最多 ${max} 个字符`);
      break;
    }
    case 'assertCompare': {
      const left = state.formValues[action.targetField || ''];
      const right = action.valueSource === 'field' && action.sourceField ? state.formValues[action.sourceField] : action.value;
      const operator = action.operator || '==';
      let passed = true;
      if (operator === '==' || operator === '===') passed = left === right;
      else if (operator === '!=' || operator === '!==') passed = left !== right;
      else if (operator === '>') passed = cmp(left) > cmp(right);
      else if (operator === '>=') passed = !(cmp(left) < cmp(right));
      else if (operator === '<') passed = cmp(left) < cmp(right);
      else if (operator === '<=') passed = !(cmp(left) > cmp(right));
      if (!passed) {
        const rightLabel = action.valueSource === 'field' && action.sourceField ? action.sourceField : String(right ?? '');
        fail(action.message || `${action.targetField} 需要满足 ${operator} ${rightLabel}`);
      }
      break;
    }
  }
}

export function applyAction(action: { type: string; targetField?: string; targetComponent?: string; expression?: string; value?: unknown; message?: string; messageType?: string; workflowId?: string; optionsConfig?: { mode?: string; table?: string } }, state: ReferenceState): boolean {
  switch (action.type) {
    case 'setValue': {
      if (!action.targetField) return false;
      const result = action.expression ? evaluateExpression(action.expression, state) : { ok: true, value: action.value };
      state.formValues = { ...state.formValues, [action.targetField]: result.ok ? result.value : action.value };
      return true;
    }
    case 'clearValue':
      if (!action.targetField) return false;
      state.formValues = { ...state.formValues, [action.targetField]: '' };
      return true;
    case 'setVisible': return !!action.targetComponent && (state.componentStates[action.targetComponent] = { ...state.componentStates[action.targetComponent], visible: true }, true);
    case 'setHidden': return !!action.targetComponent && (state.componentStates[action.targetComponent] = { ...state.componentStates[action.targetComponent], visible: false }, true);
    case 'setEnabled': return !!action.targetComponent && (state.componentStates[action.targetComponent] = { ...state.componentStates[action.targetComponent], disabled: false }, true);
    case 'setDisabled': return !!action.targetComponent && (state.componentStates[action.targetComponent] = { ...state.componentStates[action.targetComponent], disabled: true }, true);
    case 'setRequired': return !!action.targetField && (state.componentStates[action.targetField] = { ...state.componentStates[action.targetField], required: true }, true);
    case 'setOptional': return !!action.targetField && (state.componentStates[action.targetField] = { ...state.componentStates[action.targetField], required: false }, true);
    case 'showMessage':
      state.messages.push({ level: action.messageType || 'info', message: String(action.message ?? '') });
      return true;
    case 'runWorkflow':
      state.workflowRuns.push({ workflowId: action.workflowId });
      return true;
    case 'submitData':
      state.workflowRuns.push({ workflowId: undefined });
      return true;
    case 'setOptions':
      if (action.targetField) state.optionsRefreshes.push({ targetField: action.targetField, table: action.optionsConfig?.table });
      return true;
    default:
      return false;
  }
}

export function matchesEvent(rule: BehaviorRule, event: ReferenceEvent): boolean {
  if (!rule.enabled) return false;
  switch (event.type) {
    case 'fieldChange':
      return (rule.trigger.type === 'fieldChange' || rule.trigger.type === 'valueChange') && rule.trigger.fieldName === event.field;
    case 'formLoad': return rule.trigger.type === 'formLoad';
    case 'buttonClick': return rule.trigger.type === 'buttonClick' && (rule.trigger.buttonName === event.buttonName || event.buttonName === undefined);
    case 'beforeSubmit': return rule.trigger.type === 'beforeSubmit';
    case 'submit': return rule.trigger.type === 'submit';
    default: return false;
  }
}

/**
 * 参考解释器：按事件队列处理规则（与运行时一致的 priority 稳定排序）。
 */
export function runReferenceSemantics(rules: BehaviorRule[], initialValues: Record<string, unknown>, events: ReferenceEvent[], options: ReferenceRunOptions = {}): ReferenceRunResult {
  const { cascade = true, maxSteps = 200, emptyArrayIsEmpty = true } = options;
  const state: ReferenceState = options.initialState
    ? { ...options.initialState, formValues: { ...initialValues } }
    : createReferenceState(initialValues);
  const trace: ReferenceTraceStep[] = [];
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const queue: Array<{ event: ReferenceEvent; step: number }> = events.map((event) => ({ event, step: 0 }));
  let steps = 0;
  let terminated = true;
  while (queue.length > 0) {
    if (steps >= maxSteps) { terminated = false; break; }
    steps += 1;
    const current = queue.shift()!;
    if (current.event.type === 'fieldChange' && current.event.field !== undefined) {
      state.formValues = { ...state.formValues, [current.event.field]: current.event.value };
    }
    const traceStep: ReferenceTraceStep = { event: current.event, executedRules: [], actions: [] };
    const isGuard = current.event.type === 'buttonClick' || current.event.type === 'beforeSubmit';
    for (const rule of sortedRules) {
      if (!matchesEvent(rule, current.event)) continue;
      if (!evaluateConditionsValue(rule.conditions, state.formValues, emptyArrayIsEmpty)) continue;
      traceStep.executedRules.push(rule.id);
      const ruleActions: Array<{ ruleId: string; actionType: string; target?: string }> = [];
      for (const action of rule.actions) {
        applyAction(action, state);
        ruleActions.push({ ruleId: rule.id, actionType: action.type, target: action.targetField || action.targetComponent });
        if (isGuard) {
          const before = state.guardFailures.length;
          applyGuardAction(action, state);
          // 与 formLinkage 一致：守卫失败后当前规则剩余动作跳过，后续规则继续
          if (state.guardFailures.length > before) break;
        }
      }
      traceStep.actions.push(...ruleActions);
    }
    trace.push(traceStep);
    // 触发链：字段写入后排队新的 fieldChange 事件（docs 11.6）
    if (cascade) {
      const written = traceStep.actions.filter((item) => item.actionType === 'setValue' || item.actionType === 'clearValue');
      const seen = new Set<string>();
      for (const write of written) {
        if (!write.target || seen.has(write.target)) continue;
        seen.add(write.target);
        queue.push({ event: { type: 'fieldChange', field: write.target, value: state.formValues[write.target] }, step: steps });
      }
    }
  }
  return { state, trace, terminated };
}

export function traceSummary(result: ReferenceRunResult) {
  return {
    formValues: result.state.formValues,
    componentStates: result.state.componentStates,
    messages: result.state.messages,
    workflowRuns: result.state.workflowRuns,
    guardFailures: result.state.guardFailures,
    terminated: result.terminated,
  };
}
