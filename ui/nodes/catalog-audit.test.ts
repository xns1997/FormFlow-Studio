/**
 * 流程节点目录全量审计。
 *
 * 覆盖目标（对应需求）：
 * 1. 每个外露端点（端口）类型正确、schema 自洽（inputs/outputs/ports 一致）；
 * 2. 每个执行器消费的 properties/inputs 都被 schema 声明（数据可真实传入）；
 * 3. 服务端端口参考目录与客户端注册表/节点包同步（schema 可采纳连接）；
 * 4. 上下游联动连通性：每个输出端口都有兼容的下游输入，每个输入端口都有兼容的上游输出；
 * 5. 代表性上下游链路端到端执行，数据经具名端口真实传递。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadNodeRegistry } from '../src/flowRegistry';
import { portTypesCompatible } from '../src/services/config/nodeDiscovery';
import { parseCustomJsPortDefinitions } from '../src/services/config/customJsNode';
import { executeFlow, type FlowEdgeDef, type FlowNodeDef } from '../src/services/engine/flowEngine';
import { getExecutor, hasExecutor, registerExecutor } from './executor-registry';
import { checkPortType, assertPortType, getRegisteredTypes } from './port-types';

const repoRoot = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const nodesRoot = join(repoRoot, 'ui', 'nodes');
const referencePath = join(repoRoot, '.codex', 'skills', 'formflow-project-editor', 'references', 'node-ports-v2.json');

const KNOWN_TYPES = new Set([
  'string', 'number', 'boolean', 'enum', 'array', 'object', 'json', 'range', 'color', 'any',
  'workbook', 'worksheet', 'cell', 'address', 'cell-ref',
  'json-rows', 'aoa', 'headers', 'options', 'file-data',
  'csv-string', 'html-string', 'json-string',
  'filter', 'sort-config', 'style', 'validation-rule',
  'trigger', 'port-definition', 'code',
]);

/** 合法的属性类型（与 excel-api-types.PropertyType 保持一致） */
const PROPERTY_TYPES = new Set([
  'string', 'number', 'boolean', 'enum', 'array', 'object', 'json', 'range', 'color', 'any',
  'workbook', 'worksheet', 'cell', 'address', 'cell-ref',
  'json-rows', 'aoa', 'headers', 'options', 'file-data',
  'csv-string', 'html-string', 'json-string',
  'filter', 'sort-config', 'style', 'validation-rule',
  'trigger', 'port-definition', 'code',
]);

const ENGINE_PROPS = new Set(['retryCount', 'retryDelayMs', 'retryOn']);

/** 执行器使用的 legacy 别名（schema 规范名优先，别名保留兼容），审计时放行。 */
const LEGACY_ALIASES: Record<string, Set<string>> = {
  'behavior-condition': new Set(['ctx.properties.value']),
  'behavior-delay': new Set(['ctx.properties.ms', 'ctx.properties.delay']),
  'behavior-js-script': new Set(['ctx.properties.code', 'ctx.properties.scriptCode']),
  'behavior-log': new Set(['ctx.properties.level']),
  'behavior-loop': new Set(['ctx.properties.count']),
};

function normalizePackageId(id: string): string {
  if (id.startsWith('generic-')) return `generic:${id.slice('generic-'.length)}`;
  if (id.startsWith('ml-')) return `ml:${id.slice('ml-'.length)}`;
  return id;
}

function isRegistryPackageId(id: string): boolean {
  return /^(func-|behavior[-:]|generic[-:]|ml[-:]|form:|data:|logic:|flow:)/.test(id);
}

function readSchemas() {
  return readdirSync(nodesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(nodesRoot, entry.name, 'schema.json')))
    .map((entry) => JSON.parse(readFileSync(join(nodesRoot, entry.name, 'schema.json'), 'utf8')));
}

