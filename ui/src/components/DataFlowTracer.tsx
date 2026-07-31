/**
 * DataFlowTracer — shows data flow from data sources to components.
 * Visualizes binding paths and highlights breaks.
 */
import React, { useMemo } from 'react';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { buildDataFlowGraph, type DataFlowNode } from '../services/formGeneration/componentInspector';

interface DataFlowTracerProps {
  components: DesignComponent[];
  tables: SrcTableEntry[];
  workflows: WorkflowFile[];
  open: boolean;
  onToggle: (next: boolean) => void;
  selectedComponentId?: string | null;
}

const NODE_ICONS: Record<string, string> = {
  'data-source': '📊',
  component: '🧩',
  workflow: '⚙',
  expression: '📝',
};

export default function DataFlowTracer({ components, tables, workflows, open, onToggle, selectedComponentId }: DataFlowTracerProps) {
  const graph = useMemo(() => buildDataFlowGraph(components, tables, workflows), [components, tables, workflows]);

  const dataSources = graph.filter((n) => n.type === 'data-source');
  const componentNodes = graph.filter((n) => n.type === 'component');
  const workflowNodes = graph.filter((n) => n.type === 'workflow');

  const selectedNode = selectedComponentId ? graph.find((n) => n.id === selectedComponentId) : null;
  const connectedIds = new Set<string>();
  if (selectedNode) {
    connectedIds.add(selectedNode.id);
    for (const conn of selectedNode.connections) {
      connectedIds.add(conn.from);
      connectedIds.add(conn.to);
    }
  }

  return (
    <div className="dataflow-tracer" data-open={open || undefined}>
      <div className="dataflow-tracer__header">
        <div className="dataflow-tracer__header-info">
          <strong className="dataflow-tracer__title">数据流</strong>
          <span className="dataflow-tracer__subtitle">
            {dataSources.length} 数据源 · {componentNodes.length} 控件 · {workflowNodes.length} 流程
          </span>
        </div>
        <button type="button" className="ui-btn ui-btn-xs" aria-expanded={open} onClick={() => onToggle(!open)}>
          {open ? '收起' : '展开'}
        </button>
      </div>

      {open && (
        <div className="dataflow-tracer__body">
          {/* Data Sources */}
          {dataSources.length > 0 && (
            <div className="dataflow-section">
              <div className="dataflow-section__label">📊 数据源</div>
              {dataSources.map((node) => (
                <DataFlowNodeRow key={node.id} node={node} highlighted={connectedIds.has(node.id)} selected={node.id === selectedComponentId} />
              ))}
            </div>
          )}

          {/* Components */}
          {componentNodes.length > 0 && (
            <div className="dataflow-section">
              <div className="dataflow-section__label">🧩 表单控件</div>
              {componentNodes.map((node) => (
                <DataFlowNodeRow key={node.id} node={node} highlighted={connectedIds.has(node.id)} selected={node.id === selectedComponentId} />
              ))}
            </div>
          )}

          {/* Workflows */}
          {workflowNodes.length > 0 && (
            <div className="dataflow-section">
              <div className="dataflow-section__label">⚙ 流程</div>
              {workflowNodes.map((node) => (
                <DataFlowNodeRow key={node.id} node={node} highlighted={connectedIds.has(node.id)} selected={node.id === selectedComponentId} />
              ))}
            </div>
          )}

          {/* Connection summary for selected */}
          {selectedNode && selectedNode.connections.length > 0 && (
            <div className="dataflow-section">
              <div className="dataflow-section__label">🔗 连接 ({selectedNode.connections.length})</div>
              {selectedNode.connections.map((conn, i) => (
                <div key={i} className={`dataflow-connection ${conn.status === 'broken' ? 'dataflow-connection--broken' : ''}`}>
                  <span className="dataflow-connection__direction">
                    {conn.direction === 'inbound' ? '←' : conn.direction === 'outbound' ? '→' : '↔'}
                  </span>
                  <span className="dataflow-connection__field">{conn.field}</span>
                  <span className="dataflow-connection__status">
                    {conn.status === 'broken' ? '🔴 断开' : '🟢 正常'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataFlowNodeRow({ node, highlighted, selected }: { node: DataFlowNode; highlighted: boolean; selected: boolean }) {
  return (
    <div className={`dataflow-node ${highlighted ? 'dataflow-node--highlighted' : ''} ${selected ? 'dataflow-node--selected' : ''}`}>
      <span className="dataflow-node__icon">{NODE_ICONS[node.type]}</span>
      <span className="dataflow-node__label">{node.label}</span>
      {node.field && <span className="dataflow-node__field">{node.field}</span>}
      {node.connections.length > 0 && (
        <span className="dataflow-node__conn-count">{node.connections.length} 连接</span>
      )}
    </div>
  );
}
