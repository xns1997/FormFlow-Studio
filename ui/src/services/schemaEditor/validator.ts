/**
 * 极简 JSON Schema（draft-07 子集）校验器。
 *
 * 仅覆盖本仓库实体与属性 JSON Schema 实际用到的关键字：
 * type（含联合数组）、properties、required、additionalProperties、items、
 * enum、const、pattern、minimum/maximum、minItems/maxItems、minLength/maxLength。
 * 不解析 $ref / oneOf / anyOf，避免引入完整校验引擎依赖。
 */

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  [key: string]: unknown;
}

export interface SchemaViolation {
  path: string;
  message: string;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    default: return true;
  }
}

function typeNames(type: string | string[]): string {
  return Array.isArray(type) ? type.join(' / ') : type;
}

/** 校验 value 是否符合 schema，返回违规清单（path 为 JSON 指针风格的路径）。 */
export function validateJsonSchema(value: unknown, schema: JsonSchema | undefined, path = '$'): SchemaViolation[] {
  if (!schema) return [];
  const violations: SchemaViolation[] = [];
  // JSON 没有 undefined；JS 对象里的 undefined 属性视作缺失，不参与校验。
  if (value === undefined) return [];

  if (schema.enum !== undefined && !schema.enum.some((item) => item === value)) {
    violations.push({ path, message: `必须是枚举值之一：${schema.enum.map((item) => JSON.stringify(item)).join('、')}` });
  }
  if (schema.const !== undefined && schema.const !== value) {
    violations.push({ path, message: `必须是固定值 ${JSON.stringify(schema.const)}` });
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      violations.push({ path, message: `类型必须为 ${typeNames(schema.type)}，实际为 ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}` });
      return violations;
    }
  }

  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      violations.push({ path, message: `不匹配格式 ${schema.pattern}` });
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      violations.push({ path, message: `长度不能小于 ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      violations.push({ path, message: `长度不能大于 ${schema.maxLength}` });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      violations.push({ path, message: `不能小于 ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      violations.push({ path, message: `不能大于 ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      violations.push({ path, message: `至少需要 ${schema.minItems} 项` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      violations.push({ path, message: `最多 ${schema.maxItems} 项` });
    }
    if (schema.items) {
      value.forEach((item, index) => {
        violations.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    const record = value as Record<string, unknown>;
    (schema.required || []).forEach((key) => {
      if (!(key in record)) violations.push({ path, message: `缺少必填字段 "${key}"` });
    });
    Object.entries(schema.properties).forEach(([key, child]) => {
      if (key in record) violations.push(...validateJsonSchema(record[key], child, `${path}.${key}`));
    });
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
      Object.keys(record).forEach((key) => {
        if (!schema.properties || !(key in schema.properties)) {
          if (typeof schema.additionalProperties === 'object') {
            violations.push(...validateJsonSchema(record[key], schema.additionalProperties, `${path}.${key}`));
          } else {
            violations.push({ path: `${path}.${key}`, message: `未知字段 "${key}"` });
          }
        }
      });
    }
  }

  return violations;
}

/** 校验 value 并返回首条违规消息（供 UI 内联提示）。 */
export function firstSchemaViolation(value: unknown, schema: JsonSchema | undefined): string {
  const violations = validateJsonSchema(value, schema);
  return violations.length ? `${violations[0].path}：${violations[0].message}` : '';
}
