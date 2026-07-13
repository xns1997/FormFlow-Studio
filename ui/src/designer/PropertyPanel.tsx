import React, { useState, useMemo } from 'react';
import type { DesignComponent, FormLinkageRule } from '../project/types';
import type { FormFlowTriggerConfig } from '../services/engine/formFlowTrigger';
import type { RangeRef } from '../models';
import type { MetricConfig } from '../components/ChartWidget';
import { getControl } from './registry';
import type { PropSchemaEntry } from './types';
import { isCompositePropDef } from './types';
import { rangeToAddress } from '../services/data/rangeResolver';
import RangeSelector from '../components/RangeSelector';
import DimMetricField from './DimMetricField';
import { useProjectStore } from '../project/store';
import { DesignerIcon } from './icons';
import {
  AntdSelectInput,
  AntdSwitchInput,
  AntdTextInput,
  FormAntdProvider,
} from '../components/AntdFormControls';
import type { EventFieldDescriptor } from '../components/codeEditorSuggestions';
import { parseParameterMapToDraftRows, type FlowTriggerEditorMode } from '../services/engine/flowTriggerEditor';
import { getControlSnippetExamples } from '../services/display/controlSnippets';
import { getDefaultEventCode, Props, getComponentDisplayName } from './properties/utils';
import { EventScriptEditorSection } from './properties/EventScriptEditor';
import { FlowTriggerEditor } from './properties/FlowTriggerEditor';
import { LinkageRulesEditor } from './properties/LinkageRulesEditor';
import { PropertyEditorField } from './properties/PropertyEditorField';
import { evaluatePropCondition } from './properties/propertyEditorRegistry';
import type { PropertyFieldDescriptor } from './properties/propertyEditorRegistry';
import { normalizeDataBinding } from '../services/data/dataBinding';

const ADVANCED_GROUPS = new Set(['动态', '表达式', '高级']);

function hasConfiguredValue(def: PropSchemaEntry, values: Record<string, unknown>) {
  const configured = (value: unknown) => value !== undefined && value !== null && value !== ''
    && (!Array.isArray(value) || value.length > 0)
    && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).length > 0);
  return isCompositePropDef(def) ? def.keys.some((key) => configured(values[key])) : configured(values[def.key]);
}

