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
import { executeFlow, type FlowEdgeDef, type FlowNodeDef } from '../src/services/engine/flowEngine';

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
