import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { loadNodeRegistry, resolveMethod, type FlowNodeSpec, type NodeRegistry, type SchemaPort } from '../flowRegistry';
import { useProjectStore } from '../project/store';
import { executeFlow, type FlowExecutionResult, type NodeExecutionResult } from '../services/flowEngine';
import { rangeToAddress } from '../services/rangeResolver';
import type { SrcTableEntry } from '../project/types';
import type { RangeRef } from '../models';
import RangeSelector from '../components/RangeSelector';
import TypeDisplayer from '../components/TypeDisplayer';
import CodeEditor from '../components/CodeEditor';
import { jsonSuggestions } from '../components/codeEditorSuggestions';

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

function createNode(spec: FlowNodeSpec, index: number): FlowNode {
  return { id: `${spec.id}:${Date.now()}:${index}`, type: 'formflow', position: { x: 120 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 180 }, data: nodeDataFromSpec(spec) };
}

function safePreview(value: unknown) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return '[Function]';
  if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
  try { return JSON.stringify(value, (_k, v) => typeof v === 'function' ? '[Function]' : v, 2).slice(0, 2000); } catch { return String(value).slice(0, 2000); }
}

function FormFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const kindClass = data.kind === 'scenario' ? 'scenario' : data.kind === 'excel-class' ? 'excel-class' : data.kind === 'generic' ? 'generic' : data.kind === 'behavior' ? 'behavior' : 'method';
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
      {data.outputPreview && <pre className="flow-node-preview">{data.outputPreview}</pre>}
    </div>
  );
}

