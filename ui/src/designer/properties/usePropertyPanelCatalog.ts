import { useMemo } from 'react';
import type { EventFieldDescriptor } from '../../components/codeEditorSuggestions';
import type { SrcTableEntry } from '../../project/types';
import type { DesignComponent } from '../../project/types';
import type { PropertyFieldDescriptor } from './propertyEditorRegistry';

export function usePropertyPanelCatalog(components: DesignComponent[], tables: SrcTableEntry[]) {
  const fieldDescriptors = useMemo<EventFieldDescriptor[]>(() => {
    const fromTables = tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((column) => ({ name: column.name, type: column.dataType }))));
    const fromComponents = components.map((item) => {
      const name = String(item.fieldBinding || item.props.name || '').trim();
      if (!name) return null;
      if (item.type === 'number' || item.type === 'rating') return { name, type: 'number' };
      if (item.type === 'switch') return { name, type: 'boolean' };
      if (item.type === 'checkbox') return { name, type: 'array' };
      return { name, type: 'string' };
    }).filter(Boolean) as EventFieldDescriptor[];
    return [...new Map([...fromTables, ...fromComponents].map((field) => [field.name, field])).values()];
  }, [components, tables]);

  const fields = useMemo(() => fieldDescriptors.map((field) => field.name), [fieldDescriptors]);
  const fieldCatalog = useMemo<PropertyFieldDescriptor[]>(() => {
    const tableFields = tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((column) => ({
      path: column.name, label: column.name, type: column.dataType === 'enum' ? 'string' as const : column.dataType,
      source: 'table' as const, sourceId: `${table.id}:${sheet.name}`, sourceLabel: `${table.fileName} / ${sheet.name}`,
      sample: column.sampleValues?.[0] ?? sheet.preview?.[0]?.[column.name], writable: !column.locked,
    }))));
    const componentFields = components.map((item): PropertyFieldDescriptor | null => {
      const path = String(item.fieldBinding || item.props.name || '').trim();
      if (!path) return null;
      const type: PropertyFieldDescriptor['type'] = item.type === 'number' || item.type === 'rating' ? 'number' : item.type === 'switch' ? 'boolean' : item.type === 'checkbox' ? 'array' : 'string';
      return { path, label: path, type, source: 'component', sourceId: item.id, sourceLabel: String(item.props.label || item.type), writable: true };
    }).filter(Boolean) as PropertyFieldDescriptor[];
    return [...new Map([...tableFields, ...componentFields].map((field) => [`${field.source}:${field.sourceId}:${field.path}`, field])).values()];
  }, [components, tables]);

  return { fieldDescriptors, fields, fieldCatalog };
}