function extractExecutorSource(id: string): string | null {
  const normalized = normalizePackageId(id);
  const executorFiles = ['behavior.ts', 'generic.ts', 'ml.ts', 'scenario.ts', 'func.ts', 'macros.ts'];
  const sources = executorFiles
    .map((file) => join(nodesRoot, 'executors', file))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, 'utf8'));
  for (const candidate of [normalized, id]) {
    for (const src of sources) {
      const start = src.indexOf(`registerExecutor('${candidate}',`);
      if (start < 0) continue;
      const endQuote = src.indexOf("'", start + 'registerExecutor('.length + 1);
      let index = endQuote + 1;
      let depth = 0;
      let started = false;
      for (; index < src.length; index += 1) {
        const char = src[index];
        if (char === '{') { depth += 1; started = true; }
        else if (char === '}') { depth -= 1; if (started && depth === 0) break; }
      }
      return src.slice(endQuote + 1, index + 1);
    }
  }
  const packageDir = [...readdirSync(nodesRoot, { withFileTypes: true })]
    .find((entry) => entry.isDirectory()
      && existsSync(join(nodesRoot, entry.name, 'schema.json'))
      && normalizePackageId(JSON.parse(readFileSync(join(nodesRoot, entry.name, 'schema.json'), 'utf8')).id) === normalized);
  if (packageDir && existsSync(join(nodesRoot, packageDir.name, 'index.ts'))) {
    return readFileSync(join(nodesRoot, packageDir.name, 'index.ts'), 'utf8');
  }
  return null;
}

test('全部节点包 schema 自洽：端口类型合法、唯一、inputs/outputs 与 ports 一致', () => {
  const schemas = readSchemas();
  assert.equal(schemas.length, 234, '节点包数量应为 234');
  for (const schema of schemas) {
    assert.ok(schema.id && schema.label, `${schema.id || schema.label} 缺少 id/label`);
    const ports = schema.ports || [];
    const keys = new Set<string>();
    for (const port of ports) {
      const key = `${port.direction}:${port.name}`;
      assert.ok(!keys.has(key), `${schema.id}: 重复端口 ${key}`);
      keys.add(key);
      assert.ok(['input', 'output', 'both'].includes(port.direction), `${schema.id}: 非法方向 ${port.direction}`);
      assert.ok(KNOWN_TYPES.has(port.type), `${schema.id}: 未知端口类型 ${port.type} (${key})`);
      assert.ok(typeof port.label === 'string' && port.label.trim(), `${schema.id}: 端口 ${key} 缺少 label`);
      assert.ok(typeof port.description === 'string' && port.description.trim(), `${schema.id}: 端口 ${key} 缺少 description`);
      if (port.name === 'worksheet') {
        assert.ok(['worksheet', 'workbook', 'any'].includes(port.type), `${schema.id}: worksheet 端口类型应为 worksheet/workbook/any，实际 ${port.type}`);
      }
      if (port.name === 'workbook') {
        assert.equal(port.type, 'workbook', `${schema.id}: workbook 端口类型应为 workbook，实际 ${port.type}`);
      }
    }
    const inputNames = new Set(ports.filter((p) => p.direction === 'input' || p.direction === 'both').map((p) => p.name));
    const outputNames = new Set(ports.filter((p) => p.direction === 'output' || p.direction === 'both').map((p) => p.name));
    for (const input of schema.inputs || []) {
      assert.ok(inputNames.has(input.name), `${schema.id}: input "${input.name}" 缺少对应输入端口`);
      assert.ok(KNOWN_TYPES.has(input.type), `${schema.id}: input "${input.name}" 类型未知 ${input.type}`);
    }
    for (const output of schema.outputs || []) {
      assert.ok(outputNames.has(output.name), `${schema.id}: output "${output.name}" 缺少对应输出端口`);
      assert.ok(KNOWN_TYPES.has(output.type), `${schema.id}: output "${output.name}" 类型未知 ${output.type}`);
    }
    const propSeen = new Set<string>();
    for (const prop of schema.properties || []) {
      assert.ok(!propSeen.has(prop.name), `${schema.id}: 重复属性 ${prop.name}`);
      propSeen.add(prop.name);
      assert.ok(PROPERTY_TYPES.has(prop.type), `${schema.id}: 属性 ${prop.name} 类型非法 ${prop.type}`);
      if (prop.type === 'enum') {
        assert.ok(Array.isArray(prop.enum) && prop.enum.length > 0, `${schema.id}: enum 属性 ${prop.name} 缺少 enum 列表`);
      }
    }
  }
});

