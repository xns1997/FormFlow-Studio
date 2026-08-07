/**
 * 实体 JSON 的语义层 lint 与补全（结构层由 JSON Schema + Monaco 负责）。
 * 语义问题一律为 warning：不阻断保存/切换，但会在问题条与编辑器内联提示。
 */
import type { EntityJsonKind } from './registry';

export interface SemanticIssue {
  severity: 'warning';
  message: string;
  /** 便于定位的路径片段（用于查找行号）。 */
  path?: string;
}

export interface SemanticContext {
  /** 表单设计：已注册控件类型。 */
  componentTypes?: string[];
  /** 可解析的数据字段名。 */
  fieldNames?: string[];
  /** 流程：已注册节点 specId。 */
  nodeSpecIds?: string[];
  /** 流程：specId → 节点属性声明。 */
  nodePropertiesBySpec?: Record<string, Array<{ name: string; required?: boolean; type?: string }>>;
  /** 数据表 id 集合。 */
  tableIds?: string[];
  /** tableId → sheet 名列表。 */
  sheetNamesByTable?: Record<string, string[]>;
  /** 数据表配置：当前 Sheet 的表头。 */
  headers?: string[];
}

function uniqueIds(items: Array<{ id?: unknown }> | undefined): Map<string, number> {
  const seen = new Map<string, number>();
  (items || []).forEach((item) => {
    const id = String(item?.id ?? '');
    seen.set(id, (seen.get(id) || 0) + 1);
  });
  return seen;
}

function fieldName(value: unknown): string {
  return String(value ?? '');
}

export function lintDesignFile(json: unknown, ctx: SemanticContext = {}): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  if (!json || typeof json !== 'object') return issues;
  const design = json as Record<string, unknown>;
  const components = Array.isArray(design.components) ? design.components : [];
  const bindings = Array.isArray(design.bindings) ? design.bindings : [];

  const ids = uniqueIds(components as Array<{ id?: unknown }>);
  ids.forEach((count, id) => {
    if (id && count > 1) issues.push({ severity: 'warning', message: `控件 id "${id}" 重复（${count} 次）`, path: 'components' });
  });

  components.forEach((raw, index) => {
    const component = raw as Record<string, unknown>;
    const type = String(component.type || '');
    if (ctx.componentTypes?.length && type && !ctx.componentTypes.includes(type)) {
      issues.push({ severity: 'warning', message: `控件类型 "${type}" 未注册`, path: `components[${index}].type` });
    }
    const parentId = fieldName(component.parentId);
    if (parentId && !ids.has(parentId)) {
      issues.push({ severity: 'warning', message: `控件 "${component.id}" 的 parentId 引用不存在的控件 "${parentId}"`, path: `components[${index}].parentId` });
    }
    const binding = fieldName(component.fieldBinding);
    if (binding && !binding.startsWith('_') && ctx.fieldNames?.length && !ctx.fieldNames.includes(binding)) {
      issues.push({ severity: 'warning', message: `字段引用 "${binding}" 未在数据表中找到`, path: `components[${index}].fieldBinding` });
    }
    const children = Array.isArray(component.children) ? component.children : [];
    children.forEach((childId) => {
      if (!ids.has(String(childId))) {
        issues.push({ severity: 'warning', message: `控件 "${component.id}" 的 children 引用了不存在的控件 "${String(childId)}"`, path: `components[${index}].children` });
      }
    });
  });

  bindings.forEach((raw, index) => {
    const binding = raw as Record<string, unknown>;
    const sourceId = fieldName(binding.sourceId);
    const targetId = fieldName(binding.targetId);
    if (sourceId && !ids.has(sourceId)) {
      issues.push({ severity: 'warning', message: `绑定 "${binding.id}" 的 sourceId 引用不存在的控件 "${sourceId}"`, path: `bindings[${index}].sourceId` });
    }
    if (targetId && !ids.has(targetId)) {
      issues.push({ severity: 'warning', message: `绑定 "${binding.id}" 的 targetId 引用不存在的控件 "${targetId}"`, path: `bindings[${index}].targetId` });
    }
  });

  return issues;
}

