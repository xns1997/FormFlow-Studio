import { getRegistrySync, resolveMethod, type FlowNodeSpec } from '../../flowRegistry';
import { getExecutor, hasExecutor, type NodeExecContext } from '../../../nodes/executor-registry';
import { checkPortType, assertPortType } from '../../../nodes/port-types';
import type { SrcTableEntry } from '../../project/types';
import { getNodeEffectivePorts, resolveNodeProperties } from '../config/customJsNode';
import { extractNodeSideEffects, type FlowSideEffect } from './flowSideEffects';
import { isRemovedWorkflowNode } from './removedWorkflowNodes';
import type { DebugEntry } from '../../project/types';
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from './checkpoint';

let xlsxCache: any = null;
async function getXlsxModule(): Promise<any> {
  if (xlsxCache) return xlsxCache;
  xlsxCache = await import('xlsx');
  return xlsxCache;
}

export interface FlowNodeDef {
  id: string;
  specId: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
}

export interface FlowEdgeDef {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  specId: string;
  label: string;
  success: boolean;
  outputs: Record<string, unknown>;
  sideEffects: FlowSideEffect[];
  error?: string;
  duration: number;
  inputKeys?: string[];
  outputKeys?: string[];
}

export interface FlowExecutionResult {
  success: boolean;
  nodeResults: Map<string, NodeExecutionResult>;
  finalOutputs: Record<string, unknown>;
  sideEffects: FlowSideEffect[];
  errors: string[];
  totalDuration: number;
  debug?: {
    requestId?: string;
    workflowId?: string;
    executedNodeCount: number;
    exportKeys: string[];
    duration: number;
    errors: string[];
    events: DebugEntry[];
  };
}

export function topologicalSort(nodes: FlowNodeDef[], edges: FlowEdgeDef[]): FlowNodeDef[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }
  for (const e of edges) {
    adjacency.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    sorted.push(cur);
    for (const next of adjacency.get(cur) || []) {
      const newDeg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (sorted.length !== nodes.length) {
    const sortedIds = new Set(sorted);
    const cycleNodes = nodes.filter((node) => !sortedIds.has(node.id)).map((node) => node.id);
    throw new Error(`流程存在环路，无法确定执行顺序: ${cycleNodes.join(' -> ')}`);
  }
  return sorted.map((id) => nodes.find((n) => n.id === id)!);
}

/** Return the target and every transitive predecessor, preserving the original graph. */
export function selectUpstreamFlow(
  nodes: FlowNodeDef[],
  edges: FlowEdgeDef[],
  targetNodeId: string,
): { nodes: FlowNodeDef[]; edges: FlowEdgeDef[] } {
  if (!nodes.some((node) => node.id === targetNodeId)) {
    throw new Error(`目标节点不存在: ${targetNodeId}`);
  }
  const selected = new Set<string>([targetNodeId]);
  const stack = [targetNodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const edge of edges) {
      if (edge.target === current && !selected.has(edge.source)) {
        selected.add(edge.source);
        stack.push(edge.source);
      }
    }
  }
  return {
    nodes: nodes.filter((node) => selected.has(node.id)),
    edges: edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)),
  };
}

function extractPortName(handle: string | undefined, direction: 'in' | 'out'): string {
  if (!handle) return direction === 'in' ? '_args' : 'result';
  return handle.replace(/^(in:|out:)/, '');
}

function buildScopeMap(
  nodeId: string,
  edges: FlowEdgeDef[],
  nodeOutputs: Map<string, Record<string, unknown>>,
): Map<string, Record<string, unknown>> {
  const scope = new Map<string, Record<string, unknown>>();
  const sourceIds = new Set(
    edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source),
  );
  for (const sourceId of sourceIds) {
    const output = nodeOutputs.get(sourceId);
    if (output) scope.set(sourceId, output);
  }
  return scope;
}

