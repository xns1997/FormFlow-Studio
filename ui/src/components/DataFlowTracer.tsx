/**
 * DataFlowTracer — shows data flow from data sources to components.
 * Visualizes binding paths, highlights breaks, supports click-to-inspect.
 */
import React, { useMemo, useState } from 'react';
import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../project/types';
import { buildDataFlowGraph, type DataFlowNode } from '../services/formGeneration/componentInspector';
import CollapsiblePanel from './CollapsiblePanel';

interface DataFlowTracerProps {
  components: DesignComponent[];
  tables: SrcTableEntry[];
  workflows: WorkflowFile[];
  open: boolean;
  onToggle: (next: boolean) => void;
  selectedComponentId?: string | null;
  onInspectNode?: (nodeId: string) => void;
}

const NODE_ICONS: Record<string, string> = {
  'data-source': '📊',
  component: '🧩',
  workflow: '⚙',
  expression: '📝',
};

export default function DataFlowTracer({ components, tables, workflows, open, onToggle, selectedComponentId, onInspectNode }: DataFlowTracerProps) {
  const graph = useMemo(() => buildDataFlowGraph(components, tables, workflows), [components, tables, workflows]);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);

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

  const inspectedNode = inspectedNodeId ? graph.find((n) => n.id === inspectedNodeId) : null;

  const handleClickNode = (nodeId: string) => {
    setInspectedNodeId(inspectedNodeId === nodeId ? null : nodeId);
    onInspectNode?.(nodeId);
  };

  return (
    <CollapsiblePanel
      title="数据流"
      subtitle={`${dataSources.length} 数据源 · ${componentNodes.length} 控件 · ${workflowNodes.length} 流程`}
      open={open}
      onToggle={onToggle}
      className="dataflow-tracer"
    >
      {/* Data Sources */}
      {dataSources.length > 0 && (
        <div className="dataflow-section">
          <div className="dataflow-section__label">📊 数据源</div>
          {dataSources.map((node) => (
            <DataFlowNodeRow key={node.id} node={node} highlighted={connectedIds.has(node.id)} selected={node.id === selectedComponentId} inspected={node.id === inspectedNodeId} onClick={handleClickNode} />
          ))}
        </div>
      )}

      {/* Components */}
      {componentNodes.length > 0 && (
        <div className="dataflow-section">
          <div className="dataflow-section__label">🧩 表单控件</div>
          {componentNodes.map((node) => (
            <DataFlowNodeRow key={node.id} node={node} highlighted={connectedIds.has(node.id)} selected={node.id === selectedComponentId} inspected={node.id === inspectedNodeId} onClick={handleClickNode} />
          ))}
        </div>
      )}

      {/* Workflows */}
      {workflowNodes.length > 0 && (
        <div className="dataflow-section">
          <div className="dataflow-section__label">⚙ 流程</div>
          {workflowNodes.map((node) => (
            <DataFlowNodeRow key={node.id} node={node} highlighted={connectedIds.has(node.id)} selected={node.id === selectedComponentId} inspected={node.id === inspectedNodeId} onClick={handleClickNode} />
          ))}
        </div>
      )}

      {/* Inspected node details */}
      {inspectedNode && (
        <div className="dataflow-inspect">
          <div className="dataflow-inspect__header">
            <span>{NODE_ICONS[inspectedNode.type]} {inspectedNode.label}</span>
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => setInspectedNodeId(null)}>关闭</button>
          </div>
          <div className="dataflow-inspect__body">
            {inspectedNode.field && <div className="inspector-kv"><span className="inspector-k">字段</span><span className="inspector-v">{inspectedNode.field}</span></div>}
            <div className="inspector-kv"><span className="inspector-k">类型</span><span className="inspector-v">{inspectedNode.type}</span></div>
            <div className="inspector-kv"><span className="inspector-k">连接数</span><span className="inspector-v">{inspectedNode.connections.length}</span></div>
            {inspectedNode.connections.length > 0 && (
              <div className="dataflow-inspect__connections">
                <div className="inspector-section__label">连接</div>
                {inspectedNode.connections.map((conn, i) => (
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
        </div>
      )}

      {/* Connection summary for selected component */}
      {selectedNode && !inspectedNode && selectedNode.connections.length > 0 && (
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
    </CollapsiblePanel>
  );
}

function DataFlowNodeRow({ node, highlighted, selected, inspected, onClick }: { node: DataFlowNode; highlighted: boolean; selected: boolean; inspected: boolean; onClick: (id: string) => void }) {
  return (
    <div
      className={`dataflow-node ${highlighted ? 'dataflow-node--highlighted' : ''} ${selected ? 'dataflow-node--selected' : ''} ${inspected ? 'dataflow-node--inspected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(node.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(node.id); } }}
    >
      <span className="dataflow-node__icon">{NODE_ICONS[node.type]}</span>
      <span className="dataflow-node__label">{node.label}</span>
      {node.field && <span className="dataflow-node__field">{node.field}</span>}
      {node.connections.length > 0 && (
        <span className="dataflow-node__conn-count">{node.connections.length} 连接</span>
      )}
    </div>
  );
}