export function lintWorkflowFile(json: unknown, ctx: SemanticContext = {}): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  if (!json || typeof json !== 'object') return issues;
  const workflow = json as Record<string, unknown>;
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];

  const ids = uniqueIds(nodes as Array<{ id?: unknown }>);
  ids.forEach((count, id) => {
    if (id && count > 1) issues.push({ severity: 'warning', message: `节点 id "${id}" 重复（${count} 次）`, path: 'nodes' });
  });

  nodes.forEach((raw, index) => {
    const node = raw as Record<string, unknown>;
    const specId = String(node.specId || '');
    if (ctx.nodeSpecIds?.length && specId && !ctx.nodeSpecIds.includes(specId)) {
      issues.push({ severity: 'warning', message: `节点类型 "${specId}" 未在节点库中注册`, path: `nodes[${index}].specId` });
    }
    const propertiesJson = String((node.data as Record<string, unknown> | undefined)?.propertiesJson || '{}');
    let properties: Record<string, unknown>;
    try {
      properties = JSON.parse(propertiesJson);
    } catch {
      issues.push({ severity: 'warning', message: `节点 "${node.id}" 的 propertiesJson 不是合法 JSON`, path: `nodes[${index}].data` });
      return;
    }
    const declared = ctx.nodePropertiesBySpec?.[specId];
    if (declared) {
      declared.forEach((prop) => {
        if (prop.required && (properties[prop.name] === undefined || properties[prop.name] === '')) {
          issues.push({ severity: 'warning', message: `节点 "${node.id}" 缺少必填配置 "${prop.name}"`, path: `nodes[${index}].data` });
        }
      });
    }
    if (properties.tableId && ctx.tableIds?.length && !ctx.tableIds.includes(String(properties.tableId))) {
      issues.push({ severity: 'warning', message: `节点 "${node.id}" 引用了不存在的数据表 "${String(properties.tableId)}"`, path: `nodes[${index}].data` });
    }
    if (properties.tableId && properties.sheetName) {
      const sheets = ctx.sheetNamesByTable?.[String(properties.tableId)];
      if (sheets?.length && !sheets.includes(String(properties.sheetName))) {
        issues.push({ severity: 'warning', message: `节点 "${node.id}" 引用了不存在的工作表 "${String(properties.sheetName)}"`, path: `nodes[${index}].data` });
      }
    }
  });

  edges.forEach((raw, index) => {
    const edge = raw as Record<string, unknown>;
    const source = String(edge.source || '');
    const target = String(edge.target || '');
    if (source && !ids.has(source)) {
      issues.push({ severity: 'warning', message: `连线 "${edge.id}" 的起点节点 "${source}" 不存在`, path: `edges[${index}].source` });
    }
    if (target && !ids.has(target)) {
      issues.push({ severity: 'warning', message: `连线 "${edge.id}" 的终点节点 "${target}" 不存在`, path: `edges[${index}].target` });
    }
    if (source && source === target) {
      issues.push({ severity: 'warning', message: `连线 "${edge.id}" 连接了自身（自环）`, path: `edges[${index}]` });
    }
    if (!edge.sourceHandle || !edge.targetHandle) {
      issues.push({ severity: 'warning', message: `连线 "${edge.id}" 缺少端口名（sourceHandle/targetHandle）`, path: `edges[${index}]` });
    }
  });

  return issues;
}

export function lintTableConfig(json: unknown, ctx: SemanticContext = {}): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  if (!json || typeof json !== 'object') return issues;
  const config = json as Record<string, unknown>;
  const headers = ctx.headers || [];
  if (!headers.length) return issues;

  const keyFields = Array.isArray(config.keyFields) ? config.keyFields.map(fieldName) : [];
  if (keyFields.length === 0) {
    issues.push({ severity: 'warning', message: '未配置主键字段；可编辑数据建议先设置主键', path: 'keyFields' });
  }
  keyFields.forEach((field) => {
    if (!headers.includes(field)) issues.push({ severity: 'warning', message: `主键字段 "${field}" 不在当前表头中`, path: 'keyFields' });
  });

  const checkColumnList = (key: string, label: string) => {
    const list = Array.isArray(config[key]) ? config[key].map(fieldName) : [];
    list.forEach((column) => {
      if (!headers.includes(column)) issues.push({ severity: 'warning', message: `${label} "${column}" 不在当前表头中`, path: key });
    });
  };
  checkColumnList('hiddenColumns', '隐藏列');
  checkColumnList('lockedColumns', '锁定列');

  const defaultSort = config.defaultSort as Record<string, unknown> | null;
  if (defaultSort && typeof defaultSort === 'object' && !headers.includes(String(defaultSort.column || ''))) {
    issues.push({ severity: 'warning', message: `默认排序列 "${String(defaultSort.column)}" 不在当前表头中`, path: 'defaultSort' });
  }

  ['columnWidths', 'columnDescriptions', 'columnTags'].forEach((key) => {
    const record = config[key];
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      Object.keys(record).forEach((column) => {
        if (!headers.includes(column)) issues.push({ severity: 'warning', message: `配置项 "${column}" 不在当前表头中`, path: key });
      });
    }
  });

  const groupByColumn = Number(config.groupByColumn);
  if (Number.isFinite(groupByColumn) && config.groupByColumn !== null && groupByColumn >= headers.length) {
    issues.push({ severity: 'warning', message: `分组列索引 ${groupByColumn} 超出表头范围（${headers.length} 列）`, path: 'groupByColumn' });
  }

  const sequenceRules = config.sequenceRules;
  if (sequenceRules && typeof sequenceRules === 'object' && !Array.isArray(sequenceRules)) {
    Object.keys(sequenceRules).forEach((column) => {
      if (!headers.includes(column)) issues.push({ severity: 'warning', message: `序号规则列 "${column}" 不在当前表头中`, path: 'sequenceRules' });
    });
  }

  return issues;
}

