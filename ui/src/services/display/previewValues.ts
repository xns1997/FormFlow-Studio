import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { getDefaultComponentValue } from '../config/controlTypes';
import { resolveDataBindingValue } from '../data/dataBinding';

export function getPreviewInitialValue(component: DesignComponent, tables: SrcTableEntry[] = []): unknown {
  const resolved = resolveDataBindingValue(component, tables);
  if (resolved.found || resolved.value !== undefined) return resolved.value;
  return getDefaultComponentValue(component);
}
