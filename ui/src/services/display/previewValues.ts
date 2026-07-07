import type { DesignComponent, SrcTableEntry } from '../../project/types';
import { resolveSingleKeyField } from '../data/tableKeys';
import { getDefaultComponentValue } from '../config/controlTypes';

export function getPreviewInitialValue(component: DesignComponent, tables: SrcTableEntry[] = []): unknown {
  const binding = component.props.tableBinding as { tableId?: string; sheetName?: string; keyField?: string; keyValue?: unknown; column?: string } | undefined;
  const resolvedKeyField = binding?.tableId && binding.sheetName
    ? (binding.keyField || resolveSingleKeyField(tables, binding.tableId, binding.sheetName))
    : undefined;
  if (binding?.tableId && binding.sheetName && resolvedKeyField && binding.column) {
    const sheet = tables.find((table) => table.id === binding.tableId)?.sheets.find((item) => item.name === binding.sheetName);
    const row = sheet?.preview.find((item) => item[resolvedKeyField] === binding.keyValue);
    if (row && Object.prototype.hasOwnProperty.call(row, binding.column)) return row[binding.column];
  }
  return getDefaultComponentValue(component);
}
