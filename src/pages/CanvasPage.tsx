import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { loadNodeRegistry, type FlowNodeSpec, type NodeRegistry, type SchemaPort } from '../flowRegistry';
import { useProjectStore } from '../project/store';
import { executeFlow, type FlowExecutionResult } from '../services/flowEngine';
import { rangeToAddress } from '../services/rangeResolver';
import type { SrcTableEntry } from '../project/types';
import type { RangeRef } from '../models';
import RangeSelector from '../components/RangeSelector';
import TypeDisplayer from '../components/TypeDisplayer';
import OutputPreviewModal, { type OutputPreviewTarget } from '../components/OutputPreviewModal';
import CodeEditor from '../components/CodeEditor';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../services/structuredProperties';
import { jsonSuggestions } from '../components/codeEditorSuggestions';
import NodePalette, { QuickNodePicker } from '../components/NodePalette';
import { createQuickNodeConnection, portTypesCompatible, type NodeConnectionContext } from '../services/nodeDiscovery';

type FlowNodeData = {
  specId: string;
  label: string;
  kind: string;
  category: string;
  description: string;
  propertiesJson: string;
  connectedPortsJson: string;
  outputPreview?: string;
  outputs?: Record<string, unknown>;
  error?: string;
};

type FlowNode = Node<FlowNodeData>;

function nodeDataFromSpec(spec: FlowNodeSpec): FlowNodeData {
  return { specId: spec.id, label: spec.label, kind: spec.kind, category: spec.category, description: spec.description, propertiesJson: '{}', connectedPortsJson: '[]' };
}

function createNode(spec: FlowNodeSpec, index: number, position?: { x: number; y: number }): FlowNode {
  return {
    id: `${spec.id}:${Date.now()}:${index}`,
    type: 'formflow',
    position: position || { x: 120 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 180 },
    data: nodeDataFromSpec(spec),
  };
}

function downloadFileData(value: unknown, fileName: string, mimeType: string) {
  const blob = value instanceof Blob
    ? value
    : typeof value === 'string'
      ? new Blob([value], { type: mimeType })
    : value instanceof ArrayBuffer
      ? new Blob([value], { type: mimeType })
      : ArrayBuffer.isView(value)
        ? new Blob([value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer], { type: mimeType })
        : null;
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function FormFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const kindClass = data.kind === 'scenario' ? 'scenario' : data.kind === 'generic' ? 'generic' : data.kind === 'behavior' ? 'behavior' : 'method';
  const spec = (globalThis as any).__formflowRegistry?.byId.get(data.specId) as FlowNodeSpec | undefined;
  const properties = spec?.properties || [];
  const ports = spec?.ports || [];
  const portsByName = useMemo(() => {
    const m = new Map<string, SchemaPort[]>();
    for (const p of ports) {
      const list = m.get(p.name) || [];
      list.push(p);
      m.set(p.name, list);
    }
    return m;
  }, [ports]);

  const fieldRows = useMemo(() => {
    const rows: Array<{ prop: any; inputPort: SchemaPort | null; outputPort: SchemaPort | null }> = [];
    const usedNames = new Set<string>();
    for (const prop of properties) {
      const portList = portsByName.get(prop.name) || [];
      const inputPort = portList.find(p => p.direction === 'input' || p.direction === 'both') || null;
      const outputPort = portList.find(p => p.direction === 'output' || p.direction === 'both') || null;
      rows.push({ prop, inputPort, outputPort });
      usedNames.add(prop.name);
    }
    for (const port of ports) {
      if (usedNames.has(port.name)) continue;
      usedNames.add(port.name);
      const portList = portsByName.get(port.name) || [];
      const inputPort = portList.find(p => p.direction === 'input' || p.direction === 'both') || null;
      const outputPort = portList.find(p => p.direction === 'output' || p.direction === 'both') || null;
      rows.push({ prop: null, inputPort, outputPort });
    }
    return rows;
  }, [properties, ports, portsByName]);

  return (
    <div className={`flow-node ${kindClass} ${selected ? 'selected' : ''}`}>
      <div className="flow-node-header"><div className="flow-node-kicker">{data.category}</div><div className="flow-node-title">{data.label}</div></div>
      {fieldRows.length > 0 && (
        <div className="flow-node-fields">
          {fieldRows.map(({ prop, inputPort, outputPort }, i) => {
            const label = prop?.label || inputPort?.label || outputPort?.label || '?';
            const type = prop?.type || inputPort?.type || outputPort?.type || 'any';
            const required = prop?.required || inputPort?.required || false;
            return (
              <div key={i} className="flow-node-field-row">
                {inputPort ? <Handle type="target" position={Position.Left} id={`in:${inputPort.name}`} className={`port-handle in type-${type}`} /> : <span className="port-placeholder" />}
                <span className="flow-node-field-label">{label}{required && <em className="required">*</em>}</span>
                <span className={`flow-node-field-type type-${type}`}>{type}</span>
                {outputPort ? <Handle type="source" position={Position.Right} id={`out:${outputPort.name}`} className={`port-handle out type-${type}`} /> : <span className="port-placeholder" />}
              </div>
            );
          })}
        </div>
      )}
      {fieldRows.length === 0 && <div className="flow-node-fields"><div className="flow-node-field-row"><Handle type="target" position={Position.Left} className="port-handle in type-any" /><span className="flow-node-field-label">输入</span><span className="flow-node-field-type type-any">any</span><Handle type="source" position={Position.Right} className="port-handle out type-any" /></div></div>}
      {data.error && <div className="flow-node-error">{data.error}</div>}
      {data.outputPreview && <pre className="flow-node-preview" onWheel={(e) => e.stopPropagation()}>{data.outputPreview}</pre>}
    </div>
  );
}

