import { useState, type MouseEvent } from 'react';
import type { MetricConfig } from '../../components/ChartWidget';
import RangeSelector from '../../components/RangeSelector';
import type { RangeRef } from '../../models';
import type { DesignComponent } from '../../project/types';
import { useProjectStore } from '../../project/store';
import { rangeToAddress } from '../../services/data/rangeResolver';
import DimMetricField from '../DimMetricField';
import type { ControlDef, PropertyGroupDescriptor, PropertySection, PropertyStatus, PropSchemaEntry } from '../types';
import { isCompositePropDef } from '../types';
import { evaluatePropCondition } from './propertyEditorRegistry';
import type { PropertyFieldDescriptor } from './propertyEditorRegistry';
import { PropertyEditorField } from './PropertyEditorField';
import { getPropertyDefaultValue, getPropertyValue, propertyStatusLabel, resolvePropertyGroup } from './propertyMenuModel';
import { useAppInteraction } from '../../components/AppInteractionProvider';

function RangeField({ value, onChange }: { value: RangeRef | null | undefined; onChange: (value: RangeRef | null) => void }) {
  const tables = useProjectStore((state) => state.project?.srcTable || []); const [open, setOpen] = useState(false);
  const table = value ? tables.find((item) => item.id === value.tableId) : undefined; const sheet = value && table ? table.sheets.find((item) => item.name === value.sheetName) : undefined;
  if (!value) return <><button type="button" className="lg-range-connect" onClick={() => setOpen(true)}>配置数据绑定</button>{open && tables.length > 0 && <RangeSelector tables={tables} value={null} onConfirm={(next) => { onChange(next); setOpen(false); }} onCancel={() => setOpen(false)} />}</>;
  return <><div className={`lg-range-tag ${!table || !sheet ? 'invalid' : ''}`}><span className="lg-range-address">{table?.fileName || '数据源已失效'} · {value.sheetName} · {rangeToAddress(value)}</span><div><button type="button" className="lg-range-disconnect" onClick={() => setOpen(true)} aria-label="编辑数据绑定">✎</button><button type="button" className="lg-range-disconnect" onClick={() => onChange(null)} aria-label="移除数据绑定">×</button></div></div>{!table || !sheet ? <div className="property-editor-warning">原绑定仍被保留，但数据源已失效。</div> : <small className="prop-field-help">{sheet.rowCount} 行 · {sheet.columns.length} 个字段</small>}{open && tables.length > 0 && <RangeSelector tables={tables} value={value} onConfirm={(next) => { onChange(next); setOpen(false); }} onCancel={() => setOpen(false)} />}</>;
}

interface Props {
  control: ControlDef; component: DesignComponent; components: DesignComponent[]; values: Record<string, unknown>; defaults: Record<string, unknown>;
  section: PropertySection; query: string; collapsed: Record<string, boolean>; statuses: Map<string, PropertyStatus>; fields: string[]; fieldCatalog: PropertyFieldDescriptor[];
  rangeValue: RangeRef | null | undefined; onToggle: (groupId: string, collapsed: boolean) => void; onUpdate: (patch: Record<string, unknown>) => void; onUpdateGeometry?: (patch: Record<string, unknown>) => void;
}

function statusKey(def: PropSchemaEntry) { return def.key; }

