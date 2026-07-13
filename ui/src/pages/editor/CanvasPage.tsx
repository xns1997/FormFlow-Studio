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
import { loadNodeRegistry, type FlowNodeSpec, type NodeRegistry, type SchemaPort } from '../../flowRegistry';
import { useProjectStore } from '../../project/store';
import { executeFlow, type FlowExecutionResult } from '../../services/engine/flowEngine';
import { rangeToAddress } from '../../services/data/rangeResolver';
import type { SrcTableEntry } from '../../project/types';
import type { RangeRef } from '../../models';
import RangeSelector from '../../components/RangeSelector';
import TypeDisplayer from '../../components/TypeDisplayer';
import OutputPreviewModal, { type OutputPreviewTarget } from '../../components/OutputPreviewModal';
import Modal, { ModalHeader } from '../../components/Modal';
import CodeEditor from '../../components/CodeEditor';
import { createCustomJsNodeExtraLib, createCustomJsNodeSuggestions, formatCustomJsPortMap, getNodeEffectivePorts, isCustomJsNodeSpec, parseCustomJsPortDefinitions, resolveNodeProperties, toCustomJsPortMap } from '../../services/config/customJsNode';
import { formatStructuredProperty, isStructuredProperty, parseStructuredProperty } from '../../services/data/structuredProperties';
import { jsonSuggestions } from '../../components/codeEditorSuggestions';
import NodePalette, { QuickNodePicker } from '../../components/NodePalette';
import { createQuickNodeConnection, portTypesCompatible, type NodeConnectionContext } from '../../services/config/nodeDiscovery';
import { createWorkflowIoScaffold, ensureWorkflowIo } from '../../services/engine/workflowIo';
import { layoutWorkflow, type LayoutDiagnostics, type MeasuredNodeBox } from '../../services/layout';
import { createRemovedWorkflowNodeSpec, isRemovedWorkflowNode } from '../../services/engine/removedWorkflowNodes';

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
  debugActive?: boolean;
};

type FlowNode = Node<FlowNodeData>;
type ToolbarLogLevel = 'info' | 'success' | 'warning' | 'error';
type ToolbarLogSource = 'layout' | 'save' | 'run' | 'export';

type ToolbarLogEntry = {
  id: string;
  message: string;
  level: ToolbarLogLevel;
  createdAt: string;
  source: ToolbarLogSource;
};

const INPUT_OVERRIDE_KEY = '__inputOverrides';
const MAX_TOOLBAR_LOGS = 50;