export function lintSettings(json: unknown): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  if (!json || typeof json !== 'object') return issues;
  const settings = (json as Record<string, unknown>).settings as Record<string, unknown> | undefined;
  if (!settings) return issues;
  const behavior = settings.behavior as Record<string, unknown> | undefined;
  if (behavior) {
    if (typeof behavior.scriptTimeout === 'number' && behavior.scriptTimeout < 0) {
      issues.push({ severity: 'warning', message: '脚本超时不能为负数', path: 'settings.behavior.scriptTimeout' });
    }
    if (typeof behavior.loopProtection === 'number' && behavior.loopProtection < 1) {
      issues.push({ severity: 'warning', message: '循环保护上限至少为 1', path: 'settings.behavior.loopProtection' });
    }
  }
  const workflow = settings.workflow as Record<string, unknown> | undefined;
  if (workflow) {
    const ranges: Array<[string, number, number]> = [
      ['maxConcurrency', 1, 16],
      ['retryCount', 0, 5],
      ['nodeTimeout', 1000, 600000],
      ['overallTimeout', 5000, 3600000],
    ];
    ranges.forEach(([key, min, max]) => {
      const value = Number(workflow[key]);
      if (Number.isFinite(value) && (value < min || value > max)) {
        issues.push({ severity: 'warning', message: `${key} 超出推荐范围 ${min}–${max}`, path: `settings.workflow.${key}` });
      }
    });
  }
  return issues;
}

export function lintEntityJson(kind: EntityJsonKind, json: unknown, ctx: SemanticContext = {}): SemanticIssue[] {
  switch (kind) {
    case 'design': return lintDesignFile(json, ctx);
    case 'workflow': return lintWorkflowFile(json, ctx);
    case 'table-config': return lintTableConfig(json, ctx);
    case 'settings': return lintSettings(json);
  }
}

/** 按当前行上下文返回语义补全（结构补全由 Monaco JSON Schema 提供）。 */
export function semanticCompletionsFor(kind: EntityJsonKind, ctx: SemanticContext = {}): Array<{ label: string; detail: string }> {
  switch (kind) {
    case 'design':
      return [
        ...(ctx.componentTypes || []).map((type) => ({ label: type, detail: '已注册控件类型' })),
        ...(ctx.fieldNames || []).slice(0, 200).map((field) => ({ label: field, detail: '数据字段' })),
      ];
    case 'workflow':
      return (ctx.nodeSpecIds || []).map((specId) => ({ label: specId, detail: '节点库类型' }));
    case 'table-config':
      return (ctx.headers || []).map((header) => ({ label: header, detail: '当前表头' }));
    case 'settings':
      return [];
  }
}

/** 判断当前行是否适合插入某个补全（粗略按引号与冒号上下文判断）。 */
export function shouldOfferSemanticCompletion(kind: EntityJsonKind, linePrefix: string, itemLabel: string): boolean {
  if (kind === 'settings') return false;
  const keys: Array<[RegExp, boolean]> = [
    [/"type"\s*:/, false],
    [/"fieldBinding"\s*:/, false],
    [/"specId"\s*:/, false],
    [/"keyFields"\s*:/, true],
    [/"columnWidths"\s*:/, true],
    [/"columnDescriptions"\s*:/, true],
    [/"columnTags"\s*:/, true],
    [/"hiddenColumns"\s*:/, true],
    [/"lockedColumns"\s*:/, true],
    [/"defaultSort"\s*:/, true],
    [/"sequenceRules"\s*:/, true],
  ];
  const matched = keys.filter(([pattern]) => pattern.test(linePrefix));
  if (!matched.length) return true;
  const allowInObject = matched.some(([, inObject]) => inObject);
  return allowInObject;
}

