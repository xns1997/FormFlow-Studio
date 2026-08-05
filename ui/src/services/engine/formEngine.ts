/**
 * FormEngine — pure domain logic extracted from FormRenderer.
 *
 * Handles validation, expression resolution, wizard step computation,
 * and runtime property resolution. No React dependencies — all functions
 * are pure and testable without DOM.
 */

import type { ComponentNode } from '../../models';
import { isEditableComponentType } from '../config/controlTypes';
import { resolveExpressionValues, resolveRuntimeProperties } from './propertyExpression';
import { compileComponentValidation, validateField } from './validator';
import { validateEditableTableValue } from '../../components/EditableTableGrid';

// ─── Constants ────────────────────────────────────────────────────────────────

export const WIZARD_FIELD_THRESHOLD = 6;
export const WIZARD_STEP_SIZE = 4;
export const CARD_GROUP_SIZE = 4;

// ─── Field name resolution ────────────────────────────────────────────────────

/**
 * Resolve the logical field name for a component.
 * Prefers `fieldBinding`, falls back to `name`, then `props.name`, then `id`.
 */
export function resolveComponentFieldName(comp: ComponentNode): string {
  return String(comp.fieldBinding || comp.name || comp.props.name || comp.id);
}

/**
 * Normalize component props for runtime rendering.
 * Merges component props with top-level label and name.
 */
export function normalizeRenderProps(comp: ComponentNode): Record<string, unknown> {
  return {
    ...comp.props,
    label: comp.label || comp.props.label,
    name: comp.name || comp.props.name,
  };
}

// ─── Expression resolution ────────────────────────────────────────────────────

/**
 * Compute resolved expression values for all components.
 * This is the memoized computation that was previously inline in FormRenderer.
 */
export function computeExpressionValues(
  components: ComponentNode[],
  values: Record<string, unknown>,
  originalValues: Record<string, unknown>,
): Record<string, unknown> {
  return resolveExpressionValues(
    components.map((component) => ({
      field: resolveComponentFieldName(component),
      props: normalizeRenderProps(component),
    })),
    values,
    originalValues,
  ).values;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Determine whether a component should be validated.
 * Returns false for non-editable, hidden, disabled, or readonly components.
 */
export function shouldValidateComponent(
  component: ComponentNode,
  runtime: ReturnType<typeof resolveRuntimeProperties>,
  state?: { visible: boolean; disabled: boolean; readonly: boolean },
): boolean {
  if (!isEditableComponentType(component.type) && !(component.type === 'table' && component.props?.editable === true)) return false;
  if (state?.visible === false || runtime.visible === false) return false;
  if (state?.disabled || state?.readonly) return false;
  if (runtime.disabled) return false;
  if (runtime.props.disabled || runtime.props.readonly) return false;
  if (component.props?.valueExpression) return false;
  return true;
}

/**
 * Compute validation errors for all components.
 * Returns a map of field name → error message (empty string = valid).
 */
export function computeValidationErrors(
  components: ComponentNode[],
  componentStates: Record<string, { visible: boolean; disabled: boolean; readonly: boolean }>,
  expressionValues: Record<string, unknown>,
  originalValues: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(components.map((component) => {
    const field = resolveComponentFieldName(component);
    const props = normalizeRenderProps(component);
    const runtime = resolveRuntimeProperties(props, expressionValues[field], { form: expressionValues, original: originalValues, component: props });
    const required = componentStates[component.id]?.visible === false ? false : runtime.required;
    if (!shouldValidateComponent(component, runtime, componentStates[component.id])) return [field, ''];
    if (component.type === 'table') return [field, validateEditableTableValue(runtime.props, expressionValues[field])];
    return [field, validateField(expressionValues[field], compileComponentValidation({ ...runtime.props, required, componentType: component.type }), { ...expressionValues, componentType: component.type }) || ''];
  }));
}

/**
 * Get list of invalid fields from validation errors.
 */
export function getInvalidFields(validationErrors: Record<string, string>): string[] {
  return Object.entries(validationErrors).filter(([, error]) => !!error).map(([field]) => field);
}

// ─── Wizard logic ─────────────────────────────────────────────────────────────

/**
 * Determine if the form should use wizard mode.
 */
export function isWizardMode(
  components: ComponentNode[],
  componentStates: Record<string, { visible: boolean; disabled: boolean; readonly: boolean }>,
  mode: 'auto' | 'always' | 'never',
): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  const visibleComponents = components.filter((c) => (componentStates[c.id] || { visible: true }).visible);
  const editableCount = visibleComponents.filter((c) => isEditableComponentType(c.type)).length;
  return editableCount > WIZARD_FIELD_THRESHOLD;
}

/**
 * Group components into wizard steps.
 * Each step contains up to WIZARD_STEP_SIZE components, breaking on editable fields.
 */
export function computeWizardSteps(components: ComponentNode[]): ComponentNode[][] {
  const result: ComponentNode[][] = [];
  let current: ComponentNode[] = [];
  for (const comp of components) {
    current.push(comp);
    if (current.length >= WIZARD_STEP_SIZE && isEditableComponentType(comp.type)) {
      result.push(current);
      current = [];
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

// ─── Required field progress ──────────────────────────────────────────────────

/**
 * Compute required field fill progress.
 * Returns { filled, total, progress } where progress is a display string like "3/5".
 */
export function computeRequiredProgress(
  components: ComponentNode[],
  componentStates: Record<string, { visible: boolean; disabled: boolean; readonly: boolean }>,
  expressionValues: Record<string, unknown>,
  originalValues: Record<string, unknown>,
): { filled: number; total: number; progress: string | null } {
  const requiredFields = components.filter((c) => {
    const state = componentStates[c.id] || { visible: true };
    if (!state.visible) return false;
    const props = normalizeRenderProps(c);
    const field = resolveComponentFieldName(c);
    return resolveRuntimeProperties(props, expressionValues[field], { form: expressionValues, original: originalValues, component: props }).required;
  });
  const filledRequired = requiredFields.filter((c) => {
    const v = expressionValues[resolveComponentFieldName(c)];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  return {
    filled: filledRequired.length,
    total: requiredFields.length,
    progress: requiredFields.length > 0 ? `${filledRequired.length}/${requiredFields.length}` : null,
  };
}