function formatToolbarLogTime(value: Date) {
  return value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getToolbarLogLevelLabel(level: ToolbarLogLevel) {
  switch (level) {
    case 'success':
      return '成功';
    case 'warning':
      return '警告';
    case 'error':
      return '错误';
    default:
      return '信息';
  }
}

function getToolbarLogSourceLabel(source: ToolbarLogSource) {
  switch (source) {
    case 'layout':
      return '自动整理';
    case 'save':
      return '保存';
    case 'run':
      return '运行';
    case 'export':
      return '导出';
    default:
      return source;
  }
}

function nodeDataFromSpec(spec: FlowNodeSpec): FlowNodeData {
  return { specId: spec.id, label: spec.label, kind: spec.kind, category: spec.category, description: spec.description, propertiesJson: '{}', connectedPortsJson: '[]' };
}

function getInputOverrides(properties: Record<string, unknown>) {
  const raw = properties[INPUT_OVERRIDE_KEY];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function getInputSelections(properties: Record<string, unknown>) {
  const raw = properties.__inputSelections;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, string>
    : {};
}

function setInputOverride(properties: Record<string, unknown>, portName: string, value: unknown) {
  const current = getInputOverrides(properties);
  const next = { ...current };
  if (value === undefined) delete next[portName];
  else next[portName] = value;
  if (Object.keys(next).length === 0) {
    return Object.fromEntries(Object.entries(properties).filter(([key]) => key !== INPUT_OVERRIDE_KEY));
  }
  return { ...properties, [INPUT_OVERRIDE_KEY]: next };
}

function setInputSelection(properties: Record<string, unknown>, portName: string, edgeId: string | undefined) {
  const current = getInputSelections(properties);
  const next = { ...current };
  if (!edgeId) delete next[portName];
  else next[portName] = edgeId;
  const withoutSelections = Object.fromEntries(Object.entries(properties).filter(([key]) => key !== '__inputSelections'));
  if (Object.keys(next).length === 0) return withoutSelections;
  return { ...withoutSelections, __inputSelections: next };
}

function normalizeSheetKey(tableId: string, sheetName: string) {
  return `${tableId}::${sheetName}`;
}

function getLogicalEdgeKey(edge: Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>) {
  return `${edge.source}::${edge.sourceHandle || ''}=>${edge.target}::${edge.targetHandle || ''}`;
}

function dedupeEdges<T extends Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>>(edgeList: T[]) {
  const seen = new Set<string>();
  return edgeList.filter((edge) => {
    const key = getLogicalEdgeKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isStructuredInputType(type: string) {
  return ['any', 'json', 'object', 'array', 'json-rows', 'filter', 'sort-config', 'validation-rule', 'style'].includes(type);
}

function supportsProjectSheetInput(port: SchemaPort) {
  if (port.type === 'worksheet' || port.type === 'workbook' || port.type === 'json-rows') return true;
  if (port.type === 'array') {
    return /data|rows|records|items|list/i.test(port.name);
  }
  if (port.type === 'any') {
    return /data|rows|records|items|list|source|table|sheet/i.test(port.name);
  }
  return false;
}

function buildProjectSheetValue(port: SchemaPort, table: SrcTableEntry, sheet: SrcTableEntry['sheets'][number]) {
  const worksheet = {
    __fromProject: true,
    tableId: table.id,
    sheetName: sheet.name,
    headers: sheet.headers,
    preview: sheet.preview,
    rowCount: sheet.rowCount,
    colCount: sheet.colCount,
  };
  if (port.type === 'worksheet' || port.type === 'workbook') return worksheet;
  if (port.type === 'json-rows') return worksheet;
  if (port.type === 'array') return sheet.preview;
  if (port.type === 'any') return sheet.preview;
  return undefined;
}

function createNode(spec: FlowNodeSpec, index: number, position?: { x: number; y: number }): FlowNode {
  return {
    id: `${spec.id}:${Date.now()}:${index}`,
    type: 'formflow',
    position: position || { x: 120 + (index % 4) * 280, y: 120 + Math.floor(index / 4) * 180 },
    data: nodeDataFromSpec(spec),
  };
}

function resolveCanvasNodeSpec(registry: NodeRegistry | null | undefined, specId: string): FlowNodeSpec | undefined {
  return registry?.byId.get(specId) || (isRemovedWorkflowNode(specId) ? createRemovedWorkflowNodeSpec(specId) : undefined);
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

const PORT_TYPE_OPTIONS = ['string', 'number', 'boolean', 'object', 'array', 'json', 'any', 'trigger'];

function PortTableEditor({ value, onChange, disabled }: { value: unknown; onChange: (val: string) => void; disabled?: boolean }) {
  const parseRows = useCallback((source: unknown) => {
    if (typeof source === 'string' && source.trim()) {
      try {
        const arr = JSON.parse(source);
        if (Array.isArray(arr)) {
          return arr
            .filter((row: any) => row && typeof row.name === 'string')
            .map((row: any) => ({
              name: String(row.name || ''),
              label: String(row.label || row.name || ''),
              type: String(row.type || 'any'),
              description: String(row.description || ''),
            }));
        }
      } catch {}
    }
    return [] as Array<{ name: string; label: string; type: string; description: string }>;
  }, []);

  const rows = useMemo(() => parseRows(value), [value, parseRows]);
  const externalText = typeof value === 'string' && value.trim() ? value : JSON.stringify(rows, null, 2);
  const [mode, setMode] = useState<'table' | 'json'>('table');
  const [rawText, setRawText] = useState(externalText);
  const [rawError, setRawError] = useState<string | null>(null);

  useEffect(() => {
    setRawText(externalText);
    setRawError(null);
  }, [externalText]);

  const commit = useCallback((next: Array<{ name: string; label: string; type: string; description: string }>) => {
    onChange(JSON.stringify(next));
  }, [onChange]);

  const updateRow = useCallback((idx: number, field: string, val: string) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    commit(next);
  }, [rows, commit]);

  const addRow = useCallback(() => {
    const n = rows.length + 1;
    commit([...rows, { name: `port_${n}`, label: `端口${n}`, type: 'any', description: '' }]);
  }, [rows, commit]);

  const removeRow = useCallback((idx: number) => {
    commit(rows.filter((_, i) => i !== idx));
  }, [rows, commit]);

  return (
    <div className="port-table-editor">
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button type="button" className={mode === 'table' ? 'active' : ''} onClick={() => setMode('table')}>表格</button>
          <button type="button" className={mode === 'json' ? 'active' : ''} onClick={() => setMode('json')}>JSON</button>
        </div>
      )}
      {mode === 'json' ? (
        <div className={`structured-property-editor ${rawError ? 'invalid' : ''}`}>
          <CodeEditor
            value={rawText}
            onChange={(next) => {
              setRawText(next);
              try {
                const parsed = JSON.parse(next);
                if (!Array.isArray(parsed)) {
                  setRawError('字段定义必须是数组');
                  return;
                }
                setRawError(null);
              } catch {
                setRawError('JSON 无效');
              }
            }}
            onBlur={() => {
              if (disabled || rawError) return;
              onChange(rawText.trim() ? rawText : '[]');
            }}
            language="json"
            theme="light"
            height={220}
            minHeight={140}
            disabled={disabled}
            lineNumbers
            compact
            fullscreen={!disabled}
          />
          {rawError && <div className="structured-property-error">{rawError}</div>}
        </div>
      ) : (
        <>
          <table>
            <thead><tr><th>名称</th><th>标签</th><th>类型</th><th>说明</th><th /></tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td><input type="text" value={row.name} disabled={disabled} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="name" /></td>
                  <td><input type="text" value={row.label} disabled={disabled} onChange={(e) => updateRow(i, 'label', e.target.value)} placeholder="标签" /></td>
                  <td>
                    <select value={row.type || 'any'} disabled={disabled} onChange={(e) => updateRow(i, 'type', e.target.value)}>
                      {PORT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td><input type="text" value={row.description || ''} disabled={disabled} onChange={(e) => updateRow(i, 'description', e.target.value)} placeholder="说明" /></td>
                  <td>{!disabled && <button type="button" onClick={() => removeRow(i)} className="port-table-remove">×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!disabled && (
            <button type="button" onClick={addRow} className="port-table-add">+ 添加端口</button>
          )}
        </>
      )}
    </div>
  );
}

function FormFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const kindClass = data.kind === 'scenario' ? 'scenario' : data.kind === 'generic' ? 'generic' : data.kind === 'behavior' ? 'behavior' : 'method';
  const spec = resolveCanvasNodeSpec((globalThis as any).__formflowRegistry as NodeRegistry | undefined, data.specId);
  const properties = spec?.properties || [];
  const nodeProps = useMemo(() => resolveNodeProperties(spec, data.propertiesJson), [spec, data.propertiesJson]);

  const ports = useMemo(() => {
    return getNodeEffectivePorts(spec, nodeProps);
  }, [spec, nodeProps]);

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
    <div className={`flow-node ${kindClass} ${selected ? 'selected' : ''} ${data.debugActive ? 'debug-active' : ''}`}>
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

const SchemaField = React.memo(function SchemaField({ prop, value, onChange, connected, specId, tables, currentProps, onOpenRangeSelector, sourceInfo }: {
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

  if (prop.type === 'port-definition') return (
    <div className={`schema-field port-definition ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      {isCustomJsNodeSpec(specId) ? (
        <StructuredSchemaEditor
          prop={{ ...prop, type: 'object' }}
          value={toCustomJsPortMap(current)}
          disabled={disabled}
          editorPath={`canvas://${specId || 'node'}/${prop.name}.json`}
          onCommit={(next) => onChange(prop.name, JSON.stringify(next))}
        />
      ) : (
        <PortTableEditor value={current} onChange={(val) => onChange(prop.name, val)} disabled={disabled} />
      )}
      {connectedValueDisplay}
    </div>
  );

  if (prop.type === 'code') {
    const inputDefs = parseCustomJsPortDefinitions(currentProps?.inputPorts);
    const outputDefs = parseCustomJsPortDefinitions(currentProps?.outputPorts);
    return (
      <div className={`schema-field code-editor ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        <CodeEditor
          value={String(current ?? prop.default ?? '')}
          onChange={(val) => onChange(prop.name, val)}
          language="javascript"
          path={`canvas://${specId || 'node'}/${prop.name}.js`}
          theme="light"
          height={220}
          minHeight={140}
          disabled={disabled}
          lineNumbers
          compact
          fullscreen={!disabled}
          autoSuggestPolicy="explicit"
          suggestions={isCustomJsNodeSpec(specId) ? createCustomJsNodeSuggestions(inputDefs, outputDefs) : undefined}
          suggestionTriggerCharacters={['.', "'", '"', '(', '$']}
          extraLibs={isCustomJsNodeSpec(specId) ? [createCustomJsNodeExtraLib('ts:custom-js-node.d.ts', inputDefs, outputDefs)] : undefined}
        />
        {isCustomJsNodeSpec(specId) && (
          <div className="structured-property-hint">
            可直接使用 inputs.xxx / properties，并按传出定义 return {'{'} ... {'}'}。
          </div>
        )}
        {connectedValueDisplay}
      </div>
    );
  }

  if (isStructuredProperty(prop.type, current)) return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      {connected ? connectedValueDisplay : (
        <StructuredSchemaEditor
          prop={prop}
          value={current}
          disabled={disabled}
          editorPath={`canvas://${specId || 'node'}/${prop.name}.json`}
          onCommit={(next) => onChange(prop.name, next)}
        />
      )}
    </div>
  );

  // ── 数据感知的下拉选择 ──────────────────────────
  const isSheetSource = specId === 'generic:sheet-source';
  const isFileSource = specId === 'generic:file-source';
  const isValueInput = specId === 'generic:value-input';
  const isGeneric = specId?.startsWith('generic:') || specId?.startsWith('func:');
  const allSheets = (tables || []).flatMap(t => t.sheets.map(s => ({ tableId: t.id, fileName: t.fileName, sheetName: s.name, label: `${t.fileName} / ${s.name}`, headers: s.headers, rowCount: s.rowCount })));
  const allFiles = (tables || []).map(t => ({ id: t.id, fileName: t.fileName, sheets: t.sheets.map(s => s.name) }));

  // 表与区域来源 → 下拉选择实际工作表
  if (isSheetSource && prop.name === 'sheetName' && allSheets.length > 0) {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            <select value={String(current)} onChange={(e) => {
              onChange(prop.name, e.target.value);
              const sel = allSheets.find(s => s.sheetName === e.target.value);
              if (sel) { onChange('worksheetMode', 'byName'); }
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

  // 文件来源 → 下拉选择已上传的文件
  if (isFileSource && allFiles.length > 0 && prop.name === 'selectedFile') {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            <select value={String(current)} onChange={(e) => onChange(prop.name, e.target.value)}>
              <option value="">-- 自动选择第一个文件 --</option>
              {allFiles.map((file) => <option key={file.id} value={file.fileName}>{file.fileName}</option>)}
            </select>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              未连线时优先从项目文件中选择；运行时仍可由输入口覆盖。
            </div>
          </>
        )}
      </div>
    );
  }

  if (isFileSource && allFiles.length > 0 && (prop.name === 'accept' || prop.name === 'multiple')) {
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

  // 区域来源 → 选择数据范围
  if (isSheetSource && currentProps?.sourceMode === 'range' && prop.name === 'address' && allSheets.length > 0) {
    const selectedSheet = currentProps?.sheetName ? allSheets.find(s => s.sheetName === currentProps.sheetName) : allSheets[0];
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="text" value={String(current)} placeholder="A1:C10" style={{ flex: 1 }} onChange={(e) => onChange(prop.name, e.target.value)} />
              {onOpenRangeSelector && tables && tables.length > 0 && (
                <button type="button" className="ui-btn ui-btn-primary ui-btn-xs" onClick={onOpenRangeSelector} style={{ whiteSpace: 'nowrap' }}>
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

  if (isValueInput && prop.name === 'value' && currentProps?.valueType === 'boolean') {
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!!current} onChange={(e) => onChange(prop.name, e.target.checked)} />
            <span>{!!current ? 'true' : 'false'}</span>
          </label>
        )}
      </div>
    );
  }

  // 通用 string 属性 → 如果关联数据源，显示可用字段
  if (prop.name === 'sheetName' && allSheets.length > 0) {
    const currentSheet = allSheets.find((s) => s.sheetName === String(current) && (!currentProps?.tableId || currentProps.tableId === s.tableId));
    return (
      <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
        <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
        {disabled ? connectedValueDisplay : (
          <>
            <select
              value={currentSheet ? normalizeSheetKey(currentSheet.tableId, currentSheet.sheetName) : ''}
              onChange={(e) => {
                const selected = allSheets.find((s) => normalizeSheetKey(s.tableId, s.sheetName) === e.target.value);
                if (!selected) {
                  onChange(prop.name, '');
                  if (currentProps && 'tableId' in currentProps) onChange('tableId', '');
                  return;
                }
                onChange(prop.name, selected.sheetName);
                onChange('tableId', selected.tableId);
              }}
            >
              <option value="">-- 选择 --</option>
              {allSheets.map(s => <option key={`${s.tableId}:${s.sheetName}`} value={normalizeSheetKey(s.tableId, s.sheetName)}>{s.label}</option>)}
            </select>
            {currentSheet && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>来源文件: {currentSheet.fileName}</div>}
          </>
        )}
      </div>
    );
  }

  // 默认字符串输入
  return (
    <div className={`schema-field ${disabled ? 'port-connected' : ''}`}>
      <span>{prop.label}{prop.required && <em className="required">*</em>}{portBadge}</span>
      {disabled ? connectedValueDisplay : (
        <input type="text" value={String(current)} onChange={(e) => onChange(prop.name, e.target.value)} />
      )}
    </div>
  );
});

function StructuredSchemaEditor({ prop, value, disabled, editorPath, onCommit }: {
  prop: any;
  value: unknown;
  disabled: boolean;
  editorPath?: string;
  onCommit: (value: unknown) => void;
}) {
  const externalText = formatStructuredProperty(
    value,
    prop.default ?? (String(prop.type).includes('[]') || prop.type === 'array' ? [] : {}),
    prop.type,
  );
  const [text, setText] = useState(externalText);
  const [error, setError] = useState<string | null>(null);
  const pendingValueRef = useRef<unknown>(value);
  const committedTextRef = useRef(externalText);

  useEffect(() => {
    setText(externalText);
    setError(null);
    pendingValueRef.current = value;
    committedTextRef.current = externalText;
  }, [externalText, value]);

  return (
    <div className={`structured-property-editor ${error ? 'invalid' : ''}`}>
      <CodeEditor
        path={editorPath}
        value={text}
        onChange={(next) => {
          setText(next);
          const parsed = parseStructuredProperty(next, prop.type);
          setError(parsed.error || null);
          if (!parsed.error) pendingValueRef.current = parsed.value;
        }}
        onBlur={() => {
          if (disabled || error || text === committedTextRef.current) return;
          onCommit(pendingValueRef.current);
          committedTextRef.current = text;
        }}
        language="json"
        title={prop.label || prop.name}
        disabled={disabled}
        theme="light"
        height={180}
        minHeight={120}
        lineNumbers
        suggestions={jsonSuggestions}
        autoSuggestPolicy="json-contextual"
        suggestionTriggerCharacters={['"', ':', ',', '{', '[']}
        options={{ folding: true, lineNumbersMinChars: 2, scrollbar: { vertical: 'hidden', horizontal: 'auto' } }}
        compact
        fullscreen={!disabled}
      />
      {error && <div className="structured-property-error">JSON 无效：{error}</div>}
    </div>
  );
}

function InputPortEditor({
  port,
  value,
  fallbackValue,
  connected,
  sourceInfos,
  selectedEdgeId,
  hasPropertyEditor,
  tables,
  onChange,
  onJumpToSource,
  onSelectSource,
}: {
  port: SchemaPort;
  value: unknown;
  fallbackValue: unknown;
  connected: boolean;
  sourceInfos?: Array<{
    edgeId: string;
    nodeId: string;
    nodeLabel: string;
    portLabel: string;
    value?: unknown;
    summary?: string;
  }>;
  selectedEdgeId?: string;
  hasPropertyEditor: boolean;
  tables: SrcTableEntry[];
  onChange: (value: unknown) => void;
  onJumpToSource: (nodeId: string) => void;
  onSelectSource: (edgeId: string | undefined) => void;
}) {
  const effectiveValue = value !== undefined ? value : fallbackValue;
  const sheetOptions = useMemo(
    () => tables.flatMap((table) => table.sheets.map((sheet) => ({ table, sheet }))),
    [tables],
  );
  const selectedSourceKey = useMemo(() => {
    if (!effectiveValue || typeof effectiveValue !== 'object') return '';
    const source = effectiveValue as any;
    if (source.__fromProject && source.tableId && source.sheetName) {
      return normalizeSheetKey(String(source.tableId), String(source.sheetName));
    }
    return '';
  }, [effectiveValue]);
  const activeSource = useMemo(() => {
    if (!sourceInfos?.length) return undefined;
    return sourceInfos.find((item) => item.edgeId === selectedEdgeId) || sourceInfos[sourceInfos.length - 1];
  }, [sourceInfos, selectedEdgeId]);

  const renderEditor = () => {
    if (port.type === 'boolean') {
      return <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={!!effectiveValue} onChange={(e) => onChange(e.target.checked)} /><span>启用</span></label>;
    }

    if (port.type === 'number') {
      return <input type="number" value={effectiveValue == null ? '' : String(effectiveValue)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    }

    if (supportsProjectSheetInput(port) && sheetOptions.length > 0) {
      return (
        <>
          <select
            value={selectedSourceKey}
            onChange={(event) => {
              const selected = sheetOptions.find(({ table, sheet }) => normalizeSheetKey(table.id, sheet.name) === event.target.value);
              onChange(selected ? buildProjectSheetValue(port, selected.table, selected.sheet) : undefined);
            }}
          >
            <option value="">-- 选表 --</option>
            {sheetOptions.map(({ table, sheet }) => (
              <option key={normalizeSheetKey(table.id, sheet.name)} value={normalizeSheetKey(table.id, sheet.name)}>
                {table.fileName} / {sheet.name}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            未连线时可在这里直接选表；一旦接入上游连线，运行时优先使用连线数据。
          </div>
        </>
      );
    }

    if (isStructuredInputType(port.type)) {
      return (
        <StructuredSchemaEditor
          prop={{ ...port, default: port.type === 'array' || port.type === 'json-rows' ? [] : {} }}
          value={effectiveValue}
          disabled={false}
          editorPath={`input-override:${port.name}`}
          onCommit={onChange}
        />
      );
    }

    return <input type="text" value={effectiveValue == null ? '' : String(effectiveValue)} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />;
  };

  return (
    <div className={`schema-field ${connected ? 'port-connected' : ''}`}>
      <span>{port.label}{port.required && <em className="required">*</em>}<small style={{ marginLeft: 6, color: 'var(--muted)' }}>{port.type}</small></span>
      {connected ? (
        <div className="connected-port-value">
          {sourceInfos && sourceInfos.length > 1 ? (
            <>
              <select
                value={activeSource?.edgeId || ''}
                onChange={(event) => onSelectSource(event.target.value || undefined)}
              >
                {sourceInfos.map((item) => (
                  <option key={item.edgeId} value={item.edgeId}>
                    {item.nodeLabel} · {item.portLabel}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                已连接 {sourceInfos.length} 路来源，当前执行使用下拉所选这一条。
              </div>
            </>
          ) : (
            <div><strong>{activeSource?.nodeLabel || '上游节点'}</strong> · {activeSource?.portLabel || port.name}</div>
          )}
          {activeSource?.summary && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{activeSource.summary}</div>}
          <button type="button" className="ui-btn ui-btn-xs" onClick={() => activeSource && onJumpToSource(activeSource.nodeId)} style={{ marginTop: 6 }}>
            跳到上游节点
          </button>
        </div>
      ) : (
        <>
          {renderEditor()}
          {hasPropertyEditor && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              当前输入口与上方“配置”同名。未单独覆盖时沿用配置值；在这里填写后，仅覆盖这个输入口。
            </div>
          )}
        </>
      )}
      {!connected && value !== undefined && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
          <TypeDisplayer type={port.type} value={value} compact />
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-xs" onClick={() => onChange(undefined)}>清空</button>
        </div>
      )}
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
  const [debugNodeId, setDebugNodeId] = useState<string | null>(null);
  const [stepResults, setStepResults] = useState<Map<string, import('../../services/engine/flowEngine').NodeExecutionResult>>(new Map());
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
  const [toolbarLogs, setToolbarLogs] = useState<ToolbarLogEntry[]>([]);
  const [showToolbarLogModal, setShowToolbarLogModal] = useState(false);
  const nodeSequenceRef = useRef(0);
  const nodeTypes = useMemo(() => ({ formflow: FormFlowNode }), []);
  const latestToolbarLog = toolbarLogs[0] || null;

  useEffect(() => {
    loadNodeRegistry().then((reg) => {
      (globalThis as any).__formflowRegistry = reg;
      setRegistry(reg);
      const scaffold = createWorkflowIoScaffold();
      const initNodes: FlowNode[] = scaffold.nodes.map((node) => {
        const spec = resolveCanvasNodeSpec(reg, node.specId);
        return spec ? {
          id: node.id,
          type: 'formflow',
          position: node.position,
          data: {
            specId: node.specId,
            label: spec.label,
            kind: spec.kind,
            category: spec.category,
            description: spec.description,
            propertiesJson: typeof node.data?.propertiesJson === 'string' ? node.data.propertiesJson : '{}',
            connectedPortsJson: '[]',
          },
        } : null;
      }).filter(Boolean) as FlowNode[];
      setNodes(initNodes);
      if (initNodes.length > 0) setSelectedNodeId(initNodes[0].id);
      setEdges([]);
      window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 250 }));
    });
  }, [project?.srcTable]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedRangeRef = useMemo<RangeRef | null>(() => {
    if (!selectedNode || selectedNode.data.specId !== 'generic:sheet-source') return null;
    try {
      const properties = JSON.parse(selectedNode.data.propertiesJson || '{}');
      if (properties.sourceMode !== 'range') return null;
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
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => { setEdges((c) => { const next = dedupeEdges(applyEdgeChanges(changes, c)); setNodes((prev) => syncConnectedPorts(prev, next)); return next; }); }, [syncConnectedPorts]);
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
    if (connection.source === connection.target) return false;
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    const sourceSpec = sourceNode && registry?.byId.get(sourceNode.data.specId);
    const targetSpec = targetNode && registry?.byId.get(targetNode.data.specId);
    const sourcePorts = getNodeEffectivePorts(sourceSpec, resolveNodeProperties(sourceSpec, sourceNode?.data.propertiesJson));
    const targetPorts = getNodeEffectivePorts(targetSpec, resolveNodeProperties(targetSpec, targetNode?.data.propertiesJson));
    const sourceName = connection.sourceHandle.replace(/^out:/, '');
    const targetName = connection.targetHandle.replace(/^in:/, '');
    const sourcePort = sourcePorts.find((port) => port.name === sourceName && (port.direction === 'output' || port.direction === 'both'));
    const targetPort = targetPorts.find((port) => port.name === targetName && (port.direction === 'input' || port.direction === 'both'));
    return !!sourcePort && !!targetPort && portTypesCompatible(sourcePort.type, targetPort.type);
  }, [edges, nodes, registry]);
  const onConnect = useCallback((connection: Connection) => {
    if (!isValidConnection(connection)) return;
    setEdges((c) => {
      const next = dedupeEdges(addEdge({ ...connection, animated: true, type: 'smoothstep' }, c));
      setNodes((prev) => syncConnectedPorts(prev, next));
      return next;
    });
  }, [isValidConnection, syncConnectedPorts]);

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
    const node = nodes.find((item) => item.id === params.nodeId);
    const spec = node && registry.byId.get(node.data.specId);
    const ports = getNodeEffectivePorts(spec, resolveNodeProperties(spec, node?.data.propertiesJson));
    const portName = params.handleId.replace(/^(in|out):/, '');
    const port = ports.find((item) => item.name === portName && (params.handleType === 'source'
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
      const next = dedupeEdges(addEdge({ ...connection, animated: true, type: 'smoothstep' }, current));
      setNodes((nodeList) => syncConnectedPorts(nodeList, next));
      return next;
    });
    setQuickPicker(null);
  }, [quickPicker, addSpecNode, syncConnectedPorts]);

  const formatLayoutNotice = useCallback((diagnostics: LayoutDiagnostics, count: number) => {
    const overlapDelta = Math.max(0, diagnostics.overlapCountBefore - diagnostics.overlapCountAfter);
    const crossingDelta = Math.max(0, diagnostics.edgeCrossingsBefore - diagnostics.edgeCrossingsAfter);
    const warningText = diagnostics.warnings[0] ? ` · ${diagnostics.warnings[0]}` : '';
    return `已整理 ${count} 个节点，消除 ${overlapDelta} 处重叠，减少 ${crossingDelta} 处交叉${warningText}`;
  }, []);

  const appendToolbarLog = useCallback((entry: Omit<ToolbarLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => {
    const now = new Date();
    const nextEntry: ToolbarLogEntry = {
      id: entry.id || `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: entry.createdAt || now.toISOString(),
      level: entry.level,
      message: entry.message,
      source: entry.source,
    };
    setToolbarLogs((current) => [nextEntry, ...current].slice(0, MAX_TOOLBAR_LOGS));
  }, []);

  const handleAutoLayout = useCallback(() => {
    const measuredNodes: MeasuredNodeBox[] = nodes.map((node) => {
      const runtimeNode = reactFlow.getNode(node.id);
      const width = Number((runtimeNode as any)?.measured?.width || runtimeNode?.width || 220);
      const height = Number((runtimeNode as any)?.measured?.height || runtimeNode?.height || 140);
      return { id: node.id, width, height };
    });
    const workflow = {
      nodes: nodes.map((node) => ({ id: node.id, type: node.type || 'formflow', specId: node.data.specId, position: node.position, data: node.data })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      })),
    };
    const result = layoutWorkflow(workflow, measuredNodes);
    const byId = new Map(result.nodes.map((node) => [node.id, node] as const));
    setNodes((current) => current.map((node) => {
      const laidOut = byId.get(node.id);
      return laidOut ? { ...node, position: laidOut.position } : node;
    }));
    setEdges((current) => current.map((edge) => ({ ...edge, type: result.edgeType, animated: true })));
    appendToolbarLog({
      level: result.diagnostics.warnings.length > 0 ? 'warning' : 'success',
      message: formatLayoutNotice(result.diagnostics, nodes.length),
      source: 'layout',
    });
    window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 250 }));
  }, [nodes, edges, reactFlow, formatLayoutNotice, appendToolbarLog]);

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
  const srcTables = useMemo(() => project?.srcTable || [], [project?.srcTable]);

  const connectedSourceMap = useMemo(() => {
    const map = new Map<string, Array<{ edgeId: string; nodeId: string; nodeLabel: string; portLabel: string; value?: unknown; summary?: string }>>();
    const seenByPort = new Map<string, Set<string>>();
    if (!selectedNodeId || !registry) return map;
    for (const e of edges) {
      if (e.target !== selectedNodeId || typeof e.targetHandle !== 'string') continue;
      const portName = e.targetHandle.replace(/^in:/, '');
      const seenKeys = seenByPort.get(portName) || new Set<string>();
      const logicalKey = getLogicalEdgeKey(e);
      if (seenKeys.has(logicalKey)) continue;
      seenKeys.add(logicalKey);
      seenByPort.set(portName, seenKeys);
      const sourceNode = nodes.find(n => n.id === e.source);
      if (!sourceNode) continue;
      const sourceSpec = resolveCanvasNodeSpec(registry, sourceNode.data.specId);
      const sourcePorts = getNodeEffectivePorts(sourceSpec, resolveNodeProperties(sourceSpec, sourceNode.data.propertiesJson));
      const sourcePortName = (e.sourceHandle || '').replace(/^out:/, '');
      const sourcePort = sourcePorts.find((p) => p.name === sourcePortName);
      const outputVal = sourceNode.data.outputs?.[sourcePortName];
      const sourceProps = resolveNodeProperties(sourceSpec, sourceNode.data.propertiesJson);
      const sourceTable = srcTables.find((table) => table.id === sourceProps.tableId);
      const sourceSheetName = String(sourceProps.sheetName || '');
      const list = map.get(portName) || [];
      list.push({
        edgeId: e.id,
        nodeId: sourceNode.id,
        nodeLabel: sourceNode.data.label,
        portLabel: sourcePort?.label || sourcePortName,
        value: outputVal,
        summary: sourceTable && sourceSheetName
          ? `${sourceTable.fileName} / ${sourceSheetName}`
          : sourceSheetName
            ? `Sheet: ${sourceSheetName}`
            : undefined,
      });
      map.set(portName, list);
    }
    return map;
  }, [edges, selectedNodeId, nodes, registry, srcTables]);

  const saveWorkflow = useCallback(() => {
    const wfData = ensureWorkflowIo({
      id: currentWorkflowId || `wf_${Date.now()}`,
      name: '',
      description: '',
      nodes: nodes.map((n) => ({ id: n.id, type: n.type || 'formflow', specId: n.data.specId, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || '', targetHandle: e.targetHandle || '' })),
      createdAt: '',
      updatedAt: '',
    }).workflow;
    if (currentWorkflowId) {
      // Save version history
      const current = project?.workflows.find((w) => w.id === currentWorkflowId);
      const existingVersions = current?.versions || [];
      const newVersion = { timestamp: new Date().toISOString(), label: `v${existingVersions.length + 1}`, nodes: current?.nodes || [], edges: current?.edges || [] };
      const versions = [...existingVersions, newVersion].slice(-20); // Keep last 20
      updateWorkflow(currentWorkflowId, { nodes: wfData.nodes, edges: wfData.edges, versions });
    } else {
      const now = new Date().toISOString();
      const wf = { id: `wf_${Date.now()}`, name: `流程 ${project?.workflows.length || 0 + 1}`, description: '', nodes: wfData.nodes, edges: wfData.edges, versions: [], createdAt: now, updatedAt: now };
      addWorkflow(wf);
      setCurrentWorkflowId(wf.id);
    }
  }, [nodes, edges, currentWorkflowId, project, addWorkflow, updateWorkflow]);

  const exportAsJson = useCallback(() => {
    const data = { nodes: nodes.map(n => ({ id: n.id, specId: n.data.specId, position: n.position, data: n.data })), edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `flow_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const exportAsHtml = useCallback(() => {
    const flowData = { nodes: nodes.map(n => ({ id: n.id, specId: n.data.specId, label: n.data.label, position: n.position })), edges: edges.map(e => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })) };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>FormFlow - ${project?.config.name || 'Flow'}</title>
<style>body{font-family:-apple-system,sans-serif;margin:20px;background:#f5f5f7}h1{font-size:20px;margin-bottom:4px}.meta{color:#666;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}th{background:#f1f5f9;text-align:left;padding:8px 12px;border-bottom:2px solid #e2e8f0;font-weight:600}td{padding:6px 12px;border-bottom:1px solid #e5e7eb}tr:hover{background:#f8fafc}.node{display:inline-block;padding:4px 10px;margin:2px;border-radius:6px;font-size:11px;font-weight:500}.kind-generic{background:#dbeafe;color:#1e40af}.kind-behavior{background:#f3e8ff;color:#7c3aed}.kind-xlsx-method{background:#dcfce7;color:#166534}.kind-scenario{background:#ecfdf5;color:#0f766e}svg{max-width:100%;height:auto}</style></head><body>
<h1>${project?.config.name || 'FormFlow'}</h1>
<div class="meta">Generated ${new Date().toLocaleString()} · ${flowData.nodes.length} nodes · ${flowData.edges.length} edges</div>
<h2>Nodes</h2><table><thead><tr><th>ID</th><th>Label</th><th>Kind</th><th>Spec</th><th>Position</th></tr></thead><tbody>
${flowData.nodes.map(n => `<tr><td><code>${n.id}</code></td><td>${n.label}</td><td><span class="node kind-${n.specId.split(':')[0]}">${n.specId.split(':')[0]}</span></td><td><code>${n.specId}</code></td><td>(${Math.round(n.position.x)}, ${Math.round(n.position.y)})</td></tr>`).join('')}
</tbody></table>
<h2>Edges</h2><table><thead><tr><th>Source</th><th>Target</th><th>Source Port</th><th>Target Port</th></tr></thead><tbody>
${flowData.edges.map(e => `<tr><td><code>${e.source}</code></td><td><code>${e.target}</code></td><td>${e.sourceHandle || '-'}</td><td>${e.targetHandle || '-'}</td></tr>`).join('')}
</tbody></table>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `flow_${Date.now()}.html`; a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, project]);

  const loadWorkflow = useCallback((wfId: string) => {
    const wf = project?.workflows.find((w) => w.id === wfId);
    if (!wf || !registry) return;
    const migrated = ensureWorkflowIo(wf);
    if (migrated.changed) {
      updateWorkflow(wf.id, { nodes: migrated.workflow.nodes, edges: migrated.workflow.edges });
    }
    const activeWorkflow = migrated.workflow;
    const loadedNodes: FlowNode[] = (activeWorkflow.nodes || []).map((n: any) => {
      const spec = resolveCanvasNodeSpec(registry, n.specId);
      if (!spec) return null;
      const savedOutputs = n.data?.outputs;
      const savedError = n.data?.error;
      return { id: n.id, type: 'formflow', position: n.position, data: { specId: n.specId, label: spec.label, kind: spec.kind, category: spec.category, description: spec.description, propertiesJson: JSON.stringify(n.data?.propertiesJson ? JSON.parse(n.data.propertiesJson) : {}), connectedPortsJson: '[]', ...(savedOutputs ? { outputs: savedOutputs } : {}), ...(savedError ? { error: savedError } : {}) } };
    }).filter(Boolean) as FlowNode[];
      const loadedEdges: Edge[] = dedupeEdges((activeWorkflow.edges || []).map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, animated: true, type: 'smoothstep' })));
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setCurrentWorkflowId(activeWorkflow.id);
    if (loadedNodes.length > 0) setSelectedNodeId(loadedNodes[0].id);
  }, [project, registry, updateWorkflow]);

  // Ensure the canvas always has an active workflow context.
  useEffect(() => {
    if (!project || !registry) return;
    const workflows = project.workflows || [];
    if (workflows.length === 0) {
      const now = new Date().toISOString();
      const scaffold = createWorkflowIoScaffold();
      const wf = { id: `wf_${Date.now()}`, name: '流程 1', description: '', nodes: scaffold.nodes, edges: scaffold.edges, versions: [], createdAt: now, updatedAt: now };
      addWorkflow(wf);
      return;
    }
    const hasCurrentWorkflow = currentWorkflowId ? workflows.some((workflow) => workflow.id === currentWorkflowId) : false;
    if (!hasCurrentWorkflow) {
      loadWorkflow(workflows[0].id);
    }
  }, [project, registry, currentWorkflowId, addWorkflow, loadWorkflow]);

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

        if (nr.success && n.data.specId === 'generic:sheet-source') {
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

  const stepFlow = useCallback(async () => {
    // Get topological order
    const { topologicalSort } = await import('../../services/engine/flowEngine');
    const nodeDefs = nodes.map((n) => ({ id: n.id, specId: n.data.specId, position: n.position, data: n.data as Record<string, unknown> }));
    const edgeDefs = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined }));
    let sorted: typeof nodeDefs;
    try { sorted = topologicalSort(nodeDefs, edgeDefs) as typeof nodeDefs; } catch { return; }

    // Find next node to execute
    const executed = new Set(stepResults.keys());
    const nextNode = sorted.find((n) => !executed.has(n.id));
    if (!nextNode) { setDebugNodeId(null); return; }

    setDebugNodeId(nextNode.id);
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, debugActive: n.id === nextNode.id } })));
    // Execute just this node using upstream data
    const result = await import('../../services/engine/flowEngine').then((m) =>
      m.executeFlow(nodeDefs, edgeDefs, project?.srcTable || [], { targetNodeId: nextNode.id })
    );
    const nr = result.nodeResults.get(nextNode.id);
    if (nr) {
      setStepResults((prev) => new Map(prev).set(nextNode.id, nr));
      setNodes((prev) => prev.map((n) => {
        if (n.id !== nextNode.id) return n;
        return { ...n, data: { ...n.data, outputs: nr.outputs, error: nr.error } };
      }));
    }
    if (!sorted.find((n) => !executed.has(n.id) && n.id !== nextNode.id)) {
      setDebugNodeId(null); // All done
    }
  }, [nodes, edges, project, stepResults]);

  const resetDebug = useCallback(() => {
    setDebugNodeId(null);
    setStepResults(new Map());
    setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, outputs: undefined, error: undefined, debugActive: false } })));
  }, []);

  const handleRangeConfirm = useCallback((ref: RangeRef) => {
    if (selectedNode) {
      const currentProps = (() => { try { return JSON.parse(selectedNode.data.propertiesJson || '{}'); } catch { return {}; } })();
      updateNodeData(selectedNode.id, {
        propertiesJson: JSON.stringify({
          ...currentProps,
          sourceMode: 'range',
          address: rangeToAddress(ref),
          sheetName: ref.sheetName,
          rangeMode: 'address',
          rangeRef: ref,
        }),
      });
    }
    setRangeSelectorOpen(false);
  }, [selectedNode, updateNodeData]);

  // ── Memoized inspector values (必须在条件返回之前) ──
  const inspectorSpec = selectedNode ? resolveCanvasNodeSpec(registry, selectedNode.data.specId) : undefined;
  const inspectorProps = inspectorSpec?.properties || [];
  const currentProps = useMemo(() => resolveNodeProperties(inspectorSpec, selectedNode?.data.propertiesJson), [inspectorSpec, selectedNode?.data.propertiesJson]);
  const inspectorPorts = useMemo(() => getNodeEffectivePorts(inspectorSpec, currentProps), [inspectorSpec, currentProps]);
  const inputOverrides = useMemo(() => getInputOverrides(currentProps), [currentProps]);
  const inputSelections = useMemo(() => getInputSelections(currentProps), [currentProps]);
  const inspectorInputPorts = useMemo(() => inspectorPorts.filter((port) => port.direction === 'input' || port.direction === 'both'), [inspectorPorts]);
  const inspectorPropNames = useMemo(() => new Set(inspectorProps.map((prop) => prop.name)), [inspectorProps]);

  const updateProp = useCallback((name: string, val: unknown) => {
    if (!selectedNode) return;
    const nextProps = { ...currentProps, [name]: val };
    updateNodeData(selectedNode.id, { propertiesJson: JSON.stringify(nextProps) });
    if ((name === 'inputPorts' || name === 'outputPorts') && inspectorSpec) {
      const nextPorts = getNodeEffectivePorts(inspectorSpec, nextProps);
      const validIn = new Set(nextPorts.filter((port) => port.direction === 'input' || port.direction === 'both').map((port) => `in:${port.name}`));
      const validOut = new Set(nextPorts.filter((port) => port.direction === 'output' || port.direction === 'both').map((port) => `out:${port.name}`));
      setEdges((current) => {
        const next = current.filter((edge) => {
          if (edge.source === selectedNode.id && edge.sourceHandle && !validOut.has(edge.sourceHandle)) return false;
          if (edge.target === selectedNode.id && edge.targetHandle && !validIn.has(edge.targetHandle)) return false;
          return true;
        });
        setNodes((prev) => syncConnectedPorts(prev, next));
        return next;
      });
    }
  }, [selectedNode?.id, currentProps, updateNodeData, inspectorSpec, syncConnectedPorts]);

  const updateInputOverride = useCallback((portName: string, value: unknown) => {
    if (!selectedNode) return;
    updateNodeData(selectedNode.id, {
      propertiesJson: JSON.stringify(setInputOverride(currentProps, portName, value)),
    });
  }, [selectedNode?.id, currentProps, updateNodeData]);

  const updateInputSelection = useCallback((portName: string, edgeId: string | undefined) => {
    if (!selectedNode) return;
    updateNodeData(selectedNode.id, {
      propertiesJson: JSON.stringify(setInputSelection(currentProps, portName, edgeId)),
    });
  }, [selectedNode?.id, currentProps, updateNodeData]);

  const openRangeSelector = useCallback(() => setRangeSelectorOpen(true), []);

  if (!registry) return <div className="loading-splash"><div className="loading-spinner" /><p>加载中…</p></div>;

  return (
    <div className="canvas-layout" onPointerMove={movePalettePointerDrag} onPointerUp={finishPalettePointerDrag} onPointerCancel={cancelPalettePointerDrag}>
      {paletteOpen && (
        <NodePalette
          specs={registry.specs}
          tables={project?.srcTable || []}
          selectedSpec={selectedNode ? resolveCanvasNodeSpec(registry, selectedNode.data.specId) : undefined}
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
          <button onClick={handleAutoLayout} disabled={nodes.length === 0}>自动整理流程</button>
          <select value={currentWorkflowId || ''} onChange={(e) => e.target.value && loadWorkflow(e.target.value)}>
            <option value="" disabled>加载流程…</option>
            {(project?.workflows || []).map((wf) => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
          </select>
          <button className="primary" onClick={runFlow} disabled={flowRunning || nodes.length === 0}>
            {flowRunning ? '执行中…' : '▶ 运行流程'}
          </button>
          <select onChange={(e) => { if (e.target.value === 'json') exportAsJson(); else if (e.target.value === 'html') exportAsHtml(); e.target.value = ''; }} style={{ fontSize: 11, padding: '2px 6px' }}>
            <option value="">导出…</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
          </select>
          <button onClick={stepFlow} disabled={flowRunning || nodes.length === 0} title="单步执行" className="ui-btn ui-btn-xs">
            ⏭ 单步
          </button>
          {stepResults.size > 0 && (
            <button onClick={resetDebug} className="ui-btn ui-btn-danger ui-btn-xs">重置</button>
          )}
          {stepResults.size > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              已执行 {stepResults.size}/{nodes.length}
            </span>
          )}
          {flowResult && (
            <span style={{ fontSize: 11, color: flowResult.success ? '#16a34a' : 'var(--danger)' }}>
              {flowResult.success ? `✓ 完成 (${flowResult.totalDuration}ms)` : `✗ 失败 (${flowResult.errors.length} 错误)`}
            </span>
          )}
          <div className="canvas-toolbar-logbar">
            <div className={`canvas-toolbar-log latest ${latestToolbarLog ? `level-${latestToolbarLog.level}` : 'level-empty'}`}>
              <span className="canvas-toolbar-log-dot" aria-hidden="true" />
              <span className="canvas-toolbar-log-message" title={latestToolbarLog?.message || '暂无日志'}>
                {latestToolbarLog?.message || '暂无日志'}
              </span>
              {latestToolbarLog && (
                <span className="canvas-toolbar-log-time">
                  {formatToolbarLogTime(new Date(latestToolbarLog.createdAt))}
                </span>
              )}
            </div>
            <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShowToolbarLogModal(true)}>
              查看全部
            </button>
          </div>
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
          defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
          fitView
        >
          <Background /><MiniMap pannable zoomable nodeColor={(n) => {
            const kind = (n.data as FlowNodeData)?.kind;
            if (kind === 'behavior') return '#8b5cf6';
            if (kind === 'xlsx-method') return '#2563eb';
            if (kind === 'generic') return '#ea580c';
            if (kind === 'scenario') return '#0f766e';
            return '#6b7280';
          }} /><Controls />
        </ReactFlow>
      </section>
      <Modal
        open={showToolbarLogModal}
        onClose={() => setShowToolbarLogModal(false)}
        width="min(760px, 92vw)"
        maxHeight="78vh"
        containerClassName="canvas-log-modal"
      >
        <ModalHeader title={`操作日志${toolbarLogs.length > 0 ? ` (${toolbarLogs.length})` : ''}`} onClose={() => setShowToolbarLogModal(false)} />
        <div className="modal-body canvas-log-modal-body">
          {toolbarLogs.length === 0 ? (
            <div className="canvas-log-empty">暂无日志</div>
          ) : (
            <div className="canvas-log-list">
              {toolbarLogs.map((entry) => (
                <article key={entry.id} className={`canvas-log-entry level-${entry.level}`}>
                  <div className="canvas-log-entry-meta">
                    <span className={`canvas-log-entry-level level-${entry.level}`}>{getToolbarLogLevelLabel(entry.level)}</span>
                    <span>{formatToolbarLogTime(new Date(entry.createdAt))}</span>
                    <span>{getToolbarLogSourceLabel(entry.source)}</span>
                  </div>
                  <div className="canvas-log-entry-message">{entry.message}</div>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="ui-btn ui-btn-xs" onClick={() => setToolbarLogs([])} disabled={toolbarLogs.length === 0}>清空日志</button>
          <button type="button" className="primary" onClick={() => setShowToolbarLogModal(false)}>关闭</button>
        </div>
      </Modal>

      {selectedNode && registry && (() => {
        const isWorksheetSelect = selectedNode.data.specId === 'generic:sheet-source' && currentProps.sourceMode !== 'range';
        const isRemovedNode = isRemovedWorkflowNode(selectedNode.data.specId);
        const isDataNode = selectedNode.data.specId.startsWith('generic:') || selectedNode.data.specId.startsWith('func:');
        const selectedSheetName = String(currentProps.sheetName || '');
        const matchedSheet = srcTables.flatMap(t => t.sheets.map(s => ({ ...s, fileName: t.fileName, tableId: t.id }))).find(s => s.name === selectedSheetName);
        const showDataPreview = isWorksheetSelect && matchedSheet;

        return (
          <aside className="canvas-inspector">
            <div className="inspector-head"><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.description}</p></div>
            <div className="inspector-scroll">
              {inspectorProps.length > 0 && (
                <section className="inspector-section schema-config">
                  <div className="inspector-section-title"><h4>配置</h4><span>{inspectorProps.length} 项</span></div>
                  <div className="schema-fields">{inspectorProps.map((p: any) => <SchemaField key={p.name} prop={p} value={currentProps[p.name]} onChange={updateProp} connected={connectedPorts.has(`in:${p.name}`)} specId={selectedNode.data.specId} tables={srcTables} currentProps={currentProps} onOpenRangeSelector={openRangeSelector} sourceInfo={connectedSourceMap.get(p.name)?.[0]} />)}</div>
                </section>
              )}
              {inspectorInputPorts.length > 0 && (
                <section className="inspector-section schema-config">
                  <div className="inspector-section-title"><h4>输入</h4><span>{inspectorInputPorts.length} 个端口</span></div>
                  <div className="schema-fields">
                    {inspectorInputPorts.map((port) => (
                      <InputPortEditor
                        key={port.name}
                        port={port}
                        value={inputOverrides[port.name]}
                        fallbackValue={currentProps[port.name]}
                        connected={connectedPorts.has(`in:${port.name}`)}
                        sourceInfos={connectedSourceMap.get(port.name)}
                        selectedEdgeId={inputSelections[port.name]}
                        hasPropertyEditor={inspectorPropNames.has(port.name)}
                        tables={srcTables}
                        onChange={(value) => updateInputOverride(port.name, value)}
                        onJumpToSource={(nodeId) => setSelectedNodeId(nodeId)}
                        onSelectSource={(edgeId) => updateInputSelection(port.name, edgeId)}
                      />
                    ))}
                  </div>
                </section>
              )}
              <div className="inspector-run-bar"><button className="primary" onClick={() => runNode(selectedNode)} disabled={isRemovedNode}>从最上游运行到此节点</button></div>
              {inspectorPorts.length > 0 && <InspectorPortSection key={selectedNode.id} ports={inspectorPorts} connectedPorts={connectedPorts} />}

              <section className="inspector-section schema-config">
                <div className="inspector-section-title"><h4>重试配置</h4></div>
                <div className="schema-fields">
                  <label className="prop-field">
                    <span>重试次数</span>
                    <input type="number" min={0} max={10} value={Number(currentProps.retryCount || 0)} onChange={(e) => updateProp('retryCount', Math.max(0, Math.min(10, Number(e.target.value))))} style={{ width: 80 }} />
                  </label>
                  <label className="prop-field">
                    <span>重试间隔 (ms)</span>
                    <input type="number" min={0} step={100} value={Number(currentProps.retryDelayMs || 0)} onChange={(e) => updateProp('retryDelayMs', Math.max(0, Number(e.target.value)))} style={{ width: 100 }} />
                  </label>
                  <label className="prop-field">
                    <span>匹配错误 (留空=全部)</span>
                    <input type="text" value={String(currentProps.retryOn || '')} onChange={(e) => updateProp('retryOn', e.target.value)} placeholder="留空则匹配所有错误" />
                  </label>
                </div>
              </section>

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

              {!showDataPreview && srcTables.length > 0 && isDataNode && !isRemovedNode && (
                <section className="inspector-section data-preview-section">
                  <div className="inspector-section-title"><h4>可用数据源</h4><span>{srcTables.reduce((sum, table) => sum + table.sheets.length, 0)} 个表</span></div>
                  <div className="data-source-list">
                    {srcTables.flatMap((table) => table.sheets.map((sheet) => ({ table, sheet }))).map(({ table, sheet }) => (
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
              {isRemovedNode && (
                <div className="result-box error">
                  <h4>已移除节点</h4>
                  <pre>{`该节点已被新版输入/选择节点体系移除，请手动替换。\n原节点: ${selectedNode.data.specId}`}</pre>
                </div>
              )}
              {selectedNode.data.outputs && Object.keys(selectedNode.data.outputs).length > 0 && (
                <div className="result-box">
                  <div className="inspector-section-title"><h4>输出</h4><span>{Object.keys(selectedNode.data.outputs).filter((key) => !key.startsWith('__')).length} 项</span></div>
                  <div className="output-ports">
                    {Object.entries(selectedNode.data.outputs).map(([key, val]) => {
                      if (key.startsWith('__')) return null;
                      const portDef = inspectorPorts.find((p: any) => p.name === key);
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
