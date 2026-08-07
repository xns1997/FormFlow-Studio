/**
 * 把仓库内既有的节点/控件声明转换为 JSON Schema：
 * - ui/nodes 各目录 schema.json 的 SchemaProperty 列表 → 节点 data 对象 / 端口值 schema
 * - designer PropDef / CompositePropDef → 复杂属性草稿 schema
 * 转换结果仅供 Monaco 结构 lint/补全与本地校验使用，不参与运行期数据。
 */
import type { SchemaProperty } from '../../flowRegistry';
import type { PropSchemaEntry, PropValueType } from '../../designer/types';
import type { JsonSchema } from './validator';

const OBJECT_TYPES = new Set(['object', 'json', 'style', 'filter', 'sort-config', 'validation-rule']);
const ARRAY_TYPES = new Set(['array', 'aoa', 'headers', 'options', 'string[]', 'object[]', 'unknown[][]', 'json-rows']);

/** PropertyType（节点声明）→ JSON Schema。 */
export function propertyTypeToJsonSchema(type: string | undefined, extra?: Pick<SchemaProperty, 'enum' | 'min' | 'max'>): JsonSchema {
  const normalized = String(type || '').toLowerCase();
  const schema: JsonSchema = {};
  if (normalized === 'string' || normalized === 'code' || normalized === 'csv-string' || normalized === 'html-string') {
    schema.type = 'string';
  } else if (normalized === 'number') {
    schema.type = 'number';
    if (extra?.min !== undefined) schema.minimum = extra.min;
    if (extra?.max !== undefined) schema.maximum = extra.max;
  } else if (normalized === 'boolean') {
    schema.type = 'boolean';
  } else if (normalized === 'enum') {
    schema.enum = extra?.enum?.length ? extra.enum : ['']; // 空 enum 视作任意字符串
  } else if (OBJECT_TYPES.has(normalized)) {
    schema.type = 'object';
  } else if (ARRAY_TYPES.has(normalized)) {
    schema.type = 'array';
    if (normalized === 'string[]') schema.items = { type: 'string' };
    else if (normalized === 'object[]' || normalized === 'json-rows') schema.items = { type: 'object' };
    else if (normalized === 'unknown[][]') schema.items = { type: 'array' };
    else schema.items = {};
  } else {
    // any / workbook / worksheet / cell / address / trigger / file-data 等：不约束
  }
  return schema;
}

/** SchemaProperty 列表 → 节点 data 对象 schema（严格校验声明字段，允许附加键）。 */
export function nodePropertiesToJsonSchema(props: SchemaProperty[] | undefined): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  (props || []).forEach((prop) => {
    properties[prop.name] = propertyTypeToJsonSchema(prop.type, prop);
    if (prop.required) required.push(prop.name);
  });
  return { type: 'object', properties, required, additionalProperties: true };
}

/** 单个端口/属性值 schema（StructuredSchemaEditor 使用；type 放开为字符串以兼容结构化类型）。 */
export function schemaPropertyToJsonSchema(prop: { type?: string; enum?: string[]; min?: number; max?: number }): JsonSchema {
  return propertyTypeToJsonSchema(prop.type, prop);
}

const KIND_OBJECT_SCHEMAS = new Set([
  'number-range', 'date-range', 'selection-range', 'mapping', 'key-value',
  'dimension-metric', 'typography', 'spacing', 'border', 'radius', 'shadow',
  'opacity', 'dimension', 'upload-constraints', 'date-default-config',
  'date-constraint-config', 'date-business-day-config', 'option-content',
  'option-advanced', 'data-binding', 'option-source',
]);

const KIND_ARRAY_SCHEMAS = new Set([
  'options', 'string-list', 'table-columns', 'filters', 'sorting',
  'tabs', 'steps', 'validation-rules', 'display-conditions',
]);

/** 按编辑器 kind 给复杂属性草稿一个结构 schema（未知 kind 退回按 type 推断）。 */
export function complexPropertySchemaForKind(kind: string): JsonSchema {
  if (KIND_OBJECT_SCHEMAS.has(kind)) return { type: 'object' };
  if (KIND_ARRAY_SCHEMAS.has(kind)) return { type: 'array' };
  return {};
}

function propValueTypeToJsonSchema(type: PropValueType, options?: Array<{ label: string; value: unknown }>): JsonSchema {
  const schema: JsonSchema = {};
  switch (type) {
    case 'string': case 'color': case 'date': case 'datetime': case 'time':
    case 'json-string':
      schema.type = 'string';
      break;
    case 'number': schema.type = 'number'; break;
    case 'boolean': schema.type = 'boolean'; break;
    case 'select':
      if (options?.length) schema.enum = options.map((option) => option.value);
      else schema.type = 'string';
      break;
    case 'json': case 'object': case 'range': schema.type = 'object'; break;
    case 'array': schema.type = 'array'; break;
    case 'string[]': schema.type = 'array'; schema.items = { type: 'string' }; break;
    case 'object[]': schema.type = 'array'; schema.items = { type: 'object' }; break;
    case 'unknown[][]': schema.type = 'array'; schema.items = { type: 'array' }; break;
    default: break;
  }
  return schema;
}

/** PropDef / CompositePropDef → 复杂属性草稿 JSON Schema。 */
export function propDefToJsonSchema(def: PropSchemaEntry): JsonSchema {
  if ('keys' in def) {
    const properties: Record<string, JsonSchema> = {};
    const childSchema = complexPropertySchemaForKind(def.editor || 'json');
    def.keys.forEach((key) => {
      properties[key] = childSchema;
    });
    return { type: 'object', properties, required: def.keys, additionalProperties: false };
  }
  const kindSchema = complexPropertySchemaForKind(def.editor || 'json');
  if (Object.keys(kindSchema).length) return kindSchema;
  return propValueTypeToJsonSchema(def.type, def.options);
}