export function PropertySectionList(props: Props) {
  const { confirm } = useAppInteraction();
  const { control, component, components, values, defaults, section, query, statuses, fields, fieldCatalog } = props;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleDefs = control.propSchema.filter((def) => evaluatePropCondition(def.visibleWhen, values));
  const searched = visibleDefs.filter((def) => {
    if (!normalizedQuery) return resolvePropertyGroup(def).section === section;
    const group = resolvePropertyGroup(def); return [def.key, def.label, def.help, group.label, group.section, group.task].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  });
  const groups = new Map<string, { descriptor: PropertyGroupDescriptor; defs: PropSchemaEntry[] }>();
  for (const def of searched) { const descriptor = resolvePropertyGroup(def); const entry = groups.get(descriptor.id) || { descriptor, defs: [] }; entry.defs.push(def); groups.set(descriptor.id, entry); }
  const renderField = (def: PropSchemaEntry, search = false) => {
    const group = resolvePropertyGroup(def); const status = statuses.get(statusKey(def)); const disabled = def.disabledWhen ? evaluatePropCondition(def.disabledWhen, values) : false;
    if (!isCompositePropDef(def) && def.type === 'range') return <RangeField key={def.key} value={props.rangeValue ?? null} onChange={(value) => props.onUpdate({ [def.key]: value })} />;
    if (!isCompositePropDef(def) && def.type === 'dimMetric') return <DimMetricField key={def.key} rangeRef={props.rangeValue ?? null} dimensions={(values.dimensions as number[]) || []} metrics={(values.metrics as MetricConfig[]) || []} onChange={(dimensions, metrics) => props.onUpdate({ dimensions, metrics })} />;
    const defaultValue = getPropertyDefaultValue(def, defaults, component, control.defaultSize);
    return <div key={def.key} className={`${search ? 'property-search-result' : ''} ${status?.diagnostics.length ? 'has-diagnostic' : ''}`}>{search && <span className="property-search-section">{group.section === 'function' ? '功能' : '样式'} · {group.label}</span>}<PropertyEditorField def={!isCompositePropDef(def) && component.type === 'datePicker' && (def.key === 'minDate' || def.key === 'maxDate') ? { ...def, type: values.showTime ? 'datetime' : 'date' } : def} value={getPropertyValue(def, values, component)} values={values} defaultValue={defaultValue} defaultValues={defaults} status={status} fields={fields} fieldCatalog={fieldCatalog} component={component} components={components} disabled={disabled} onChange={(value) => !isCompositePropDef(def) && def.target === 'geometry' ? props.onUpdateGeometry?.({ [def.key]: value }) : props.onUpdate({ [def.key]: value })} onPatch={props.onUpdate} />{status?.diagnostics.map((diagnostic, index) => <small key={index} className={`property-diagnostic ${diagnostic.severity}`}>{diagnostic.message}</small>)}</div>;
  };
  if (normalizedQuery) return <div className="property-search-results">{searched.map((def) => renderField(def, true))}{searched.length === 0 && <div className="properties-no-results">没有匹配的属性</div>}</div>;
  return <>{[...groups.values()].sort((a, b) => a.descriptor.order - b.descriptor.order).map(({ descriptor, defs }) => {
    const groupStatuses = defs.map((def) => statuses.get(statusKey(def))).filter(Boolean) as PropertyStatus[]; const label = propertyStatusLabel(groupStatuses);
    const changedDefs = defs.filter((def) => statuses.get(statusKey(def))?.changed);
    const resetGroup = async (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); if (!changedDefs.length || !await confirm({ title: '恢复本组配置？', message: `恢复“${descriptor.label}”中 ${changedDefs.length} 项已修改配置？`, detail: '这些属性将恢复为控件默认值。', confirmLabel: '恢复默认' })) return; const patch: Record<string, unknown> = {}; const geometry: Record<string, unknown> = {}; for (const def of changedDefs) { const target = !isCompositePropDef(def) && def.target === 'geometry' ? geometry : patch; if (isCompositePropDef(def)) for (const key of def.keys) target[key] = defaults[key]; else target[def.key] = getPropertyDefaultValue(def, defaults, component, control.defaultSize); } if (Object.keys(patch).length) props.onUpdate(patch); if (Object.keys(geometry).length) props.onUpdateGeometry?.(geometry); };
    const collapseKey = `${component.type}:${descriptor.id}`;
    const open = collapseKey in props.collapsed ? !props.collapsed[collapseKey] : descriptor.defaultOpen === true;
    return <details id={`property-group-${descriptor.id}`} key={descriptor.id} className="properties-group" open={open} onToggle={(event) => props.onToggle(descriptor.id, !event.currentTarget.open)}><summary><span>{descriptor.label}</span><span className="property-group-status">{label && <small className={groupStatuses.some((status) => status.diagnostics.some((item) => item.severity === 'error')) ? 'invalid' : ''}>{label}</small>}{changedDefs.length > 0 && <button type="button" onClick={resetGroup}>恢复本组</button>}</span></summary>{defs.map((def) => renderField(def))}</details>;
  })}</>;
}
