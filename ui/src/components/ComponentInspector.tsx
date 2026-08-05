/**
 * ComponentInspector — shows selected component's state for debugging.
 * Displays bindings, validations, linkages, flow triggers, and source info.
 */
import React from 'react';
import { useMemo } from 'react';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { inspectComponent, type ComponentState } from '../services/formGeneration/componentInspector';
import CollapsiblePanel from './CollapsiblePanel';

interface ComponentInspectorProps {
  selectedComponent: DesignComponent | null;
  allComponents: DesignComponent[];
  tables: SrcTableEntry[];
  workflows: WorkflowFile[];
  open: boolean;
  onToggle: (next: boolean) => void;
}

const STATUS_ICONS: Record<string, string> = {
  active: '🟢',
  broken: '🔴',
  missing: '🟡',
  pass: '✅',
  fail: '❌',
  unknown: '⚪',
  valid: '🟢',
  'missing-flow': '🔴',
  disabled: '🟡',
};

export default function ComponentInspector({ selectedComponent, allComponents, tables, workflows, open, onToggle }: ComponentInspectorProps) {
  const state = useMemo<ComponentState | null>(() => {
    if (!selectedComponent) return null;
    return inspectComponent(selectedComponent, allComponents, tables, workflows);
  }, [selectedComponent, allComponents, tables, workflows]);

  if (!state) return null;

  return (
    <CollapsiblePanel
      title="组件检查"
      subtitle={`${state.label} (${state.type})`}
      open={open}
      onToggle={onToggle}
      className="component-inspector"
    >
      {/* Basic info */}
      <div className="inspector-section">
        <div className="inspector-section__label">基本信息</div>
        <div className="inspector-kv"><span className="inspector-k">类型</span><span className="inspector-v">{state.type}</span></div>
        <div className="inspector-kv"><span className="inspector-k">字段</span><span className="inspector-v">{state.field || '(未设置)'}</span></div>
        {state.sourceTable && (
          <div className="inspector-kv">
            <span className="inspector-k">数据源</span>
            <span className="inspector-v">{state.sourceTable} / {state.sourceSheet} / {state.sourceColumn}</span>
          </div>
        )}
      </div>

      {/* Bindings */}
      {state.bindings.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-section__label">数据绑定</div>
          {state.bindings.map((b, i) => (
            <div key={i} className="inspector-item">
              <span className="inspector-status">{STATUS_ICONS[b.status]}</span>
              <span className="inspector-item__text">{b.detail}</span>
              <span className="inspector-item__meta">{b.direction}</span>
            </div>
          ))}
        </div>
      )}

      {/* Validations */}
      {state.validations.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-section__label">校验规则</div>
          {state.validations.map((v, i) => (
            <div key={i} className="inspector-item">
              <span className="inspector-status">{STATUS_ICONS[v.status]}</span>
              <span className="inspector-item__text">{v.label}: {v.value}</span>
              <span className="inspector-item__meta">{v.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Linkages */}
      {state.linkages.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-section__label">联动规则</div>
          {state.linkages.map((l, i) => (
            <div key={i} className="inspector-item">
              <span className="inspector-item__text">
                当 <strong>{l.event}</strong> → 设置 <strong>{l.targetField}</strong>
              </span>
              {l.condition && <span className="inspector-item__meta">条件: {l.condition}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Flow triggers */}
      {state.flowTriggers.length > 0 && (
        <div className="inspector-section">
          <div className="inspector-section__label">流程触发</div>
          {state.flowTriggers.map((t, i) => (
            <div key={i} className="inspector-item">
              <span className="inspector-status">{STATUS_ICONS[t.status]}</span>
              <span className="inspector-item__text">
                {t.event} → {t.workflowName}
              </span>
              <span className="inspector-item__meta">{t.enabled ? '已启用' : '已禁用'}</span>
            </div>
          ))}
        </div>
      )}
    </CollapsiblePanel>
  );
}
