/**
 * 生成服务端流程校验用的节点端口目录（含类型）。
 *
 * 数据来源：
 * - 客户端注册表（generic/scenario/curated XLSX 方法），在 tsx 下可用；
 * - ui/nodes 目录下各节点包的 schema.json（tsx 无法加载 import.meta.glob，因此从文件系统补齐）。
 *
 * 运行：npx tsx scripts/generate-node-ports.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNodeRegistry } from '../ui/src/flowRegistry';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const nodesRoot = join(repoRoot, 'ui', 'nodes');
const target = join(repoRoot, '.codex', 'skills', 'formflow-project-editor', 'references', 'node-ports-v2.json');

type PortEntry = { name: string; type: string; required: boolean };
type NodePorts = { inputs: PortEntry[]; outputs: Array<Omit<PortEntry, 'required'>> };

function normalizePackageId(id: string): string {
  if (id.startsWith('generic-')) return `generic:${id.slice('generic-'.length)}`;
  if (id.startsWith('ml-')) return `ml:${id.slice('ml-'.length)}`;
  return id;
}

const reference: Record<string, NodePorts> = {};

// 1) 客户端注册表（tsx 下包含 generic/scenario/curated 方法）
const registry = await loadNodeRegistry();
for (const spec of registry.specs) {
  reference[spec.id] = {
    inputs: spec.ports
      .filter((port) => port.direction === 'input' || port.direction === 'both')
      .map((port) => ({ name: port.name, type: port.type, required: !!port.required })),
    outputs: spec.ports
      .filter((port) => port.direction === 'output' || port.direction === 'both')
      .map((port) => ({ name: port.name, type: port.type })),
  };
}

// 2) 节点包 schema（tsx 无法解析 import.meta.glob，从文件系统读取；代码内定义的同名 spec 优先）
const packageDirs = readdirSync(nodesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(nodesRoot, entry.name, 'schema.json')));
for (const entry of packageDirs) {
  const schema = JSON.parse(readFileSync(join(nodesRoot, entry.name, 'schema.json'), 'utf8'));
  if (!/^(func-|behavior[-:]|generic[-:]|ml[-:]|form:|data:|logic:|flow:)/.test(schema.id)) continue;
  const id = normalizePackageId(schema.id);
  if (reference[id]) continue;
  const ports = schema.ports || [];
  reference[id] = {
    inputs: ports
      .filter((port: any) => port.direction === 'input' || port.direction === 'both')
      .map((port: any) => ({ name: port.name, type: port.type, required: !!port.required })),
    outputs: ports
      .filter((port: any) => port.direction === 'output' || port.direction === 'both')
      .map((port: any) => ({ name: port.name, type: port.type })),
  };
}

const sorted = Object.fromEntries(Object.keys(reference).sort().map((key) => [key, reference[key]]));
writeFileSync(target, JSON.stringify(sorted, null, 2) + '\n');
console.log(`node-ports-v2.json: ${Object.keys(sorted).length} nodes -> ${target}`);
