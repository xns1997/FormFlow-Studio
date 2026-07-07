import React, { useState, useEffect, useMemo } from 'react';
import type { DesignComponent, FormLinkageRule } from '../project/types';
import type { FormFlowTriggerConfig } from '../services/engine/formFlowTrigger';
import type { RangeRef } from '../models';
import type { MetricConfig } from '../components/ChartWidget';
import { getControl } from './registry';
import type { PropDef } from './types';
import { rangeToAddress } from '../services/data/rangeResolver';
import RangeSelector from '../components/RangeSelector';
import DimMetricField from './DimMetricField';
import { useProjectStore } from '../project/store';
import { DesignerIcon } from './icons';
import {
  AntdColorInput,
  AntdDateInput,
  AntdNumberInput,
  AntdSelectInput,
  AntdSwitchInput,
  AntdTimeInput,
  AntdTextInput,
  FormAntdProvider,
} from '../components/AntdFormControls';
import CodeEditor from '../components/CodeEditor';
import { jsonSuggestions, type EventFieldDescriptor } from '../components/codeEditorSuggestions';
import { parseParameterMapToDraftRows, type FlowTriggerEditorMode } from '../services/engine/flowTriggerEditor';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/data/structuredProperties';
import { getControlSnippetExamples } from '../services/display/controlSnippets';
import { getDefaultEventCode, Props, getComponentDisplayName } from './properties/utils';
import { EventScriptEditorSection } from './properties/EventScriptEditor';
import { FlowTriggerEditor } from './properties/FlowTriggerEditor';
import { LinkageRulesEditor } from './properties/LinkageRulesEditor';

function PropField({ def, value, onChange }: { def: PropDef; value: any; onChange: (v: any) => void }) {
  const effectiveValue = value ?? def.default ?? '';
  const selectOptions = (def.options || []).map((option) => ({ label: option.label, value: option.value }));

  if (def.type !== 'range' && def.type !== 'dimMetric' && isStructuredProperty(def.type, effectiveValue)) {
    return (
      <StructuredPropField
        def={def}
        value={effectiveValue}
        onChange={onChange}
      />
    );
  }

  switch (def.type) {
    case 'boolean':
      return (
        <label className="prop-toggle">
          <AntdSwitchInput checked={!!value} onChange={(checked) => onChange(checked)} />
          <span>{def.label}</span>
        </label>
      );
    case 'select':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdSelectInput
            value={String(value ?? '')}
            options={selectOptions}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'number':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdNumberInput
            value={value ?? ''}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(next) => onChange(next === '' ? '' : Number(next))}
          />
        </label>
      );
    case 'color':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdColorInput value={String(value ?? '#000000')} onChange={(next) => onChange(next)} />
        </label>
      );
    case 'date':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdDateInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'datetime':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdDateInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            showTime
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'time':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdTimeInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
    case 'range':
      return null; // handled separately
    case 'dimMetric' as any:
      return null; // handled separately
    default:
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <AntdTextInput
            value={String(value ?? '')}
            placeholder={def.placeholder}
            onChange={(next) => onChange(next)}
          />
        </label>
      );
  }
}

function StructuredPropField({ def, value, onChange }: { def: PropDef; value: unknown; onChange: (v: any) => void }) {
  const externalText = formatStructuredProperty(value, def.default ?? (String(def.type).includes('[]') || def.type === 'array' ? [] : {}), def.type);
  const [text, setText] = useState(externalText);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(externalText);
    setError(null);
  }, [externalText]);

  return (
    <div className="prop-field">
      <span>{def.label}</span>
      <div className={`structured-property-editor ${error ? 'invalid' : ''}`}>
        <CodeEditor
          value={text}
          onChange={(next) => {
            setText(next);
            const parsed = parseStructuredProperty(next, def.type);
            setError(parsed.error || null);
            if (!parsed.error) onChange(parsed.value);
          }}
          language="json"
          title={def.label}
          theme="light"
          height={180}
          minHeight={120}
          lineNumbers
          suggestions={jsonSuggestions}
          autoSuggestPolicy="json-contextual"
          suggestionTriggerCharacters={['"', ':', ',', '{', '[']}
          options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
          compact
          fullscreen
        />
        {error && <div className="structured-property-error">JSON 无效：{error}</div>}
      </div>
    </div>
  );
}