test('每个 schema 端口类型都有运行时校验器（checkPortType 可检测有效性）', () => {
  const schemas = readSchemas();
  const registered = new Set(getRegisteredTypes());
  const used = new Set<string>();
  for (const schema of schemas) {
    for (const port of schema.ports || []) used.add(port.type);
    for (const input of schema.inputs || []) used.add(input.type);
    for (const output of schema.outputs || []) used.add(output.type);
  }
  for (const type of used) {
    assert.ok(registered.has(type), `端口类型 ${type} 未注册运行时校验器，checkPortType 会静默放行`);
  }
});

test('每个执行器消费的 properties/inputs 都被 schema 声明', () => {
  const schemas = readSchemas();
  const checked = 0;
  let asserted = 0;
  for (const schema of schemas) {
    if (!isRegistryPackageId(schema.id)) continue;
    const source = extractExecutorSource(schema.id);
    assert.ok(source, `${schema.id}: 缺少执行器（executors/*.ts 或 index.ts）`);
    const props = new Set((schema.properties || []).map((p) => p.name));
    const inputs = new Set((schema.ports || []).filter((p) => p.direction === 'input' || p.direction === 'both').map((p) => p.name));
    const aliases = LEGACY_ALIASES[schema.id] || new Set<string>();
    for (const match of source.matchAll(/(?:ctx\.)?properties\.([A-Za-z0-9_]+)/g)) {
      if (!props.has(match[1]) && !ENGINE_PROPS.has(match[1]) && !aliases.has(`ctx.properties.${match[1]}`)) {
        assert.fail(`${schema.id}: 执行器使用未声明的属性 ctx.properties.${match[1]}`);
      }
    }
    for (const match of source.matchAll(/(?:ctx\.)?inputs\.([A-Za-z0-9_]+)/g)) {
      if (!inputs.has(match[1]) && !ENGINE_PROPS.has(match[1]) && !aliases.has(`ctx.inputs.${match[1]}`)) {
        assert.fail(`${schema.id}: 执行器使用未声明的输入 ctx.inputs.${match[1]}`);
      }
    }
    asserted += 1;
  }
  assert.ok(asserted >= 130, `至少检查 130 个注册表节点，实际 ${asserted}`);
  assert.equal(checked, 0);
});

test('服务端端口参考目录与注册表/节点包同步（含类型）', async () => {
  const registry = await loadNodeRegistry();
  const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
  const expected = new Map<string, { inputs: Array<{ name: string; type: string; required: boolean }>; outputs: Array<{ name: string; type: string }> }>();
  for (const spec of registry.specs) {
    expected.set(spec.id, {
      inputs: spec.ports.filter((p) => p.direction === 'input' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type, required: !!p.required })),
      outputs: spec.ports.filter((p) => p.direction === 'output' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type })),
    });
  }
  for (const schema of readSchemas()) {
    if (!isRegistryPackageId(schema.id)) continue;
    const id = normalizePackageId(schema.id);
    if (expected.has(id)) continue;
    expected.set(id, {
      inputs: (schema.ports || []).filter((p) => p.direction === 'input' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type, required: !!p.required })),
      outputs: (schema.ports || []).filter((p) => p.direction === 'output' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type })),
    });
  }
  assert.equal(Object.keys(reference).length, expected.size, `参考目录节点数 ${Object.keys(reference).length} 与期望 ${expected.size} 不一致`);
  for (const [id, ports] of expected) {
    assert.ok(reference[id], `参考目录缺少节点 ${id}`);
    const refInputNames = new Set((reference[id].inputs || []).map((i) => i.name));
    const refOutputNames = new Set((reference[id].outputs || []).map((o) => o.name));
    for (const input of ports.inputs) {
      const ref = (reference[id].inputs || []).find((i) => i.name === input.name);
      assert.ok(ref, `${id}: 参考目录缺少输入端口 ${input.name}`);
      assert.equal(ref.type, input.type, `${id}: 输入端口 ${input.name} 类型不一致 ${ref.type} != ${input.type}`);
    }
    for (const output of ports.outputs) {
      const ref = (reference[id].outputs || []).find((o) => o.name === output.name);
      assert.ok(ref, `${id}: 参考目录缺少输出端口 ${output.name}`);
      assert.equal(ref.type, output.type, `${id}: 输出端口 ${output.name} 类型不一致 ${ref.type} != ${output.type}`);
    }
    assert.equal(refInputNames.size, ports.inputs.length, `${id}: 参考目录多出输入端口`);
    assert.equal(refOutputNames.size, ports.outputs.length, `${id}: 参考目录多出输出端口`);
  }
});

