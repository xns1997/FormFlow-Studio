import { useEffect, useState } from 'react';
import { FormAntdProvider } from '../components/AntdFormControls';
import type { RangeRef } from '../models';
import { useProjectStore } from '../project/store';
import { normalizeDataBinding } from '../services/data/dataBinding';
import { getControl } from './registry';
import type { PropertySection, PropertyStatus, PropertyTaskId } from './types';
import { isCompositePropDef } from './types';
import { PropertyEventsSection } from './properties/PropertyEventsSection';
import { PropertyPanelHeader } from './properties/PropertyPanelHeader';
import { PropertySectionList } from './properties/PropertySectionList';
import { PropertyTaskNav } from './properties/PropertyTaskNav';
import { getPropertyStatus, PROPERTY_TASKS, resolvePropertyGroup } from './properties/propertyMenuModel';
import { usePropertyPanelCatalog } from './properties/usePropertyPanelCatalog';
import type { Props } from './properties/utils';

export function PropertyPanel({ component, components = [], onUpdate, onUpdateGeometry, onRemove, onClose }: Props) {
  const projectId = useProjectStore((state) => state.project?.config.id || '');
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [section, setSection] = useState<PropertySection>('function');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeTask, setActiveTask] = useState<PropertyTaskId>();
  const { fieldDescriptors, fields, fieldCatalog } = usePropertyPanelCatalog(components, tables);

  useEffect(() => { setQuery(''); setActiveTask(undefined); }, [component?.id]);
  if (!component) return <div className="designer-properties-shell"><FormAntdProvider><div className="designer-properties"><div className="properties-empty" tabIndex={-1} data-panel-focus><strong>未选择控件</strong><span>在画布中选择一个控件，即可编辑功能、样式与交互。</span>{onClose && <button type="button" onClick={onClose}>收起属性栏</button>}</div></div></FormAntdProvider></div>;
  const control = getControl(component.type);
  if (!control) return null;

  const effectiveProps = { ...control.defaultProps, ...component.props };
  const normalizedBinding = normalizeDataBinding({ ...component, props: effectiveProps });
  const values = { ...effectiveProps, dataBinding: normalizedBinding ?? effectiveProps.dataBinding };
  const rangeDef = control.propSchema.find((def) => !isCompositePropDef(def) && def.type === 'range');
  const rangeValue = normalizedBinding?.source.kind === 'range' ? normalizedBinding.source.ref : rangeDef ? effectiveProps[rangeDef.key] as RangeRef | null : null;
  const statuses = new Map(control.propSchema.map((def) => [def.key, getPropertyStatus({ def, values, defaults: control.defaultProps, component: { ...component, props: values }, components, defaultSize: control.defaultSize, fields, fieldCatalog })]));
  const taskStatuses = (() => {
    const next: Partial<Record<PropertyTaskId, PropertyStatus[]>> = {};
    for (const def of control.propSchema) { const task = resolvePropertyGroup(def).task; (next[task] ||= []).push(statuses.get(def.key)!); }
    const eventChanged = !!Object.keys(component.props.events || {}).length || !!Object.keys(component.props.flowTriggers || {}).length || !!Object.keys(component.props.linkageRules || {}).length;
    if (control.eventSchema.length) next.events = [{ changed: eventChanged, diagnostics: [] }];
    const geometryChanged = component.width !== control.defaultSize.w || component.height !== control.defaultSize.h;
    (next.layout ||= []).push({ changed: geometryChanged, diagnostics: [] });
    return next;
  })();
  const tasks = ([...new Set(control.propSchema.map((def) => resolvePropertyGroup(def).task).filter((task) => PROPERTY_TASKS[task].section === section))] as PropertyTaskId[])
    .concat(section === 'function' && control.eventSchema.length ? ['events'] : [], section === 'style' ? ['layout'] : [])
    .filter((task, index, list) => list.indexOf(task) === index).sort((a, b) => PROPERTY_TASKS[a].order - PROPERTY_TASKS[b].order);
  const updateProps = (patch: Record<string, unknown>) => onUpdate(component.id, patch);
  const updateGeometry = onUpdateGeometry ? (patch: Record<string, unknown>) => onUpdateGeometry(component.id, patch) : undefined;
  const selectTask = (task: PropertyTaskId) => {
    const nextSection = PROPERTY_TASKS[task].section; setSection(nextSection); setActiveTask(task);
    const matching = control.propSchema.map(resolvePropertyGroup).filter((group) => group.task === task);
    setCollapsed((current) => ({ ...current, ...Object.fromEntries(matching.map((group) => [`${component.type}:${group.id}`, false])) }));
    window.setTimeout(() => { document.getElementById(task === 'events' ? 'property-task-events' : `property-group-${matching[0]?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.setTimeout(() => setActiveTask(undefined), 900); }, 0);
  };
  const showEvents = !query.trim() ? section === 'function' : '交互与事件 events'.includes(query.trim().toLowerCase());

  return <div className="designer-properties-shell"><FormAntdProvider><div className="designer-properties">
    <PropertyPanelHeader type={component.type} label={control.label} icon={control.icon} query={query} section={section} onQuery={setQuery} onSection={setSection} onRemove={() => onRemove(component.id)} onClose={onClose} />
    <div className="properties-body"><PropertyTaskNav tasks={tasks} statuses={taskStatuses} active={activeTask} onSelect={selectTask} />
      <PropertySectionList control={control} component={component} components={components} values={values} defaults={control.defaultProps} section={section} query={query} collapsed={collapsed} statuses={statuses} fields={fields} fieldCatalog={fieldCatalog} rangeValue={rangeValue} onToggle={(groupId, isCollapsed) => setCollapsed((current) => ({ ...current, [`${component.type}:${groupId}`]: isCollapsed }))} onUpdate={updateProps} onUpdateGeometry={updateGeometry} />
      {!query.trim() && section === 'style' && <div className="properties-group" id="property-task-layout"><h4>布局</h4><div className="prop-layout-grid"><span><b>X</b>{Math.round(component.x)}</span><span><b>Y</b>{Math.round(component.y)}</span><span><b>宽</b>{Math.round(component.width)}</span><span><b>高</b>{Math.round(component.height)}</span></div></div>}
      {showEvents && control.eventSchema.length > 0 && <PropertyEventsSection component={component} components={components} events={control.eventSchema} controlLabel={control.label} fields={fields} fieldDescriptors={fieldDescriptors} workflows={workflows} tables={tables} projectId={projectId} onUpdate={updateProps} />}
    </div>
  </div></FormAntdProvider></div>;
}