function RangeField({ value, onChange }: { value: RangeRef | null | undefined; onChange: (v: RangeRef | null) => void }) {
  const tables = useProjectStore((s) => s.project?.srcTable || []);
  const [open, setOpen] = useState(false);

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
          连接数据源
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
      <div className="lg-range-tag" style={{ width: '100%', justifyContent: 'space-between' }}>
        <span className="lg-range-address">{address}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="lg-range-disconnect" onClick={() => setOpen(true)} title="重新选择" style={{ fontSize: 12 }}>✎</button>
          <button className="lg-range-disconnect" onClick={() => onChange(null)} title="断开连接">×</button>
        </div>
      </div>
      {open && tables.length > 0 && (
        <RangeSelector tables={tables} value={value} onConfirm={handleConfirm} onCancel={() => setOpen(false)} />
      )}
    </>
  );
}

export function PropertyPanel({ component, components = [], onUpdate, onRemove }: Props) {
  const projectId = useProjectStore((state) => state.project?.config.id || '');
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
  const [flowTriggerModes, setFlowTriggerModes] = useState<Record<string, FlowTriggerEditorMode>>({});
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
  if (!component) {
    return (
      <div className="designer-properties-shell">
        <FormAntdProvider>
          <div className="designer-properties">
            <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
              点击画布上的控件编辑属性
            </div>
          </div>
        </FormAntdProvider>
      </div>
    );
  }

  const control = getControl(component.type);
  if (!control) return null;

  const groups = new Map<string, PropDef[]>();
  for (const def of control.propSchema) {
    const g = def.group || '基础';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(def);
  }

  const rangeDef = control.propSchema.find(d => d.type === 'range');
  const rangeValue = rangeDef ? component.props[rangeDef.key] as RangeRef | null : null;

  return (
    <div className="designer-properties-shell">
      <FormAntdProvider>
        <div className="designer-properties">
          <div className="properties-header">
            <span className="properties-type">
              <DesignerIcon name={component.type} fallback={control.icon} />
              {control.label}
            </span>
            <button className="properties-delete" onClick={() => onRemove(component.id)}>删除</button>
          </div>
          <div className="properties-body">
            {[...groups.entries()].map(([group, defs]) => (
              <div key={group} className="properties-group">
                <h4>{group}</h4>
                {defs.map((def) => {
                  if (def.type === 'range') {
                    return (
                      <RangeField
                        key={def.key}
                        value={rangeValue}
                        onChange={(v) => onUpdate(component.id, { [def.key]: v })}
                      />
                    );
                  }
                  if ((def as any).type === 'dimMetric') {
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
                    <PropField
                      key={def.key}
                      def={
                        component.type === 'datePicker' && (def.key === 'minDate' || def.key === 'maxDate')
                          ? { ...def, type: component.props.showTime ? 'datetime' : 'date' }
                          : def
                      }
                      value={component.props[def.key]}
                      onChange={(v) => onUpdate(component.id, { [def.key]: v })}
                    />
                  );
                })}
              </div>
            ))}
            <div className="properties-group">
              <h4>布局</h4>
              <div className="prop-row">
                <span>X: {Math.round(component.x)}</span>
                <span>Y: {Math.round(component.y)}</span>
              </div>
              <div className="prop-row">
                <span>W: {Math.round(component.width)}</span>
                <span>H: {Math.round(component.height)}</span>
              </div>
            </div>
            {control.eventSchema && control.eventSchema.length > 0 && (
              <div className="properties-group">
                <h4>事件</h4>
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
              return (
                <div key={evt.key} className="prop-event">
                  <div className="prop-event-header">
                    <span className="prop-event-key">{evt.key}</span>
                    <span className="prop-event-label">{evt.label}</span>
                  </div>
                  <div className="prop-event-section">
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
                  </div>
                  <div className="prop-event-section">
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
                  </div>
                  <div className="prop-event-section">
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
                  </div>
                </div>
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