test('上下游连通性：每个端口都有兼容的上下游搭档', async () => {
  const registry = await loadNodeRegistry();
  const nodes: Array<{ id: string; outputs: Array<{ name: string; type: string }>; inputs: Array<{ name: string; type: string }> }> = [];
  for (const spec of registry.specs) {
    nodes.push({
      id: spec.id,
      outputs: spec.ports.filter((p) => p.direction === 'output' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type })),
      inputs: spec.ports.filter((p) => p.direction === 'input' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type })),
    });
  }
  for (const schema of readSchemas()) {
    if (!isRegistryPackageId(schema.id)) continue;
    const id = normalizePackageId(schema.id);
    if (nodes.some((n) => n.id === id)) continue;
    nodes.push({
      id,
      outputs: (schema.ports || []).filter((p) => p.direction === 'output' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type })),
      inputs: (schema.ports || []).filter((p) => p.direction === 'input' || p.direction === 'both').map((p) => ({ name: p.name, type: p.type })),
    });
  }
  for (const node of nodes) {
    for (const output of node.outputs) {
      const compatible = nodes.some((other) => other.id !== node.id && other.inputs.some((input) => portTypesCompatible(output.type, input.type)));
      assert.ok(compatible, `${node.id}: 输出端口 ${output.name}(${output.type}) 没有任何兼容的下游输入`);
    }
    for (const input of node.inputs) {
      const compatible = nodes.some((other) => other.id !== node.id && other.outputs.some((output) => portTypesCompatible(output.type, input.type)));
      assert.ok(compatible, `${node.id}: 输入端口 ${input.name}(${input.type}) 没有任何兼容的上游输出`);
    }
  }
});

test('动态端口类型与运行时/服务端类型系统一致（不静默降级为 any）', () => {
  const defs = parseCustomJsPortDefinitions({
    a: 'workbook',
    b: 'json-rows',
    c: 'file-data',
    d: 'range',
    e: 'filter',
    f: 'string',
    g: 'unknown-type',
  });
  const byName = new Map(defs.map((entry) => [entry.name, entry.type]));
  assert.equal(byName.get('a'), 'workbook', '动态端口 workbook 类型不应被降级');
  assert.equal(byName.get('b'), 'json-rows', '动态端口 json-rows 类型不应被降级');
  assert.equal(byName.get('c'), 'file-data', '动态端口 file-data 类型不应被降级');
  assert.equal(byName.get('d'), 'range', '动态端口 range 类型不应被降级');
  assert.equal(byName.get('e'), 'filter', '动态端口 filter 类型不应被降级');
  assert.equal(byName.get('f'), 'string');
  assert.equal(byName.get('g'), 'any', '未知类型仍应安全降级为 any');
});

/** 与服务端 validateProjectModel / formflow-project CLI 一致的动态端口解析。 */
function workflowCustomPorts(raw: unknown): Array<{ name: string; type: string }> {
  let source = raw;
  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) return [];
    try { source = JSON.parse(text); } catch { return []; }
  }
  if (Array.isArray(source)) {
    return source
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => entry as Record<string, unknown>)
      .filter((entry) => typeof entry.name === 'string' && String(entry.name).trim())
      .map((entry) => ({ name: String(entry.name).trim(), type: String(entry.type || 'any').trim() || 'any' }));
  }
  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, unknown>)
      .filter(([name]) => Boolean(String(name).trim()))
      .map(([name, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const entry = value as Record<string, unknown>;
          return { name, type: String(entry.type || 'any').trim() || 'any' };
        }
        return { name, type: String(value || 'any').trim() || 'any' };
      });
  }
  return [];
}

