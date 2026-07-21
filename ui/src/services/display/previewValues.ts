import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { getDefaultComponentValue } from '../config/controlTypes';
import { resolveDataBindingValue } from '../data/dataBinding';

export function getPreviewInitialValue(component: DesignComponent, tables: SrcTableEntry[] = []): unknown {
  const resolved = resolveDataBindingValue(component, tables);
  if (resolved.found || resolved.value !== undefined) return resolved.value;
  return getDefaultComponentValue(component);
}

export function getPreviewInitializationSignature(component: DesignComponent): string {
  return JSON.stringify({
    content: component.type === 'text' ? component.props.content : undefined,
    defaultValue: component.props.defaultValue,
    value: component.props.value,
    dataBinding: component.props.dataBinding,
    tableBinding: component.props.tableBinding,
    rangeRef: component.props.rangeRef,
  });
}