function collectInputs(
  nodeId: string,
  edges: FlowEdgeDef[],
  nodeOutputs: Map<string, Record<string, unknown>>,
  selectedEdgeIdsByPort: Record<string, string> = {},
  scopeMap?: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  const targetEdges = edges.filter((edge) => edge.target === nodeId);
  const grouped = new Map<string, FlowEdgeDef[]>();
  for (const edge of targetEdges) {
    const portName = extractPortName(edge.targetHandle, 'in');
    const list = grouped.get(portName) || [];
    list.push(edge);
    grouped.set(portName, list);
  }

  for (const [portName, portEdges] of grouped) {
    const selected = selectedEdgeIdsByPort[portName];
    const edge = portEdges.find((item) => item.id === selected) || portEdges[portEdges.length - 1];
    if (!edge) continue;
    const srcOutput = scopeMap ? scopeMap.get(edge.source) : nodeOutputs.get(edge.source);
    if (!srcOutput) throw new Error(`上游节点 ${edge.source} 尚未执行`);
    const srcPortName = extractPortName(edge.sourceHandle, 'out');
    if (edge.sourceHandle) {
      if (!Object.prototype.hasOwnProperty.call(srcOutput, srcPortName)) {
        throw new Error(`上游节点 ${edge.source} 没有输出端口 "${srcPortName}"`);
      }
      inputs[portName] = srcOutput[srcPortName];
    } else {
      const keys = Object.keys(srcOutput).filter((key) => !key.startsWith('__'));
      const fallbackKey = keys.length === 1 ? keys[0] : (Object.prototype.hasOwnProperty.call(srcOutput, 'result') ? 'result' : 'value');
      inputs[portName] = srcOutput[fallbackKey];
    }
  }
  return inputs;
}

function resolveInputSelections(properties: Record<string, unknown>) {
  const raw = properties.__inputSelections;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, string>;
}

