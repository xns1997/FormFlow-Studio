import { getRegistrySync, resolveMethod, type FlowNodeSpec } from '../flowRegistry';
import { getExecutor, hasExecutor, type NodeExecContext } from '../../nodes/executor-registry';
import { checkPortType, assertPortType } from '../../nodes/port-types';
import type { SrcTableEntry } from '../project/types';
import { getNodeEffectivePorts, resolveNodeProperties } from './customJsNode';
import { extractNodeSideEffects, type FlowSideEffect } from './flowSideEffects';

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
}

export interface FlowExecutionResult {
  success: boolean;
  nodeResults: Map<string, NodeExecutionResult>;
  finalOutputs: Record<string, unknown>;
  sideEffects: FlowSideEffect[];
  errors: string[];
  totalDuration: number;
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

function collectInputs(
  nodeId: string,
  edges: FlowEdgeDef[],
  nodeOutputs: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const edge of edges) {
    if (edge.target === nodeId) {
      const srcOutput = nodeOutputs.get(edge.source);
      if (!srcOutput) throw new Error(`上游节点 ${edge.source} 尚未执行`);
      const portName = extractPortName(edge.targetHandle, 'in');
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
  }
  return inputs;
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
  /** Values injected into generic:variable-input nodes by their configured varName. */
  variables?: Record<string, unknown>;
  /** Values injected into concrete node input ports. Connected edges take precedence. */
  nodeInputs?: Record<string, Record<string, unknown>>;
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
  const errors: string[] = [];

  const getNodeOutput = (nodeId: string) => nodeOutputs.get(nodeId) || {};

  for (const node of sorted) {
    const nodeStart = Date.now();
    const colonIdx = node.specId.indexOf(':');
    const kind = colonIdx > -1 ? node.specId.slice(0, colonIdx) : 'unknown';
    const name = colonIdx > -1 ? node.specId.slice(colonIdx + 1) : node.specId;
    let inputs: Record<string, unknown> = {};
    let properties: Record<string, unknown> = {};

    try {
      const spec = getRegistrySync()?.byId.get(node.specId);
      properties = resolveNodeProperties(spec, (node.data as any)?.propertiesJson);
      const effectivePorts = getNodeEffectivePorts(spec, properties);
      const injectedInputs = { ...(options.nodeInputs?.[node.id] || {}) };
      if (node.specId === 'generic:variable-input') {
        const variableName = String(properties.varName || '');
        if (variableName && Object.prototype.hasOwnProperty.call(options.variables || {}, variableName)) {
          injectedInputs.override = options.variables![variableName];
        }
      }
      inputs = { ...injectedInputs, ...collectInputs(node.id, edges, nodeOutputs) };
      inputs = validateConnectedInputs({ ...spec, ports: effectivePorts } as FlowNodeSpec, inputs);
      let outputs: Record<string, unknown>;

      // 优先使用注册的执行器
      if (hasExecutor(node.specId)) {
        const executor = getExecutor(node.specId)!;
        const ctx: NodeExecContext = {
          inputs, properties, tables, getNodeOutput,
          checkType: (type: string, value: unknown) => checkPortType(type, value),
          assertType: (type: string, value: unknown, portName?: string) => assertPortType(type, value, portName),
        };
        outputs = await executor(ctx);
      } else if (kind === 'method') {
        outputs = await executeXlsxMethod(node.specId.replace('method:', ''), inputs, properties);
      } else {
        throw new Error(`节点缺少执行器: ${node.specId}`);
      }

      outputs = validateOutputs(effectivePorts, outputs);
      const nodeSideEffects = extractNodeSideEffects(outputs);
      sideEffects.push(...nodeSideEffects);

      nodeOutputs.set(node.id, outputs);
      nodeResults.set(node.id, {
        nodeId: node.id,
        specId: node.specId,
        label: name,
        success: true,
        outputs,
        sideEffects: nodeSideEffects,
        duration: Date.now() - nodeStart,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const inputKeys = Object.keys(inputs || {}).filter(k => !k.startsWith('_'));
      const propKeys = Object.keys(properties || {}).filter(k => properties[k] !== undefined && properties[k] !== '');
      const context = [
        `节点 ${name} (${node.specId})`,
        `错误: ${errMsg}`,
        inputKeys.length > 0 ? `输入端口: ${inputKeys.join(', ')}` : null,
        propKeys.length > 0 ? `配置: ${propKeys.slice(0, 5).join(', ')}` : null,
      ].filter(Boolean).join(' | ');
      errors.push(context);
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
      });
    }
  }

  const finalOutputs: Record<string, unknown> = {};
  for (const node of sorted) {
    const outEdges = edges.filter((e) => e.source === node.id);
    if (outEdges.length === 0) {
      const nodeOut = nodeOutputs.get(node.id);
      if (nodeOut) Object.assign(finalOutputs, nodeOut);
    }
  }

  return {
    success: errors.length === 0,
    nodeResults,
    finalOutputs,
    sideEffects,
    errors,
    totalDuration: Date.now() - startTime,
  };
}
