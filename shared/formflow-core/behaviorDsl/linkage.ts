import type {
  ConditionOperator, ActionConfig, BehaviorRule,
  FormLinkageOperator, FormLinkageCondition, FormLinkageAction, FormLinkageRule,
  DesignComponent, FormWindowConfig,
} from './types';
import { compileBehaviorDsl } from './parser';

const LINKAGE_OPERATOR: Partial<Record<ConditionOperator, FormLinkageOperator>> = {
  '==': 'equals', '!=': 'notEquals', '>': 'greaterThan', '<': 'lessThan', '>=': 'greaterOrEqual', '<=': 'lessOrEqual',
  contains: 'contains', notContains: 'notContains', startsWith: 'startsWith', notStartsWith: 'notStartsWith', endsWith: 'endsWith', notEndsWith: 'notEndsWith', isEmpty: 'isEmpty', isNotEmpty: 'isNotEmpty',
};

function toLinkageAction(action: ActionConfig, index: number): FormLinkageAction | null {
  const id = `action_${index}`;
  switch (action.type) {
    case 'setValue': return { id, type: 'setValue', targetField: action.targetField, value: action.value, expression: action.expression };
    case 'clearValue': return { id, type: 'setValue', targetField: action.targetField, value: '' };
    case 'setVisible': return { id, type: 'setVisible', targetComponentId: action.targetComponent, visible: true };
    case 'setHidden': return { id, type: 'setVisible', targetComponentId: action.targetComponent, visible: false };
    case 'setEnabled': return { id, type: 'setDisabled', targetComponentId: action.targetComponent, disabled: false };
    case 'setDisabled': return { id, type: 'setDisabled', targetComponentId: action.targetComponent, disabled: true };
    case 'setRequired': return { id, type: 'setRequired', targetField: action.targetField, required: true };
    case 'setOptional': return { id, type: 'setRequired', targetField: action.targetField, required: false };
    case 'assertRequired': return { id, type: 'assertRequired', fields: action.fields || (action.targetField ? [action.targetField] : []) };
    case 'assertAny': return { id, type: 'assertAny', fields: action.fields || (action.targetField ? [action.targetField] : []) };
    case 'assertValidator': return { id, type: 'assertValidator', targetField: action.targetField, validator: action.validator, pattern: action.pattern };
    case 'assertRange': return { id, type: 'assertRange', targetField: action.targetField, min: action.min ?? null, max: action.max ?? null };
    case 'assertLength': return { id, type: 'assertLength', targetField: action.targetField, min: action.min ?? null, max: action.max ?? null };
    case 'assertDirty': return { id, type: 'assertDirty', fields: action.fields || (action.targetField ? [action.targetField] : []) };
    case 'assertReadonly': return { id, type: 'assertReadonly', fields: action.fields || (action.targetField ? [action.targetField] : []) };
    case 'assertCompare': return { id, type: 'assertCompare', targetField: action.targetField, operator: action.operator, value: action.value, valueSource: action.valueSource, sourceField: action.sourceField };
    case 'showMessage': return { id, type: 'showMessage', message: action.message, level: action.messageType };
    case 'runWorkflow': return { id, type: 'runWorkflow', workflowId: action.workflowId, parameters: action.workflowParameters };
    case 'setOptions': return { id, type: 'setOptions', targetField: action.targetField, optionsConfig: action.optionsConfig };
    case 'submitData': return { id, type: 'runWorkflow' };
    default: return null;
  }
}

function triggerEventName(trigger: BehaviorRule['trigger']) { if (trigger.type === 'fieldChange' || trigger.type === 'valueChange') return 'onChange'; if (trigger.type === 'formLoad') return 'onLoad'; if (trigger.type === 'beforeSubmit') return 'onBeforeSubmit'; if (trigger.type === 'submit') return 'onSubmit'; if (trigger.type === 'buttonClick') return 'onClick'; return `on${trigger.type.charAt(0).toUpperCase()}${trigger.type.slice(1)}`; }

export function behaviorRuleToLinkageRule(rule: BehaviorRule): FormLinkageRule {
  const conditions = rule.conditions.map((condition, index): FormLinkageCondition | null => {
    const operator = LINKAGE_OPERATOR[condition.operator];
    return operator ? { id: `condition_${index}`, field: condition.fieldName, operator, value: condition.value, valueSource: condition.sourceField ? 'field' : 'static', sourceField: condition.sourceField } : null;
  }).filter(Boolean) as FormLinkageCondition[];
  const actions = rule.actions.map(toLinkageAction).filter(Boolean) as FormLinkageAction[];
  return { id: rule.id, name: rule.name, trigger: { eventName: triggerEventName(rule.trigger), sourceField: rule.trigger.fieldName }, conditions, conditionMode: rule.conditions.some((condition) => condition.logic === 'OR') ? 'any' : 'all', actions, scope: rule.trigger.fieldName ? 'target-fields' : 'current-form', enabled: rule.enabled, priority: rule.priority };
}

export function applyBehaviorDslToComponents(components: DesignComponent[], source: string, formWindow?: FormWindowConfig) {
  const fields = components.map((component) => String(component.fieldBinding || component.props?.name || '')).filter(Boolean);
  const compilation = compileBehaviorDsl(source, { fields, components });
  const unapplied: string[] = [];
  const patches = new Map<string, Record<string, FormLinkageRule[]>>();
  const implicitForm = formWindow ? { id: '__formflow_form_window__', type: 'formWindow', x: formWindow.x, y: formWindow.y, width: formWindow.width, height: formWindow.height, props: formWindow.props } as DesignComponent : undefined;
  for (const rule of compilation.rules) {
    const field = rule.trigger.fieldName;
    const buttonName = rule.trigger.buttonName;
    const target = field
      ? components.find((component) => String(component.fieldBinding || component.props?.name || '') === field)
      : buttonName
        ? components.find((component) => component.id === buttonName || String(component.props?.name || component.fieldBinding || '') === buttonName || String(component.props?.label || '') === buttonName)
        : implicitForm || components.find((component) => component.type === 'form');
    if (!target) { unapplied.push(field ? `找不到触发字段：${field}` : buttonName ? `找不到触发按钮：${buttonName}` : `找不到表单容器：${rule.name}`); continue; }
    let missingActionTarget = false;
    const normalizedActions = rule.actions.map((action) => {
      if (!action.targetComponent) return action;
      const actionTarget = components.find((component) => component.id === action.targetComponent || String(component.fieldBinding || '') === action.targetComponent || String(component.props?.name || '') === action.targetComponent || String(component.props?.label || '') === action.targetComponent);
      if (!actionTarget) { unapplied.push(`找不到动作控件：${action.targetComponent}（${rule.name}）`); missingActionTarget = true; return action; }
      return { ...action, targetComponent: actionTarget.id };
    });
    if (missingActionTarget) continue;
    const linkage = behaviorRuleToLinkageRule({ ...rule, actions: normalizedActions }); const eventName = linkage.trigger.eventName;
    const current = patches.get(target.id) || { ...((target.props?.linkageRules || {}) as Record<string, FormLinkageRule[]>) };
    const existing = (current[eventName] || []).filter((item) => item.id !== linkage.id); current[eventName] = [...existing, linkage]; patches.set(target.id, current);
  }
  const windowRules = patches.get('__formflow_form_window__');
  return {
    ...compilation,
    components: components.map((component) => patches.has(component.id) ? { ...component, props: { ...component.props, linkageRules: patches.get(component.id) } } : component),
    formWindow: formWindow && windowRules ? { ...formWindow, props: { ...formWindow.props, linkageRules: windowRules } } : formWindow,
    unapplied,
  };
}
