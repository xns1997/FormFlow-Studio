/**
 * Schema 编辑器注册中心：为四类实体文档提供稳定 model URI，并把 JSON Schema
 * 注册到 Monaco jsonDefaults，使 Monaco 对匹配 URI 的模型做结构校验与补全。
 */
import type { Monaco } from '@monaco-editor/react';
import designFileSchema from '../../../../shared/schemas/design-file.schema.json';
import workflowFileSchema from '../../../../shared/schemas/workflow-file.schema.json';
import tableConfigSchema from '../../../../shared/schemas/table-config.schema.json';
import projectSettingsSchema from '../../../../shared/schemas/project-settings.schema.json';

export type EntityJsonKind = 'design' | 'workflow' | 'table-config' | 'settings';

interface MonacoJsonDefaults {
  diagnosticsOptions: {
    schemas?: Array<{ uri: string; fileMatch?: string[]; schema?: unknown }>;
    [key: string]: unknown;
  };
  setDiagnosticsOptions(options: {
    schemas?: Array<{ uri: string; fileMatch?: string[]; schema?: unknown }>;
    [key: string]: unknown;
  }): void;
}

/** monaco.d.ts 0.55 将 JSON 语言服务标记为顶层命名空间，此处用结构类型兼容。 */
function jsonDefaultsOf(monaco: Monaco): MonacoJsonDefaults | null {
  const jsonApi = (monaco as unknown as { json?: { jsonDefaults?: MonacoJsonDefaults } }).json;
  return jsonApi?.jsonDefaults || null;
}

export const JSON_MODEL_BASE = 'inmemory://model/formflow-json';

export const ENTITY_SCHEMA_URIS: Record<EntityJsonKind, string> = {
  design: 'formflow://schemas/design-file.json',
  workflow: 'formflow://schemas/workflow-file.json',
  'table-config': 'formflow://schemas/table-config.json',
  settings: 'formflow://schemas/project-settings.json',
};

export const ENTITY_SCHEMAS: Record<EntityJsonKind, unknown> = {
  design: designFileSchema,
  workflow: workflowFileSchema,
  'table-config': tableConfigSchema,
  settings: projectSettingsSchema,
};

export const ENTITY_FILE_MATCH: Record<EntityJsonKind, string[]> = {
  design: [`${JSON_MODEL_BASE}/design/*.json`],
  workflow: [`${JSON_MODEL_BASE}/workflow/*.json`],
  'table-config': [`${JSON_MODEL_BASE}/table-config/*.json`],
  settings: [`${JSON_MODEL_BASE}/settings/*.json`],
};

/** 生成实体 JSON 编辑器的稳定 model URI。 */
export function jsonModelPath(kind: EntityJsonKind, id: string): string {
  const safeId = encodeURIComponent(id || 'unknown');
  return `${JSON_MODEL_BASE}/${kind}/${safeId}.json`;
}

/** 判断某个 model URI 是否属于实体 JSON 编辑器。 */
export function isEntityJsonModel(uri: string): boolean {
  return uri.startsWith(`${JSON_MODEL_BASE}/`);
}

/** 判断 model URI 是否属于指定实体类型。 */
export function isEntityJsonModelOfKind(uri: string, kind: EntityJsonKind): boolean {
  return uri.startsWith(`${JSON_MODEL_BASE}/${kind}/`);
}

let registered = false;

/** 一次性把四份实体 JSON Schema 注册到 Monaco（worker 会在首次使用 json 语言时加载）。 */
export function setupEntityJsonSchemas(monaco: Monaco): void {
  if (registered) return;
  registered = true;
  const defaults = jsonDefaultsOf(monaco);
  if (!defaults) return;
  const current = defaults.diagnosticsOptions;
  const schemas = [...(current.schemas || [])];
  (Object.keys(ENTITY_SCHEMAS) as EntityJsonKind[]).forEach((kind) => {
    schemas.push({
      uri: ENTITY_SCHEMA_URIS[kind],
      fileMatch: ENTITY_FILE_MATCH[kind],
      schema: ENTITY_SCHEMAS[kind],
    });
  });
  defaults.setDiagnosticsOptions({
    ...current,
    validate: true,
    allowComments: false,
    trailingCommas: 'error',
    comments: 'error',
    schemaValidation: 'error',
    schemas,
  });
}

/** 注册（或替换）一个按 URI 关联的 JSON Schema（用于属性级/端口级编辑器）。 */
export function upsertJsonSchema(
  monaco: Monaco,
  uri: string,
  fileMatch: string[],
  schema: unknown,
): void {
  const defaults = jsonDefaultsOf(monaco);
  if (!defaults) return;
  const current = defaults.diagnosticsOptions;
  const others = (current.schemas || []).filter((entry: { uri: string }) => entry.uri !== uri);
  defaults.setDiagnosticsOptions({
    ...current,
    schemas: [...others, { uri, fileMatch, schema }],
  });
}

const registeredSchemaUris = new Set<string>();

/** 属性级/端口级编辑器的稳定 model URI（与 fileMatch 精确匹配）。 */
export function propertySchemaUri(kind: string, key: string): string {
  return `${JSON_MODEL_BASE}/property/${encodeURIComponent(kind)}/${encodeURIComponent(key)}.json`;
}

export function portValueSchemaUri(type: string, name: string): string {
  return `${JSON_MODEL_BASE}/port-value/${encodeURIComponent(type)}/${encodeURIComponent(name)}.json`;
}

/** 按 URI 幂等注册一份 JSON Schema（同一 URI 只注册一次）。 */
export function ensureJsonSchema(monaco: Monaco, uri: string, schema: unknown): void {
  if (registeredSchemaUris.has(uri)) return;
  registeredSchemaUris.add(uri);
  upsertJsonSchema(monaco, uri, [uri], schema);
}
