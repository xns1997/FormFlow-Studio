import type { BindingEdge, RuntimeState } from '../../models';
import { setFormValue, getFormValue, setValidationError, clearValidationError } from './runtime';
import { validateField } from './validator';

/** 将表数据绑定到表单（按字段映射）。 */
export function bindDataToForm(
  state: RuntimeState,
  bindings: BindingEdge[],
  rowData: Record<string, unknown>,
): RuntimeState {
  let next = state;
  for (const binding of bindings) {
    if (binding.direction === 'dataToUi' || binding.direction === 'twoWay') {
      const field = binding.to.field || binding.to.port;
      const value = rowData[field];
      const transformed = applyTransform(value, binding.transform.formatter);
      next = setFormValue(next, field, transformed);
    }
  }
  return next;
}

/** 收集表单相对原始值的变更。 */
export function collectFormChanges(
  state: RuntimeState,
  bindings: BindingEdge[],
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const binding of bindings) {
    if (binding.direction === 'uiToData' || binding.direction === 'twoWay') {
      const field = binding.to.field || binding.to.port;
      const uiValue = getFormValue(state, field);
      const original = state.originalValues[field];
      if (JSON.stringify(uiValue) !== JSON.stringify(original)) {
        changes[field] = applyTransform(uiValue, binding.transform.parser);
      }
    }
  }
  return changes;
}

/** 应用值转换函数（按名称）。 */
export function applyTransform(value: unknown, transformFn?: string): unknown {
  if (!transformFn) return value;
  try {
    const fn = new Function('value', `return (${transformFn})(value)`);
    return fn(value);
  } catch {
    return value;
  }
}

/** 校验绑定完整性（字段/表/列存在）。 */
export function validateBindings(
  state: RuntimeState,
  bindings: BindingEdge[],
): RuntimeState {
  let next = state;
  for (const binding of bindings) {
    if (binding.validation?.rules?.length) {
      const field = binding.to.field || binding.to.port;
      const value = getFormValue(next, field);
      const error = validateField(value, binding.validation.rules);
      if (error) next = setValidationError(next, field, error);
      else next = clearValidationError(next, field);
    }
  }
  return next;
}