async function executeXlsxMethod(
  methodName: string,
  inputs: Record<string, unknown>,
  properties: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const method = resolveMethod(methodName);
  if (!method) throw new Error(`方法未找到: ${methodName}`);

  const args: unknown[] = [];
  const merged = { ...properties, ...inputs };
  const spec = getRegistrySync()?.byId.get(`method:${methodName}`);
  const methodOptions = Object.fromEntries(
    (spec?.properties || [])
      .filter((property) => merged[property.name] !== undefined)
      .map((property) => [property.name, merged[property.name]]),
  );

  // 特殊处理常用方法，带类型校验
  if (methodName === 'XLSX.utils.sheet_to_json') {
    const ws = inputs.worksheet ?? merged.worksheet;
    if (!ws) throw new Error('缺少 worksheet 输入');
    // 类型校验
    const wsCheck = checkPortType('worksheet', ws);
    if (!wsCheck.valid) throw new Error(`worksheet 类型错误: ${wsCheck.error}`);
    const validWs = wsCheck.normalized!;
    const wsAny = validWs as any;
    if (wsAny.__fromProject) {
      return { rows: wsAny.preview || [], headers: wsAny.headers || [], __autoHeader: wsAny.headers || [] };
    }
    args.push(validWs);
    const opts: Record<string, unknown> = {};
    if (merged.header !== undefined && Array.isArray(merged.header) && merged.header.length > 0) opts.header = merged.header;
    if (merged.defval !== undefined && merged.defval !== '') opts.defval = merged.defval;
    if (merged.raw !== undefined) opts.raw = merged.raw;
    if (merged.blankrows !== undefined) opts.blankrows = merged.blankrows;
    if (merged.skipHidden !== undefined) opts.skipHidden = merged.skipHidden;
    if (merged.dateNF) opts.dateNF = merged.dateNF;
    if (merged.range) opts.range = merged.range;
    else if (typeof merged.headerRow === 'number' && merged.headerRow >= 0) opts.range = merged.headerRow;
    if (Object.keys(opts).length > 0) args.push(opts);
    let result = method(...args) as any[];
    if (typeof merged.sheetRows === 'number' && merged.sheetRows > 0) result = result.slice(0, merged.sheetRows);
    // 输出校验
    const rowsCheck = checkPortType('json-rows', result);
    const validRows = rowsCheck.valid ? rowsCheck.normalized! : result;
    const autoHeader = Array.isArray(validRows) && validRows.length > 0 ? Object.keys(validRows[0]) : [];
    return { rows: validRows, headers: autoHeader, __autoHeader: autoHeader };
  }

  if (methodName === 'XLSX.read') {
    const data = inputs.data ?? merged.data ?? merged._args;
    if (!data) throw new Error('缺少数据输入');
    const dataCheck = checkPortType('file-data', data);
    if (!dataCheck.valid) throw new Error(`输入数据类型错误: ${dataCheck.error}`);
    args.push(dataCheck.normalized!);
    args.push({
      type: merged.type || 'array',
      cellFormula: merged.cellFormula !== false,
      cellHTML: merged.cellHTML !== false,
      cellDates: merged.cellDates === true,
      bookSheets: merged.bookSheets === true,
      bookVBA: merged.bookVBA !== false,
      sheetRows: typeof merged.sheetRows === 'number' ? merged.sheetRows : 0,
      raw: merged.raw === true,
      dense: merged.dense === true,
    });
    const result = method(...args);
    const wbCheck = checkPortType('workbook', result);
    return { workbook: wbCheck.valid ? wbCheck.normalized! : result };
  }

  if (methodName === 'XLSX.utils.json_to_sheet') {
    const data = inputs.data ?? merged.data ?? merged._args;
    if (!data) throw new Error('缺少 JSON 数据输入');
    const rowsCheck = checkPortType('json-rows', data);
    if (!rowsCheck.valid) throw new Error(`JSON 数据类型错误: ${rowsCheck.error}`);
    args.push(rowsCheck.normalized!);
    if (Object.keys(methodOptions).length > 0) args.push(methodOptions);
    return { worksheet: method(...args) };
  }

  if (methodName === 'XLSX.utils.sheet_to_csv') {
    const ws = inputs.worksheet ?? merged.worksheet;
    if (!ws) throw new Error('缺少 worksheet 输入');
    const wsAny = ws as any;
    if (wsAny.__fromProject) {
      const rows = wsAny.preview || [];
      const headers = wsAny.headers || [];
      const csv = [headers.join(','), ...rows.map((r: any) => headers.map((h: string) => String(r[h] ?? '')).join(','))].join('\n');
      return { csv };
    }
    const wsCheck = checkPortType('worksheet', ws);
    if (!wsCheck.valid) throw new Error(`worksheet 类型错误: ${wsCheck.error}`);
    args.push(wsCheck.normalized!);
    if (Object.keys(methodOptions).length > 0) args.push(methodOptions);
    const result = method(...args);
    return { csv: result };
  }

  if (methodName === 'XLSX.utils.sheet_to_html') {
    const ws = inputs.worksheet ?? merged.worksheet;
    if (!ws) throw new Error('缺少 worksheet 输入');
    const wsAny = ws as any;
    if (wsAny.__fromProject) {
      const rows = wsAny.preview || [];
      const headers = wsAny.headers || [];
      const html = '<table>' +
        '<thead><tr>' + headers.map((h: string) => `<th>${h}</th>`).join('') + '</tr></thead>' +
        '<tbody>' + rows.map((r: any) => '<tr>' + headers.map((h: string) => `<td>${String(r[h] ?? '')}</td>`).join('') + '</tr>').join('') + '</tbody>' +
        '</table>';
      return { html };
    }
    const wsCheck = checkPortType('worksheet', ws);
    if (!wsCheck.valid) throw new Error(`worksheet 类型错误: ${wsCheck.error}`);
    args.push(wsCheck.normalized!);
    if (Object.keys(methodOptions).length > 0) args.push(methodOptions);
    return { html: method(...args) };
  }

  if (methodName === 'XLSX.utils.sheet_to_formulae') {
    const ws = inputs.worksheet ?? merged.worksheet;
    if (!ws) throw new Error('缺少 worksheet 输入');
    const wsAny = ws as any;
    if (wsAny.__fromProject) {
      const rows = wsAny.preview || [];
      const headers = wsAny.headers || [];
      const formulae = rows.flatMap((r: any, ri: number) =>
        headers.map((h: string, ci: number) => {
          const col = String.fromCharCode(65 + ci);
          return `${col}${ri + 1}=${String(r[h] ?? '')}`;
        })
      );
      return { formulae };
    }
    const wsCheck = checkPortType('worksheet', ws);
    if (!wsCheck.valid) throw new Error(`worksheet 类型错误: ${wsCheck.error}`);
    args.push(wsCheck.normalized!);
    return { formulae: method(...args) };
  }

  if (methodName === 'XLSX.utils.sheet_to_row_object_array') {
    const ws = inputs.worksheet ?? merged.worksheet;
    if (!ws) throw new Error('缺少 worksheet 输入');
    const wsAny = ws as any;
    if (wsAny.__fromProject) {
      return { rows: wsAny.preview || [] };
    }
    const wsCheck = checkPortType('worksheet', ws);
    if (!wsCheck.valid) throw new Error(`worksheet 类型错误: ${wsCheck.error}`);
    args.push(wsCheck.normalized!);
    return { rows: method(...args) };
  }

  if (methodName === 'XLSX.utils.aoa_to_sheet') {
    const data = inputs.data ?? merged.data ?? merged._args;
    if (!data) throw new Error('缺少数据输入');
    // 如果是 json-rows，转换为 aoa
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      const headers = Object.keys(data[0]);
      const aoa = [headers, ...data.map((row: any) => headers.map(h => row[h]))];
      args.push(aoa);
    } else {
      args.push(data);
    }
    if (Object.keys(methodOptions).length > 0) args.push(methodOptions);
    return { worksheet: method(...args) };
  }

  if (methodName === 'XLSX.utils.book_append_sheet') {
    const wb = inputs.workbook ?? merged.workbook;
    const ws = inputs.worksheet ?? merged.worksheet;
    if (!wb) throw new Error('缺少 workbook 输入');
    if (!ws) throw new Error('缺少 worksheet 输入');
    args.push(wb);
    const wsAny = ws as any;
    if (wsAny.__fromProject) {
      // 从项目数据创建真实 worksheet
      const XLSX = await getXlsxModule();
      const realWs = XLSX.utils.json_to_sheet(wsAny.preview || []);
      args.push(realWs);
    } else {
      args.push(ws);
    }
    args.push(merged.sheetName || 'Sheet1');
    return { workbook: method(...args) };
  }

  if (methodName === 'XLSX.write') {
    const wb = inputs.workbook ?? merged.workbook;
    if (!wb) throw new Error('缺少 workbook 输入');
    const wbCheck = checkPortType('workbook', wb);
    if (!wbCheck.valid) throw new Error(`workbook 类型错误: ${wbCheck.error}`);
    args.push(wbCheck.normalized!);
    args.push({ bookType: merged.bookType || 'xlsx', type: merged.type || 'array' });
    return { data: method(...args) };
  }

  // 通用处理：严格按照 Schema 中输入 Port 的顺序组装参数。
  if (merged._args !== undefined) {
    args.push(...(Array.isArray(merged._args) ? merged._args : [merged._args]));
  } else {
    const inputPorts = (spec?.ports || []).filter((port) => port.direction === 'input' || port.direction === 'both');
    for (const port of inputPorts) {
      const value = merged[port.name] ?? port.defaultValue;
      if (value === undefined && port.required) throw new Error(`缺少 ${port.name} 输入`);
      if (value !== undefined) args.push(value);
    }
    if (Object.keys(methodOptions).length > 0) args.push(methodOptions);
  }
  const result = await method(...args);
  const outputPorts = (spec?.ports || []).filter((port) => port.direction === 'output' || port.direction === 'both');
  if (outputPorts.length === 0) return { result };
  if (outputPorts.length === 1) {
    const output = outputPorts[0];
    return { [output.name]: result === undefined ? merged[output.name] : result };
  }
  if (result && typeof result === 'object' && !Array.isArray(result)) return result as Record<string, unknown>;
  return { [outputPorts[0].name]: result };
}

