import React, { useState, useCallback } from 'react';
import type { DesignComponent } from '../project/types';
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
import { ctxSuggestions, jsonSuggestions } from '../components/codeEditorSuggestions';

interface Props {
  component: DesignComponent | null;
  onUpdate: (id: string, patch: Record<string, any>) => void;
  onRemove: (id: string) => void;
}

function PropField({ def, value, onChange }: { def: PropDef; value: any; onChange: (v: any) => void }) {
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
    case 'json':
      return (
        <div className="prop-field">
          <span>{def.label}</span>
          <CodeEditor
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(next) => {
              try { onChange(JSON.parse(next)); } catch { onChange(next); }
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
        </div>
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

export function PropertyPanel({ component, onUpdate, onRemove }: Props) {
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
              const eventCode = component.props.events?.[evt.key] || '';
              return (
                <div key={evt.key} className="prop-event">
                  <div className="prop-event-header">
                    <span className="prop-event-key">{evt.key}</span>
                    <span className="prop-event-label">{evt.label}</span>
                  </div>
                  <CodeEditor
                    value={eventCode}
                    placeholder={evt.description}
                    height={160}
                    minHeight={120}
                    compact
                    fullscreen
                    lineNumbers
                    theme="light"
                    suggestions={ctxSuggestions}
                    suggestionTriggerCharacters={['.']}
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
