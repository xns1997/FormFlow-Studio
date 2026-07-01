import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { DesignComponent, WorkflowFile } from '../project/types';
import type { RangeRef } from '../models';
import type { MetricConfig } from '../components/ChartWidget';
import { getControl } from './registry';
import type { PropDef } from './types';
import { rangeToAddress } from '../services/rangeResolver';
import RangeSelector from '../components/RangeSelector';
import DimMetricField from './DimMetricField';
import { useProjectStore } from '../project/store';
import { DesignerIcon } from './icons';
import CodeEditor from '../components/CodeEditor';
import { createEventContextExtraLib, createEventContextSuggestions, createFlowParameterSuggestions, jsonSuggestions, type EventFieldDescriptor } from '../components/codeEditorSuggestions';
import {
  createDefaultParameterMap,
  getWorkflowVariableNames,
  type FormFlowTriggerConfig,
} from '../services/formFlowTrigger';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/structuredProperties';

function getDefaultEventCode(eventKey: string, fieldName: string): string {
  const templates: Record<string, string> = {
    onChange: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 变更为:', ctx.value);
  return ctx.value;
}`,
    onBlur: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 失焦, 当前值:', ctx.value);
}`,
    onFocus: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 获得焦点');
}`,
    onClick: `/** @param {FormEventContext} ctx */
async (ctx) => {
  ctx.console.log('${fieldName} 被点击', ctx.values);
}`,
  };
  return templates[eventKey] || `// ${eventKey}\n`;
}

interface Props {
  component: DesignComponent | null;
  components?: DesignComponent[];
  onUpdate: (id: string, patch: Record<string, any>) => void;
  onRemove: (id: string) => void;
}

function PropField({ def, value, onChange }: { def: PropDef; value: any; onChange: (v: any) => void }) {
  const effectiveValue = value ?? def.default ?? '';

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
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span>{def.label}</span>
        </label>
      );
    case 'select':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      );
    case 'number':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <input
            type="number"
            value={value ?? ''}
            min={def.min}
            max={def.max}
            step={def.step}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </label>
      );
    case 'color':
      return (
        <label className="prop-field">
          <span>{def.label}</span>
          <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
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
          <input
            type="text"
            value={value ?? ''}
            placeholder={def.placeholder}
            onChange={(e) => onChange(e.target.value)}
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

  const handleConfirm = useCallback((ref: RangeRef) => {
    onChange(ref);
    setOpen(false);
  }, [onChange]);

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

function FlowTriggerEditor({
  value, workflows, componentName, fields, onChange,
}: {
  value: FormFlowTriggerConfig | undefined;
  workflows: WorkflowFile[];
  componentName: string;
  fields: string[];
  onChange: (value: FormFlowTriggerConfig) => void;
}) {
  const enabled = !!value?.enabled;
  const workflow = workflows.find((item) => item.id === value?.workflowId);
  const [parameterText, setParameterText] = useState(() => JSON.stringify(value?.parameterMap || {}, null, 2));

  useEffect(() => {
    setParameterText(JSON.stringify(value?.parameterMap || {}, null, 2));
  }, [value?.workflowId, value?.parameterMap]);

  const toggle = (nextEnabled: boolean) => {
    const selected = workflow || workflows[0];
    onChange({
      enabled: nextEnabled,
      workflowId: selected?.id || '',
      parameterMap: value?.parameterMap || createDefaultParameterMap(selected, componentName),
    });
  };

  const selectWorkflow = (workflowId: string) => {
    const selected = workflows.find((item) => item.id === workflowId);
    onChange({
      enabled: true,
      workflowId,
      parameterMap: createDefaultParameterMap(selected, componentName),
    });
  };

  return (
    <div className={`prop-flow-trigger ${enabled ? 'enabled' : ''}`}>
      <label className="prop-flow-trigger-toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} />
        <span>触发流程</span>
      </label>
      {enabled && workflows.length === 0 && (
        <div className="prop-flow-trigger-empty">请先在流程画布中创建并保存流程</div>
      )}
      {enabled && workflows.length > 0 && (
        <div className="prop-flow-trigger-body">
          <label className="prop-field">
            <span>运行流程</span>
            <select value={value?.workflowId || workflow?.id || workflows[0].id} onChange={(event) => selectWorkflow(event.target.value)}>
              {workflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {workflow && getWorkflowVariableNames(workflow).length > 0 && (
            <div className="prop-flow-trigger-vars">
              <span>流程变量</span>
              {getWorkflowVariableNames(workflow).map((name) => <code key={name}>{name}</code>)}
            </div>
          )}
          <div className="prop-field prop-flow-parameters">
            <span>传入参数（参数名 → 表达式）</span>
            <CodeEditor
              value={parameterText}
              onChange={(next) => {
                setParameterText(next);
                try {
                  const parsed = JSON.parse(next);
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    onChange({ ...value!, enabled: true, workflowId: workflow?.id || workflows[0].id, parameterMap: parsed });
                  }
                } catch { /* Keep incomplete JSON in the editor until it becomes valid. */ }
              }}
              language="json"
              theme="light"
              height={130}
              minHeight={100}
              lineNumbers
              compact
              fullscreen
              title="流程传入参数"
              suggestions={createFlowParameterSuggestions(workflow, fields)}
              suggestionTriggerCharacters={['"', ':', ',', '{', '$']}
              options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
            />
          </div>
          <div className="prop-flow-trigger-help">
            支持嵌套对象和数组：<code>$value</code> <code>$values</code> <code>$detail</code> <code>$form.字段</code>；参数名写成 <code>节点ID.Port</code> 可直传端口。
          </div>
        </div>
      )}
    </div>
  );
}

export function PropertyPanel({ component, components = [], onUpdate, onRemove }: Props) {
  const workflows = useProjectStore((state) => state.project?.workflows || []);
  const tables = useProjectStore((state) => state.project?.srcTable || []);
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
      <div className="designer-properties">
        <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
          点击画布上的控件编辑属性
        </div>
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
                  def={def}
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
              return (
                <div key={evt.key} className="prop-event">
                  <div className="prop-event-header">
                    <span className="prop-event-key">{evt.key}</span>
                    <span className="prop-event-label">{evt.label}</span>
                  </div>
                  <FlowTriggerEditor
                    value={flowTriggers[evt.key]}
                    workflows={workflows}
                    componentName={component.props.name || component.type}
                    fields={fields}
                    onChange={(trigger) => onUpdate(component.id, {
                      flowTriggers: { ...flowTriggers, [evt.key]: trigger },
                    })}
                  />
                  <CodeEditor
                    value={eventCode}
                    placeholder={evt.description}
                    height={160}
                    minHeight={120}
                    path={`inmemory://model/form-event-${component.id}-${evt.key}.js`}
                    compact
                    fullscreen
                    lineNumbers
                    theme="light"
                    extraLibs={[
                      createEventContextExtraLib({
                        filePath: `inmemory://model/form-event-${component.id}-${evt.key}.d.ts`,
                        fields: fieldDescriptors,
                        currentField: String(component.fieldBinding || component.props.name || component.type),
                        eventName: evt.key,
                      }),
                    ]}
                    suggestions={createEventContextSuggestions({
                      fields: fieldDescriptors,
                      workflows,
                      eventName: evt.key,
                      currentField: String(component.fieldBinding || component.props.name || component.type),
                    })}
                    suggestionTriggerCharacters={['.', "'", '"', '(']}
                    options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
                    title={`${control.label} · ${evt.label}`}
                    onChange={(code) => {
                      const events = { ...(component.props.events || {}), [evt.key]: code };
                      onUpdate(component.id, { events });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