function SchemaField({ prop, value, onChange, connected, specId, tables, currentProps, onOpenRangeSelector, sourceInfo }: {
  prop: any; value: unknown; onChange: (name: string, val: unknown) => void; connected?: boolean;
  specId?: string; tables?: SrcTableEntry[]; currentProps?: Record<string, unknown>;
  onOpenRangeSelector?: () => void;
  sourceInfo?: { nodeLabel: string; portLabel: string; value?: unknown } | null;
}) {
  const current = value ?? prop.default ?? '';
  const disabled = !!connected;

  const portBadge = connected ? (
    <span className="port-badge" title={sourceInfo ? `← ${sourceInfo.nodeLabel}.${sourceInfo.portLabel}` : '已连接'}>
      {sourceInfo ? `← ${sourceInfo.nodeLabel}` : '已连接'}
    </span>
  ) : null;

  const connectedValueDisplay = connected && sourceInfo?.value !== undefined ? (
    <div className="port-connected-value" title={String(sourceInfo.value)}>
      {typeof sourceInfo.value === 'object' ? JSON.stringify(sourceInfo.value) : String(sourceInfo.value)}
    </div>
  ) : null;

  if (prop.type === 'boolean') return (<label className={`schema-field boolean ${disabled ? 'port-connected' : ''}`}><input type="checkbox" checked={!!current} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.checked)} /><span>{prop.label}{prop.required && <em className="required">*</em>}</span>{portBadge}{connectedValueDisplay}</label>);

  if (prop.type === 'enum') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      <select value={String(current)} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)}>{prop.enum?.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
      {connectedValueDisplay}
    </div>
  );

  if (prop.type === 'number') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      <input type="number" value={String(current)} disabled={disabled} min={prop.min} max={prop.max} onChange={(e) => onChange(prop.name, Number(e.target.value))} />
      {connectedValueDisplay}
    </div>
  );

  if (prop.type === 'color') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      <input type="color" value={String(current || '#000000')} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)} />
      {connectedValueDisplay}
    </div>
  );

  if (isStructuredProperty(prop.type, current)) return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      {connected ? connectedValueDisplay : (
        <StructuredSchemaEditor prop={prop} value={current} disabled={disabled} onCommit={(next) => onChange(prop.name, next)} />
      )}
    </div>
  );

  // ── 数据感知的下拉选择 ──────────────────────────
  const isWorksheetSelect = specId === 'generic:worksheet-select';
  const isFilePicker = specId === 'generic:file-picker';
  const isRangeSelect = specId === 'generic:range-select';
  const isGeneric = specId?.startsWith('generic:') || specId?.startsWith('func:');
  const allSheets = (tables || []).flatMap(t => t.sheets.map(s => ({ tableId: t.id, fileName: t.fileName, sheetName: s.name, label: `${t.fileName} / ${s.name}`, headers: s.headers, rowCount: s.rowCount })));
  const allFiles = (tables || []).map(t => ({ id: t.id, fileName: t.fileName, sheets: t.sheets.map(s => s.name) }));

  // 工作表选择器 → 下拉选择实际工作表
  if (isWorksheetSelect && prop.name === 'sheetName' && allSheets.length > 0) {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            <select value={String(current)} onChange={(e) => {
              onChange(prop.name, e.target.value);
              const sel = allSheets.find(s => s.sheetName === e.target.value);
              if (sel) { onChange('selectMode', 'byName'); }
            }}>
              <option value="">-- 选择工作表 --</option>
              {allSheets.map(s => <option key={`${s.tableId}:${s.sheetName}`} value={s.sheetName}>{s.label} ({s.rowCount}行)</option>)}
            </select>
            {current && (() => {
              const sel = allSheets.find(s => s.sheetName === String(current));
              return sel ? <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sel.headers.join(', ')}</div> : null;
            })()}
          </>
        )}
      </div>
    );
  }

  // 文件选择器 → 下拉选择已上传的文件
  if (isFilePicker && allFiles.length > 0 && (prop.name === 'accept' || prop.name === 'multiple')) {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            {prop.type === 'boolean' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!current} onChange={(e) => onChange(prop.name, e.target.checked)} />
                <span>{prop.label}</span>
              </label>
            ) : (
              <input type="text" value={String(current)} onChange={(e) => onChange(prop.name, e.target.value)} />
            )}
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              已上传: {allFiles.map(f => f.fileName).join(', ')}
            </div>
          </>
        )}
      </div>
    );
  }

  // 区域选择器 → 选择数据范围
  if (isRangeSelect && prop.name === 'address' && allSheets.length > 0) {
    const selectedSheet = currentProps?.sheetName ? allSheets.find(s => s.sheetName === currentProps.sheetName) : allSheets[0];
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="text" value={String(current)} placeholder="A1:C10" style={{ flex: 1 }} onChange={(e) => onChange(prop.name, e.target.value)} />
              {onOpenRangeSelector && tables && tables.length > 0 && (
                <button onClick={onOpenRangeSelector} style={{ padding: '2px 8px', fontSize: 10, border: '1px solid var(--accent)', borderRadius: 4, background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap' }}>
                  选择
                </button>
              )}
            </div>
            {selectedSheet && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                {selectedSheet.label}: {selectedSheet.headers.slice(0, 5).join(', ')}{selectedSheet.headers.length > 5 ? '...' : ''}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // 通用 string 属性 → 如果关联数据源，显示可用字段
  if (prop.name === 'sheetName' && allSheets.length > 0) {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <select value={String(current)} onChange={(e) => onChange(prop.name, e.target.value)}>
            <option value="">-- 选择 --</option>
            {allSheets.map(s => <option key={`${s.tableId}:${s.sheetName}`} value={s.sheetName}>{s.label}</option>)}
          </select>
        )}
      </div>
    );
  }

  // 默认文本输入
  return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      {disabled ? connectedValueDisplay : (
        <input type="text" value={String(current)} onChange={(e) => onChange(prop.name, e.target.value)} />
      )}
    </div>
  );
}