export interface ExecuteFlowOptions {
  /** Execute this node and all of its transitive upstream dependencies only. */
  targetNodeId?: string;
  /** Values injected into generic:value-input nodes by their configured name. */
  variables?: Record<string, unknown>;
  /** Values injected into concrete node input ports. Connected edges take precedence. */
  nodeInputs?: Record<string, Record<string, unknown>>;
  workflowId?: string;
  checkpointId?: string;
  resumeFromCheckpoint?: boolean;
  keepCheckpointOnSuccess?: boolean;
  /** Strategy when a node fails. 'abort' stops the flow (default), 'skip' continues with empty output, 'continue' behaves like 'skip'. */
  onNodeFailure?: 'abort' | 'skip' | 'continue';
  /** Global timeout in ms. If the flow doesn't complete within this duration, it is aborted. */
  timeoutMs?: number;
  /** Per-node timeout in ms. If a single node doesn't complete within this duration, it is aborted. */
  nodeTimeoutMs?: number;
  /** When true, independent nodes at the same topological level execute concurrently via Promise.all. */
  parallel?: boolean;
  /** When true, each node gets its own scope map for variable lookups, preventing variable name collisions between nodes. */
  isolatedScopes?: boolean;
  /** When true, debug events include variable snapshots (actual input/output values) at each step. */
  debug?: boolean;
  /** When true, side effects are buffered and only committed on success. On failure, pending side effects are discarded. */
  transactionalSideEffects?: boolean;
}