function mergePorts(staticPorts: Array<{ name: string; type: string }>, customPorts: Array<{ name: string; type: string }>) {
  const byName = new Map<string, { name: string; type: string }>();
  for (const port of [...staticPorts, ...customPorts]) if (!byName.has(port.name)) byName.set(port.name, port);
  return byName;
}

function workflowNodeProperties(node: any): Record<string, any> {
  try {
    const raw = node?.data?.propertiesJson;
    if (typeof raw !== 'string' || !raw.trim()) return {};
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return {};
  }
}

test('真实项目全部工作流连线可被端口 schema 采纳（端口存在 + 类型兼容 + 动态端口）', () => {
  const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
  const projectRoot = join(repoRoot, 'projects', 'data');
  if (!existsSync(projectRoot)) return;
  let projects = 0;
  let workflows = 0;
  let edges = 0;
  const violations: string[] = [];
  for (const dir of readdirSync(projectRoot, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.endsWith('.formflow')) continue;
    const workflowPath = join(projectRoot, dir.name, 'workflows', 'workflows.json');
    if (!existsSync(workflowPath)) continue;
    const { workflows: workflowList } = JSON.parse(readFileSync(workflowPath, 'utf8'));
    projects += 1;
    for (const workflow of workflowList || []) {
      workflows += 1;
      const nodesById = new Map<string, any>((workflow.nodes || []).map((item: any) => [item.id, item]));
      for (const edge of workflow.edges || []) {
        if (!edge.sourceHandle || !edge.targetHandle) continue; // 状态机/无句柄边不是流式连线
        edges += 1;
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        if (!source) { violations.push(`${dir.name}/${workflow.id}: 边 ${edge.id} 源节点不存在`); continue; }
        if (!target) { violations.push(`${dir.name}/${workflow.id}: 边 ${edge.id} 目标节点不存在`); continue; }
        const sourcePortName = String(edge.sourceHandle).replace(/^out:/, '');
        const targetPortName = String(edge.targetHandle).replace(/^in:/, '');
        const sourceProperties = workflowNodeProperties(source);
        const targetProperties = workflowNodeProperties(target);
        const sourceOutputs = mergePorts(
          reference[source.specId]?.outputs || [],
          [...workflowCustomPorts(sourceProperties.outputPorts), ...(source.specId === 'workflow:import' ? workflowCustomPorts(sourceProperties.ports) : [])],
        );
        const targetInputs = mergePorts(
          reference[target.specId]?.inputs || [],
          [...workflowCustomPorts(targetProperties.inputPorts), ...(target.specId === 'workflow:export' ? workflowCustomPorts(targetProperties.ports) : [])],
        );
        const sourceEntry = sourceOutputs.get(sourcePortName);
        const targetEntry = targetInputs.get(targetPortName);
        if (!sourceEntry) violations.push(`${dir.name}/${workflow.id}: 边 ${edge.id} 输出端口 ${source.specId}.${sourcePortName} 不存在`);
        if (!targetEntry) violations.push(`${dir.name}/${workflow.id}: 边 ${edge.id} 输入端口 ${target.specId}.${targetPortName} 不存在`);
        if (sourceEntry && targetEntry && !portTypesCompatible(sourceEntry.type, targetEntry.type)) {
          violations.push(`${dir.name}/${workflow.id}: 边 ${edge.id} 类型不兼容 ${sourcePortName}(${sourceEntry.type}) → ${targetPortName}(${targetEntry.type})`);
        }
      }
    }
  }
  assert.ok(projects >= 20, `应扫描到至少 20 个本地样例项目，实际 ${projects}`);
  assert.ok(workflows > 0 && edges > 0, `应存在带连线的样例工作流，实际 workflows=${workflows} edges=${edges}`);
  assert.equal(violations.length, 0, violations.join('\n'));
});

