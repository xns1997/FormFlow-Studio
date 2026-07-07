import type { BindingEdge, RuntimeState } from '../../models';
import { setFormValue, getFormValue, setValidationError, clearValidationError } from './runtime';
import { validateField } from './validator';

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

export function applyTransform(value: unknown, transformFn?: string): unknown {
  if (!transformFn) return value;
  try {
    const fn = new Function('value', `return (${transformFn})(value)`);
    return fn(value);
  } catch {
    return value;
  }
}

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