function SchemaField({ prop, value, onChange, connected, specId, tables, currentProps, onOpenRangeSelector }: {
  prop: any; value: unknown; onChange: (name: string, val: unknown) => void; connected?: boolean;
  specId?: string; tables?: SrcTableEntry[]; currentProps?: Record<string, unknown>;
  onOpenRangeSelector?: () => void;
}) {
  const current = value ?? prop.default ?? '';
  const disabled = !!connected;
  const updateJsonValue = (next: string) => {
    try { onChange(prop.name, JSON.parse(next)); } catch { onChange(prop.name, next); }
  };

  if (prop.type === 'boolean') return (<label className={`schema-field boolean ${disabled ? 'port-connected' : ''}`}><input type="checkbox" checked={!!current} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.checked)} /><span>{prop.label}{prop.required && <em className="required">*</em>}</span>{connected && <span className="port-badge">已连接</span>}</label>);

  if (prop.type === 'enum') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
      <select value={String(current)} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)}>{prop.enum?.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>
    </div>
  );

  if (prop.type === 'number') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
      <input type="number" value={String(current)} disabled={disabled} min={prop.min} max={prop.max} onChange={(e) => onChange(prop.name, Number(e.target.value))} />
    </div>
  );

  if (prop.type === 'color') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
      <input type="color" value={String(current || '#000000')} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)} />
    </div>
  );

  if (prop.type === 'array' || prop.type === 'object') return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
      <CodeEditor
        value={typeof current === 'string' ? current : JSON.stringify(current, null, 2)}
        onChange={updateJsonValue}
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
        <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
        <select value={String(current)} disabled={disabled} onChange={(e) => {
          onChange(prop.name, e.target.value);
          const sel = allSheets.find(s => s.sheetName === e.target.value);
          if (sel) {
            onChange('selectMode', 'byName');
          }
        }}>
          <option value="">-- 选择工作表 --</option>
          {allSheets.map(s => <option key={`${s.tableId}:${s.sheetName}`} value={s.sheetName}>{s.label} ({s.rowCount}行)</option>)}
        </select>
        {current && (() => {
          const sel = allSheets.find(s => s.sheetName === String(current));
          return sel ? <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sel.headers.join(', ')}</div> : null;
        })()}
      </div>
    );
  }

  // 文件选择器 → 下拉选择已上传的文件
  if (isFilePicker && allFiles.length > 0 && (prop.name === 'accept' || prop.name === 'multiple')) {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
        {prop.type === 'boolean' ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!current} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.checked)} />
            <span>{prop.label}</span>
          </label>
        ) : (
          <input type="text" value={String(current)} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)} />
        )}
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          已上传: {allFiles.map(f => f.fileName).join(', ')}
        </div>
      </div>
    );
  }

  // 区域选择器 → 选择数据范围
  if (isRangeSelect && prop.name === 'address' && allSheets.length > 0) {
    const selectedSheet = currentProps?.sheetName ? allSheets.find(s => s.sheetName === currentProps.sheetName) : allSheets[0];
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <input type="text" value={String(current)} disabled={disabled} placeholder="A1:C10" style={{ flex: 1 }} onChange={(e) => onChange(prop.name, e.target.value)} />
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
      </div>
    );
  }

  // 通用 string 属性 → 如果关联数据源，显示可用字段
  if (prop.name === 'sheetName' && allSheets.length > 0) {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
        <select value={String(current)} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)}>
          <option value="">-- 选择 --</option>
          {allSheets.map(s => <option key={`${s.tableId}:${s.sheetName}`} value={s.sheetName}>{s.label}</option>)}
        </select>
      </div>
    );
  }

  // 默认文本输入
  return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{connected && <span className="port-badge">已连接</span>}</span>
      <input type="text" value={String(current)} disabled={disabled} onChange={(e) => onChange(prop.name, e.target.value)} />
    </div>
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
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<string>('all');
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [flowRunning, setFlowRunning] = useState(false);
  const [flowResult, setFlowResult] = useState<FlowExecutionResult | null>(null);
  const [rangeSelectorOpen, setRangeSelectorOpen] = useState(false);
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
      if (fileSpec && readSpec) initEdges.push({ id: 'e-file-read', source: 'generic:file-picker', target: 'method:XLSX.read', sourceHandle: 'out:data', targetHandle: 'in:_args', animated: true });
      setEdges(initEdges);
      window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 250 }));
    });
  }, [project?.srcTable]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const syncConnectedPorts = useCallback((nodeList: FlowNode[], edgeList: Edge[]) => {
    const portMap = new Map<string, Set<string>>();
    for (const edge of edgeList) {
      if (typeof edge.sourceHandle === 'string') { const name = edge.sourceHandle.replace('out:', ''); if (!portMap.has(edge.source)) portMap.set(edge.source, new Set()); portMap.get(edge.source)!.add(name); }
      if (typeof edge.targetHandle === 'string') { const name = edge.targetHandle.replace('in:', ''); if (!portMap.has(edge.target)) portMap.set(edge.target, new Set()); portMap.get(edge.target)!.add(name); }
    }
    return nodeList.map(node => { const ports = portMap.get(node.id); if (!ports) return node; const next = JSON.stringify([...ports]); if (node.data.connectedPortsJson === next) return node; return { ...node, data: { ...node.data, connectedPortsJson: next } }; });
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => setNodes((c) => applyNodeChanges(changes, c)), []);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => { setEdges((c) => { const next = applyEdgeChanges(changes, c); setNodes((prev) => syncConnectedPorts(prev, next)); return next; }); }, [syncConnectedPorts]);
  const onConnect = useCallback((connection: Connection) => { setEdges((c) => { const next = addEdge({ ...connection, animated: true }, c); setNodes((prev) => syncConnectedPorts(prev, next)); return next; }); }, [syncConnectedPorts]);

  const addSpecNode = useCallback((spec: FlowNodeSpec) => { setNodes((c) => { const n = createNode(spec, c.length); setSelectedNodeId(n.id); return [...c, n]; }); }, []);

  const updateNodeData = useCallback((nodeId: string, patch: Partial<FlowNodeData>) => { setNodes((c) => c.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)); }, []);

  const runNode = useCallback(async (node: FlowNode) => {
    if (!registry) return;
    const spec = registry.byId.get(node.data.specId);
    if (!spec) return;

    if (node.data.specId === 'generic:worksheet-select') {
      const props = (() => { try { return JSON.parse(node.data.propertiesJson || '{}'); } catch { return {}; } })();
      const sheetName = String(props.sheetName || '');
      const allSheets = (project?.srcTable || []).flatMap(t => t.sheets.map(s => ({ tableId: t.id, fileName: t.fileName, ...s })));
      const matched = allSheets.find(s => s.name === sheetName) || allSheets[0];
      if (matched) {
        updateNodeData(node.id, {
          outputs: {
            worksheet: { __fromProject: true, tableId: matched.tableId, sheetName: matched.name, headers: matched.headers, preview: matched.preview, rowCount: matched.rowCount, colCount: matched.colCount },
            sheetNames: allSheets.filter(s => s.tableId === matched.tableId).map(s => s.name),
            headers: matched.headers,
          },
          outputPreview: undefined,
          error: undefined,
        });
      } else {
        updateNodeData(node.id, { error: '未找到匹配的工作表，请先上传数据' });
      }
      return;
    }

    if (node.data.specId === 'method:XLSX.utils.sheet_to_json') {
      const props = (() => { try { return JSON.parse(node.data.propertiesJson || '{}'); } catch { return {}; } })();
      const allSheets = (project?.srcTable || []).flatMap(t => t.sheets.map(s => ({ tableId: t.id, fileName: t.fileName, ...s })));
      const headerArr = Array.isArray(props.header) ? props.header : [];
      const matched = allSheets.length > 0 ? allSheets[0] : null;
      if (matched) {
        const rows = matched.preview;
        const headers = headerArr.length > 0 ? headerArr : matched.headers;
        updateNodeData(node.id, {
          outputs: { rows, headers },
          outputPreview: undefined,
          error: undefined,
        });
        try {
          const currentProps = JSON.parse(node.data.propertiesJson || '{}');
          if (!currentProps.header || (Array.isArray(currentProps.header) && currentProps.header.length === 0)) {
            currentProps.header = matched.headers;
            updateNodeData(node.id, { propertiesJson: JSON.stringify(currentProps) });
          }
        } catch {}
      } else {
        updateNodeData(node.id, { error: '无数据，请先上传数据或连接工作表选择器' });
      }
      return;
    }

    if (spec.kind === 'scenario' || spec.kind === 'generic' || spec.kind === 'behavior') {
      // 使用执行器执行节点
      try {
        const { getExecutor } = await import('../../nodes/executor-registry');
        const executor = getExecutor(node.data.specId);
        if (executor) {
          const props = (() => { try { return JSON.parse(node.data.propertiesJson || '{}'); } catch { return {}; } })();
          const ctx = {
            inputs: {},
            properties: props,
            tables: project?.srcTable || [],
            getNodeOutput: () => ({}),
            checkType: (t: string, v: unknown) => ({ valid: true, normalized: v }),
            assertType: (t: string, v: unknown) => v,
          };
          const result = await executor(ctx);
          if (result.error) {
            updateNodeData(node.id, { error: String(result.error), outputPreview: undefined, outputs: undefined });
          } else {
            updateNodeData(node.id, { outputs: result, outputPreview: undefined, error: undefined });
          }
        } else {
          updateNodeData(node.id, { outputPreview: `${spec.label} · ${spec.description}`, error: undefined });
        }
      } catch (e) {
        updateNodeData(node.id, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    if (spec.kind === 'excel-class') {
      updateNodeData(node.id, { outputPreview: `Excel API · ${spec.label}`, error: undefined });
      return;
    }

    const methodName = spec.id.replace('method:', '');
    const method = resolveMethod(methodName);
    if (!method) { updateNodeData(node.id, { error: '没有找到对应方法。' }); return; }
    try {
      const props = JSON.parse(node.data.propertiesJson || '{}');
      const args = props._args ? (Array.isArray(props._args) ? props._args : [props._args]) : [];
      const result = method(...args);
      updateNodeData(node.id, { outputPreview: safePreview(result), error: undefined });
    } catch (e) { updateNodeData(node.id, { error: e instanceof Error ? e.message : String(e) }); }
  }, [registry, updateNodeData, project]);

  const connectedPorts = useMemo(() => {
    const c = new Set<string>();
    for (const e of edges) {
      if (e.source === selectedNodeId && typeof e.sourceHandle === 'string') c.add(e.sourceHandle.replace('out:', ''));
      if (e.target === selectedNodeId && typeof e.targetHandle === 'string') c.add(e.targetHandle.replace('in:', ''));
    }
    return c;
  }, [edges, selectedNodeId]);

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
        }),
      });
    }
    setRangeSelectorOpen(false);
  }, [selectedNode, updateNodeData]);

  if (!registry) return <div className="loading-splash"><div className="loading-spinner" /><p>加载中…</p></div>;

  const allSpecs = registry.specs;
  const visibleSpecs = allSpecs.filter((s) => {
    if (mode !== 'all' && s.kind !== mode) return false;
    if (query) {
      const q = query.toLowerCase();
      const searchable = [s.label, s.category, s.description, ...(s.keywords || []), s.originalName || ''].join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
  const groups: Record<string, FlowNodeSpec[]> = {};
  for (const s of visibleSpecs) { (groups[s.category] = groups[s.category] || []).push(s); }

  return (
    <div className="canvas-layout">
      {paletteOpen && (
        <aside className="canvas-palette">
          <div className="palette-header"><span>节点面板</span><button onClick={() => setPaletteOpen(false)}>×</button></div>
          <input className="palette-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索节点…" />
          <div className="palette-filters">
            {[['all', '全部'], ['generic', '输入输出'], ['xlsx-method', '功能'], ['excel-class', 'API'], ['behavior', '行为'], ['scenario', '场景']].map(([v, l]) => (
              <button key={v} className={mode === v ? 'active' : ''} onClick={() => setMode(v)}>{l}</button>
            ))}
          </div>
          {(project?.srcTable || []).length > 0 && (
            <div className="palette-data-source">
              <h3>数据源</h3>
              {(project?.srcTable || []).map(t => (
                <div key={t.id} className="palette-data-file">
                  <span className="palette-data-file-name">{t.fileName}</span>
                  {t.sheets.map(s => (
                    <span key={s.name} className="palette-data-sheet">
                      {s.name} <small>{s.rowCount}×{s.colCount}</small>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="palette-list">
            {Object.entries(groups).map(([cat, specs]) => (
              <section key={cat}><h2>{cat}</h2>
                {specs.map((s) => (
                  <button key={s.id} className="palette-item" onClick={() => addSpecNode(s)}>
                    <span>{s.label}</span>
                    <div className="palette-item-tooltip">
                      <div className="tooltip-title">{s.label}</div>
                      {s.originalName && <div className="tooltip-original">{s.originalName}</div>}
                      <div className="tooltip-desc">{s.description}</div>
                      <div className="tooltip-meta">
                        <span>{s.ports.filter(p => p.direction === 'input').length} 入 / {s.ports.filter(p => p.direction === 'output').length} 出</span>
                        <span>{s.properties.length} 配置</span>
                      </div>
                      {s.keywords && s.keywords.length > 0 && (
                        <div className="tooltip-keywords">
                          {s.keywords.map((k, i) => <span key={i} className="tooltip-kw">{k}</span>)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>
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
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_e, n) => setSelectedNodeId(n.id)} fitView>
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
            {ports.length > 0 && <div className="port-status"><h4>端口</h4><div className="port-list">{ports.map((p, i) => <div key={`${p.direction}-${p.name}-${i}`} className={`port-item ${connectedPorts.has(p.name) ? 'connected' : 'disconnected'}`}><span className={`port-direction ${p.direction === 'output' ? 'out' : ''}`}>{p.direction === 'output' ? 'OUT' : 'IN'}</span><span className="port-name">{p.label}</span><span className="port-type">{p.type}</span></div>)}</div></div>}
            {props.length > 0 && <div className="schema-config"><h4>配置</h4><div className="schema-fields">{props.map((p: any) => <SchemaField key={p.name} prop={p} value={currentProps[p.name]} onChange={updateProp} connected={connectedPorts.has(p.name)} specId={selectedNode.data.specId} tables={project?.srcTable || []} currentProps={currentProps} onOpenRangeSelector={() => setRangeSelectorOpen(true)} />)}</div>{spec?.kind !== 'scenario' && <button className="primary" onClick={() => runNode(selectedNode)}>运行</button>}</div>}

            {showDataPreview && matchedSheet && (
              <div className="data-preview-section">
                <h4>数据预览 · {selectedSheetName}</h4>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
                  {matchedSheet.fileName} · {matchedSheet.rowCount}行 × {matchedSheet.colCount}列
                </div>
                <div style={{ overflow: 'auto', maxHeight: 200, border: '1px solid var(--line)', borderRadius: 4 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr>
                        {matchedSheet.headers.slice(0, 8).map((h, i) => (
                          <th key={i} style={{ padding: '3px 6px', background: 'var(--panel)', borderBottom: '1px solid var(--line)', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }}>{h}</th>
                        ))}
                        {matchedSheet.headers.length > 8 && <th style={{ padding: '3px 6px', background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>...</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {matchedSheet.preview.slice(0, 10).map((row, ri) => (
                        <tr key={ri}>
                          {matchedSheet.headers.slice(0, 8).map((h, ci) => (
                            <td key={ci} style={{ padding: '3px 6px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[h] ?? '')}</td>
                          ))}
                          {matchedSheet.headers.length > 8 && <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--line)' }}>...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!showDataPreview && (project?.srcTable || []).length > 0 && isDataNode && (
              <div className="data-preview-section">
                <h4>可用数据源</h4>
                {(project?.srcTable || []).map(t => (
                  <div key={t.id} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{t.fileName}</div>
                    {t.sheets.map(s => (
                      <div key={s.name} style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 8 }}>
                        {s.name} · {s.rowCount}行 × {s.colCount}列 · {s.headers.slice(0, 3).join(', ')}{s.headers.length > 3 ? '...' : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {selectedNode.data.error && <div className="result-box error"><h4>错误</h4><pre>{selectedNode.data.error}</pre></div>}
            {selectedNode.data.outputs && Object.keys(selectedNode.data.outputs).length > 0 && (
              <div className="result-box">
                <h4>输出</h4>
                <div className="output-ports">
                  {Object.entries(selectedNode.data.outputs).map(([key, val]) => {
                    if (key.startsWith('__')) return null;
                    const portDef = ports.find((p: any) => p.name === key);
                    const portType = portDef?.type || 'any';
                    return (
                      <div key={key} className="output-port-row">
                        <span className="output-port-name">{portDef?.label || key}</span>
                        <span className="output-port-type">{portType}</span>
                        <div className="output-port-value">
                          <TypeDisplayer type={portType} value={val} compact />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedNode.data.outputPreview && <div className="result-box"><h4>输出</h4><pre>{selectedNode.data.outputPreview}</pre></div>}
          </aside>
        );
      })()}

      {rangeSelectorOpen && (project?.srcTable || []).length > 0 && (
        <RangeSelector
          tables={project?.srcTable || []}
          value={null}
          onConfirm={handleRangeConfirm}
          onCancel={() => setRangeSelectorOpen(false)}
        />
      )}
    </div>
  );
}

export function CanvasWithProvider() {
  return <ReactFlowProvider><CanvasPage /></ReactFlowProvider>;
}
