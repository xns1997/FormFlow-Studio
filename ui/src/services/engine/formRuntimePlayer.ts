/**
 * FormRuntimePlayer — pure event-processing logic extracted from PreviewCanvas.
 *
 * Handles side-effect formatting, trace analysis, idempotency key computation,
 * and validation orchestration. No React dependencies — all functions are pure
 * and testable without DOM.
 */

import type { DesignComponent, FormEventExecutionTrace, SrcTableEntry } from '../../project/types';
import { getDesignComponentField } from './designPreviewRuntime';
import { resolveRuntimeProperties } from './propertyExpression';
import { compileComponentValidation, validateField } from './validator';
import { isEditableComponentType } from '../config/controlTypes';
import { validateEditableTableValue } from '../../components/EditableTableGrid';
import { getPreviewInitialValue } from '../display/previewValues';

// ─── Side-effect formatting ───────────────────────────────────────────────────

export interface SideEffectStats {
  persistedRows?: number;
  formValues?: number;
  visible?: number;
  disabled?: number;
  required?: number;
  messages?: number;
}

/**
 * Format side-effect stats into human-readable detail lines.
 */
export function formatSideEffectDetails(stats: SideEffectStats): string[] {
  const details: string[] = [];
  if (stats.persistedRows) details.push(`保存 ${stats.persistedRows} 条数据`);
  if (stats.formValues) details.push(`更新 ${stats.formValues} 个字段值`);
  if (stats.visible) details.push(`切换 ${stats.visible} 个显示状态`);
  if (stats.disabled) details.push(`切换 ${stats.disabled} 个禁用状态`);
  if (stats.required) details.push(`切换 ${stats.required} 个必填状态`);
  if (stats.messages) details.push(`触发 ${stats.messages} 条提示`);
  return details;
}

// ─── Trace formatting ─────────────────────────────────────────────────────────

/**
 * Format an execution trace into human-readable detail lines.
 */
export function formatTraceDetails(trace: FormEventExecutionTrace): string[] {
  const details: string[] = [];
  const ruleStages = trace.stages.filter((stage) => stage.type === 'rule');
  const matchedRules = ruleStages.filter((stage) => stage.status === 'success').length;
  if (ruleStages.length > 0) details.push(`规则 ${matchedRules}/${ruleStages.length} 命中`);
  if (trace.stages.some((stage) => stage.type === 'script' && stage.status === 'success')) details.push('已执行高级脚本');
  if (trace.stages.some((stage) => stage.type === 'flow' && stage.status === 'success')) details.push('已执行绑定流程');
  if (trace.effects.messages.length > 0) details.push(`直接提示 ${trace.effects.messages.length} 条`);
  return details;
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

/**
 * Compute an idempotency key for a button operation.
 * Returns empty string if the event is not a submit/save/delete action.
 */
export function computeIdempotencyKey(
  component: DesignComponent,
  eventName: string,
  formId: string | undefined,
  nextValues: Record<string, unknown>,
): string {
  if (eventName !== 'onClick' || component.type !== 'button') return '';
  const action = String(component.props?.action || '');
  if (!['submit', 'save', 'delete'].includes(action)) return '';
  return `${formId || 'preview'}:${component.id}:${action}:${JSON.stringify(nextValues)}`;
}

// ─── Reset values ─────────────────────────────────────────────────────────────

/**
 * Compute reset values for all components.
 * Returns null if the event is not onReset.
 */
export function computeResetValues(
  components: DesignComponent[],
  eventName: string,
  tables: SrcTableEntry[],
): Record<string, unknown> | null {
  if (eventName !== 'onReset') return null;
  return Object.fromEntries(components.map((item) => [getDesignComponentField(item), getPreviewInitialValue(item, tables)]));
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a single field on blur.
 * Returns the error message or null if valid.
 */
export function validateFieldOnBlur(
  component: DesignComponent,
  field: string,
  value: unknown,
  values: Record<string, unknown>,
  originalValues: Record<string, unknown>,
  fieldRequired: Record<string, boolean>,
): string | null {
  const resolved = resolveRuntimeProperties(component.props, values[field], { form: values, original: originalValues, component: component.props });
  const required = fieldRequired[field] ?? resolved.required;
  const shouldValidate = (isEditableComponentType(component.type) || (component.type === 'table' && component.props.editable === true))
    && !resolved.disabled
    && !resolved.props.disabled
    && !resolved.props.readonly
    && !component.props.valueExpression;
  if (!shouldValidate) return null;
  return component.type === 'table'
    ? validateEditableTableValue(resolved.props, value)
    : validateField(value, compileComponentValidation({ ...resolved.props, required }), values);
}

/**
 * Validate all fields for submit.
 * Returns a map of field → error message. Empty string means valid.
 */
export function validateAllForSubmit(
  components: DesignComponent[],
  values: Record<string, unknown>,
  originalValues: Record<string, unknown>,
  fieldRequired: Record<string, boolean>,
): Record<string, string> {
  return Object.fromEntries(components.map((item) => {
    const itemField = getDesignComponentField(item);
    const resolved = resolveRuntimeProperties(item.props, values[itemField], { form: values, original: originalValues, component: item.props });
    const required = fieldRequired[itemField] ?? resolved.required;
    const shouldValidate = (isEditableComponentType(item.type) || (item.type === 'table' && item.props.editable === true))
      && !resolved.disabled
      && !resolved.props.disabled
      && !resolved.props.readonly
      && !item.props.valueExpression;
    return [itemField, shouldValidate
      ? item.type === 'table'
        ? validateEditableTableValue(resolved.props, values[itemField])
        : validateField(values[itemField], compileComponentValidation({ ...resolved.props, required }), values) || ''
      : ''];
  }));
}

// ─── Component type helpers ───────────────────────────────────────────────────

/**
 * Check if a component type supports dynamic options.
 */
export function supportsDynamicOptions(componentType: string): boolean {
  return componentType === 'select' || componentType === 'radio' || componentType === 'checkbox' || componentType === 'segmented';
}

/**
 * Check if a component type supports date convenience features.
 */
export function supportsDateConvenience(componentType: string): boolean {
  return componentType === 'datePicker' || componentType === 'timePicker' || componentType === 'dateRange';
}