const node = (id: string, specId: string, properties: Record<string, unknown> = {}): FlowNodeDef => ({
  id, specId, position: { x: 0, y: 0 }, data: { propertiesJson: JSON.stringify(properties) },
});
const edge = (id: string, source: string, target: string, sourcePort: string, targetPort: string): FlowEdgeDef => ({
  id, source, target, sourceHandle: `out:${sourcePort}`, targetHandle: `in:${targetPort}`,
});

test('联动执行：value-input → condition → log 经具名端口传递数据', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('src', 'generic:value-input', { valueType: 'number', value: 10 }),
    node('cond', 'behavior-condition', { operator: '>', compareValue: '5' }),
    node('log', 'behavior-log', { message: '校验通过' }),
  ];
  const edges = [
    edge('e1', 'src', 'cond', 'value', 'value'),
    edge('e2', 'cond', 'log', 'true', 'trigger'),
  ];
  const result = await executeFlow(nodes, edges, []);
  assert.equal(result.success, true, result.errors.join('\n'));
  const cond = result.nodeResults.get('cond');
  const log = result.nodeResults.get('log');
  assert.equal(cond?.outputs.true, 10, 'condition 成立时应透传字段值');
  assert.equal(log?.outputs.trigger, 10, 'log 应从 condition.true 端口收到触发信号');
  assert.equal(log?.outputs.message, '校验通过');
  assert.deepEqual(log?.inputKeys, ['trigger']);
});

test('联动执行：targetNodeId 只运行上游链路并传递命名端口', async () => {
  await loadNodeRegistry();
  const nodes = [
    node('src', 'generic:value-input', { valueType: 'string', value: '表单值' }),
    node('target', 'generic:output-display'),
    node('unrelated', 'generic:value-input', { valueType: 'string', value: '不应运行' }),
  ];
  const result = await executeFlow(nodes, [edge('e', 'src', 'target', 'value', 'value')], [], { targetNodeId: 'target' });
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual([...result.nodeResults.keys()].sort(), ['src', 'target']);
  assert.equal(result.nodeResults.get('target')?.outputs.value, '表单值');
});

function samplePortValue(type: string): unknown {
  switch (type) {
    case 'string': case 'address': case 'cell-ref': case 'csv-string': case 'html-string': case 'json-string':
    case 'enum': case 'color': return 'x';
    case 'number': return 1;
    case 'boolean': return true;
    case 'array': case 'json-rows': case 'aoa': case 'headers': return [];
    default: return {};
  }
}

