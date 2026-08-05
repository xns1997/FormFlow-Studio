import type { FlowNodeSpec } from './registry';
import type { NodeExecutor } from './types';
import type { NodeExecutorLoader, NodeSchemaModule } from './package-modules';

export interface NodePackage {
  name: string;
  schema: NodeSchemaModule;
  loadExecutor?: NodeExecutorLoader;
}

const PACKAGE_SCHEMA_RE = /^\.\/([^/]+)\/schema\.json$/;

/** 规范化节点包 ID（小写、去非法字符）。 */
export function normalizeNodePackageId(id: string): string {
  if (id.startsWith('generic-')) return `generic:${id.slice('generic-'.length)}`;
  if (id.startsWith('ml-')) return `ml:${id.slice('ml-'.length)}`;
  return id;
}

/** 是否为注册表节点包（id 以 registry: 前缀）。 */
export function isRegistryNodePackage(schema: NodeSchemaModule): boolean {
  return typeof schema.id === 'string' && /^(func-|behavior[-:]|generic[-:]|ml[-:]|form:|data:|logic:|flow:)/.test(schema.id);
}

/** 发现并加载节点包（schema 目录 + 插件覆盖）。 */
export function discoverNodePackages(
  schemas: Record<string, NodeSchemaModule>,
  executors: Record<string, NodeExecutorLoader>,
): NodePackage[] {
  return Object.entries(schemas)
    .flatMap(([path, schema]) => {
      const name = PACKAGE_SCHEMA_RE.exec(path)?.[1];
      if (!name || !isRegistryNodePackage(schema)) return [];
      return [{ name, schema, loadExecutor: executors[`./${name}/index.ts`] }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 节点包 → FlowNodeSpec。 */
export function nodePackageToSpec(pkg: NodePackage): FlowNodeSpec {
  const { schema } = pkg;
  const id = normalizeNodePackageId(schema.id);
  return {
    id,
    label: schema.label,
    description: schema.description,
    category: schema.category,
    kind: id.startsWith('behavior-') || id.startsWith('behavior:') || id.startsWith('form:') ? 'behavior' : (schema.kind || 'generic'),
    properties: schema.properties || [],
    ports: schema.ports || [],
    keywords: schema.keywords || [],
    originalName: schema.originalName,
  };
}

/** 执行节点包（懒加载执行器）。 */
export async function executeNodePackage(
  loadExecutor: NodeExecutorLoader,
  args: unknown[],
  properties: Record<string, unknown>,
): Promise<unknown> {
  const execute: NodeExecutor | undefined = await loadExecutor();
  if (typeof execute !== 'function') throw new Error('节点包未导出 execute 方法');
  return execute(args, properties);
}
