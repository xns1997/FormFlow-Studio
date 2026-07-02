import type {
  FormEventExecutionStage,
  FormLinkageAction,
  FormLinkageCondition,
  FormLinkageRule,
} from '../project/types';

interface LinkageRuntimeContext {
  eventName: string;
  field: string;
  value: unknown;
  values: Record<string, unknown>;
  getValue: (field: string) => unknown;
  setValue: (field: string, value: unknown) => void | Promise<void>;
  setVisible: (componentId: string, visible: boolean) => void | Promise<void>;
  setDisabled: (componentId: string, disabled: boolean) => void | Promise<void>;
  setRequired: (field: string, required: boolean) => void | Promise<void>;
  showMessage: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void | Promise<void>;
  runWorkflow: (workflow?: string, parameters?: Record<string, unknown>, options?: { targetNodeId?: string }) => Promise<unknown>;
  runConfiguredWorkflow: (parameters?: Record<string, unknown>) => Promise<unknown>;
}

export interface LinkageExecutionResult {
  stages: FormEventExecutionStage[];
  matchedRules: number;
  executedActions: number;
}

function compareValues(left: unknown, operator: FormLinkageCondition['operator'], right: unknown): boolean {
  switch (operator) {
    case 'equals': return left === right;
    case 'notEquals': return left !== right;
    case 'isEmpty': return left == null || left === '' || (Array.isArray(left) && left.length === 0);
    case 'isNotEmpty': return !(left == null || left === '' || (Array.isArray(left) && left.length === 0));
    case 'contains': return String(left ?? '').includes(String(right ?? ''));
    case 'greaterThan': return Number(left) > Number(right);
    case 'lessThan': return Number(left) < Number(right);
    case 'greaterOrEqual': return Number(left) >= Number(right);
    case 'lessOrEqual': return Number(left) <= Number(right);
    default: return false;
  }
}

function resolveConditionValue(condition: FormLinkageCondition, ctx: LinkageRuntimeContext) {
  if (!condition.field || condition.field === '$event') return ctx.value;
  return ctx.getValue(condition.field);
}

function resolveActionValue(action: FormLinkageAction, ctx: LinkageRuntimeContext) {
  if (action.valueSource === 'event') return ctx.value;
  if (action.valueSource === 'field' && action.sourceField) return ctx.getValue(action.sourceField);
  return action.value;
}

function describeAction(action: FormLinkageAction) {
  switch (action.type) {
    case 'setValue': return `赋值 ${action.targetField || '字段'}`;
    case 'setVisible': return `${action.visible === false ? '隐藏' : '显示'} ${action.targetComponentId || '组件'}`;
    case 'setDisabled': return `${action.disabled ? '禁用' : '启用'} ${action.targetComponentId || '组件'}`;
    case 'setRequired': return `${action.required ? '设为必填' : '取消必填'} ${action.targetField || '字段'}`;
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
  const matches = rule.conditions.map((condition) => compareValues(resolveConditionValue(condition, ctx), condition.operator, condition.value));
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
    case 'showMessage':
      if (action.message) await ctx.showMessage(action.message, action.level || 'info');
      return;
    case 'runWorkflow':
      if (action.workflowId) await ctx.runWorkflow(action.workflowId, action.parameters || {});
      else await ctx.runConfiguredWorkflow(action.parameters || {});
      return;
  }
}

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
