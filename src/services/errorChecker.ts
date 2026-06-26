// 错误检查 - 未绑定字段/重复绑定/类型不匹配

import type { ColumnSchema, ComponentNode, BindingEdge } from '../models';

export interface BindingError {
  type: 'unbound' | 'duplicate' | 'typeMismatch' | 'invalidConnection';
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  componentId?: string;
}

export function checkUnboundFields(
  columns: ColumnSchema[],
  bindings: BindingEdge[],
): BindingError[] {
  const errors: BindingError[] = [];
  const boundFields = new Set(bindings.map((b) => b.to.field || b.to.columnId));

  for (const col of columns) {
    if (!boundFields.has(col.name) && col.required) {
      errors.push({
        type: 'unbound',
        severity: 'error',
        message: `必填字段 "${col.name}" 未绑定到任何组件`,
        field: col.name,
      });
    } else if (!boundFields.has(col.name)) {
      errors.push({
        type: 'unbound',
        severity: 'info',
        message: `字段 "${col.name}" 未绑定`,
        field: col.name,
      });
    }
  }

  return errors;
}

export function checkDuplicateBindings(
  bindings: BindingEdge[],
): BindingError[] {
  const errors: BindingError[] = [];
  const seen = new Map<string, string>();

  for (const binding of bindings) {
    const key = `${binding.to.field || binding.to.columnId}:${binding.to.port || 'value'}`;
    if (seen.has(key)) {
      errors.push({
        type: 'duplicate',
        severity: 'warning',
        message: `字段 "${binding.to.field}" 的 "${binding.to.port || 'value'}" 端口被重复绑定`,
        field: binding.to.field,
        componentId: binding.from.componentId,
      });
    }
    seen.set(key, binding.from.componentId);
  }

  return errors;
}

export function checkTypeMismatches(
  columns: ColumnSchema[],
  bindings: BindingEdge[],
  components: ComponentNode[],
): BindingError[] {
  const errors: BindingError[] = [];

  const portTypeMap: Record<string, string> = {
    'value': 'any',
    'checked': 'boolean',
    'selected': 'string',
    'visible': 'boolean',
    'disabled': 'boolean',
  };

  for (const binding of bindings) {
    const col = columns.find((c) => c.name === (binding.to.field || binding.to.columnId));
    if (!col) continue;

    const component = components.find((c) => c.id === binding.from.componentId);
    if (!component) continue;

    const portType = portTypeMap[binding.from.port || 'value'] || 'any';
    const colType = col.dataType;

    if (portType !== 'any' && colType !== 'unknown' && portType !== colType) {
      errors.push({
        type: 'typeMismatch',
        severity: 'warning',
        message: `${component.label} 的端口 "${binding.from.port}" (${portType}) 绑定到了 "${col.name}" (${colType})，类型不匹配`,
        field: col.name,
        componentId: component.id,
      });
    }
  }

  return errors;
}

export function checkInvalidConnections(
  bindings: BindingEdge[],
  components: ComponentNode[],
  columns: ColumnSchema[],
): BindingError[] {
  const errors: BindingError[] = [];

  for (const binding of bindings) {
    const component = components.find((c) => c.id === binding.from.componentId);
    if (!component) {
      errors.push({
        type: 'invalidConnection',
        severity: 'error',
        message: `连接引用了不存在的组件 "${binding.from.componentId}"`,
        componentId: binding.from.componentId,
      });
      continue;
    }

    const validPorts = component.ports.map((p) => p.name);
    if (binding.from.port && !validPorts.includes(binding.from.port)) {
      errors.push({
        type: 'invalidConnection',
        severity: 'error',
        message: `${component.label} 没有端口 "${binding.from.port}"`,
        componentId: component.id,
      });
    }

    if (binding.to.field) {
      const col = columns.find((c) => c.name === binding.to.field);
      if (!col) {
        errors.push({
          type: 'invalidConnection',
          severity: 'error',
          message: `连接引用了不存在的字段 "${binding.to.field}"`,
          field: binding.to.field,
        });
      }
    }
  }

  return errors;
}

export function checkBehaviorCycles(
  rules: Array<{ id: string; name: string; trigger: { type: string; fieldName?: string }; actions: Array<{ type: string; targetField?: string }> }>,
): BindingError[] {
  const errors: BindingError[] = [];
  const fieldTriggers = new Map<string, string[]>();

  for (const rule of rules) {
    if (rule.trigger.fieldName) {
      const triggers = fieldTriggers.get(rule.trigger.fieldName) || [];
      triggers.push(rule.id);
      fieldTriggers.set(rule.trigger.fieldName, triggers);
    }
  }

  for (const [field, triggerIds] of fieldTriggers) {
    const setterActions = rules.filter((r) => triggerIds.includes(r.id)).flatMap((r) => r.actions.filter((a) => a.type === 'setValue' && a.targetField === field));
    if (setterActions.length > 0) {
      errors.push({
        type: 'invalidConnection',
        severity: 'warning',
        message: `字段 "${field}" 的变化可能触发自身的修改，存在死循环风险`,
        field,
      });
    }
  }

  return errors;
}

export function runAllChecks(
  columns: ColumnSchema[],
  components: ComponentNode[],
  bindings: BindingEdge[],
  behaviorRules?: Array<{ id: string; name: string; trigger: { type: string; fieldName?: string }; actions: Array<{ type: string; targetField?: string }> }>,
): BindingError[] {
  const errors: BindingError[] = [];
  errors.push(...checkUnboundFields(columns, bindings));
  errors.push(...checkDuplicateBindings(bindings));
  errors.push(...checkTypeMismatches(columns, bindings, components));
  errors.push(...checkInvalidConnections(bindings, components, columns));
  if (behaviorRules) errors.push(...checkBehaviorCycles(behaviorRules));
  return errors;
}
