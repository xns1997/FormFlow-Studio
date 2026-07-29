/**
 * 节点文档自动生成器
 * 从 FlowNodeSpec 元数据提取端口定义和参数表
 */

import type { FlowNodeSpec } from '../../../../nodes/registry';
import type { SchemaPort, SchemaProperty } from '../../../../nodes/excel-api-types';

export interface FlowNodePortDoc {
  name: string;
  label: string;
  type: string;
  direction: 'input' | 'output' | 'both';
  required?: boolean;
  description: string;
  defaultValue?: unknown;
  enum?: string[];
}

export interface FlowNodePropertyDoc {
  name: string;
  label: string;
  type: string;
  defaultValue?: unknown;
  required?: boolean;
  description: string;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface NodeDocData {
  id: string;
  label: string;
  description: string;
  kind: string;
  inputs: FlowNodePortDoc[];
  outputs: FlowNodePortDoc[];
  properties: FlowNodePropertyDoc[];
}

/**
 * 从 SchemaPort 转换为 FlowNodePortDoc
 */
function portToDoc(port: SchemaPort): FlowNodePortDoc {
  return {
    name: port.name,
    label: port.label,
    type: port.type,
    direction: port.direction,
    required: port.required,
    description: port.description,
    defaultValue: port.defaultValue,
    enum: port.enum,
  };
}

/**
 * 从 SchemaProperty 转换为 FlowNodePropertyDoc
 */
function propertyToDoc(prop: SchemaProperty): FlowNodePropertyDoc {
  return {
    name: prop.name,
    label: prop.label,
    type: prop.type,
    defaultValue: prop.default,
    required: prop.required,
    description: prop.description,
    enum: prop.enum,
    min: prop.min,
    max: prop.max,
  };
}

/**
 * 从单个 FlowNodeSpec 生成文档数据
 */
export function generateNodeDoc(spec: FlowNodeSpec): NodeDocData {
  const inputs: FlowNodePortDoc[] = [];
  const outputs: FlowNodePortDoc[] = [];

  for (const port of spec.ports) {
    if (port.direction === 'input' || port.direction === 'both') {
      inputs.push(portToDoc(port));
    }
    if (port.direction === 'output' || port.direction === 'both') {
      outputs.push(portToDoc(port));
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    kind: spec.kind,
    inputs,
    outputs,
    properties: spec.properties.map(propertyToDoc),
  };
}

/**
 * 从节点注册表批量生成所有节点的文档数据
 * 按 category 分组
 */
export function generateAllNodeDocs(specs: FlowNodeSpec[]): Map<string, NodeDocData[]> {
  const grouped = new Map<string, NodeDocData[]>();

  for (const spec of specs) {
    const category = spec.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(generateNodeDoc(spec));
  }

  return grouped;
}

/**
 * 生成节点的 Markdown 端口表
 */
export function generatePortTableMarkdown(ports: FlowNodePortDoc[], title: string): string {
  if (ports.length === 0) return '';

  let md = `### ${title}\n\n`;
  md += '| 端口名 | 类型 | 必填 | 说明 |\n';
  md += '|--------|------|------|------|\n';

  for (const port of ports) {
    const required = port.required ? '✅' : '❌';
    md += `| ${port.label} | \`${port.type}\` | ${required} | ${port.description} |\n`;
  }

  return md + '\n';
}

/**
 * 生成节点的 Markdown 参数表
 */
export function generatePropertyTableMarkdown(props: FlowNodePropertyDoc[]): string {
  if (props.length === 0) return '';

  let md = '### 参数配置\n\n';
  md += '| 参数名 | 类型 | 默认值 | 说明 |\n';
  md += '|--------|------|--------|------|\n';

  for (const prop of props) {
    const defaultVal = prop.defaultValue !== undefined ? String(prop.defaultValue) : '-';
    md += `| ${prop.label} | \`${prop.type}\` | ${defaultVal} | ${prop.description} |\n`;
  }

  return md + '\n';
}