function RangeField({ value, onChange }: { value: RangeRef | null | undefined; onChange: (v: RangeRef | null) => void }) {
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const [open, setOpen] = useState(false);
  const table = value ? tables.find((item) => item.id === value.tableId) : undefined;
  const sheet = value && table ? table.sheets.find((item) => item.name === value.sheetName) : undefined;

  const handleConfirm = (ref: RangeRef) => {
    onChange(ref);
    setOpen(false);
  };

  if (!value) {
    return (
      <>
        <button className="lg-range-connect" onClick={() => setOpen(true)} style={{ width: '100%', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          配置数据绑定
        </button>
        {open && tables.length > 0 && (
          <RangeSelector tables={tables} value={null} onConfirm={handleConfirm} onCancel={() => setOpen(false)} />
        )}
      </>
    );
  }

  const address = rangeToAddress(value);

  return (
    <>
      <div className={`lg-range-tag ${!table || !sheet ? 'invalid' : ''}`} style={{ width: '100%', justifyContent: 'space-between' }}>
        <span className="lg-range-address" title={`${table?.fileName || value.tableId} / ${value.sheetName} / ${address}`}>{table?.fileName || '数据源已失效'} · {value.sheetName} · {address}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="lg-range-disconnect" onClick={() => setOpen(true)} title="重新选择" style={{ fontSize: 12 }}>✎</button>
          <button className="lg-range-disconnect" onClick={() => onChange(null)} title="断开连接">×</button>
        </div>
      </div>
      {(!table || !sheet) && <div className="property-editor-warning">原绑定仍被保留，但对应的数据表或工作表已经不存在。</div>}
      {table && sheet && <small className="prop-field-help">{sheet.rowCount} 行 · {sheet.columns.length} 个字段 · {value.firstRowIsHeader === false ? '无表头' : '首行为表头'}</small>}
      {open && tables.length > 0 && (
        <RangeSelector tables={tables} value={value} onConfirm={handleConfirm} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}

export function PropertyPanel({ component, components = [], onUpdate, onUpdateGeometry, onRemove }: Props) {
  const projectId = useProjectStore((state) => state.project?.config.id || '');
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [flowTriggerModes, setFlowTriggerModes] = useState<Record<string, FlowTriggerEditorMode>>({});
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [propertyQuery, setPropertyQuery] = useState('');
  const [propertyMode, setPropertyMode] = useState<'common' | 'advanced'>('common');
  const fieldDescriptors = useMemo<EventFieldDescriptor[]>(() => {
    const fromTables = tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((column) => ({
      name: column.name,
      type: column.dataType,
    }))));
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
      path: column.name,
      label: column.name,
      type: column.dataType === 'enum' ? 'string' as const : column.dataType,
      source: 'table' as const,
      sourceId: `${table.id}:${sheet.name}`,
      sourceLabel: `${table.fileName} / ${sheet.name}`,
      sample: column.sampleValues?.[0] ?? sheet.preview?.[0]?.[column.name],
      writable: !column.locked,
    }))));
    const componentFields = components.map((item): PropertyFieldDescriptor | null => {
      const path = String(item.fieldBinding || item.props.name || '').trim();
      if (!path) return null;
      const type: PropertyFieldDescriptor['type'] = item.type === 'number' || item.type === 'rating' ? 'number'
        : item.type === 'switch' ? 'boolean' : item.type === 'checkbox' ? 'array' : 'string';
      return { path, label: path, type, source: 'component', sourceId: item.id, sourceLabel: String(item.props.label || item.type), writable: true };
    }).filter(Boolean) as PropertyFieldDescriptor[];
    return [...new Map([...tableFields, ...componentFields].map((field) => [`${field.source}:${field.sourceId}:${field.path}`, field])).values()];
  }, [components, tables]);
  if (!component) {
    return (
      <div className="designer-properties-shell">
        <FormAntdProvider>
          <div className="designer-properties">
            <div className="properties-empty">
              <DesignerIcon name="select" />
              <strong>属性配置</strong>
              <span>选择画布中的控件后即可编辑</span>
            </div>
          </div>
        </FormAntdProvider>
      </div>
    );
  }

  const control = getControl(component.type);
  if (!control) return null;

  const groups = new Map<string, PropSchemaEntry[]>();
  const normalizedQuery = propertyQuery.trim().toLowerCase();
  for (const def of control.propSchema) {
    const g = def.group || '基础';
    const advanced = def.level === 'advanced' || (!def.level && ADVANCED_GROUPS.has(g));
    if (propertyMode === 'common' && advanced) continue;
    if (normalizedQuery && ![def.key, def.label, def.help, g].some((value) => String(value || '').toLowerCase().includes(normalizedQuery))) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(def);
  }

  const rangeDef = control.propSchema.find((def) => !isCompositePropDef(def) && def.type === 'range');
  const normalizedBinding = normalizeDataBinding(component);
  const rangeValue = normalizedBinding?.source.kind === 'range' ? normalizedBinding.source.ref : rangeDef ? component.props[rangeDef.key] as RangeRef | null : null;

  return (
    <div className="designer-properties-shell">
      <FormAntdProvider>
        <div className="designer-properties">
          <div className="properties-header">
            <div className="properties-heading">
              <span className="properties-eyebrow">属性配置</span>
              <span className="properties-type">
                <DesignerIcon name={component.type} fallback={control.icon} />
                {control.label}
              </span>
            </div>
            <button className="properties-delete" title="删除控件" aria-label="删除控件" onClick={() => onRemove(component.id)}>删除</button>
          </div>
          <div className="properties-body">
            <div className="properties-filterbar">
              <AntdTextInput value={propertyQuery} placeholder="搜索属性、帮助或分组" onChange={setPropertyQuery} />
              <div className="properties-mode-switch" role="tablist" aria-label="属性显示范围">
                <button type="button" role="tab" aria-selected={propertyMode === 'common'} className={propertyMode === 'common' ? 'active' : ''} onClick={() => setPropertyMode('common')}>常用</button>
                <button type="button" role="tab" aria-selected={propertyMode === 'advanced'} className={propertyMode === 'advanced' ? 'active' : ''} onClick={() => setPropertyMode('advanced')}>全部</button>
              </div>
            </div>
            {[...groups.entries()].map(([group, defs]) => (
              <details key={group} className="properties-group" open={!collapsedGroups[group]} onToggle={(event) => {
                const collapsed = !event.currentTarget.open;
                setCollapsedGroups((current) => current[group] === collapsed ? current : { ...current, [group]: collapsed });
              }}>
                <summary><span>{group}</span><small>{defs.filter((def) => hasConfiguredValue(def, component.props)).length}/{defs.length} 已配置</small></summary>
                {defs.map((def) => {
                  if (!evaluatePropCondition(def.visibleWhen, component.props)) return null;
                  const disabled = def.disabledWhen ? evaluatePropCondition(def.disabledWhen, component.props) : false;
                  if (!isCompositePropDef(def) && def.type === 'range') {
                    return (
                      <RangeField
                        key={def.key}
                        value={rangeValue}
                        onChange={(v) => onUpdate(component.id, { [def.key]: v })}
                      />
                    );
                  }
                  if (!isCompositePropDef(def) && def.type === 'dimMetric') {
                    return (
                      <DimMetricField
                        key={def.key}
                        rangeRef={rangeValue}
                        dimensions={(component.props.dimensions as number[]) || []}
                        metrics={(component.props.metrics as MetricConfig[]) || []}
                        onChange={(dims, mets) => onUpdate(component.id, { dimensions: dims, metrics: mets })}
                      />
                    );
                  }
                  return (
                    <PropertyEditorField
                      key={def.key}
                      def={
                        !isCompositePropDef(def) && component.type === 'datePicker' && (def.key === 'minDate' || def.key === 'maxDate')
                          ? { ...def, type: component.props.showTime ? 'datetime' : 'date' }
                          : def
                      }
                      value={isCompositePropDef(def) ? Object.fromEntries(def.keys.map((key) => [key, component.props[key]])) : !isCompositePropDef(def) && def.target === 'geometry' ? component[def.key as 'x' | 'y' | 'width' | 'height'] : def.key === 'dataBinding' ? normalizedBinding : component.props[def.key]}
                      values={component.props}
                      fields={fields}
                      fieldCatalog={fieldCatalog}
                      component={component}
                      components={components}
                      disabled={disabled}
                      onChange={(value) => !isCompositePropDef(def) && def.target === 'geometry' && onUpdateGeometry ? onUpdateGeometry(component.id, { [def.key]: value }) : onUpdate(component.id, { [def.key]: value })}
                      onPatch={(patch) => onUpdate(component.id, patch)}
                    />
                  );
                })}
              </details>
            ))}
            {groups.size === 0 && <div className="properties-no-results">没有匹配的属性</div>}
            <div className="properties-group">
              <h4>布局</h4>
              <div className="prop-layout-grid">
                <span><b>X</b>{Math.round(component.x)}</span>
                <span><b>Y</b>{Math.round(component.y)}</span>
                <span><b>宽</b>{Math.round(component.width)}</span>
                <span><b>高</b>{Math.round(component.height)}</span>
              </div>
            </div>
            {propertyMode === 'advanced' && control.eventSchema && control.eventSchema.length > 0 && (
              <div className="properties-group properties-events">
                <h4>交互与事件 <span>{control.eventSchema.length}</span></h4>
                {control.eventSchema.map((evt) => {
              const eventCode = component.props.events?.[evt.key] || getDefaultEventCode(evt.key, component.props.name || component.type);
              const flowTriggers = (component.props.flowTriggers || {}) as Record<string, FormFlowTriggerConfig>;
              const linkageRuleMap = (component.props.linkageRules || {}) as Record<string, FormLinkageRule[]>;
              const eventRules = linkageRuleMap[evt.key] || [];
              const modeKey = `${component.id}:${evt.key}`;
              const editorMode = flowTriggerModes[modeKey]
                || (parseParameterMapToDraftRows(flowTriggers[evt.key]?.parameterMap, workflows.find((item) => item.id === flowTriggers[evt.key]?.workflowId)).unsupportedEntries.length > 0 ? 'code' : 'ui');
              const impactFields = [...new Set(eventRules.flatMap((rule) => rule.actions.map((action) => action.targetField).filter(Boolean) as string[]))];
              const impactComponents = [...new Set(eventRules.flatMap((rule) => rule.actions.map((action) => action.targetComponentId).filter(Boolean) as string[]))];
              const controlSnippets = getControlSnippetExamples({
                components,
                currentField: String(component.fieldBinding || component.props.name || component.type),
                eventName: evt.key,
              });
              const isConfigured = !!component.props.events?.[evt.key]
                || !!flowTriggers[evt.key]
                || eventRules.length > 0;
              return (
                <details
                  key={evt.key}
                  className="prop-event"
                  open={!!expandedEvents[modeKey]}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setExpandedEvents((current) => current[modeKey] === open ? current : { ...current, [modeKey]: open });
                  }}
                >
                  <summary className="prop-event-header">
                    <span className="prop-event-label">{evt.label}</span>
                    <code className="prop-event-key">{evt.key}</code>
                    <span className={`prop-event-state ${isConfigured ? 'configured' : ''}`}>{isConfigured ? '已配置' : '未配置'}</span>
                  </summary>
                  {expandedEvents[modeKey] && <div className="prop-event-content">
                    <section className="prop-event-section">
                    <div className="prop-event-section-title">联动规则</div>
                    <LinkageRulesEditor
                      eventName={evt.key}
                      fieldName={String(component.fieldBinding || component.props.name || component.type)}
                      rules={eventRules}
                      fields={fields}
                      components={components}
                      workflows={workflows}
                      onChange={(nextRules) => onUpdate(component.id, {
                        linkageRules: { ...linkageRuleMap, [evt.key]: nextRules },
                      })}
                    />
                    </section>
                    <section className="prop-event-section">
                    <div className="prop-event-section-title">流程绑定</div>
                      <FlowTriggerEditor
                        value={flowTriggers[evt.key]}
                        workflows={workflows}
                        componentName={component.props.name || component.type}
                        fields={fields}
                        mode={editorMode}
                        onModeChange={(nextMode) => setFlowTriggerModes((current) => ({ ...current, [modeKey]: nextMode }))}
                        onChange={(trigger) => onUpdate(component.id, {
                          flowTriggers: { ...flowTriggers, [evt.key]: trigger },
                        })}
                      />
                    </section>
                    <section className="prop-event-section">
                      <EventScriptEditorSection
                        component={component}
                        evt={evt}
                        controlLabel={control.label}
                        eventCode={String(eventCode)}
                        fieldDescriptors={fieldDescriptors}
                        workflows={workflows}
                        components={components}
                        tables={tables}
                        projectId={projectId}
                        controlSnippets={controlSnippets}
                        impactFields={impactFields}
                        impactComponents={impactComponents}
                        onChange={(code) => {
                          const events = { ...(component.props.events || {}), [evt.key]: code };
                          onUpdate(component.id, { events });
                        }}
                      />
                    </section>
                  </div>}
                </details>
              );
            })}
            </div>
          )}
        </div>
      </div>
      </FormAntdProvider>
    </div>
  );
}
