import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { getDefaultComponentValue } from '../config/controlTypes';
import { resolveDataBindingValue } from '../data/dataBinding';
import { resolveDateDefaultValue } from '../data/dateConvenience';

/** 预览初始值（默认值/表达式/当前值）。 */
export function getPreviewInitialValue(component: DesignComponent, tables: SrcTableEntry[] = [], currentValues: Record<string, unknown> = {}): unknown {
  const resolved = resolveDataBindingValue(component, tables);
  if (resolved.found || resolved.value !== undefined) return resolved.value;
  if (component.type === 'datePicker') {
    const mode = component.props.showTime ? 'datetime' : 'date';
    const convenience = resolveDateDefaultValue(component.props.defaultValueConfig, currentValues, mode, component.props.storageFormat);
    if (convenience) return convenience;
  }
  if (component.type === 'timePicker') {
    const convenience = resolveDateDefaultValue(component.props.defaultValueConfig, currentValues, 'time', component.props.storageFormat);
    if (convenience) return convenience;
  }
  if (component.type === 'dateRange') {
    const convenience = resolveDateDefaultValue(component.props.defaultValueConfig, currentValues, 'date', component.props.storageFormat);
    if (convenience && typeof convenience === 'object') return convenience;
  }
  return getDefaultComponentValue(component);
}

/** 预览初始化签名（缓存键）。 */
export function getPreviewInitializationSignature(component: DesignComponent): string {
  return JSON.stringify({
    content: component.type === 'text' ? component.props.content : undefined,
    defaultValue: component.props.defaultValue,
    value: component.props.value,
    dataBinding: component.props.dataBinding,
    tableBinding: component.props.tableBinding,
    rangeRef: component.props.rangeRef,
    defaultValueConfig: component.props.defaultValueConfig,
    constraintConfig: component.props.constraintConfig,
    businessDayConfig: component.props.businessDayConfig,
    storageFormat: component.props.storageFormat,
  });
}