function resolvePropertyInputOverrides(
  ports: Array<{ name: string; direction: string }>,
  properties: Record<string, unknown>,
) {
  const raw = properties.__inputOverrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const overrides = raw as Record<string, unknown>;
  if (ports.length === 0) return overrides;
  const allowed = new Set(
    ports
      .filter((port) => port.direction === 'input' || port.direction === 'both')
      .map((port) => port.name),
  );
  return Object.fromEntries(
    Object.entries(overrides).filter(([name]) => allowed.has(name)),
  );
}

function validateConnectedInputs(spec: FlowNodeSpec | undefined, inputs: Record<string, unknown>) {
  if (!spec) return inputs;
  const normalized = { ...inputs };
  for (const port of (spec.ports || []).filter((item) => item.direction === 'input' || item.direction === 'both')) {
    if (!Object.prototype.hasOwnProperty.call(inputs, port.name)) continue;
    normalized[port.name] = assertPortType(port.type, inputs[port.name], port.name);
  }
  return normalized;
}

function validateOutputs(ports: FlowNodeSpec['ports'], outputs: Record<string, unknown>) {
  const normalized = { ...outputs };
  for (const port of ports.filter((item) => item.direction === 'output' || item.direction === 'both')) {
    if (!Object.prototype.hasOwnProperty.call(outputs, port.name)) continue;
    normalized[port.name] = assertPortType(port.type, outputs[port.name], port.name);
  }
  return normalized;
}

