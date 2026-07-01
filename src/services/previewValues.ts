import type { DesignComponent, SrcTableEntry } from '../project/types';

export function getPreviewInitialValue(component: DesignComponent, tables: SrcTableEntry[] = []): unknown {
  const binding = component.props.tableBinding as { tableId?: string; sheetName?: string; keyField?: string; keyValue?: unknown; column?: string } | undefined;
  if (binding?.tableId && binding.sheetName && binding.keyField && binding.column) {
    const sheet = tables.find((table) => table.id === binding.tableId)?.sheets.find((item) => item.name === binding.sheetName);
    const row = sheet?.preview.find((item) => item[binding.keyField!] === binding.keyValue);
    if (row && Object.prototype.hasOwnProperty.call(row, binding.column)) return row[binding.column];
  }
  if (component.props.value !== undefined) return component.props.value;
  if (component.props.defaultValue !== undefined) return component.props.defaultValue;
  if (component.type === 'checkbox') return [];
  if (component.type === 'switch') return component.props.defaultValue !== false;
  return '';
}