function StructuredSchemaEditor({ prop, value, disabled, onCommit }: {
  prop: any;
  value: unknown;
  disabled: boolean;
  onCommit: (value: unknown) => void;
}) {
  const externalText = formatStructuredProperty(
    value,
    prop.default ?? (String(prop.type).includes('[]') || prop.type === 'array' ? [] : {}),
    prop.type,
  );
  const [text, setText] = useState(externalText);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setText(externalText); setError(null); }, [externalText]);

  return (
    <div className={`structured-property-editor ${error ? 'invalid' : ''}`}>
      <CodeEditor
        value={text}
        onChange={(next) => {
          setText(next);
          const parsed = parseStructuredProperty(next, prop.type);
          setError(parsed.error || null);
          if (!parsed.error) onCommit(parsed.value);
        }}
        language="json"
        title={prop.label || prop.name}
        disabled={disabled}
        theme="light"
        height={180}
        minHeight={120}
        lineNumbers
        suggestions={jsonSuggestions}
        suggestionTriggerCharacters={['"', ':', ',', '{', '[']}
        options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
        compact
        fullscreen={!disabled}
      />
      {error && <div className="structured-property-error">JSON 无效：{error}</div>}
    </div>
  );
}

function InspectorPortSection({ ports, connectedPorts }: { ports: SchemaPort[]; connectedPorts: Set<string> }) {
  const [open, setOpen] = useState(ports.length <= 6);
  const connectedCount = ports.filter((port) => port.direction === 'input'
    ? connectedPorts.has(`in:${port.name}`)
    : port.direction === 'output'
      ? connectedPorts.has(`out:${port.name}`)
      : connectedPorts.has(`in:${port.name}`) || connectedPorts.has(`out:${port.name}`)).length;
  return (
    <section className={`inspector-section port-status ${open ? 'open' : 'collapsed'}`}>
      <button className="inspector-section-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span><b>端口</b><em>{ports.length}</em></span>
        <small>{connectedCount} 已连接</small>
        <i>{open ? '−' : '+'}</i>
      </button>
      {open && (
        <div className="port-list" role="list">
          {ports.map((port, index) => {
            const connected = port.direction === 'input'
              ? connectedPorts.has(`in:${port.name}`)
              : port.direction === 'output'
                ? connectedPorts.has(`out:${port.name}`)
                : connectedPorts.has(`in:${port.name}`) || connectedPorts.has(`out:${port.name}`);
            return (
              <div key={`${port.direction}-${port.name}-${index}`} className={`port-item ${connected ? 'connected' : 'disconnected'}`} role="listitem">
                <span className={`port-direction ${port.direction === 'output' ? 'out' : port.direction === 'both' ? 'both' : ''}`}>{port.direction === 'output' ? 'OUT' : port.direction === 'both' ? 'I/O' : 'IN'}</span>
                <span className="port-name">{port.label}</span>
                <span className="port-type">{port.type}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function CanvasPage() {
  const reactFlow = useReactFlow<FlowNode, Edge>();
  const project = useProjectStore((s) => s.project);
  const addWorkflow = useProjectStore((s) => s.addWorkflow);
  const updateWorkflow = useProjectStore((s) => s.updateWorkflow);
  const [registry, setRegistry] = useState<NodeRegistry | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [flowRunning, setFlowRunning] = useState(false);
  const [flowResult, setFlowResult] = useState<FlowExecutionResult | null>(null);
  const [rangeSelectorOpen, setRangeSelectorOpen] = useState(false);
  const [expandedOutput, setExpandedOutput] = useState<OutputPreviewTarget | null>(null);
  const [quickPicker, setQuickPicker] = useState<{
    context: NodeConnectionContext;
    clientPosition: { x: number; y: number };
    flowPosition: { x: number; y: number };
    nodeId: string;
    handleId: string;
  } | null>(null);
  const connectionStartRef = useRef<{ context: NodeConnectionContext; nodeId: string; handleId: string } | null>(null);
  const palettePointerDragRef = useRef<{ spec: FlowNodeSpec; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [paletteDragPreview, setPaletteDragPreview] = useState<{ label: string; x: number; y: number; overCanvas: boolean } | null>(null);
  const nodeSequenceRef = useRef(0);
  const nodeTypes = useMemo(() => ({ formflow: FormFlowNode }), []);

  useEffect(() => {
    loadNodeRegistry().then((reg) => {
      (globalThis as any).__formflowRegistry = reg;
      setRegistry(reg);
      const fileSpec = reg.byId.get('generic:file-picker');
      const wsSpec = reg.byId.get('generic:worksheet-select');
      const readSpec = reg.byId.get('method:XLSX.read');
      const jsonSpec = reg.byId.get('method:XLSX.utils.sheet_to_json');
      const initNodes: FlowNode[] = [];

      const srcTable = project?.srcTable || [];
      const firstFile = srcTable[0];
      const firstSheet = firstFile?.sheets[0];

      if (fileSpec) {
        const node = createNode(fileSpec, 0);
        node.id = 'generic:file-picker';
        node.position = { x: 40, y: 80 };
        if (firstFile) {
          node.data.propertiesJson = JSON.stringify({ accept: '.xlsx,.xls,.csv,.json', multiple: false, selectedFile: firstFile.fileName });
        }
        initNodes.push(node);
      }
      if (readSpec) {
        const node = createNode(readSpec, 1);
        node.id = 'method:XLSX.read';
        node.position = { x: 340, y: 80 };
        initNodes.push(node);
      }
      if (jsonSpec) {
        const node = createNode(jsonSpec, 2);
        node.id = 'method:XLSX.utils.sheet_to_json';
        node.position = { x: 620, y: 80 };
        initNodes.push(node);
      }
      if (wsSpec) {
        const node = createNode(wsSpec, 3);
        node.id = 'generic:worksheet-select';
        node.position = { x: 340, y: 260 };
        if (firstSheet) {
          node.data.propertiesJson = JSON.stringify({ selectMode: 'byName', sheetName: firstSheet.name, sheetIndex: 0 });
        }
        initNodes.push(node);
      }
      setNodes(initNodes);
      if (initNodes.length > 0) setSelectedNodeId(initNodes[0].id);
      const initEdges: Edge[] = [];
      if (fileSpec && readSpec) initEdges.push({ id: 'e-file-read', source: 'generic:file-picker', target: 'method:XLSX.read', sourceHandle: 'out:data', targetHandle: 'in:data', animated: true });
      if (readSpec && wsSpec) initEdges.push({ id: 'e-read-sheet', source: 'method:XLSX.read', target: 'generic:worksheet-select', sourceHandle: 'out:workbook', targetHandle: 'in:workbook', animated: true });
      if (wsSpec && jsonSpec) initEdges.push({ id: 'e-sheet-json', source: 'generic:worksheet-select', target: 'method:XLSX.utils.sheet_to_json', sourceHandle: 'out:worksheet', targetHandle: 'in:worksheet', animated: true });
      setEdges(initEdges);
      window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 250 }));
    });
  }, [project?.srcTable]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedRangeRef = useMemo<RangeRef | null>(() => {
    if (!selectedNode || selectedNode.data.specId !== 'generic:range-select') return null;
    try {
      const properties = JSON.parse(selectedNode.data.propertiesJson || '{}');
      return properties.rangeRef || null;
    } catch { return null; }
  }, [selectedNode]);

  const syncConnectedPorts = useCallback((nodeList: FlowNode[], edgeList: Edge[]) => {
    const portMap = new Map<string, Set<string>>();
    for (const edge of edgeList) {
      if (typeof edge.sourceHandle === 'string') { if (!portMap.has(edge.source)) portMap.set(edge.source, new Set()); portMap.get(edge.source)!.add(edge.sourceHandle); }
      if (typeof edge.targetHandle === 'string') { if (!portMap.has(edge.target)) portMap.set(edge.target, new Set()); portMap.get(edge.target)!.add(edge.targetHandle); }
    }
    return nodeList.map(node => { const next = JSON.stringify([...(portMap.get(node.id) || [])]); if (node.data.connectedPortsJson === next) return node; return { ...node, data: { ...node.data, connectedPortsJson: next } }; });
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => setNodes((c) => applyNodeChanges(changes, c)), []);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => { setEdges((c) => { const next = applyEdgeChanges(changes, c); setNodes((prev) => syncConnectedPorts(prev, next)); return next; }); }, [syncConnectedPorts]);
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
    if (connection.source === connection.target) return false;
    if (edges.some((edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle)) return false;
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    const sourceSpec = sourceNode && registry?.byId.get(sourceNode.data.specId);
    const targetSpec = targetNode && registry?.byId.get(targetNode.data.specId);
    const sourceName = connection.sourceHandle.replace(/^out:/, '');
    const targetName = connection.targetHandle.replace(/^in:/, '');
    const sourcePort = sourceSpec?.ports.find((port) => port.name === sourceName && (port.direction === 'output' || port.direction === 'both'));
    const targetPort = targetSpec?.ports.find((port) => port.name === targetName && (port.direction === 'input' || port.direction === 'both'));
    return !!sourcePort && !!targetPort && portTypesCompatible(sourcePort.type, targetPort.type);
  }, [edges, nodes, registry]);
  const onConnect = useCallback((connection: Connection) => { if (!isValidConnection(connection)) return; setEdges((c) => { const next = addEdge({ ...connection, animated: true }, c); setNodes((prev) => syncConnectedPorts(prev, next)); return next; }); }, [isValidConnection, syncConnectedPorts]);

  const addSpecNode = useCallback((spec: FlowNodeSpec, requestedPosition?: { x: number; y: number }) => {
    const sequence = nodeSequenceRef.current++;
    const basePosition = requestedPosition || reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const offset = (sequence % 6) * 18;
    const node = createNode(spec, nodes.length + sequence, { x: basePosition.x + offset, y: basePosition.y + offset });
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    window.dispatchEvent(new CustomEvent('formflow:node-used', { detail: spec.id }));
    return node;
  }, [nodes.length, reactFlow]);

  const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: 'source' | 'target' | null }) => {
    if (!params.nodeId || !params.handleId || !params.handleType || !registry) return;
    if (params.handleType === 'target' && edges.some((edge) => edge.target === params.nodeId && edge.targetHandle === params.handleId)) return;
    const node = nodes.find((item) => item.id === params.nodeId);
    const spec = node && registry.byId.get(node.data.specId);
    const portName = params.handleId.replace(/^(in|out):/, '');
    const port = spec?.ports.find((item) => item.name === portName && (params.handleType === 'source'
      ? item.direction === 'output' || item.direction === 'both'
      : item.direction === 'input' || item.direction === 'both'));
    if (!port) return;
    connectionStartRef.current = {
      context: { direction: params.handleType === 'source' ? 'from-output' : 'to-input', port, nodeId: params.nodeId },
      nodeId: params.nodeId,
      handleId: params.handleId,
    };
  }, [nodes, edges, registry]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: { toNode: unknown | null }) => {
    const start = connectionStartRef.current;
    connectionStartRef.current = null;
    if (!start || connectionState.toNode) return;
    const point = 'changedTouches' in event && event.changedTouches.length > 0 ? event.changedTouches[0] : event as MouseEvent;
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.react-flow__pane')) return;
    const clientPosition = { x: point.clientX, y: point.clientY };
    setQuickPicker({ ...start, clientPosition, flowPosition: reactFlow.screenToFlowPosition(clientPosition) });
  }, [reactFlow]);

  const chooseQuickNode = useCallback((spec: FlowNodeSpec, port: SchemaPort) => {
    if (!quickPicker) return;
    const node = addSpecNode(spec, quickPicker.flowPosition);
    const connection: Connection = createQuickNodeConnection(quickPicker.context, quickPicker.nodeId, quickPicker.handleId, node.id, port);
    setEdges((current) => {
      const next = addEdge({ ...connection, animated: true }, current);
      setNodes((nodeList) => syncConnectedPorts(nodeList, next));
      return next;
    });
    setQuickPicker(null);
  }, [quickPicker, addSpecNode, syncConnectedPorts]);

  const startPalettePointerDrag = useCallback((spec: FlowNodeSpec, event: React.PointerEvent) => {
    palettePointerDragRef.current = { spec, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  }, []);

  const movePalettePointerDrag = useCallback((event: React.PointerEvent) => {
    const drag = palettePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 6) return;
    drag.moved = true;
    const overCanvas = !!document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__pane');
    setPaletteDragPreview({ label: drag.spec.label, x: event.clientX, y: event.clientY, overCanvas });
    event.preventDefault();
  }, []);

  const finishPalettePointerDrag = useCallback((event: React.PointerEvent) => {
    const drag = palettePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved && document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__pane')) {
      addSpecNode(drag.spec, reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    }
    palettePointerDragRef.current = null;
    setPaletteDragPreview(null);
  }, [addSpecNode, reactFlow]);

  const cancelPalettePointerDrag = useCallback(() => {
    palettePointerDragRef.current = null;
    setPaletteDragPreview(null);
  }, []);

  const updateNodeData = useCallback((nodeId: string, patch: Partial<FlowNodeData>) => { setNodes((c) => c.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)); }, []);

  const runNode = useCallback(async (node: FlowNode) => {
    try {
      const result = await executeFlow(
        nodes.map((item) => ({ id: item.id, specId: item.data.specId, position: item.position, data: item.data })),
        edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? undefined, targetHandle: edge.targetHandle ?? undefined })),
        project?.srcTable || [],
        { targetNodeId: node.id },
      );
      setFlowResult(result);
      setNodes((current) => current.map((item) => {
        const executed = result.nodeResults.get(item.id);
        return executed ? { ...item, data: { ...item.data, outputs: executed.outputs, outputPreview: undefined, error: executed.error } } : item;
      }));
    } catch (error) {
      updateNodeData(node.id, { error: error instanceof Error ? error.message : String(error) });
    }
  }, [nodes, edges, project, updateNodeData]);

  const connectedPorts = useMemo(() => {
    const c = new Set<string>();
    for (const e of edges) {
      if (e.source === selectedNodeId && typeof e.sourceHandle === 'string') c.add(e.sourceHandle);
      if (e.target === selectedNodeId && typeof e.targetHandle === 'string') c.add(e.targetHandle);
    }
    return c;
  }, [edges, selectedNodeId]);

  const connectedSourceMap = useMemo(() => {
    const map = new Map<string, { nodeLabel: string; portLabel: string; value?: unknown }>();
    if (!selectedNodeId || !registry) return map;
    for (const e of edges) {
      if (e.target !== selectedNodeId || typeof e.targetHandle !== 'string') continue;
      const portName = e.targetHandle.replace(/^in:/, '');
      const sourceNode = nodes.find(n => n.id === e.source);
      if (!sourceNode) continue;
      const sourceSpec = registry.byId.get(sourceNode.data.specId);
      const sourcePortName = (e.sourceHandle || '').replace(/^out:/, '');
      const sourcePort = sourceSpec?.ports.find(p => p.name === sourcePortName);
      const outputVal = sourceNode.data.outputs?.[sourcePortName];
      map.set(portName, {
        nodeLabel: sourceNode.data.label,
        portLabel: sourcePort?.label || sourcePortName,
        value: outputVal,
      });
    }
    return map;
  }, [edges, selectedNodeId, nodes, registry]);

  const saveWorkflow = useCallback(() => {
    const wfData = { nodes: nodes.map((n) => ({ id: n.id, type: n.type || 'formflow', specId: n.data.specId, position: n.position, data: n.data })), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || '', targetHandle: e.targetHandle || '' })) };
    if (currentWorkflowId) {
      updateWorkflow(currentWorkflowId, wfData);
    } else {
      const now = new Date().toISOString();
      const wf = { id: `wf_${Date.now()}`, name: `流程 ${project?.workflows.length || 0 + 1}`, description: '', ...wfData, createdAt: now, updatedAt: now };
      addWorkflow(wf);
      setCurrentWorkflowId(wf.id);
    }
  }, [nodes, edges, currentWorkflowId, project, addWorkflow, updateWorkflow]);

  const loadWorkflow = useCallback((wfId: string) => {
    const wf = project?.workflows.find((w) => w.id === wfId);
    if (!wf || !registry) return;
    const loadedNodes: FlowNode[] = (wf.nodes || []).map((n: any) => {
      const spec = registry.byId.get(n.specId);
      if (!spec) return null;
      return { id: n.id, type: 'formflow', position: n.position, data: { specId: n.specId, label: spec.label, kind: spec.kind, category: spec.category, description: spec.description, propertiesJson: JSON.stringify(n.data?.propertiesJson ? JSON.parse(n.data.propertiesJson) : {}), connectedPortsJson: '[]' } };
    }).filter(Boolean) as FlowNode[];
    const loadedEdges: Edge[] = (wf.edges || []).map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, animated: true }));
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setCurrentWorkflowId(wf.id);
    if (loadedNodes.length > 0) setSelectedNodeId(loadedNodes[0].id);
  }, [project, registry]);

  const runFlow = useCallback(async () => {
    setFlowRunning(true);
    setFlowResult(null);
    try {
      const result = await executeFlow(
        nodes.map((n) => ({ id: n.id, specId: n.data.specId, position: n.position, data: n.data })),
        edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined })),
        project?.srcTable || [],
      );
      setFlowResult(result);
      setNodes((prev) => prev.map((n) => {
        const nr = result.nodeResults.get(n.id);
        if (!nr) return n;
        const error = nr.error;

        let updatedData: Partial<FlowNodeData> = { outputs: nr.outputs, outputPreview: undefined, error };

        if (nr.success && n.data.specId === 'method:XLSX.utils.sheet_to_json') {
          const autoHeader = (nr.outputs as any)?.__autoHeader;
          if (autoHeader && Array.isArray(autoHeader) && autoHeader.length > 0) {
            try {
              const currentProps = JSON.parse(n.data.propertiesJson || '{}');
              if (!currentProps.header || (Array.isArray(currentProps.header) && currentProps.header.length === 0)) {
                currentProps.header = autoHeader;
                updatedData.propertiesJson = JSON.stringify(currentProps);
              }
            } catch {}
          }
        }

        if (nr.success && n.data.specId === 'generic:worksheet-select') {
          const headers = (nr.outputs as any)?.headers;
          if (headers && Array.isArray(headers)) {
            try {
              const currentProps = JSON.parse(n.data.propertiesJson || '{}');
              if (!currentProps.headers || currentProps.headers.length === 0) {
                currentProps.headers = headers;
                updatedData.propertiesJson = JSON.stringify(currentProps);
              }
            } catch {}
          }
        }

        return { ...n, data: { ...n.data, ...updatedData } };
      }));
    } catch (e) {
      setFlowResult({
        success: false,
        nodeResults: new Map(),
        finalOutputs: {},
        sideEffects: [],
        errors: [e instanceof Error ? e.message : String(e)],
        totalDuration: 0,
      });
    }
    setFlowRunning(false);
  }, [nodes, edges, project]);

  const handleRangeConfirm = useCallback((ref: RangeRef) => {
    if (selectedNode) {
      const currentProps = (() => { try { return JSON.parse(selectedNode.data.propertiesJson || '{}'); } catch { return {}; } })();
      updateNodeData(selectedNode.id, {
        propertiesJson: JSON.stringify({
          ...currentProps,
          address: rangeToAddress(ref),
          sheetName: ref.sheetName,
          rangeMode: 'address',
          rangeRef: ref,
        }),
      });
    }
    setRangeSelectorOpen(false);
  }, [selectedNode, updateNodeData]);

  if (!registry) return <div className="loading-splash"><div className="loading-spinner" /><p>加载中…</p></div>;

  return (
    <div className="canvas-layout" onPointerMove={movePalettePointerDrag} onPointerUp={finishPalettePointerDrag} onPointerCancel={cancelPalettePointerDrag}>
      {paletteOpen && (
        <NodePalette
          specs={registry.specs}
          tables={project?.srcTable || []}
          selectedSpec={selectedNode ? registry.byId.get(selectedNode.data.specId) : undefined}
          onAdd={addSpecNode}
          onPointerDragStart={startPalettePointerDrag}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {!paletteOpen && <button className="palette-toggle" onClick={() => setPaletteOpen(true)}>☰</button>}

      <section className="canvas-flow">
        <div className="canvas-toolbar">
          <span>流程: {project?.workflows.length || 0} 个</span>
          {currentWorkflowId && <span className="workflow-id">当前: {project?.workflows.find((w) => w.id === currentWorkflowId)?.name}</span>}
          <button onClick={saveWorkflow}>保存流程</button>
          <select onChange={(e) => e.target.value && loadWorkflow(e.target.value)}>
            <option value="">加载流程…</option>
            {(project?.workflows || []).map((wf) => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
          </select>
          <button className="primary" onClick={runFlow} disabled={flowRunning || nodes.length === 0}>
            {flowRunning ? '执行中…' : '▶ 运行流程'}
          </button>
          {flowResult && (
            <span style={{ fontSize: 11, color: flowResult.success ? '#16a34a' : 'var(--danger)' }}>
              {flowResult.success ? `✓ 完成 (${flowResult.totalDuration}ms)` : `✗ 失败 (${flowResult.errors.length} 错误)`}
            </span>
          )}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onNodeClick={(_e, n) => setSelectedNodeId(n.id)}
          fitView
        >
          <Background /><MiniMap pannable zoomable /><Controls />
        </ReactFlow>
      </section>

      {selectedNode && registry && (() => {
        const spec = registry.byId.get(selectedNode.data.specId);
        const props = spec?.properties || [];
        const ports = spec?.ports || [];
        const currentProps: Record<string, unknown> = (() => { try { return JSON.parse(selectedNode.data.propertiesJson || '{}'); } catch { return {}; } })();
        const updateProp = (name: string, val: unknown) => { updateNodeData(selectedNode.id, { propertiesJson: JSON.stringify({ ...currentProps, [name]: val }) }); };

        const isWorksheetSelect = selectedNode.data.specId === 'generic:worksheet-select';
        const isDataNode = selectedNode.data.specId.startsWith('generic:') || selectedNode.data.specId.startsWith('func:');
        const selectedSheetName = String(currentProps.sheetName || '');
        const matchedSheet = (project?.srcTable || []).flatMap(t => t.sheets.map(s => ({ ...s, fileName: t.fileName, tableId: t.id }))).find(s => s.name === selectedSheetName);
        const showDataPreview = isWorksheetSelect && matchedSheet;

        return (
          <aside className="canvas-inspector">
            <div className="inspector-head"><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.description}</p></div>
            <div className="inspector-scroll">
              {props.length > 0 && (
                <section className="inspector-section schema-config">
                  <div className="inspector-section-title"><h4>配置</h4><span>{props.length} 项</span></div>
                  <div className="schema-fields">{props.map((p: any) => <SchemaField key={p.name} prop={p} value={currentProps[p.name]} onChange={updateProp} connected={connectedPorts.has(`in:${p.name}`)} specId={selectedNode.data.specId} tables={project?.srcTable || []} currentProps={currentProps} onOpenRangeSelector={() => setRangeSelectorOpen(true)} sourceInfo={connectedSourceMap.get(p.name)} />)}</div>
                </section>
              )}
              <div className="inspector-run-bar"><button className="primary" onClick={() => runNode(selectedNode)}>从最上游运行到此节点</button></div>
              {ports.length > 0 && <InspectorPortSection key={selectedNode.id} ports={ports} connectedPorts={connectedPorts} />}

              {showDataPreview && matchedSheet && (
                <section className="inspector-section data-preview-section">
                  <div className="inspector-section-title"><h4>数据预览</h4><span>{matchedSheet.rowCount.toLocaleString()} 行</span></div>
                  <div className="data-preview-card">
                    <div><b>{selectedSheetName}</b><span>{matchedSheet.fileName} · {matchedSheet.rowCount.toLocaleString()}行 × {matchedSheet.colCount}列</span></div>
                    <div className="data-preview-fields">{matchedSheet.headers.slice(0, 8).map((header) => <span key={header}>{header}</span>)}{matchedSheet.headers.length > 8 && <span>+{matchedSheet.headers.length - 8}</span>}</div>
                    <button onClick={() => setExpandedOutput({
                      key: `source:${matchedSheet.tableId}:${matchedSheet.name}`,
                      type: 'worksheet',
                      label: `${matchedSheet.fileName} / ${matchedSheet.name}`,
                      value: { __fromProject: true, tableId: matchedSheet.tableId, sheetName: matchedSheet.name, headers: matchedSheet.headers, preview: matchedSheet.preview, rowCount: matchedSheet.rowCount, colCount: matchedSheet.colCount },
                    })}>打开完整预览</button>
                  </div>
                </section>
              )}

              {!showDataPreview && (project?.srcTable || []).length > 0 && isDataNode && (
                <section className="inspector-section data-preview-section">
                  <div className="inspector-section-title"><h4>可用数据源</h4><span>{(project?.srcTable || []).reduce((sum, table) => sum + table.sheets.length, 0)} 个表</span></div>
                  <div className="data-source-list">
                    {(project?.srcTable || []).flatMap((table) => table.sheets.map((sheet) => ({ table, sheet }))).map(({ table, sheet }) => (
                      <button key={`${table.id}:${sheet.name}`} className="data-source-row" onClick={() => setExpandedOutput({
                        key: `source:${table.id}:${sheet.name}`,
                        type: 'worksheet',
                        label: `${table.fileName} / ${sheet.name}`,
                        value: { __fromProject: true, tableId: table.id, sheetName: sheet.name, headers: sheet.headers, preview: sheet.preview, rowCount: sheet.rowCount, colCount: sheet.colCount },
                      })}>
                        <span><b>{sheet.name}</b><small>{table.fileName}</small></span><em>{sheet.rowCount.toLocaleString()} × {sheet.colCount}</em><i>↗</i>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {selectedNode.data.error && <div className="result-box error"><h4>错误</h4><pre>{selectedNode.data.error}</pre></div>}
              {selectedNode.data.outputs && Object.keys(selectedNode.data.outputs).length > 0 && (
                <div className="result-box">
                  <div className="inspector-section-title"><h4>输出</h4><span>{Object.keys(selectedNode.data.outputs).filter((key) => !key.startsWith('__')).length} 项</span></div>
                  <div className="output-ports">
                    {Object.entries(selectedNode.data.outputs).map(([key, val]) => {
                      if (key.startsWith('__')) return null;
                      const portDef = ports.find((p: any) => p.name === key);
                      const portType = portDef?.type || 'any';
                      const fileName = String(selectedNode.data.outputs?.fileName || 'output.xlsx');
                      const mimeType = String(selectedNode.data.outputs?.mimeType || 'application/octet-stream');
                      return (
                        <div key={key} className="output-port-row">
                          <div className="output-port-row-head">
                            <span className="output-port-name">{portDef?.label || key}</span>
                            <span className="output-port-type">{portType}</span>
                            {portType === 'file-data' && (typeof val === 'string' || val instanceof ArrayBuffer || ArrayBuffer.isView(val) || val instanceof Blob) && <button className="output-download-btn" title="下载文件" onClick={() => downloadFileData(val, fileName, mimeType)}>↓</button>}
                            <button className="output-expand-btn" title="弹窗预览" onClick={() => setExpandedOutput({ key, type: portType, value: val, label: portDef?.label || key, fileName, mimeType })}>⤢</button>
                          </div>
                          <div className="output-port-value"><TypeDisplayer type={portType} value={val} compact /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedNode.data.outputPreview && <div className="result-box"><h4>输出</h4><pre>{selectedNode.data.outputPreview}</pre></div>}
            </div>
          </aside>
        );
      })()}

      {rangeSelectorOpen && (project?.srcTable || []).length > 0 && (
        <RangeSelector
          tables={project?.srcTable || []}
          value={selectedRangeRef}
          onConfirm={handleRangeConfirm}
          onCancel={() => setRangeSelectorOpen(false)}
        />
      )}

      {quickPicker && (
        <QuickNodePicker
          specs={registry.specs}
          context={quickPicker.context}
          clientPosition={quickPicker.clientPosition}
          onChoose={chooseQuickNode}
          onClose={() => setQuickPicker(null)}
        />
      )}

      {paletteDragPreview && (
        <div
          className={`palette-drag-preview ${paletteDragPreview.overCanvas ? 'over-canvas' : ''}`}
          style={{ left: paletteDragPreview.x, top: paletteDragPreview.y }}
        >
          <span>＋</span>{paletteDragPreview.label}
        </div>
      )}

      <OutputPreviewModal target={expandedOutput} onClose={() => setExpandedOutput(null)} onDownload={downloadFileData} />
    </div>
  );
}

export function CanvasWithProvider() {
  return <ReactFlowProvider><CanvasPage /></ReactFlowProvider>;
}