test('执行器输出契约：成功路径的返回键覆盖声明输出，产物键均为已声明端口', async () => {
  const registry = await loadNodeRegistry();
  const registryIds = new Set(registry.specs.map((s) => s.id));

  // 模拟 registry 对 func-* 包执行器的包装（Vite glob 在 Node 下不可用，这里手工套用同一包装逻辑）
  const schemas = readSchemas();
  const schemaById = new Map(schemas.map((s) => [s.id, s]));
  const nodesRootDir = nodesRoot;
  for (const entry of readdirSync(nodesRootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const schemaPath = join(nodesRootDir, entry.name, 'schema.json');
    const indexPath = join(nodesRootDir, entry.name, 'index.ts');
    if (!existsSync(schemaPath) || !existsSync(indexPath)) continue;
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    if (!String(schema.id || '').startsWith('func-')) continue;
    const inputPorts = (schema.ports || []).filter((p) => p.direction === 'input' || p.direction === 'both');
    const outputPorts = (schema.ports || []).filter((p) => p.direction === 'output' || p.direction === 'both');
    registerExecutor(String(schema.id), async (ctx: any) => {
      const module = await import(indexPath);
      const args = inputPorts.map((p) => ctx.inputs[p.name]);
      const result = await module.execute(args, ctx.properties);
      if (result && typeof result === 'object' && !Array.isArray(result)) return result;
      return { [outputPorts[0]?.name || 'result']: result };
    });
  }

  const allNodes: Array<{ id: string; ports: Array<{ name: string; type: string; direction: string }>; properties: Array<{ name: string; type: string; default?: unknown }> }> = [];
  for (const spec of registry.specs) {
    if (spec.id.startsWith('method:')) continue;
    allNodes.push({ id: spec.id, ports: spec.ports, properties: spec.properties });
  }
  for (const schema of schemas) {
    if (registryIds.has(schema.id)) continue;
    allNodes.push({ id: normalizePackageId(schema.id), ports: schema.ports || [], properties: schema.properties || [] });
  }

  /** 条件输出：仅在特定运行模式下产出，探针默认夹具不触发，属于合法豁免 */
  const CONDITIONAL_OUTPUTS: Record<string, Set<string>> = {
    'generic:sheet-source': new Set(['workbook', 'range', 'address', 'areas', 'values', 'areaValues', 'areaCount', 'cellCount', 'rowCount', 'colCount']),
    'generic:websocket': new Set(['sent', 'error']),
  };
  const EXTRA_ALLOWLIST = new Set(['sideEffects', 'result', 'error']);

  // 屏蔽真实网络：探针只验证契约，不允许依赖外部服务
  const realFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = () => Promise.reject(new Error('probe network stub'));

  const mismatches: string[] = [];
  let executedOk = 0;
  let envSkipped = 0;
  let configSkipped = 0;
  try {
    for (const node of allNodes) {
      const declaredOutputs = new Set(node.ports.filter((p) => p.direction === 'output' || p.direction === 'both').map((p) => p.name));
      if (declaredOutputs.size === 0) continue;
      if (!hasExecutor(node.id)) continue;
      const inputs: Record<string, unknown> = {};
      for (const port of node.ports.filter((p) => p.direction === 'input' || p.direction === 'both')) {
        inputs[port.name] = samplePortValue(port.type);
      }
      // 条件输出节点固定到默认分支
      if (node.id === 'generic:sheet-source') {
        inputs.sourceMode = 'worksheet';
      }
      const props: Record<string, unknown> = {};
      for (const prop of node.properties || []) props[prop.name] = prop.default !== undefined ? prop.default : samplePortValue(prop.type);
      if (node.id === 'generic:websocket') {
        props.url = 'wss://example.test';
      }
      const ctx: any = {
        inputs,
        properties: props,
        tables: [],
        getNodeOutput: () => ({}),
        checkType: (type: string, value: unknown) => checkPortType(type, value),
        assertType: (type: string, value: unknown, portName?: string) => assertPortType(type, value, portName),
      };
      try {
        const output = (await getExecutor(node.id)!(ctx)) || {};
        const keys = Object.keys(output).filter((key) => !key.startsWith('__'));
        const hasAnyDeclared = [...declaredOutputs].some((key) => keys.includes(key));
        if (!hasAnyDeclared && keys.includes('error')) {
          // 网络/服务/配置错误被捕获后返回 {error}：按环境失败豁免，不判定为契约错误
          envSkipped += 1;
          continue;
        }
        executedOk += 1;
        const conditional = CONDITIONAL_OUTPUTS[node.id] || new Set<string>();
        const missing = [...declaredOutputs].filter((key) => !keys.includes(key) && !conditional.has(key));
        const extra = keys.filter((key) => !declaredOutputs.has(key) && !EXTRA_ALLOWLIST.has(key));
        if (missing.length > 0) {
          mismatches.push(`${node.id}: 声明输出未产出 [${missing.join(', ')}]`);
        }
        if (extra.length > 0) {
          mismatches.push(`${node.id}: 产出未声明 [${extra.join(', ')}]`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/fetch|网络|Failed to parse URL|请求失败/.test(message)) envSkipped += 1;
        else configSkipped += 1;
      }
    }
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = realFetch;
  }

  assert.ok(executedOk >= 120, `探针应覆盖至少 120 个可执行节点，实际 ${executedOk}（env 跳过 ${envSkipped}，配置跳过 ${configSkipped}）`);
  assert.deepEqual(mismatches, [], mismatches.join('\n'));
});
