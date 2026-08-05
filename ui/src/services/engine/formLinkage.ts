import type {
  FormEventExecutionStage,
  FormLinkageAction,
  FormLinkageCondition,
  FormLinkageOptionsConfig,
  FormLinkageRule,
} from '../../project/types';
import { evaluatePropertyExpression } from './propertyExpression';
import { validateField } from './validator';

export interface LinkageRuntimeContext {
  eventName: string;
  field: string;
  value: unknown;
  values: Record<string, unknown>;
  originalValues?: Record<string, unknown>;
  getValue: (field: string) => unknown;
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setVisible: (componentId: string, visible: boolean) => void | Promise<void>;
  setDisabled: (componentId: string, disabled: boolean) => void | Promise<void>;
  setRequired: (field: string, required: boolean) => void | Promise<void>;
  setOptions: (field: string, config: NonNullable<FormLinkageAction['optionsConfig']>) => void | Promise<void>;
  showMessage: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void | Promise<void>;
  runWorkflow: (workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }) => Promise<unknown>;
  runConfiguredWorkflow: (parameters?: Record<string, unknown>) => Promise<unknown>;
  queueFlowOutput?: (field: string, value: unknown) => void;
}

function isBlankValue(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

import { comparableValue, sameValue } from './valueUtils';

export interface LinkageExecutionResult {
  stages: FormEventExecutionStage[];
  matchedRules: number;
  executedActions: number;
}

/** 联动条件值比较。 */
export function compareValues(left: unknown, operator: FormLinkageCondition['operator'], right: unknown): boolean {
  const comparableLeft = comparableValue(left) as any;
  const comparableRight = comparableValue(right) as any;
  switch (operator) {
    case 'equals': return left === right;
    case 'notEquals': return left !== right;
    case 'isEmpty': return left == null || left === '' || (Array.isArray(left) && left.length === 0);
    case 'isNotEmpty': return !(left == null || left === '' || (Array.isArray(left) && left.length === 0));
    case 'contains': return String(left ?? '').includes(String(right ?? ''));
    case 'notContains': return !String(left ?? '').includes(String(right ?? ''));
    case 'startsWith': return String(left ?? '').startsWith(String(right ?? ''));
    case 'notStartsWith': return !String(left ?? '').startsWith(String(right ?? ''));
    case 'endsWith': return String(left ?? '').endsWith(String(right ?? ''));
    case 'notEndsWith': return !String(left ?? '').endsWith(String(right ?? ''));
    case 'greaterThan': return comparableLeft > comparableRight;
    case 'lessThan': return comparableLeft < comparableRight;
    // 文档 8/11.5：`>=` 与 `<`、`<=` 与 `>` 互为严格反向；
    // 对 NaN/空值等不可比输入用“精确取反”保证 when/else 恰有一个分支命中。
    case 'greaterOrEqual': return !(comparableLeft < comparableRight);
    case 'lessOrEqual': return !(comparableLeft > comparableRight);
    default: return false;
  }
}

function compareByOperator(left: unknown, operator: NonNullable<FormLinkageAction['operator']>, right: unknown) {
  const comparableLeft = comparableValue(left) as any;
  const comparableRight = comparableValue(right) as any;
  switch (operator) {
    case '==': return comparableLeft === comparableRight;
    case '!=': return comparableLeft !== comparableRight;
    case '>': return comparableLeft > comparableRight;
    case '<': return comparableLeft < comparableRight;
    // 与条件求值一致：`>=`/`<=` 为 `<`/`>` 的精确取反（文档 8/11.5）
    case '>=': return !(comparableLeft < comparableRight);
    case '<=': return !(comparableLeft > comparableRight);
    default: return false;
  }
}

function resolveConditionValue(condition: FormLinkageCondition, ctx: LinkageRuntimeContext) {
  if (!condition.field || condition.field === '$event') return ctx.value;
  return ctx.getValue(condition.field);
}

function resolveConditionCompareValue(condition: FormLinkageCondition, ctx: LinkageRuntimeContext) {
  if (condition.valueSource === 'field' && condition.sourceField) return ctx.getValue(condition.sourceField);
  return condition.value;
}

function resolveActionValue(action: FormLinkageAction, ctx: LinkageRuntimeContext) {
  if (action.expression) {
    const result = evaluatePropertyExpression(action.expression, { form: ctx.values, event: { value: ctx.value, field: ctx.field } });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
  if (action.valueSource === 'event') return ctx.value;
  if (action.valueSource === 'field' && action.sourceField) return ctx.getValue(action.sourceField);
  return action.value;
}

function resolveOptionFilterValue(value: unknown, ctx: LinkageRuntimeContext) {
  if (value === '$value') return ctx.value;
  if (typeof value === 'string' && value.startsWith('$form.')) return ctx.getValue(value.slice(6));
  if (typeof value === 'string' && value.startsWith('$')) return ctx.getValue(value.slice(1));
  return value;
}

function resolveOptionValueRef(
  ref: { source: 'event' | 'field' | 'static'; field?: string; value?: unknown } | undefined,
  fallback: unknown,
  ctx: LinkageRuntimeContext,
) {
  if (!ref) return resolveOptionFilterValue(fallback, ctx);
  if (ref.source === 'event') return ctx.value;
  if (ref.source === 'field') return ctx.getValue(String(ref.field || ''));
  return ref.value;
}

function resolveOptionsConfig(config: FormLinkageOptionsConfig, ctx: LinkageRuntimeContext): FormLinkageOptionsConfig {
  if (config.mode === 'table') {
    return {
      ...config,
      filterValue: resolveOptionValueRef(config.filterValueRef, config.filterValue, ctx),
    };
  }
  if (config.mode === 'range') {
    return {
      ...config,
      filterValue: resolveOptionValueRef(config.filterValueRef, config.filterValue, ctx),
    };
  }
  return {
    ...config,
    valueRef: {
      ...(config.valueRef || { source: 'event' as const }),
      value: resolveOptionValueRef(config.valueRef, config.valueRef?.value, ctx),
    },
  };
}

function describeAction(action: FormLinkageAction) {
  switch (action.type) {
    case 'setValue': return `赋值 ${action.targetField || '字段'}`;
    case 'setVisible': return `${action.visible === false ? '隐藏' : '显示'} ${action.targetComponentId || '组件'}`;
    case 'setDisabled': return `${action.disabled ? '禁用' : '启用'} ${action.targetComponentId || '组件'}`;
    case 'setRequired': return `${action.required ? '设为必填' : '取消必填'} ${action.targetField || '字段'}`;
    case 'assertRequired': return `校验必填 ${action.fields?.join('、') || action.targetField || '字段'}`;
    case 'assertAny': return `校验至少填写一项 ${action.fields?.join('、') || '字段组'}`;
    case 'assertValidator': return `校验格式 ${action.targetField || '字段'}`;
    case 'assertRange': return `校验范围 ${action.targetField || '字段'}`;
    case 'assertLength': return `校验长度 ${action.targetField || '字段'}`;
    case 'assertDirty': return `校验存在修改 ${action.fields?.join('、') || '字段组'}`;
    case 'assertReadonly': return `校验只读字段未改动 ${action.fields?.join('、') || '字段组'}`;
    case 'assertCompare': return `校验比较关系 ${action.targetField || '字段'}`;
    case 'setOptions': return `刷新 ${action.targetField || '字段'} 的选项`;
    case 'showMessage': return `提示：${action.message || ''}`;
    case 'runWorkflow': return `执行流程 ${action.workflowId || '当前流程'}`;
    default: return action.type;
  }
}

function ruleMatches(rule: FormLinkageRule, ctx: LinkageRuntimeContext) {
  if (!rule.enabled) return false;
  if (rule.trigger.eventName && rule.trigger.eventName !== ctx.eventName) return false;
  if (rule.trigger.sourceField && rule.trigger.sourceField !== ctx.field) return false;
  if (!rule.conditions.length) return true;
  const matches = rule.conditions.map((condition) => compareValues(resolveConditionValue(condition, ctx), condition.operator, resolveConditionCompareValue(condition, ctx)));
  return (rule.conditionMode || 'all') === 'any' ? matches.some(Boolean) : matches.every(Boolean);
}

async function executeAction(action: FormLinkageAction, ctx: LinkageRuntimeContext) {
  switch (action.type) {
    case 'setValue':
      if (action.targetField) await ctx.setValue(action.targetField, resolveActionValue(action, ctx));
      return;
    case 'setVisible':
      if (action.targetComponentId) await ctx.setVisible(action.targetComponentId, action.visible !== false);
      return;
    case 'setDisabled':
      if (action.targetComponentId) await ctx.setDisabled(action.targetComponentId, !!action.disabled);
      return;
    case 'setRequired':
      if (action.targetField) await ctx.setRequired(action.targetField, !!action.required);
      return;
    case 'assertRequired': {
      const fields = (action.fields || []).filter(Boolean);
      const missing = fields.filter((field) => isBlankValue(ctx.getValue(field)));
      if (!missing.length) return;
      const message = action.message || `请填写以下字段：${missing.join('、')}`;
      await ctx.showMessage(message, action.level || 'error');
      throw new Error(message);
    }
    case 'assertAny': {
      const fields = (action.fields || []).filter(Boolean);
      if (fields.some((field) => !isBlankValue(ctx.getValue(field)))) return;
      const message = action.message || `请至少填写以下字段之一：${fields.join('、')}`;
      await ctx.showMessage(message, action.level || 'error');
      throw new Error(message);
    }
    case 'assertValidator': {
      const field = String(action.targetField || '').trim();
      if (!field) return;
      const value = ctx.getValue(field);
      const validator = String(action.validator || '').trim();
      const rules = validator === 'pattern'
        ? [{ type: 'pattern', param: String(action.pattern || ''), message: action.message || `${field} 格式不正确` }]
        : [{ type: validator as any, message: action.message || `${field} 格式不正确` }];
      const error = validateField(value, rules as any, ctx.values);
      if (!error) return;
      await ctx.showMessage(error, action.level || 'error');
      throw new Error(error);
    }
    case 'assertRange': {
      const field = String(action.targetField || '').trim();
      if (!field) return;
      const value = ctx.getValue(field);
      if (isBlankValue(value)) return;
      const rules: Array<{ type: string; param: string; message: string }> = [];
      if (action.min != null) rules.push({ type: 'min', param: String(action.min), message: action.message || `${field} 不能小于 ${action.min}` });
      if (action.max != null) rules.push({ type: 'max', param: String(action.max), message: action.message || `${field} 不能大于 ${action.max}` });
      for (const rule of rules as any[]) {
        const error = validateField(value, [rule], ctx.values);
        if (!error) continue;
        await ctx.showMessage(error, action.level || 'error');
        throw new Error(error);
      }
      return;
    }
    case 'assertLength': {
      const field = String(action.targetField || '').trim();
      if (!field) return;
      const value = ctx.getValue(field);
      if (isBlankValue(value)) return;
      const rules: Array<{ type: string; param: string; message: string }> = [];
      if (action.min != null) rules.push({ type: 'minLength', param: String(action.min), message: action.message || `${field} 最少 ${action.min} 个字符` });
      if (action.max != null) rules.push({ type: 'maxLength', param: String(action.max), message: action.message || `${field} 最多 ${action.max} 个字符` });
      for (const rule of rules as any[]) {
        const error = validateField(value, [rule], ctx.values);
        if (!error) continue;
        await ctx.showMessage(error, action.level || 'error');
        throw new Error(error);
      }
      return;
    }
    case 'assertDirty': {
      const fields = (action.fields || []).filter(Boolean);
      const originalValues = ctx.originalValues || {};
      if (fields.some((field) => !sameValue(ctx.getValue(field), originalValues[field]))) return;
      const message = action.message || `请至少修改以下字段之一：${fields.join('、')}`;
      await ctx.showMessage(message, action.level || 'error');
      throw new Error(message);
    }
    case 'assertReadonly': {
      const fields = (action.fields || []).filter(Boolean);
      const originalValues = ctx.originalValues || {};
      const changed = fields.filter((field) => !sameValue(ctx.getValue(field), originalValues[field]));
      if (!changed.length) return;
      const message = action.message || `只读字段不允许修改：${changed.join('、')}`;
      await ctx.showMessage(message, action.level || 'error');
      throw new Error(message);
    }
    case 'assertCompare': {
      const field = String(action.targetField || '').trim();
      const operator = action.operator;
      if (!field || !operator) return;
      const left = ctx.getValue(field);
      const right = action.valueSource === 'field' && action.sourceField ? ctx.getValue(action.sourceField) : action.value;
      if (isBlankValue(left) || isBlankValue(right)) return;
      if (compareByOperator(left, operator, right)) return;
      const rightLabel = action.valueSource === 'field' && action.sourceField ? action.sourceField : String(right ?? '');
      const message = action.message || `${field} 需要满足 ${operator} ${rightLabel}`;
      await ctx.showMessage(message, action.level || 'error');
      throw new Error(message);
    }
    case 'setOptions':
      if (action.targetField && action.optionsConfig) await ctx.setOptions(action.targetField, resolveOptionsConfig(action.optionsConfig, ctx));
      return;
    case 'showMessage':
      if (action.message) await ctx.showMessage(action.message, action.level || 'info');
      return;
    case 'runWorkflow': {
      let result: unknown;
      if (action.workflowId) result = await ctx.runWorkflow(action.workflowId, action.parameters || {});
      else result = await ctx.runConfiguredWorkflow(action.parameters || {});
      // Defer explicit targets to the event tail, where they participate in the
      // same duplicate-target validation and atomic commit as V2 bindings.
      if (result && typeof result === 'object' && 'finalOutputs' in result) {
        const outputs = (result as { finalOutputs: Record<string, unknown> }).finalOutputs;
        if (action.targetField && Object.prototype.hasOwnProperty.call(outputs, 'result')) {
          ctx.queueFlowOutput?.(action.targetField, outputs.result);
        }
      }
      return;
    }
  }
}

/** 执行联动规则（按条件批量应用动作）。 */
export async function executeLinkageRules(
  rules: FormLinkageRule[],
  ctx: LinkageRuntimeContext,
): Promise<LinkageExecutionResult> {
  const sorted = [...rules].sort((left, right) => (left.priority || 0) - (right.priority || 0));
  const stages: FormEventExecutionStage[] = [];
  let matchedRules = 0;
  let executedActions = 0;

  for (const rule of sorted) {
    const stage: FormEventExecutionStage = {
      id: rule.id,
      type: 'rule',
      label: rule.name || rule.id,
      status: 'skipped',
      details: [],
    };
    if (!rule.enabled) {
      stage.details = ['已禁用'];
      stages.push(stage);
      continue;
    }
    if (!ruleMatches(rule, ctx)) {
      stage.details = ['条件未命中'];
      stages.push(stage);
      continue;
    }
    matchedRules += 1;
    try {
      for (const action of rule.actions) {
        await executeAction(action, ctx);
        executedActions += 1;
        stage.details?.push(describeAction(action));
      }
      stage.status = 'success';
      if (stage.details?.length === 0) stage.details = ['已命中，无动作'];
    } catch (cause) {
      stage.status = 'error';
      stage.details = [cause instanceof Error ? cause.message : String(cause)];
    }
    stages.push(stage);
  }

  return { stages, matchedRules, executedActions };
}