function createTimeoutPromise(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label}执行超时（${ms}ms）`)), ms);
  });
}

function groupByTopologicalLevel(sorted: FlowNodeDef[], edges: FlowEdgeDef[]): FlowNodeDef[][] {
  const levels: FlowNodeDef[][] = [];
  const inDegree = new Map<string, number>();
  for (const n of sorted) inDegree.set(n.id, 0);
  for (const e of edges) {
    if (inDegree.has(e.target)) inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }
  const visited = new Set<string>();
  let remaining = sorted.length;
  while (remaining > 0) {
    const level: FlowNodeDef[] = [];
    for (const n of sorted) {
      if (visited.has(n.id)) continue;
      const allPredecessorsVisited = edges
        .filter(e => e.target === n.id)
        .every(e => visited.has(e.source));
      if (allPredecessorsVisited) {
        level.push(n);
      }
    }
    if (level.length === 0) break;
    for (const n of level) {
      visited.add(n.id);
      remaining--;
    }
    levels.push(level);
  }
  return levels;
}

export async function executeFlow(
  nodes: FlowNodeDef[],
  edges: FlowEdgeDef[],
  tables: SrcTableEntry[] = [],
  options: ExecuteFlowOptions = {},
): Promise<FlowExecutionResult> {
  const startTime = Date.now();
  const executionGraph = options.targetNodeId ? selectUpstreamFlow(nodes, edges, options.targetNodeId) : { nodes, edges };
  nodes = executionGraph.nodes;
  edges = executionGraph.edges;
  let sorted: FlowNodeDef[];
  try {
    sorted = topologicalSort(nodes, edges);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, nodeResults: new Map(), finalOutputs: {}, sideEffects: [], errors: [message], totalDuration: Date.now() - startTime };
  }
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  const nodeResults = new Map<string, NodeExecutionResult>();
  const sideEffects: FlowSideEffect[] = [];
  const pendingSideEffects: FlowSideEffect[] = [];
  const errors: string[] = [];
  const debugEvents: DebugEntry[] = [];
  let hasNodeFailures = false;
  const requestId = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const checkpoint = options.checkpointId && options.resumeFromCheckpoint ? loadCheckpoint(options.checkpointId) : null;
  if (checkpoint) Object.entries(checkpoint.outputs).forEach(([id, output]) => nodeOutputs.set(id, output));

  const getNodeOutput = (nodeId: string) => nodeOutputs.get(nodeId) || {};

  let globalTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (options.timeoutMs && options.timeoutMs > 0) {
    const globalTimeoutPromise = new Promise<never>((_, reject) => {
      globalTimeoutHandle = setTimeout(() => reject(new Error(`流程执行超时（${options.timeoutMs}ms）`)), options.timeoutMs);
    });
    // Race the flow loop against the global timeout
    try {
      await Promise.race([runFlowLoop(), globalTimeoutPromise]);
    } catch (e) {
      if (globalTimeoutHandle) clearTimeout(globalTimeoutHandle);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (/执行超时/.test(errMsg)) {
        return { success: false, nodeResults, finalOutputs: {}, sideEffects, errors: [errMsg], totalDuration: Date.now() - startTime };
      }
      throw e;
    }
    if (globalTimeoutHandle) clearTimeout(globalTimeoutHandle);
    return buildResult();
  }

  await runFlowLoop();
  return buildResult();

  async function runFlowLoop() {
    const executeNode = async (node: FlowNodeDef) => {
      if (checkpoint?.completedNodeIds.includes(node.id)) return;
      const nodeStart = Date.now();
      const colonIdx = node.specId.indexOf(':');
      const kind = colonIdx > -1 ? node.specId.slice(0, colonIdx) : 'unknown';
      const name = colonIdx > -1 ? node.specId.slice(colonIdx + 1) : node.specId;
      let inputs: Record<string, unknown> = {};
      let properties: Record<string, unknown> = {};

      try {
        if (isRemovedWorkflowNode(node.specId)) {
          throw new Error(`节点已移除，不可执行: ${node.specId}`);
        }
        const spec = getRegistrySync()?.byId.get(node.specId);
        properties = resolveNodeProperties(spec, (node.data as any)?.propertiesJson);
        const effectivePorts = getNodeEffectivePorts(spec, properties);
        const injectedInputs = { ...(options.nodeInputs?.[node.id] || {}) };
        if (node.specId === 'generic:value-input') {
          const variableName = String(properties.name || '');
          if (variableName && Object.prototype.hasOwnProperty.call(options.variables || {}, variableName)) {
            injectedInputs.override = options.variables![variableName];
          }
        }
        const propertyInputOverrides = resolvePropertyInputOverrides(effectivePorts, properties);
        const inputSelections = resolveInputSelections(properties);
        const scopeMap = options.isolatedScopes ? buildScopeMap(node.id, edges, nodeOutputs) : undefined;
        inputs = { ...propertyInputOverrides, ...injectedInputs, ...collectInputs(node.id, edges, nodeOutputs, inputSelections, scopeMap) };
        inputs = validateConnectedInputs({ ...spec, ports: effectivePorts } as FlowNodeSpec, inputs);
        const startContext: Record<string, unknown> = {
          specId: node.specId,
          inputKeys: Object.keys(inputs).filter((key) => !key.startsWith('_')),
        };
        if (options.debug) {
          startContext.variableSnapshot = Object.fromEntries(
            Object.entries(inputs).filter(([key]) => !key.startsWith('_')),
          );
        }
        debugEvents.push({
          id: `${requestId}:${node.id}:start`,
          timestamp: Date.now(),
          level: 'debug',
          source: 'flow',
          title: `开始执行节点 ${name}`,
          message: `${node.specId}`,
          workflowId: options.targetNodeId,
          nodeId: node.id,
          context: startContext,
        });
        let outputs: Record<string, unknown>;

        const retryCount = Math.max(0, Number(properties.retryCount || 0)); const retryDelayMs = Math.max(0, Number(properties.retryDelayMs || 0)); const retryOn = String(properties.retryOn || 'any'); let attempt = 0;
        while (true) {
          try {
            const runNode = async (): Promise<Record<string, unknown>> => {
              if (hasExecutor(node.specId)) {
                const executor = getExecutor(node.specId)!;
                const ctx: NodeExecContext = { inputs, properties, tables, getNodeOutput, checkType: (type: string, value: unknown) => checkPortType(type, value), assertType: (type: string, value: unknown, portName?: string) => assertPortType(type, value, portName) };
                return executor(ctx);
              } else if (kind === 'method') return executeXlsxMethod(node.specId.replace('method:', ''), inputs, properties);
              else throw new Error(`节点缺少执行器: ${node.specId}`);
            };
            outputs = options.nodeTimeoutMs && options.nodeTimeoutMs > 0
              ? await Promise.race([runNode(), createTimeoutPromise(options.nodeTimeoutMs, name)])
              : await runNode();
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error); const matches = retryOn === 'any' || message.includes(retryOn);
            if (attempt >= retryCount || !matches) throw error;
            attempt += 1; debugEvents.push({ id: `${requestId}:${node.id}:retry:${attempt}`, timestamp: Date.now(), level: 'warn', source: 'workflow-node', title: name, message: `第 ${attempt} 次重试`, nodeId: node.id, context: { error: message, delay: retryDelayMs } });
            if (retryDelayMs) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          }
        }

        outputs = validateOutputs(effectivePorts, outputs);
        const nodeSideEffects = extractNodeSideEffects(outputs);
        if (options.transactionalSideEffects) {
          pendingSideEffects.push(...nodeSideEffects);
        } else {
          sideEffects.push(...nodeSideEffects);
        }

        nodeOutputs.set(node.id, outputs);
        if (options.checkpointId) saveCheckpoint(options.checkpointId, options.workflowId || options.targetNodeId || 'workflow', [...nodeOutputs.keys()], nodeOutputs);
        nodeResults.set(node.id, {
          nodeId: node.id,
          specId: node.specId,
          label: name,
          success: true,
          outputs,
          sideEffects: nodeSideEffects,
          duration: Date.now() - nodeStart,
          inputKeys: Object.keys(inputs).filter((key) => !key.startsWith('_')),
          outputKeys: Object.keys(outputs).filter((key) => !key.startsWith('_')),
        });
        const successContext: Record<string, unknown> = {
          specId: node.specId,
          inputKeys: Object.keys(inputs).filter((key) => !key.startsWith('_')),
          outputKeys: Object.keys(outputs).filter((key) => !key.startsWith('_')),
          duration: Date.now() - nodeStart,
        };
        if (options.debug) {
          successContext.variableSnapshot = {
            inputs: Object.fromEntries(
              Object.entries(inputs).filter(([key]) => !key.startsWith('_')),
            ),
            outputs: Object.fromEntries(
              Object.entries(outputs).filter(([key]) => !key.startsWith('_')),
            ),
          };
        }
        debugEvents.push({
          id: `${requestId}:${node.id}:success`,
          timestamp: Date.now(),
          level: 'info',
          source: 'workflow-node',
          title: name,
          message: `节点执行完成，用时 ${Date.now() - nodeStart}ms`,
          workflowId: options.targetNodeId,
          nodeId: node.id,
          context: successContext,
        });
      } catch (e) {
        hasNodeFailures = true;
        const errMsg = e instanceof Error ? e.message : String(e);
        const inputKeys = Object.keys(inputs || {}).filter(k => !k.startsWith('_'));
        const propKeys = Object.keys(properties || {}).filter(k => properties[k] !== undefined && properties[k] !== '');
        const context = [
          `节点 ${name} (${node.specId})`,
          `错误: ${errMsg}`,
          inputKeys.length > 0 ? `输入端口: ${inputKeys.join(', ')}` : null,
          propKeys.length > 0 ? `配置: ${propKeys.slice(0, 5).join(', ')}` : null,
        ].filter(Boolean).join(' | ');
        if (options.onNodeFailure !== 'skip' && options.onNodeFailure !== 'continue') {
          errors.push(context);
        }
        nodeOutputs.set(node.id, {});
        nodeResults.set(node.id, {
          nodeId: node.id,
          specId: node.specId,
          label: name,
          success: false,
          outputs: {},
          sideEffects: [],
          error: context,
          duration: Date.now() - nodeStart,
          inputKeys: Object.keys(inputs).filter((key) => !key.startsWith('_')),
          outputKeys: [],
        });
        const errorContext: Record<string, unknown> = {
          specId: node.specId,
          inputKeys: Object.keys(inputs).filter((key) => !key.startsWith('_')),
          duration: Date.now() - nodeStart,
          errorMessage: errMsg,
        };
        if (options.debug) {
          errorContext.variableSnapshot = Object.fromEntries(
            Object.entries(inputs).filter(([key]) => !key.startsWith('_')),
          );
        }
        debugEvents.push({
          id: `${requestId}:${node.id}:error`,
          timestamp: Date.now(),
          level: 'error',
          source: 'workflow-node',
          title: name,
          message: context,
          workflowId: options.targetNodeId,
          nodeId: node.id,
          context: errorContext,
        });
        if (options.onNodeFailure !== 'skip' && options.onNodeFailure !== 'continue') {
          return;
        }
      }
    };

    let aborted = false;
    if (options.parallel) {
      const levels = groupByTopologicalLevel(sorted, edges);
      for (const level of levels) {
        if (aborted) break;
        await Promise.all(level.map(n => executeNode(n)));
        if (hasNodeFailures && options.onNodeFailure !== 'skip' && options.onNodeFailure !== 'continue') {
          aborted = true;
        }
      }
    } else {
      for (const node of sorted) {
        await executeNode(node);
        if (hasNodeFailures && options.onNodeFailure !== 'skip' && options.onNodeFailure !== 'continue') {
          break;
        }
      }
    }
  }

  function buildResult(): FlowExecutionResult {
    const finalOutputs: Record<string, unknown> = {};
    for (const node of sorted) {
      const outEdges = edges.filter((e) => e.source === node.id);
      if (outEdges.length === 0) {
        const nodeOut = nodeOutputs.get(node.id);
        if (nodeOut) {
          Object.assign(finalOutputs, nodeOut);
          if (node.specId === 'workflow:export' && nodeOut.result && typeof nodeOut.result === 'object' && !Array.isArray(nodeOut.result)) {
            Object.assign(finalOutputs, nodeOut.result as Record<string, unknown>);
          }
        }
      }
    }
    if (errors.length === 0 && options.checkpointId && !options.keepCheckpointOnSuccess) clearCheckpoint(options.checkpointId);
    const success = errors.length === 0 && !hasNodeFailures;
    if (options.transactionalSideEffects && success) {
      sideEffects.push(...pendingSideEffects);
    }
    return {
      success,
      nodeResults,
      finalOutputs,
      sideEffects,
      errors,
      totalDuration: Date.now() - startTime,
      debug: {
        requestId,
        workflowId: options.targetNodeId,
        executedNodeCount: nodeResults.size,
        exportKeys: Object.keys(finalOutputs),
        duration: Date.now() - startTime,
        errors,
        events: debugEvents,
      },
    };
  }
}
