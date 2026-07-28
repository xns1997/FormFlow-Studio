import { createHash, randomUUID } from 'node:crypto';
import {
  batchProjectRows, fullSourceRows, generatedForm, normalizeFormDesign, toolError, validateProjectModel, type JsonObject,
} from './project-authoring';
import { queryRows, type FilterRule, type SortRule } from './data-preview';
import { generateFormScaffold } from '../../../ui/src/services/formGeneration/formScaffold';
import { applyBehaviorDslToComponents } from '../../../ui/src/services/engine/behaviorDsl';

export type TemplateKind = 'project' | 'operation' | 'fragment' | 'recipe';
export type FeasibilityStatus = 'ready' | 'needs-configuration' | 'warning' | 'blocked' | 'not-applicable';
export type CheckStatus = 'passed' | 'warning' | 'failed';
export type FieldRole = 'key' | 'query' | 'editable' | 'readonly' | 'dimension' | 'metric' | 'time' | 'target' | 'feature' | 'join-key';
export type NormalizedFieldType =
  | 'string'
  | 'long-text'
  | 'number'
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'
  | 'enum'
  | 'multi-enum'
  | 'email'
  | 'phone'
  | 'url'
  | 'file'
  | 'relation-key'
  | 'computed'
  | 'unknown';

export interface NormalizedField {
  id: string;
  name: string;
  qualifiedName: string;
  tableId: string;
  sheetName: string;
  source: { tableId: string; sheetName: string; field: string };
  type: NormalizedFieldType;
  typeConfidence: number;
  nullable: boolean;
  required: boolean;
  key: boolean;
  unique: boolean;
  readOnly: boolean;
  computed: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  sampleValues: unknown[];
  sampleQuality: {
    nonEmptyRatio: number;
    distinctRatio: number;
    sampleCount: number;
  };
  needsConfiguration: boolean;
  reasons: string[];
}

interface ResolvedFieldReference {
  input: string;
  field: string;
  tableId: string;
  sheetName: string;
  tableQualifiedName: string;
  qualifiedName: string;
  rowKey: string;
  type: NormalizedFieldType;
  normalized: NormalizedField;
}

export interface DataRelation {
  id: string;
  name: string;
  left: { tableId: string; sheetName: string; fields: string[] };
  right: { tableId: string; sheetName: string; fields: string[] };
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  defaultJoinType: 'inner' | 'left';
  integrity: 'enforced' | 'checked' | 'informational';
  onDelete: 'restrict' | 'set-null' | 'cascade';
}

export interface TemplateSelection {
  tableId?: string;
  sheetName?: string;
  tableIds?: string[];
  fields?: string[];
  relationIds?: string[];
  formId?: string;
  componentIds?: string[];
}

export interface FeasibilityCheck {
  code: string;
  status: CheckStatus;
  message: string;
  path?: string;
  fix?: { action: string; label: string; parameters?: JsonObject };
}

export interface FeasibilityReport {
  status: FeasibilityStatus;
  score: number;
  summary: string;
  checks: FeasibilityCheck[];
  inferredRoles: Array<{ field: string; role: FieldRole; confidence: number }>;
  requiredQuestions: Array<{ id: string; label: string; type: string; required: boolean }>;
  generationPreview?: GenerationSummary;
}

export interface GenerationSummary {
  forms: number;
  workflows: number;
  behaviors: number;
  outputs: number;
  tests: number;
  modifiesData: boolean;
  destructive: boolean;
}

export type EventFallbackReason =
  | 'focus-management'
  | 'component-interop'
  | 'client-formatting'
  | 'runtime-ui-only'
  | 'unsupported-declarative-gap';

export interface TemplateRuleArtifact {
  id: string;
  kind: 'rule';
  ownerFormId: string;
  implementationLayer: 'rule';
  reasonCode: string;
  businessGoal?: string;
  relatedFields?: string[];
  ruleCode: string;
}

export interface TemplateBehaviorArtifact {
  id: string;
  kind: 'behavior' | 'flow-trigger';
  ownerFormId: string;
  implementationLayer: 'workflow' | 'event';
  reasonCode: string;
  businessGoal?: string;
  relatedFields?: string[];
  eventFallbackReason?: EventFallbackReason;
  componentId?: string;
  behavior?: JsonObject;
  trigger?: JsonObject;
}

export interface TemplateArtifactBundle {
  forms: JsonObject[];
  rules: TemplateRuleArtifact[];
  behaviors: TemplateBehaviorArtifact[];
  workflows: JsonObject[];
  outputs: JsonObject[];
  tests: JsonObject[];
}

export interface OperationTemplateDefinition {
  id: string;
  version: string;
  kind: TemplateKind;
  category: 'entry' | 'maintenance' | 'cross-table' | 'analysis' | 'prediction' | 'fragment' | 'workflow';
  name: string;
  description: string;
  selectionContract: {
    accepts: Array<'table' | 'field' | 'relation' | 'form' | 'component'>;
    minTables?: number;
    maxTables?: number;
    minFields?: number;
    requiresKey?: boolean;
    requiresWritable?: boolean;
    requiresRelation?: boolean;
    requiresNumeric?: number;
    requiresTime?: boolean;
    minimumRows?: number;
  };
  parameterSchema: JsonObject;
  generation: GenerationSummary;
}

export interface TemplateRecommendation {
  template: OperationTemplateDefinition;
  report: FeasibilityReport;
  matchScore: number;
  roleCoverage: number;
  reasons: string[];
  suggestedParameters: JsonObject;
  unresolvedParameters: string[];
}

const parameters = (properties: JsonObject = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const base = (definition: Omit<OperationTemplateDefinition, 'version' | 'kind'> & Partial<Pick<OperationTemplateDefinition, 'version' | 'kind'>>): OperationTemplateDefinition => ({ version: '1.0.0', kind: 'operation', ...definition });

const commonFormParameters = {
  formId: { type: 'string' },
  name: { type: 'string' },
  title: { type: 'string' },
  subtitle: { type: 'string' },
  successMessage: { type: 'string', default: '操作成功' },
};

const scaffoldParameters = {
  ...commonFormParameters,
  columns: { enum: [1, 2, 3], default: 2 },
  includeReset: { type: 'boolean', default: true },
  saveLabel: { type: 'string' },
  lookupLabel: { type: 'string' },
  resetLabel: { type: 'string' },
  layoutMode: { enum: ['auto', 'single-column', 'double-column', 'triple-column', 'tabs', 'steps'], default: 'auto' },
  sectionMode: { enum: ['auto', 'none', 'by-role', 'by-type'], default: 'auto' },
  denseLayout: { type: 'boolean', default: false },
};

const entryTemplateParameters = {
  ...scaffoldParameters,
  selectedFields: { type: 'array', items: { type: 'string' } },
  defaultValues: { type: 'object', additionalProperties: true },
  computedExpressions: { type: 'object', additionalProperties: { type: 'string' } },
  linkageDsl: { type: 'array', items: { type: 'string' } },
  keyStrategy: { enum: ['insert', 'upsert'], default: 'upsert' },
  duplicatePolicy: { enum: ['error', 'update', 'skip'], default: 'error' },
  submitMode: { enum: ['create', 'save-continue'], default: 'create' },
  resultField: { type: 'string', default: '_写回结果' },
  changeLogField: { type: 'string', default: '_写回差异' },
  writeBackField: { type: 'string', default: '_写回状态' },
};

const lookupEditTemplateParameters = {
  ...scaffoldParameters,
  queryFields: { type: 'array', minItems: 1, items: { type: 'string' } },
  displayFields: { type: 'array', items: { type: 'string' } },
  editableFields: { type: 'array', minItems: 1, items: { type: 'string' } },
  autoQueryOnLoad: { type: 'boolean', default: false },
  queryMode: { enum: ['exact', 'any'], default: 'exact' },
  queryLimit: { type: 'integer', minimum: 1, maximum: 20, default: 2 },
  dirtyOnly: { type: 'boolean', default: true },
  refetchAfterSave: { type: 'boolean', default: true },
  conflictPolicy: { enum: ['error', 'refresh-and-retry'], default: 'error' },
  emptyResultMessage: { type: 'string', default: '未找到匹配记录' },
  multipleResultMessage: { type: 'string', default: '命中多条记录，请补充查询条件' },
  resultField: { type: 'string', default: '_查询结果' },
  changeLogField: { type: 'string', default: '_变更差异' },
  writeBackField: { type: 'string', default: '_更新状态' },
};

const previewParameters = {
  ...commonFormParameters,
  previewRows: { type: 'integer', minimum: 1, maximum: 50, default: 8 },
  detailRows: { type: 'integer', minimum: 1, maximum: 50, default: 8 },
  sampleRows: { type: 'integer', minimum: 1, maximum: 50, default: 8 },
  chartLimit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
};

export const OPERATION_TEMPLATES: readonly OperationTemplateDefinition[] = [
  base({ id: 'single-table-entry', category: 'entry', name: '单表数据录入', description: '按字段生成校验、保存和重置表单。', selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, minFields: 1, requiresWritable: true }, parameterSchema: parameters(entryTemplateParameters), generation: { forms: 1, workflows: 1, behaviors: 2, outputs: 0, tests: 3, modifiesData: false, destructive: false } }),
  base({ id: 'single-table-lookup-edit', category: 'maintenance', name: '单表查询修改', description: '生成查询、回填、并发检查和更新能力。', selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, minFields: 1, requiresKey: true, requiresWritable: true }, parameterSchema: parameters(lookupEditTemplateParameters, ['queryFields', 'editableFields']), generation: { forms: 1, workflows: 2, behaviors: 2, outputs: 0, tests: 7, modifiesData: false, destructive: false } }),
  base({ id: 'single-table-batch-update', category: 'maintenance', name: '表格批量更新', description: '生成跨页修改、差异摘要和整批原子提交。', selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, requiresKey: true, requiresWritable: true }, parameterSchema: parameters({ ...previewParameters, maxChanges: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }, submitLabel: { type: 'string' } }), generation: { forms: 1, workflows: 1, behaviors: 1, outputs: 0, tests: 6, modifiesData: false, destructive: false } }),
  base({ id: 'parallel-cross-table-entry', category: 'cross-table', name: '并列跨表录入', description: '在同一事务中新增或更新多张表。', selectionContract: { accepts: ['table', 'field', 'relation'], minTables: 2, requiresWritable: true }, parameterSchema: parameters({ ...previewParameters, atomic: { type: 'boolean', const: true }, tableOrder: { type: 'array', items: { type: 'string' } }, tableTitles: { type: 'object', additionalProperties: { type: 'string' } }, fieldsByTable: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }, sectionMode: { enum: ['auto', 'compact', 'by-table'], default: 'by-table' }, existingPolicy: { enum: ['skip', 'update', 'error'], default: 'error' }, statusField: { type: 'string', default: '_事务状态' }, diffField: { type: 'string', default: '_变更差异' }, successMessage: { type: 'string', default: '已准备跨表变更，提交过程保持原子性' }, failureMessage: { type: 'string', default: '事务未提交：发现冲突，请先修正后再试' }, showDiffPreview: { type: 'boolean', default: true }, submitLabel: { type: 'string' } }, ['atomic']), generation: { forms: 1, workflows: 1, behaviors: 1, outputs: 0, tests: 6, modifiesData: false, destructive: false } }),
  base({ id: 'master-detail-entry', category: 'cross-table', name: '主从表录入', description: '生成主记录、明细表格和主键传播事务。', selectionContract: { accepts: ['table', 'field', 'relation'], minTables: 2, maxTables: 2, requiresRelation: true, requiresWritable: true }, parameterSchema: parameters({ ...previewParameters, relationId: { type: 'string' }, masterFields: { type: 'array', items: { type: 'string' } }, detailFields: { type: 'array', items: { type: 'string' } }, detailTitle: { type: 'string' }, allowEmptyDetails: { type: 'boolean', default: false }, detailEditableMode: { enum: ['editable', 'readonly'], default: 'editable' }, duplicateDetailPolicy: { enum: ['error', 'skip', 'overwrite'], default: 'error' }, resultField: { type: 'string', default: '_主从提交结果' }, statusField: { type: 'string', default: '_事务状态' }, changeLogField: { type: 'string', default: '_变更差异' }, submitLabel: { type: 'string' } }, ['relationId']), generation: { forms: 1, workflows: 1, behaviors: 1, outputs: 0, tests: 6, modifiesData: false, destructive: false } }),
  base({ id: 'master-detail-view', category: 'cross-table', name: '主从详情', description: '按已声明的一对多关系生成主记录与嵌套明细浏览。', selectionContract: { accepts: ['table', 'field', 'relation'], minTables: 2, maxTables: 2, requiresRelation: true }, parameterSchema: parameters({ ...previewParameters, relationId: { type: 'string' }, joinType: { enum: ['left', 'inner'], default: 'left' }, pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 5 }, exportFormat: { enum: ['json', 'csv', 'xlsx'], default: 'json' }, submitLabel: { type: 'string' } }, ['relationId']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 4, modifiesData: false, destructive: false } }),
  base({ id: 'join-query-update', category: 'cross-table', name: '跨表查询与分表更新', description: '按声明关系查询并将修改准确写回来源表。', selectionContract: { accepts: ['table', 'field', 'relation'], minTables: 2, requiresRelation: true, requiresKey: true }, parameterSchema: parameters({ ...previewParameters, relationId: { type: 'string' }, joinType: { enum: ['left', 'inner'], default: 'left' }, queryFields: { type: 'array', minItems: 1, items: { type: 'string' } }, displayFields: { type: 'array', minItems: 1, items: { type: 'string' } }, editableFieldsLeft: { type: 'array', items: { type: 'string' } }, editableFieldsRight: { type: 'array', items: { type: 'string' } }, queryLimit: { type: 'integer', minimum: 1, maximum: 20, default: 2 }, autoQueryOnLoad: { type: 'boolean', default: false }, atomic: { type: 'boolean', const: true }, conflictPolicy: { enum: ['error', 'refresh-and-retry'], default: 'error' }, resultField: { type: 'string', default: '_联合查询结果' }, changeLogField: { type: 'string', default: '_变更差异' }, writeBackField: { type: 'string', default: '_更新状态' }, statusField: { type: 'string', default: '_联合查询状态' }, messageField: { type: 'string', default: '_联合查询状态' }, emptyResultMessage: { type: 'string', default: '未找到匹配记录' }, ambiguousResultMessage: { type: 'string', default: '命中多条记录，请继续收窄查询条件' }, multipleResultMessage: { type: 'string', default: '命中多条记录，请继续收窄查询条件' }, submitLabel: { type: 'string' } }, ['relationId', 'queryFields', 'displayFields', 'atomic']), generation: { forms: 1, workflows: 2, behaviors: 1, outputs: 1, tests: 4, modifiesData: false, destructive: false } }),
  base({ id: 'multi-table-batch-update', category: 'cross-table', name: '多表批量更新', description: '编辑多张表的变更集，预览逐表差异并在冲突预检通过后原子提交。', selectionContract: { accepts: ['table', 'field', 'relation'], minTables: 2, requiresKey: true, requiresWritable: true }, parameterSchema: parameters({ ...previewParameters, maxChanges: { type: 'integer', minimum: 1, maximum: 1000, default: 200 }, atomic: { type: 'boolean', const: true }, tableOrder: { type: 'array', items: { type: 'string' } }, fieldsByTable: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }, editableFieldsByTable: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }, showOnlyDirty: { type: 'boolean', default: true }, statusField: { type: 'string', default: '_事务状态' }, changeLogField: { type: 'string', default: '_变更差异' }, successMessage: { type: 'string', default: '已准备跨表批量变更，提交过程保持原子性' }, submitLabel: { type: 'string' } }, ['atomic']), generation: { forms: 1, workflows: 1, behaviors: 1, outputs: 0, tests: 7, modifiesData: false, destructive: false } }),
  base({ id: 'data-overview', category: 'analysis', name: '数据概览', description: '生成质量摘要、分布和可筛选明细。', selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, minimumRows: 1 }, parameterSchema: parameters({
    ...previewParameters,
    fields: { type: 'array', items: { type: 'string' } },
    resultField: { type: 'string', default: '_分析结果' },
    summaryField: { type: 'string', default: '_概览摘要' },
    chartField: { type: 'string', default: '_概览图' },
    messageField: { type: 'string', default: '_分析状态' },
    sampleField: { type: 'string', default: '_输入样本' },
    chartTitle: { type: 'string', default: '选中字段唯一值数量' },
    resultLabel: { type: 'string', default: '数据质量与分布' },
    chartMetric: { enum: ['唯一值', '缺失数'], default: '唯一值' },
    distributionLimit: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
    sampleValueLimit: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
  }), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 2, modifiesData: false, destructive: false } }),
  base({ id: 'kpi-dashboard', category: 'analysis', name: 'KPI 汇总看板', description: '生成指标卡、趋势、分组和明细。', selectionContract: { accepts: ['table', 'field'], minTables: 1, requiresNumeric: 1, minimumRows: 1 }, parameterSchema: parameters({
    ...previewParameters,
    metrics: { type: 'array', items: { type: 'string' } },
    dimensions: { type: 'array', items: { type: 'string' } },
    aggregation: { enum: ['sum', 'average', 'min', 'max', 'count'], default: 'average' },
    resultField: { type: 'string', default: '_分析结果' },
    summaryField: { type: 'string', default: '_KPI摘要' },
    messageField: { type: 'string', default: '_分析状态' },
    chartField: { type: 'string', default: '_KPI图' },
  }, ['metrics']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 2, modifiesData: false, destructive: false } }),
  base({ id: 'group-comparison', category: 'analysis', name: '分组对比', description: '按一个或多个维度聚合指标，并保留分组明细。', selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, requiresNumeric: 1, minimumRows: 1 }, parameterSchema: parameters({
    ...previewParameters,
    dimensions: { type: 'array', minItems: 1, items: { type: 'string' } },
    metrics: { type: 'array', minItems: 1, items: { type: 'string' } },
    aggregation: { enum: ['sum', 'average', 'min', 'max', 'count'], default: 'sum' },
    resultField: { type: 'string', default: '_分析结果' },
    summaryField: { type: 'string', default: '_分组摘要' },
    messageField: { type: 'string', default: '_分析状态' },
    chartField: { type: 'string', default: '_分组图' },
  }, ['dimensions', 'metrics']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 3, modifiesData: false, destructive: false } }),
  base({ id: 'pivot-analysis', category: 'analysis', name: '透视分析', description: '按行维度和列维度生成可追溯透视矩阵。', selectionContract: { accepts: ['table', 'field'], minTables: 1, maxTables: 1, requiresNumeric: 1, minimumRows: 1 }, parameterSchema: parameters({
    ...previewParameters,
    rowDimension: { type: 'string' },
    columnDimension: { type: 'string' },
    metric: { type: 'string' },
    aggregation: { enum: ['sum', 'average', 'min', 'max', 'count'], default: 'sum' },
    resultField: { type: 'string', default: '_分析结果' },
    summaryField: { type: 'string', default: '_透视摘要' },
    messageField: { type: 'string', default: '_分析状态' },
    chartField: { type: 'string', default: '_透视图' },
  }, ['rowDimension', 'columnDimension', 'metric']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 3, modifiesData: false, destructive: false } }),
  base({ id: 'trend-analysis', category: 'analysis', name: '趋势分析', description: '按时间粒度生成趋势、移动平均和周期对比。', selectionContract: { accepts: ['table', 'field'], minTables: 1, requiresNumeric: 1, requiresTime: true, minimumRows: 3 }, parameterSchema: parameters({ ...previewParameters, timeField: { type: 'string' }, metric: { type: 'string' }, grain: { enum: ['day', 'week', 'month', 'quarter', 'year'], default: 'month' } }, ['timeField', 'metric', 'grain']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 3, modifiesData: false, destructive: false } }),
  base({ id: 'correlation-analysis', category: 'analysis', name: '相关性分析', description: '生成相关矩阵、散点图和数据质量说明。', selectionContract: { accepts: ['table', 'field'], minTables: 1, requiresNumeric: 2, minimumRows: 3 }, parameterSchema: parameters({ ...previewParameters, fields: { type: 'array', minItems: 2, items: { type: 'string' } }, resultField: { type: 'string', default: '_分析结果' }, summaryField: { type: 'string', default: '_相关摘要' }, chartField: { type: 'string', default: '_相关图' }, messageField: { type: 'string', default: '_分析状态' } }, ['fields']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 2, modifiesData: false, destructive: false } }),
  base({ id: 'anomaly-detection', category: 'analysis', name: '异常检测', description: '生成异常得分、记录列表和人工确认区。', selectionContract: { accepts: ['table', 'field'], minTables: 1, requiresNumeric: 1, minimumRows: 10 }, parameterSchema: parameters({ ...previewParameters, fields: { type: 'array', items: { type: 'string' } }, contamination: { type: 'number', minimum: 0, maximum: 0.5, default: 0.1 }, resultField: { type: 'string', default: '_分析结果' }, summaryField: { type: 'string', default: '_异常摘要' }, chartField: { type: 'string', default: '_异常图' }, messageField: { type: 'string', default: '_分析状态' } }, ['fields']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 3, modifiesData: false, destructive: false } }),
  base({ id: 'cross-table-summary', category: 'analysis', name: '跨表汇总分析', description: '基于已声明关系执行 Join 后分组汇总，并保留来源主键。', selectionContract: { accepts: ['table', 'field', 'relation'], minTables: 2, maxTables: 2, requiresRelation: true, requiresNumeric: 1, minimumRows: 1 }, parameterSchema: parameters({ ...previewParameters, relationId: { type: 'string' }, dimensions: { type: 'array', minItems: 1, items: { type: 'string' } }, metrics: { type: 'array', minItems: 1, items: { type: 'string' } }, aggregation: { enum: ['sum', 'average', 'min', 'max', 'count'], default: 'sum' }, joinType: { enum: ['left', 'inner'], default: 'left' }, resultField: { type: 'string', default: '_分析结果' }, summaryField: { type: 'string', default: '_跨表摘要' }, chartField: { type: 'string', default: '_跨表图' }, messageField: { type: 'string', default: '_分析状态' } }, ['relationId', 'dimensions', 'metrics']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 1, tests: 3, modifiesData: false, destructive: false } }),
  base({ id: 'regression-prediction', category: 'prediction', name: '数值回归预测', description: '训练、评估并输出带版本的数值预测。', selectionContract: { accepts: ['table', 'field'], minTables: 1, requiresNumeric: 2, minimumRows: 30 }, parameterSchema: parameters({ ...previewParameters, target: { type: 'string' }, features: { type: 'array', minItems: 1, items: { type: 'string' } }, validationRatio: { type: 'number', minimum: 0.1, maximum: 0.5, default: 0.2 }, resultField: { type: 'string', default: '_分析结果' }, summaryField: { type: 'string', default: '_回归摘要' }, chartField: { type: 'string', default: '_回归图' }, messageField: { type: 'string', default: '_分析状态' } }, ['target', 'features']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 2, tests: 4, modifiesData: false, destructive: false } }),
  base({ id: 'classification-prediction', category: 'prediction', name: '分类预测', description: '生成分类训练、评估、阈值和结果展示。', selectionContract: { accepts: ['table', 'field'], minTables: 1, minimumRows: 30 }, parameterSchema: parameters({ ...previewParameters, target: { type: 'string' }, features: { type: 'array', minItems: 1, items: { type: 'string' } }, validationRatio: { type: 'number', minimum: 0.1, maximum: 0.5, default: 0.2 }, resultField: { type: 'string', default: '_分析结果' }, summaryField: { type: 'string', default: '_分类摘要' }, chartField: { type: 'string', default: '_分类图' }, messageField: { type: 'string', default: '_分析状态' } }, ['target', 'features']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 2, tests: 4, modifiesData: false, destructive: false } }),
  base({ id: 'time-series-prediction', category: 'prediction', name: '基础时间序列预测', description: '生成时间顺序回测、基线比较和预测区间。', selectionContract: { accepts: ['table', 'field'], minTables: 1, requiresNumeric: 1, requiresTime: true, minimumRows: 24 }, parameterSchema: parameters({ ...previewParameters, timeField: { type: 'string' }, target: { type: 'string' }, horizon: { type: 'integer', minimum: 1, default: 6 }, resultField: { type: 'string', default: '_分析结果' }, summaryField: { type: 'string', default: '_时序摘要' }, chartField: { type: 'string', default: '_时序图' }, messageField: { type: 'string', default: '_分析状态' } }, ['timeField', 'target', 'horizon']), generation: { forms: 1, workflows: 1, behaviors: 0, outputs: 2, tests: 5, modifiesData: false, destructive: false } }),
];

export function getOperationTemplate(id: string, project?: JsonObject): OperationTemplateDefinition {
  const template = [...OPERATION_TEMPLATES, ...(project?.customOperationTemplates || [])].find((item) => item.id === id);
  if (!template) throw toolError('TEMPLATE_NOT_FOUND', `模板 ${id} 不存在`, 'templateId');
  return template;
}

export function validateImportedOperationTemplate(value: JsonObject): OperationTemplateDefinition {
  const categories = new Set(['entry', 'maintenance', 'cross-table', 'analysis', 'prediction', 'fragment', 'workflow']);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(String(value.id || ''))) throw toolError('INVALID_TEMPLATE_ID', '模板 ID 必须为 3～64 位 ASCII 字母、数字、下划线或连字符', 'templates.id');
  if (!/^\d+\.\d+\.\d+$/.test(String(value.version || ''))) throw toolError('INVALID_TEMPLATE_VERSION', '模板版本必须使用 x.y.z', 'templates.version');
  if (!categories.has(String(value.category))) throw toolError('INVALID_TEMPLATE_CATEGORY', '模板分类无效', 'templates.category');
  if (!value.name || !value.description) throw toolError('INVALID_TEMPLATE_METADATA', '模板必须包含名称和用途说明', 'templates');
  if (!value.selectionContract || !Array.isArray(value.selectionContract.accepts)) throw toolError('INVALID_SELECTION_CONTRACT', '模板必须声明选择契约', 'templates.selectionContract');
  if (!value.parameterSchema || value.parameterSchema.type !== 'object') throw toolError('INVALID_PARAMETER_SCHEMA', '模板必须包含 object 参数 Schema', 'templates.parameterSchema');
  const generation = value.generation as JsonObject; if (!generation || ['forms', 'workflows', 'behaviors', 'outputs', 'tests'].some((key) => !Number.isInteger(Number(generation[key])) || Number(generation[key]) < 0)) throw toolError('INVALID_GENERATION_SUMMARY', '生成物数量必须是非负整数', 'templates.generation');
  return { id: String(value.id), version: String(value.version), kind: 'operation', category: value.category as OperationTemplateDefinition['category'], name: String(value.name), description: String(value.description), selectionContract: structuredClone(value.selectionContract) as OperationTemplateDefinition['selectionContract'], parameterSchema: structuredClone(value.parameterSchema), generation: { forms: Number(generation.forms), workflows: Number(generation.workflows), behaviors: Number(generation.behaviors), outputs: Number(generation.outputs), tests: Number(generation.tests), modifiesData: !!generation.modifiesData, destructive: !!generation.destructive } };
}

export function exportOperationTemplatePackage(project: JsonObject, templateIds: string[]) {
  const templates = templateIds.map((id) => getOperationTemplate(id, project)); const payload = { kind: 'formflow-operation-template-package', formatVersion: 1, exportedAt: new Date().toISOString(), templates };
  return { ...payload, checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

function resolveTables(project: JsonObject, selection: TemplateSelection) {
  const ids = [...new Set([...(selection.tableIds || []), ...(selection.tableId ? [selection.tableId] : [])])];
  return ids.map((id) => (project.srcTable || []).find((item: JsonObject) => item.id === id)).filter(Boolean);
}

function selectedSheet(table: JsonObject | undefined, selection: TemplateSelection) {
  return table?.sheets?.find((item: JsonObject) => item.name === selection.sheetName) || table?.sheets?.[0];
}

const EMAIL_FIELD_PATTERN = /(email|e-mail|邮箱)/i;
const PHONE_FIELD_PATTERN = /(phone|mobile|tel|电话|手机)/i;
const URL_FIELD_PATTERN = /(url|link|website|web|网址|链接)/i;
const FILE_FIELD_PATTERN = /(file|attachment|附件|图片|照片|文档)/i;
const CURRENCY_FIELD_PATTERN = /(amount|price|cost|fee|salary|工资|金额|价格|费用|收入|预算)/i;
const PERCENTAGE_FIELD_PATTERN = /(rate|ratio|pct|percent|百分比|占比|比例|率)/i;
const INTEGER_FIELD_PATTERN = /(count|qty|quantity|num|数量|人数|次数|期数)/i;
const TIME_FIELD_PATTERN = /(time|时刻|时段)/i;
const DATETIME_FIELD_PATTERN = /(datetime|timestamp|created.?at|updated.?at|时间戳|创建时间|更新时间)/i;
const LONG_TEXT_FIELD_PATTERN = /(说明|描述|备注|意见|内容|详情|地址|原因|总结|日志|comment|description|remark|content|address)/i;
const RELATION_KEY_FIELD_PATTERN = /(id|编号|编码|标识)$/i;

function normalizedFieldId(tableId: string, sheetName: string, field: string) {
  return `${tableId}.${sheetName}.${field}`;
}

function distinctNonEmptyStrings(values: unknown[] = []) {
  return [...new Set(values.filter((value) => value !== '' && value !== null && value !== undefined).map(String))];
}

function looksLikeAllIntegers(values: unknown[] = []) {
  const numeric = values.filter((value) => value !== '' && value !== null && value !== undefined);
  return numeric.length > 0 && numeric.every((value) => Number.isInteger(Number(value)));
}

function inferNormalizedFieldType(column: JsonObject, field: string, samples: unknown[], format?: string): Pick<NormalizedField, 'type' | 'typeConfidence' | 'pattern' | 'minLength' | 'maxLength' | 'reasons'> {
  const reasons: string[] = [];
  const sampleStrings = distinctNonEmptyStrings(samples);
  const inferredFormat = String(format || column.format || '').toLowerCase();
  const push = (type: NormalizedFieldType, typeConfidence: number, reason: string, extra: Partial<Pick<NormalizedField, 'pattern' | 'minLength' | 'maxLength'>> = {}) => ({ type, typeConfidence, reasons: [...reasons, reason], ...extra });
  if (column.dataType === 'boolean') return push('boolean', 0.99, '数据类型为布尔值');
  if (column.dataType === 'date') {
    if (DATETIME_FIELD_PATTERN.test(field) || inferredFormat.includes('hh') || inferredFormat.includes('time')) return push('datetime', 0.9, '日期字段名称或格式包含时间');
    if (TIME_FIELD_PATTERN.test(field)) return push('time', 0.82, '字段名称包含时间语义');
    return push('date', 0.99, '数据类型为日期');
  }
  if (column.dataType === 'number') {
    if (PERCENTAGE_FIELD_PATTERN.test(field) || inferredFormat.includes('%')) return push('percentage', 0.92, '字段名称或格式表示百分比');
    if (CURRENCY_FIELD_PATTERN.test(field) || /currency|cny|usd|¥|\$/.test(inferredFormat)) return push('currency', 0.93, '字段名称或格式表示金额');
    if (looksLikeAllIntegers(samples) && INTEGER_FIELD_PATTERN.test(field)) return push('integer', 0.9, '数字样本均为整数且字段名称表示计数');
    if (looksLikeAllIntegers(samples)) return push('integer', 0.82, '数字样本均为整数');
    return push('decimal', 0.92, '数据类型为数字');
  }
  if (column.dataType === 'enum') {
    if (sampleStrings.some((value) => /[,，;；]/.test(value))) return push('multi-enum', 0.74, '枚举样本包含多值分隔符');
    return push('enum', 0.98, '数据类型为枚举');
  }
  if (EMAIL_FIELD_PATTERN.test(field)) {
    const confident = sampleStrings.length === 0 || sampleStrings.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    return push('email', confident ? 0.95 : 0.62, confident ? '字段名称和样本符合邮箱格式' : '字段名称像邮箱，但样本不足或不稳定', { maxLength: 254 });
  }
  if (sampleStrings.length > 0 && sampleStrings.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return push('email', 0.88, '样本值符合邮箱格式', { maxLength: 254 });
  if (PHONE_FIELD_PATTERN.test(field)) {
    const confident = sampleStrings.length === 0 || sampleStrings.every((value) => /^(\+?\d[\d\s-]{5,}|\d{11})$/.test(value));
    return push('phone', confident ? 0.94 : 0.62, confident ? '字段名称和样本符合电话格式' : '字段名称像电话，但样本不足或不稳定', { maxLength: 20 });
  }
  if (sampleStrings.length > 0 && sampleStrings.every((value) => /^(\+?\d[\d\s-]{5,}|\d{11})$/.test(value))) return push('phone', 0.86, '样本值符合电话格式', { maxLength: 20 });
  if (URL_FIELD_PATTERN.test(field)) {
    const confident = sampleStrings.length === 0 || sampleStrings.every((value) => /^https?:\/\//i.test(value));
    return push('url', confident ? 0.94 : 0.6, confident ? '字段名称和样本符合 URL 格式' : '字段名称像 URL，但样本不足或不稳定', { maxLength: 2048 });
  }
  if (sampleStrings.length > 0 && sampleStrings.every((value) => /^https?:\/\//i.test(value))) return push('url', 0.88, '样本值符合 URL 格式', { maxLength: 2048 });
  if (FILE_FIELD_PATTERN.test(field)) return push('file', 0.76, '字段名称表示附件或文件');
  if (LONG_TEXT_FIELD_PATTERN.test(field) || sampleStrings.some((value) => value.length > 80)) return push('long-text', 0.88, '字段名称或样本表示长文本');
  if (RELATION_KEY_FIELD_PATTERN.test(field) && /[A-Za-z\u4e00-\u9fff].*(id|编号|编码|标识)$/i.test(field)) return push('relation-key', 0.72, '字段名称具有关系键语义');
  if (column.dataType === 'string') return push('string', 0.8, '数据类型为字符串');
  return push('unknown', 0.35, '字段类型未知，缺少足够证据');
}

function normalizeSheetFields(table: JsonObject | undefined, sheet: JsonObject | undefined): NormalizedField[] {
  if (!table || !sheet) return [];
  const keyFields = new Set((sheet.config?.keyFields || []).map(String));
  const lockedColumns = new Set((sheet.config?.lockedColumns || []).map(String));
  const hiddenColumns = new Set((sheet.config?.hiddenColumns || []).map(String));
  const computedFields = new Map(
    ((sheet.config?.computedFields || []) as JsonObject[])
      .filter((item) => item?.target)
      .map((item) => [String(item.target), item]),
  );
  return (sheet.columns || []).map((column: JsonObject) => {
    const field = String(column.name || '');
    const sampleValues = Array.isArray(column.sampleValues) ? column.sampleValues : [];
    const distinct = distinctNonEmptyStrings(sampleValues);
    const previewRows = Array.isArray(sheet.preview) ? sheet.preview as JsonObject[] : [];
    const previewValues = previewRows.map((row) => row[field]);
    const samplePool = [...sampleValues, ...previewValues];
    const sampleCount = samplePool.filter((value) => value !== null && value !== undefined && value !== '').length;
    const nonEmptyRatio = previewRows.length
      ? previewValues.filter((value) => value !== null && value !== undefined && value !== '').length / previewRows.length
      : sampleCount ? 1 : 0;
    const distinctRatio = sampleCount ? distinctNonEmptyStrings(samplePool).length / sampleCount : 0;
    const inferred = inferNormalizedFieldType(column, field, samplePool, String(column.format || ''));
    const computed = computedFields.has(field);
    const defaultValue = sheet.config?.sequenceRules?.[field]
      ? `@sequence(${field})`
      : computed
        ? computedFields.get(field)?.expression
        : undefined;
    const readOnly = !!sheet.config?.readOnly || !!column.locked || lockedColumns.has(field) || computed;
    const type = computed ? 'computed' : inferred.type;
    const typeConfidence = computed ? 0.99 : inferred.typeConfidence;
    const reasons = computed ? [...inferred.reasons, '字段在 computedFields 中声明'] : inferred.reasons;
    const needsConfiguration = type === 'unknown' || typeConfidence < 0.7;
    return {
      id: normalizedFieldId(String(table.id || ''), String(sheet.name || ''), field),
      name: field,
      qualifiedName: `${table.id}.${sheet.name}.${field}`,
      tableId: String(table.id || ''),
      sheetName: String(sheet.name || ''),
      source: { tableId: String(table.id || ''), sheetName: String(sheet.name || ''), field },
      type,
      typeConfidence,
      nullable: column.nullable !== false,
      required: column.nullable === false && !readOnly,
      key: keyFields.has(field),
      unique: Number(column.uniqueCount || 0) >= Math.max(1, Number(sheet.rowCount || 0)),
      readOnly,
      computed,
      defaultValue,
      enumValues: ['enum', 'multi-enum'].includes(type) ? distinct.slice(0, 50) : undefined,
      minLength: inferred.minLength,
      maxLength: inferred.maxLength,
      pattern: inferred.pattern,
      format: String(column.format || ''),
      sampleValues: samplePool.slice(0, 20),
      sampleQuality: {
        nonEmptyRatio: Number(nonEmptyRatio.toFixed(3)),
        distinctRatio: Number(distinctRatio.toFixed(3)),
        sampleCount,
      },
      needsConfiguration,
      reasons,
    } satisfies NormalizedField;
  }).filter((field) => !hiddenColumns.has(field.name) && field.name);
}

function inferRoles(normalizedFields: NormalizedField[], selected: string[] = [], readOnlySheet = false) {
  const activeFields = selected.length ? selected : normalizedFields.map((field) => field.name);
  return activeFields.flatMap((fieldName) => {
    const field = normalizedFields.find((item) => item.name === fieldName);
    if (!field) return [];
    const roles: Array<{ field: string; role: FieldRole; confidence: number }> = [];
    if (field.key) roles.push({ field: field.name, role: 'key', confidence: 1 });
    if (['number', 'integer', 'decimal', 'currency', 'percentage'].includes(field.type)) roles.push({ field: field.name, role: 'metric', confidence: 0.95 }, { field: field.name, role: 'feature', confidence: 0.85 });
    if (['date', 'datetime', 'time'].includes(field.type)) roles.push({ field: field.name, role: 'time', confidence: Math.max(0.8, field.typeConfidence) });
    if (['enum', 'multi-enum', 'relation-key'].includes(field.type) || field.unique === false) roles.push({ field: field.name, role: 'dimension', confidence: Math.max(0.76, field.typeConfidence) });
    roles.push({ field: field.name, role: readOnlySheet || field.readOnly ? 'readonly' : 'editable', confidence: 0.92 });
    return roles;
  });
}

export function analyzeOperationTemplate(project: JsonObject, templateId: string, selection: TemplateSelection = {}, suppliedParameters: JsonObject = {}): FeasibilityReport {
  const template = getOperationTemplate(templateId, project);
  const checks: FeasibilityCheck[] = [];
  const tables = resolveTables(project, selection);
  const contract = template.selectionContract;
  const fail = (code: string, message: string, path?: string, fix?: FeasibilityCheck['fix']) => checks.push({ code, status: 'failed', message, path, fix });
  const warn = (code: string, message: string, path?: string) => checks.push({ code, status: 'warning', message, path });
  const pass = (code: string, message: string) => checks.push({ code, status: 'passed', message });

  if (tables.length < (contract.minTables || 0)) fail('TABLE_REQUIRED', `至少选择 ${contract.minTables} 张表`, 'selection.tableIds');
  else if (contract.maxTables && tables.length > contract.maxTables) fail('TOO_MANY_TABLES', `最多选择 ${contract.maxTables} 张表`, 'selection.tableIds');
  else pass('TABLE_SELECTION_VALID', `已选择 ${tables.length} 张表`);
  const missingTables = [...new Set([...(selection.tableIds || []), ...(selection.tableId ? [selection.tableId] : [])])].filter((id) => !tables.some((table: JsonObject) => table.id === id));
  if (missingTables.length) fail('TABLE_NOT_FOUND', `数据表不存在：${missingTables.join('、')}`, 'selection.tableIds');

  const sheet = selectedSheet(tables[0], selection);
  if (tables[0] && !sheet) fail('SHEET_NOT_FOUND', '所选 Sheet 不存在', 'selection.sheetName');
  const normalizedFields = normalizeSheetFields(tables[0], sheet);
  const headers = new Set(normalizedFields.map((field) => field.name));
  const { selectionFields, parameterSelectedFields, effectiveFields } = resolveSelectedFieldSet(selection, suppliedParameters, normalizedFields);
  const chosenFields = selectionFields;
  const duplicateSelectedFields = chosenFields.filter((field, index) => chosenFields.indexOf(field) !== index);
  if (duplicateSelectedFields.length) fail('DUPLICATE_SELECTED_FIELDS', `selection.fields 存在重复字段：${[...new Set(duplicateSelectedFields)].join('、')}`, 'selection.fields');
  const missingFields = chosenFields.filter((field) => !headers.has(field));
  if (missingFields.length) fail('FIELD_NOT_FOUND', `字段不存在：${missingFields.join('、')}`, 'selection.fields');
  if (parameterSelectedFields.length && parameterSelectedFields.some((field) => !headers.has(field))) {
    const unavailable = parameterSelectedFields.filter((field) => !headers.has(field));
    fail('SELECTED_FIELDS_INVALID', `selectedFields 包含不存在字段：${unavailable.join('、')}`, 'parameters.selectedFields');
  }
  if (selectionFields.length && parameterSelectedFields.length && !sameFieldSequence(selectionFields, parameterSelectedFields)) {
    fail('SELECTED_FIELDS_MISMATCH', 'selection.fields 与 parameters.selectedFields 必须指向同一字段集合且顺序一致。', 'parameters.selectedFields');
  }
  if (contract.minFields && (effectiveFields.length || headers.size) < contract.minFields) fail('FIELDS_REQUIRED', `至少选择 ${contract.minFields} 个字段`, 'selection.fields');
  const fieldCount = effectiveFields.length || headers.size;
  if (fieldCount > 49 && template.category !== 'analysis' && template.category !== 'prediction') fail('FIELD_COUNT_EXCEEDED', `字段数量 ${fieldCount} 超过上限 49；请分组或筛选字段后再生成`, 'selection.fields');
  if (contract.requiresWritable && tables.some((table: JsonObject) => (table.sheets || []).some((item: JsonObject) => item.config?.readOnly))) fail('READ_ONLY_TABLE', '模板需要可写数据表', 'selection.tableIds');
  const keyless = tables.flatMap((table: JsonObject) => (table.sheets || []).filter((item: JsonObject) => !(item.config?.keyFields || []).length).map((item: JsonObject) => `${table.id}/${item.name}`));
  if (contract.requiresKey && keyless.length) fail('KEY_REQUIRED', `缺少非空唯一主键：${keyless.join('、')}`, 'data.config.keyFields', { action: 'configure-key', label: '配置并校验主键' });
  else if (contract.requiresKey) {
    const keyIssues: Array<{ code: string; source: string; rows: number[] }> = [];
    for (const table of tables) for (const candidate of table.sheets || []) {
      const keys: string[] = candidate.config?.keyFields || []; const rows = fullSourceRows(project, table, candidate); const seen = new Map<string, number>(); const empty: number[] = []; const duplicate: number[] = [];
      rows.forEach((row: JsonObject, index: number) => { const values = keys.map((key) => row[key]); if (values.some((value) => value === null || value === undefined || value === '')) { empty.push(index + 1); return; } const signature = JSON.stringify(values); if (seen.has(signature)) duplicate.push(index + 1); else seen.set(signature, index + 1); });
      if (empty.length) keyIssues.push({ code: 'EMPTY_KEY', source: `${table.id}/${candidate.name}`, rows: empty });
      if (duplicate.length) keyIssues.push({ code: 'DUPLICATE_KEY', source: `${table.id}/${candidate.name}`, rows: duplicate });
    }
    for (const issue of keyIssues) fail(issue.code, `${issue.source} 存在${issue.code === 'EMPTY_KEY' ? '空主键' : '重复主键'}（行 ${issue.rows.slice(0, 5).join('、')}）`, 'data.config.keyFields', { action: 'configure-key', label: '修复主键数据' });
    if (!keyIssues.length) pass('KEY_AVAILABLE', '主键已配置且样本中非空唯一');
  }

  const relations: DataRelation[] = project.relations || [];
  const selectedRelations = (selection.relationIds || []).map((id) => relations.find((item) => item.id === id)).filter(Boolean) as DataRelation[];
  const primaryRelation = selectedRelations[0];
  if (contract.requiresRelation && !selectedRelations.length) fail('RELATION_REQUIRED', '需要选择已声明的数据关系', 'selection.relationIds', { action: 'create-relation', label: '创建数据关系' });
  for (const relation of selectedRelations) checks.push(...validateRelation(project, relation).checks);
  if (template.id === 'join-query-update' && selectedRelations.some((relation) => relation.cardinality === 'many-to-many')) {
    fail('AMBIGUOUS_MANY_TO_MANY_UPDATE', '多对多关系无法唯一定位写回记录；请改为只读查询，或拆成两个可唯一定位的关系。', 'selection.relationIds');
  }
  if ((template.id === 'master-detail-view' || template.id === 'master-detail-entry') && selectedRelations.some((relation) => !['one-to-many', 'one-to-one'].includes(relation.cardinality))) fail('MASTER_DETAIL_DIRECTION_INVALID', '主从模板要求关系左侧为主表、右侧为明细表（一对多或一对一）。', 'selection.relationIds');

  const roles = inferRoles(normalizedFields, effectiveFields, !!sheet?.config?.readOnly);
  const numeric = new Set(roles.filter((item) => item.role === 'metric').map((item) => item.field));
  const times = new Set(roles.filter((item) => item.role === 'time').map((item) => item.field));
  if (contract.requiresNumeric && numeric.size < contract.requiresNumeric) fail('NUMERIC_FIELDS_REQUIRED', `至少需要 ${contract.requiresNumeric} 个有效数值字段`, 'selection.fields');
  if (contract.requiresTime && !times.size) fail('TIME_FIELD_REQUIRED', '需要可解析的时间字段', 'selection.fields');
  else if (contract.requiresTime && sheet) {
    const timeField = String(suppliedParameters.timeField || [...times][0]); const values = fullSourceRows(project, tables[0], sheet).map((row) => row[timeField]).filter((value) => value !== null && value !== undefined && value !== '');
    const parseable = values.filter((value) => typeof value === 'number' ? Number.isFinite(value) : !Number.isNaN(Date.parse(String(value)))).length;
    if (values.length && parseable / values.length < 0.8) fail('TIME_FIELD_UNPARSABLE', `${timeField} 只有 ${Math.round(parseable / values.length * 100)}% 的值可解析为时间`, `parameters.timeField`);
    else pass('TIME_FIELD_PARSEABLE', `${timeField} 可解析为时间`);
    if (template.id === 'trend-analysis' && values.length) {
      const grain = String(suppliedParameters.grain || 'month');
      const parsedDates = values.map((value) => parseTimeValue(value)).filter(Boolean) as Date[];
      if (parsedDates.length >= 2) {
        const minTime = Math.min(...parsedDates.map((item) => item.getTime()));
        const maxTime = Math.max(...parsedDates.map((item) => item.getTime()));
        const spanDays = Math.max(1, Math.round((maxTime - minTime) / 86400000) + 1);
        const limits = {
          day: { min: 3, max: 366 },
          week: { min: 14, max: 1095 },
          month: { min: 60, max: 3650 },
          quarter: { min: 180, max: Number.POSITIVE_INFINITY },
          year: { min: 730, max: Number.POSITIVE_INFINITY },
        } as const;
        const limit = limits[grain as keyof typeof limits];
        if (limit) {
          if (spanDays < limit.min) fail('TIME_GRAIN_SPAN_TOO_NARROW', `${grain} 粒度至少需要覆盖 ${limit.min} 天，当前约 ${spanDays} 天`, 'parameters.grain');
          else if (spanDays > limit.max) fail('TIME_GRAIN_SPAN_TOO_WIDE', `${grain} 粒度最多建议覆盖 ${limit.max} 天，当前约 ${spanDays} 天`, 'parameters.grain');
          else pass('TIME_GRAIN_SPAN_MATCHED', `${grain} 粒度与约 ${spanDays} 天的数据跨度匹配`);
        }
      }
    }
  }
  const rowCount = Number(sheet?.rowCount ?? sheet?.preview?.length ?? 0);
  if (contract.minimumRows && rowCount < contract.minimumRows) fail('SAMPLE_TOO_SMALL', `至少需要 ${contract.minimumRows} 行，当前 ${rowCount} 行`, 'data.rowCount');
  if (template.category === 'prediction' && rowCount > 0 && numeric.size > Math.max(1, Math.floor(rowCount / 10))) warn('FEATURE_RATIO_HIGH', '特征数相对样本量偏高，可能导致过拟合', 'selection.fields');

  const properties = (template.parameterSchema.properties || {}) as JsonObject;
  const isEmptyParameter = (value: unknown) => value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  const roleParameterNames = ['selectedFields', 'queryFields', 'displayFields', 'editableFields', 'editableFieldsLeft', 'editableFieldsRight', 'metrics', 'dimensions', 'rowDimension', 'columnDimension', 'timeField', 'metric', 'fields', 'target', 'features'];
  const crossTableReferences = selectedRelations.length ? crossTableFieldCatalog(project, selection, primaryRelation) : [];
  for (const [name, rawSchema] of Object.entries(properties)) {
    const value = suppliedParameters[name];
    if (isEmptyParameter(value)) continue;
    const schema = rawSchema as JsonObject;
    if (schema.const !== undefined && value !== schema.const) fail('PARAMETER_CONST_MISMATCH', `${name} 必须为 ${String(schema.const)}`, `parameters.${name}`);
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) fail('PARAMETER_ENUM_INVALID', `${name} 不是允许的选项`, `parameters.${name}`);
    if (schema.type === 'array' && !Array.isArray(value)) fail('PARAMETER_TYPE_INVALID', `${name} 必须是列表`, `parameters.${name}`);
    if (Array.isArray(value) && Number(schema.minItems || 0) > value.length) fail('PARAMETER_ITEMS_REQUIRED', `${name} 至少选择 ${schema.minItems} 项`, `parameters.${name}`);
    if ((schema.type === 'number' || schema.type === 'integer') && !Number.isFinite(Number(value))) fail('PARAMETER_NUMBER_INVALID', `${name} 必须是有效数字`, `parameters.${name}`);
    if (schema.minimum !== undefined && Number(value) < Number(schema.minimum)) fail('PARAMETER_BELOW_MINIMUM', `${name} 不能小于 ${schema.minimum}`, `parameters.${name}`);
    if (schema.maximum !== undefined && Number(value) > Number(schema.maximum)) fail('PARAMETER_ABOVE_MAXIMUM', `${name} 不能大于 ${schema.maximum}`, `parameters.${name}`);
  }
  const parameterFields = (name: string) => {
    const value = suppliedParameters[name];
    return Array.isArray(value) ? value.map(String) : isEmptyParameter(value) ? [] : [String(value)];
  };
  for (const name of roleParameterNames) {
    const values = parameterFields(name);
    const duplicates = values.filter((field, index) => values.indexOf(field) !== index);
    if (duplicates.length) fail('PARAMETER_FIELD_DUPLICATE', `${name} 存在重复字段：${[...new Set(duplicates)].join('、')}`, `parameters.${name}`);
  }
  const availableFields = new Set(effectiveFields.length ? effectiveFields : [...headers]);
  const crossTableRoleParameterNames = new Set(['dimensions', 'metrics', 'queryFields', 'displayFields', 'editableFieldsLeft', 'editableFieldsRight']);
  if ((template.id === 'cross-table-summary' || template.id === 'join-query-update') && crossTableReferences.length) {
    for (const name of crossTableRoleParameterNames) {
      if (template.id === 'cross-table-summary' && !['dimensions', 'metrics'].includes(name)) continue;
      if (template.id === 'join-query-update' && !['queryFields', 'displayFields', 'editableFieldsLeft', 'editableFieldsRight'].includes(name)) continue;
      const refs = resolveCrossTableFieldReferences(crossTableReferences, parameterFields(name));
      for (const issue of refs.errors) {
        if (issue.error === 'ambiguous') fail('CROSS_TABLE_FIELD_AMBIGUOUS', `${name} 中的字段 ${issue.input} 在多张表中同名；请改用稳定限定名（如 ${issue.candidates[0]?.qualifiedName || issue.candidates[0]?.tableQualifiedName || issue.input}）。`, `parameters.${name}`);
        else fail('CROSS_TABLE_FIELD_NOT_FOUND', `${name} 包含不存在的跨表字段：${issue.input}`, `parameters.${name}`);
      }
    }
  }
  if (!['cross-table-summary', 'join-query-update'].includes(template.id)) {
    for (const name of roleParameterNames) {
      const unavailable = parameterFields(name).filter((field) => !availableFields.has(field));
      if (unavailable.length) fail('PARAMETER_FIELD_NOT_SELECTED', `${name} 包含未选字段：${unavailable.join('、')}`, `parameters.${name}`);
    }
  }
  const numericParameterNames = template.id === 'classification-prediction'
    ? ['features']
    : ['metrics', 'metric', 'fields', 'target', 'features'];
  const crossTableNumericFields = new Set(
    template.id === 'cross-table-summary'
      ? resolveCrossTableFieldReferences(crossTableReferences, parameterFields('metrics')).resolved
        .filter((field) => ['number', 'integer', 'decimal', 'currency', 'percentage'].includes(field.type))
        .map((field) => field.input)
      : [],
  );
  if (template.id !== 'cross-table-summary') for (const name of numericParameterNames) {
    const invalid = parameterFields(name).filter((field) => !numeric.has(field));
    if (invalid.length) fail('NUMERIC_PARAMETER_REQUIRED', `${name} 只能使用数值字段：${invalid.join('、')}`, `parameters.${name}`);
  }
  if (template.id === 'cross-table-summary') {
    const invalidMetrics = parameterFields('metrics').filter((field) => !crossTableNumericFields.has(field));
    if (invalidMetrics.length) fail('NUMERIC_PARAMETER_REQUIRED', `metrics 只能使用数值字段：${invalidMetrics.join('、')}`, 'parameters.metrics');
  }
  const timeParameters = parameterFields('timeField');
  if (timeParameters.some((field) => !times.has(field))) fail('TIME_PARAMETER_REQUIRED', `timeField 必须使用可解析的时间字段`, 'parameters.timeField');
  const target = parameterFields('target')[0];
  const features = parameterFields('features');
  if (target && features.includes(target)) fail('TARGET_FEATURE_OVERLAP', '目标字段不能同时作为特征字段', 'parameters.features');
  if (suppliedParameters.rowDimension && suppliedParameters.rowDimension === suppliedParameters.columnDimension) fail('PIVOT_DIMENSIONS_DUPLICATE', '行维度和列维度不能相同', 'parameters.columnDimension');
  if (template.id === 'single-table-lookup-edit') {
    const queryFields = parameterFields('queryFields');
    const displayFields = parameterFields('displayFields');
    const editableFields = parameterFields('editableFields');
    const overlap = queryFields.filter((field) => editableFields.includes(field));
    if (overlap.length) fail('LOOKUP_FIELD_ROLE_OVERLAP', `查询字段和编辑字段不能重叠：${overlap.join('、')}`, 'parameters.editableFields');
    const invalidDisplay = displayFields.filter((field) => queryFields.includes(field));
    if (invalidDisplay.length) fail('LOOKUP_QUERY_DISPLAY_OVERLAP', `查询字段和展示字段不能重叠：${invalidDisplay.join('、')}`, 'parameters.displayFields');
    const keyFields = new Set(sheet?.config?.keyFields || []);
    const invalidEditable = editableFields.filter((field) => keyFields.has(field));
    if (invalidEditable.length) fail('LOOKUP_KEY_NOT_EDITABLE', `主键不可作为编辑字段：${invalidEditable.join('、')}`, 'parameters.editableFields');
  }
  if (template.id === 'join-query-update' && crossTableReferences.length) {
    const relationId = String(suppliedParameters.relationId || selection.relationIds?.[0] || '');
    const relation = (project.relations || []).find((item: DataRelation) => item.id === relationId) as DataRelation | undefined;
    const leftTableId = String(relation?.left.tableId || '');
    const rightTableId = String(relation?.right.tableId || '');
    const displayFields = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('displayFields')).resolved;
    const editableLeft = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('editableFieldsLeft')).resolved;
    const editableRight = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('editableFieldsRight')).resolved;
    const queryFields = resolveCrossTableFieldReferences(crossTableReferences, parameterFields('queryFields')).resolved;
    if (!queryFields.length) fail('JOIN_QUERY_FIELDS_REQUIRED', '跨表查询模板至少需要一个查询字段。', 'parameters.queryFields');
    if (!displayFields.length) fail('JOIN_DISPLAY_FIELDS_REQUIRED', '跨表查询模板至少需要一个展示字段。', 'parameters.displayFields');
    const invalidLeft = editableLeft.filter((field) => field.tableId !== leftTableId);
    if (invalidLeft.length) fail('JOIN_EDITABLE_LEFT_INVALID', `editableFieldsLeft 只能包含左表字段：${invalidLeft.map((field) => field.input).join('、')}`, 'parameters.editableFieldsLeft');
    const invalidRight = editableRight.filter((field) => field.tableId !== rightTableId);
    if (invalidRight.length) fail('JOIN_EDITABLE_RIGHT_INVALID', `editableFieldsRight 只能包含右表字段：${invalidRight.map((field) => field.input).join('、')}`, 'parameters.editableFieldsRight');
    const relationKeys = new Set([
      ...((relation?.left.fields || []).map((field) => `${leftTableId}.${field}`)),
      ...((relation?.right.fields || []).map((field) => `${rightTableId}.${field}`)),
    ]);
    const nonEditableProtected = [...editableLeft, ...editableRight].filter((field) => field.normalized.key || relationKeys.has(field.tableQualifiedName));
    if (nonEditableProtected.length) fail('JOIN_PROTECTED_FIELD_NOT_EDITABLE', `主键与关系键不可编辑：${nonEditableProtected.map((field) => field.input).join('、')}`, 'parameters.editableFieldsLeft');
  }
  if (template.id === 'correlation-analysis' && sheet) {
    const correlationFields = parameterFields('fields');
    if (correlationFields.length < 2) fail('CORRELATION_FIELDS_REQUIRED', '相关性分析至少需要两个不同的数值字段。', 'parameters.fields');
    else {
      const rows = fullSourceRows(project, tables[0], sheet);
      if (rows.length >= 2) {
        let hasAlignedPair = false;
        for (let left = 0; left < correlationFields.length; left += 1) {
          for (let right = left + 1; right < correlationFields.length; right += 1) {
            const aligned = rows.filter((row: JsonObject) => row[correlationFields[left]] !== null && row[correlationFields[left]] !== undefined && row[correlationFields[left]] !== '' && row[correlationFields[right]] !== null && row[correlationFields[right]] !== undefined && row[correlationFields[right]] !== '' && Number.isFinite(Number(row[correlationFields[left]])) && Number.isFinite(Number(row[correlationFields[right]])));
            if (aligned.length >= 2) {
              hasAlignedPair = true;
              break;
            }
          }
          if (hasAlignedPair) break;
        }
        if (!hasAlignedPair) fail('CORRELATION_ALIGNED_SAMPLES_REQUIRED', '至少需要一对字段拥有 2 组以上对齐的有效数值样本。', 'parameters.fields');
      }
    }
  }
  if (template.id === 'anomaly-detection' && sheet) {
    const anomalyFields = parameterFields('fields');
    if (!anomalyFields.length) fail('ANOMALY_FIELDS_REQUIRED', '异常检测至少需要一个数值字段。', 'parameters.fields');
    else {
      const rows = fullSourceRows(project, tables[0], sheet);
      if (rows.length >= 2) {
        const informativeField = anomalyFields.find((field) => {
          const values = finiteFieldValues(rows, field);
          return new Set(values.map((value) => String(value))).size > 1;
        });
        if (!informativeField) fail('ANOMALY_FIELDS_CONSTANT', '所选异常检测字段全部为常量或空值，无法形成有效异常得分。', 'parameters.fields');
      }
    }
  }
  if (template.id === 'regression-prediction' && sheet) {
    const rows = fullSourceRows(project, tables[0], sheet);
    if (rows.length >= 3 && target) {
      const targetValues = finiteFieldValues(rows, target);
      if (new Set(targetValues.map((value) => String(value))).size < 2) fail('REGRESSION_CONSTANT_TARGET', '回归目标字段不能是常量。', 'parameters.target');
      const highMissingFeatures = features.filter((field) => {
        const validCount = rows.filter((row: JsonObject) => row[field] !== null && row[field] !== undefined && row[field] !== '' && Number.isFinite(Number(row[field]))).length;
        return validCount / Math.max(1, rows.length) < 0.5;
      });
      if (highMissingFeatures.length) fail('FEATURE_MISSING_TOO_HIGH', `以下特征字段缺失率过高：${highMissingFeatures.join('、')}`, 'parameters.features');
      const usableRows = rows.filter((row: JsonObject) => Number.isFinite(Number(row[target])) && features.every((field) => row[field] !== null && row[field] !== undefined && row[field] !== '' && Number.isFinite(Number(row[field]))));
      if (usableRows.length < 3) fail('REGRESSION_USABLE_ROWS_REQUIRED', '可同时用于目标和特征计算的有效样本不足，无法完成回归评估。', 'parameters.features');
    }
  }
  if (template.id === 'classification-prediction' && sheet && target) {
    const rows = fullSourceRows(project, tables[0], sheet);
    if (rows.length >= 3) {
      const classes = rows.map((row: JsonObject) => row[target]).filter((value) => value !== null && value !== undefined && value !== '').map(String);
      const uniqueClasses = [...new Set(classes)];
      if (uniqueClasses.length < 2) fail('CLASS_COUNT_TOO_LOW', '分类目标字段至少需要两个类别。', 'parameters.target');
      const counts = new Map<string, number>();
      for (const item of classes) counts.set(item, (counts.get(item) || 0) + 1);
      const rareClasses = [...counts.entries()].filter(([, count]) => count < 2).map(([clazz]) => clazz);
      if (rareClasses.length) fail('CLASS_SAMPLE_TOO_SMALL', `以下类别样本过少：${rareClasses.join('、')}`, 'parameters.target');
      const total = classes.length;
      const majority = Math.max(...[...counts.values(), 0]);
      if (total > 0 && majority / total > 0.95) fail('CLASS_IMBALANCE_TOO_HIGH', '分类目标字段过度失衡，无法形成稳定评估。', 'parameters.target');
    }
  }
  if (template.id === 'time-series-prediction' && sheet) {
    const rows = fullSourceRows(project, tables[0], sheet);
    const timeField = timeParameters[0];
    const horizon = Number(suppliedParameters.horizon || 6);
    if (rows.length >= 3 && timeField && target) {
      const usableRows = rows.filter((row: JsonObject) => row[timeField] !== null && row[timeField] !== undefined && row[timeField] !== '' && row[target] !== null && row[target] !== undefined && row[target] !== '' && !Number.isNaN(Date.parse(String(row[timeField]))) && Number.isFinite(Number(row[target])));
      const timeValues = usableRows.map((row: JsonObject) => String(row[timeField]));
      if (new Set(timeValues).size !== timeValues.length) fail('TIME_FIELD_DUPLICATE', '时间序列预测要求时间字段在有效样本中唯一。', 'parameters.timeField');
      if (usableRows.length && horizon >= usableRows.length) fail('TIME_SERIES_HORIZON_TOO_LONG', `预测期 ${horizon} 不能大于等于有效历史样本数 ${usableRows.length}。`, 'parameters.horizon');
    }
  }
  const keyFieldList = Array.isArray(sheet?.config?.keyFields) ? sheet.config.keyFields.filter(Boolean) : [];
  if (['single-table-entry', 'single-table-lookup-edit', 'single-table-batch-update'].includes(template.id) && keyFieldList.length > 1) {
    fail('COMPOSITE_KEY_UNSUPPORTED', '当前模板仅支持单主键；组合主键请先拆分或改用支持组合键的模板。', 'data.config.keyFields', { action: 'split-or-switch-template', label: '拆分主键或改用支持组合键的模板' });
  }
  if (template.id === 'single-table-entry' && keyFieldList.length !== 1) {
    fail('ENTRY_KEY_CONFIGURATION_REQUIRED', '单表录入模板当前要求先配置一个稳定单主键，再生成可写保存流程。', 'data.config.keyFields', { action: 'configure-key', label: '配置单主键' });
  }
  const selectedOrAllFields = effectiveFields.length ? effectiveFields : normalizedFields.map((field) => field.name);
  const visibleBusinessFields = selectedOrAllFields.filter((field) => !keyFieldList.includes(field));
  const effectiveFieldCount = visibleBusinessFields.length || selectedOrAllFields.length;
  if ((template.id === 'single-table-entry' || template.id === 'basic-entry') && effectiveFieldCount > 48) {
    fail('TOO_MANY_FIELDS_FOR_DIRECT_FORM', `当前选择了 ${effectiveFieldCount} 个字段；超过 48 个字段时必须先分组或筛选，再生成表单。`, 'selection.fields', { action: 'narrow-fields', label: '减少字段或分组' });
  }

  const required = Array.isArray(template.parameterSchema.required) ? template.parameterSchema.required as string[] : [];
  const unanswered = required.filter((key) => isEmptyParameter(suppliedParameters[key]));
  const activeFieldNames = new Set(
    (effectiveFields.length ? effectiveFields : normalizedFields.map((field) => field.name))
      .concat(...roleParameterNames.map((name) => parameterFields(name))),
  );
  const lowConfidenceFields = normalizedFields.filter((field) => activeFieldNames.has(field.name) && field.needsConfiguration);
  lowConfidenceFields.forEach((field) => warn('FIELD_TYPE_CONFIRMATION_REQUIRED', `字段 ${field.name} 当前推断为 ${field.type}（置信度 ${Math.round(field.typeConfidence * 100)}%），生成前需要确认。`, `fields.${field.name}`));
  const configurationQuestions = lowConfidenceFields.map((field) => ({
    id: `field_type:${field.name}`,
    label: `确认字段 ${field.name} 的类型`,
    type: 'field-type',
    required: true,
  }));
  const requiredQuestions = [
    ...unanswered.map((key) => ({ id: key, label: key, type: String((template.parameterSchema.properties as JsonObject)?.[key]?.type || 'string'), required: true })),
    ...configurationQuestions,
  ];
  const failed = checks.filter((item) => item.status === 'failed').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  const status: FeasibilityStatus = failed ? 'blocked' : requiredQuestions.length ? 'needs-configuration' : warnings ? 'warning' : 'ready';
  const score = Math.max(0, Math.min(100, 100 - failed * 25 - warnings * 8 - requiredQuestions.length * 5));
  return { status, score, summary: failed ? `${failed} 项条件未满足` : requiredQuestions.length ? `还需配置 ${requiredQuestions.length} 项参数` : warnings ? `${warnings} 项风险需要确认` : '可以生成', checks, inferredRoles: roles, requiredQuestions, generationPreview: template.generation };
}

function inferRecommendationParameters(
  template: OperationTemplateDefinition,
  selection: TemplateSelection,
  report: FeasibilityReport,
  project?: JsonObject,
): JsonObject {
  const properties = (template.parameterSchema.properties || {}) as JsonObject;
  const fields = selection.fields || [];
  const byRole = (role: FieldRole) => report.inferredRoles
    .filter((item) => item.role === role)
    .sort((left, right) => fields.indexOf(left.field) - fields.indexOf(right.field))
    .map((item) => item.field);
  const unique = (values: string[]) => [...new Set(values)];
  const keys = unique(byRole('key'));
  const metrics = unique(byRole('metric'));
  const dimensions = unique(byRole('dimension'));
  const times = unique(byRole('time'));
  const editable = unique(byRole('editable')).filter((field) => !keys.includes(field));
  const suggested: JsonObject = {};
  for (const [name, rawSchema] of Object.entries(properties)) {
    const schema = rawSchema as JsonObject;
    if (schema.const !== undefined) suggested[name] = structuredClone(schema.const);
    else if (schema.default !== undefined) suggested[name] = structuredClone(schema.default);
  }
  if (properties.name) suggested.name = template.name;
  if (properties.selectedFields) suggested.selectedFields = fields;
  if (properties.queryFields && keys.length) suggested.queryFields = keys;
  if (properties.displayFields && editable.length) suggested.displayFields = editable;
  if (properties.editableFields && editable.length) suggested.editableFields = editable;
  if (properties.metrics && metrics.length) suggested.metrics = metrics;
  if (properties.dimensions && dimensions.length) suggested.dimensions = dimensions;
  if (properties.fields && metrics.length) suggested.fields = metrics;
  if (properties.relationId && selection.relationIds?.length === 1) suggested.relationId = selection.relationIds[0];
  if (properties.timeField && times.length === 1) suggested.timeField = times[0];
  if (properties.metric && metrics.length === 1) suggested.metric = metrics[0];
  if (properties.target && metrics.length === 1) suggested.target = metrics[0];
  if (template.id === 'classification-prediction' && properties.target && dimensions.length === 1) suggested.target = dimensions[0];
  if (properties.features && metrics.length > 1 && suggested.target) suggested.features = metrics.filter((field) => field !== suggested.target);
  if (properties.rowDimension && dimensions.length === 2) suggested.rowDimension = dimensions[0];
  if (properties.columnDimension && dimensions.length === 2) suggested.columnDimension = dimensions[1];
  if (template.id === 'join-query-update' && project && selection.relationIds?.length) {
    const relation = (project.relations || []).find((item: DataRelation) => item.id === selection.relationIds?.[0]) as DataRelation | undefined;
    const refs = crossTableFieldCatalog(project, selection, relation);
    const leftTableId = String(relation?.left.tableId || '');
    const rightTableId = String(relation?.right.tableId || '');
    const qualifiedSelection = fields
      .map((field) => resolveCrossTableFieldReference(refs, field).resolved?.tableQualifiedName)
      .filter(Boolean);
    if (properties.queryFields && relation) suggested.queryFields = (relation.left.fields || []).map((field) => `${leftTableId}.${field}`);
    if (properties.displayFields) suggested.displayFields = qualifiedSelection.length ? qualifiedSelection : refs.slice(0, 6).map((field) => field.tableQualifiedName);
    if (properties.editableFieldsLeft) suggested.editableFieldsLeft = refs.filter((field) => field.tableId === leftTableId && !field.normalized.key && !(relation?.left.fields || []).includes(field.field)).map((field) => field.tableQualifiedName);
    if (properties.editableFieldsRight) suggested.editableFieldsRight = refs.filter((field) => field.tableId === rightTableId && !field.normalized.key && !(relation?.right.fields || []).includes(field.field)).map((field) => field.tableQualifiedName);
    if (properties.joinType && relation?.defaultJoinType) suggested.joinType = relation.defaultJoinType;
  }
  if (template.id === 'cross-table-summary' && project && selection.relationIds?.length) {
    const relation = (project.relations || []).find((item: DataRelation) => item.id === selection.relationIds?.[0]) as DataRelation | undefined;
    const refs = crossTableFieldCatalog(project, selection, relation);
    const qualify = (field: string) => refs.find((item) => item.field === field)?.tableQualifiedName || field;
    if (properties.dimensions && dimensions.length) suggested.dimensions = dimensions.map(qualify);
    if (properties.metrics && metrics.length) suggested.metrics = metrics.map(qualify);
  }
  return suggested;
}

function recommendationRoleCoverage(template: OperationTemplateDefinition, report: FeasibilityReport): number {
  const roles = new Set(report.inferredRoles.map((item) => item.role));
  const requirements: boolean[] = [];
  if (template.selectionContract.requiresKey) requirements.push(roles.has('key'));
  if (template.selectionContract.requiresTime) requirements.push(roles.has('time'));
  for (let index = 0; index < Number(template.selectionContract.requiresNumeric || 0); index += 1) {
    requirements.push(report.inferredRoles.filter((item) => item.role === 'metric').length > index);
  }
  return requirements.length ? requirements.filter(Boolean).length / requirements.length : 1;
}

function recommendationReasons(
  template: OperationTemplateDefinition,
  report: FeasibilityReport,
  unresolvedParameters: string[],
): string[] {
  const reasons: string[] = [];
  const passed = new Set(report.checks.filter((item) => item.status === 'passed').map((item) => item.code));
  const roles = new Set(report.inferredRoles.map((item) => item.role));
  if (passed.has('KEY_AVAILABLE')) reasons.push('已配置且校验通过唯一主键');
  if (roles.has('time')) reasons.push('所选字段包含时间字段');
  const metricCount = new Set(report.inferredRoles.filter((item) => item.role === 'metric').map((item) => item.field)).size;
  if (metricCount) reasons.push(`所选字段包含 ${metricCount} 个数值指标`);
  if (roles.has('dimension')) reasons.push('所选字段包含可分组维度');
  if (!reasons.length && passed.has('TABLE_SELECTION_VALID')) reasons.push('当前数据范围满足模板的基础条件');
  if (unresolvedParameters.length) reasons.push(`还需补充 ${unresolvedParameters.length} 项配置`);
  const firstFailure = report.checks.find((item) => item.status === 'failed');
  if (firstFailure) reasons.push(firstFailure.message);
  return reasons.slice(0, 3);
}

export function recommendOperationTemplates(
  project: JsonObject,
  selection: TemplateSelection,
): TemplateRecommendation[] {
  const templates = [...OPERATION_TEMPLATES, ...(project.customOperationTemplates || [])] as OperationTemplateDefinition[];
  const statusRank: Record<FeasibilityStatus, number> = {
    ready: 4,
    warning: 3,
    'needs-configuration': 2,
    blocked: 1,
    'not-applicable': 0,
  };
  return templates.map((template, catalogIndex) => {
    const initialReport = analyzeOperationTemplate(project, template.id, selection, {});
    const suggestedParameters = inferRecommendationParameters(template, selection, initialReport, project);
    const report = analyzeOperationTemplate(project, template.id, selection, suggestedParameters);
    const unresolvedParameters = report.requiredQuestions.map((item) => item.id);
    const roleCoverage = recommendationRoleCoverage(template, report);
    const matchScore =
      statusRank[report.status] * 100_000 +
      report.score * 1_000 +
      Math.round(roleCoverage * 100) * 10 -
      unresolvedParameters.length;
    return {
      template,
      report,
      matchScore,
      roleCoverage,
      reasons: recommendationReasons(template, report, unresolvedParameters),
      suggestedParameters,
      unresolvedParameters,
      catalogIndex,
    };
  }).sort((left, right) =>
    right.matchScore - left.matchScore ||
    left.catalogIndex - right.catalogIndex
  ).map(({ catalogIndex: _catalogIndex, ...recommendation }) => recommendation);
}

export function validateRelation(project: JsonObject, relation: DataRelation): { valid: boolean; checks: FeasibilityCheck[] } {
  const checks: FeasibilityCheck[] = [];
  const side = (value: DataRelation['left'], label: string) => {
    const table = (project.srcTable || []).find((item: JsonObject) => item.id === value.tableId);
    const sheet = table?.sheets?.find((item: JsonObject) => item.name === value.sheetName);
    if (!table || !sheet) { checks.push({ code: 'RELATION_SOURCE_NOT_FOUND', status: 'failed', message: `${label}表或 Sheet 不存在`, path: `relations.${relation.id}.${label}` }); return undefined; }
    const missing = value.fields.filter((field) => !(sheet.headers || []).includes(field));
    if (missing.length) checks.push({ code: 'RELATION_FIELD_NOT_FOUND', status: 'failed', message: `${label}关联字段不存在：${missing.join('、')}`, path: `relations.${relation.id}.${label}.fields` });
    return sheet;
  };
  const left = side(relation.left, 'left'); const right = side(relation.right, 'right');
  if (relation.left.fields.length !== relation.right.fields.length || !relation.left.fields.length) checks.push({ code: 'RELATION_ARITY_MISMATCH', status: 'failed', message: '两侧关联字段数量必须相同且非空', path: `relations.${relation.id}` });
  if (left && right && relation.left.fields.length === relation.right.fields.length) relation.left.fields.forEach((field, index) => {
    const l = left.columns?.find((item: JsonObject) => item.name === field)?.dataType;
    const r = right.columns?.find((item: JsonObject) => item.name === relation.right.fields[index])?.dataType;
    if (l && r && l !== 'unknown' && r !== 'unknown' && l !== r) checks.push({ code: 'RELATION_TYPE_MISMATCH', status: 'failed', message: `关联字段类型不兼容：${field}(${l}) / ${relation.right.fields[index]}(${r})`, path: `relations.${relation.id}` });
  });
  if (!checks.length) checks.push({ code: 'RELATION_VALID', status: 'passed', message: `关系 ${relation.name} 可用` });
  return { valid: !checks.some((item) => item.status === 'failed'), checks };
}

export interface RelationSuggestion {
  id: string;
  left: DataRelation['left'];
  right: DataRelation['right'];
  cardinality: DataRelation['cardinality'];
  confidence: number;
  reasons: string[];
}

function normalizedFieldName(value: string) {
  return value.toLocaleLowerCase().replace(/[\s_-]+/g, '').replace(/(编号|编码|标识|identifier)$/i, 'id');
}

/** Suggests auditable equal-key relations without modifying the project. */
export function suggestDataRelations(project: JsonObject): RelationSuggestion[] {
  const candidates: RelationSuggestion[] = [];
  const existing = new Set((project.relations || []).flatMap((relation: DataRelation) => [
    `${relation.left.tableId}/${relation.left.sheetName}/${relation.left.fields.join('+')}::${relation.right.tableId}/${relation.right.sheetName}/${relation.right.fields.join('+')}`,
    `${relation.right.tableId}/${relation.right.sheetName}/${relation.right.fields.join('+')}::${relation.left.tableId}/${relation.left.sheetName}/${relation.left.fields.join('+')}`,
  ]));
  const tables: JsonObject[] = project.srcTable || [];
  for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < tables.length; rightIndex += 1) {
    const leftTable = tables[leftIndex]; const rightTable = tables[rightIndex];
    for (const leftSheet of leftTable.sheets || []) for (const rightSheet of rightTable.sheets || []) {
      const leftRows = fullSourceRows(project, leftTable, leftSheet).slice(0, 200); const rightRows = fullSourceRows(project, rightTable, rightSheet).slice(0, 200);
      for (const leftField of leftSheet.headers || []) for (const rightField of rightSheet.headers || []) {
        const leftColumn = leftSheet.columns?.find((item: JsonObject) => item.name === leftField); const rightColumn = rightSheet.columns?.find((item: JsonObject) => item.name === rightField);
        if (leftColumn?.dataType && rightColumn?.dataType && leftColumn.dataType !== 'unknown' && rightColumn.dataType !== 'unknown' && leftColumn.dataType !== rightColumn.dataType) continue;
        const leftName = normalizedFieldName(leftField); const rightName = normalizedFieldName(rightField); const exactName = leftName === rightName;
        const idLike = /(^id$|id$|编号$|编码$|标识$)/i.test(leftField) && /(^id$|id$|编号$|编码$|标识$)/i.test(rightField);
        if (!exactName && !idLike) continue;
        const leftValues = new Set(leftRows.map((row: JsonObject) => row[leftField]).filter((value: unknown) => value !== null && value !== undefined && value !== '').map(String));
        const rightValues = new Set(rightRows.map((row: JsonObject) => row[rightField]).filter((value: unknown) => value !== null && value !== undefined && value !== '').map(String));
        const overlap = leftValues.size && rightValues.size ? [...leftValues].filter((value) => rightValues.has(value)).length / Math.min(leftValues.size, rightValues.size) : 0;
        if (!exactName && overlap === 0) continue;
        const leftKey = (leftSheet.config?.keyFields || []).includes(leftField); const rightKey = (rightSheet.config?.keyFields || []).includes(rightField);
        const cardinality: DataRelation['cardinality'] = leftKey && rightKey ? 'one-to-one' : leftKey ? 'one-to-many' : rightKey ? 'many-to-one' : 'many-to-many';
        const signature = `${leftTable.id}/${leftSheet.name}/${leftField}::${rightTable.id}/${rightSheet.name}/${rightField}`;
        if (existing.has(signature)) continue;
        const reasons = [exactName ? '字段名称一致' : '字段均具有 ID 语义'];
        if (leftColumn?.dataType && rightColumn?.dataType) reasons.push(`类型兼容（${leftColumn.dataType}）`);
        if (leftKey || rightKey) reasons.push(leftKey && rightKey ? '两侧均为主键' : '一侧为主键');
        if (overlap > 0) reasons.push(`样本值重合 ${Math.round(overlap * 100)}%`);
        const confidence = Math.min(0.99, 0.35 + (exactName ? 0.25 : 0.1) + (leftKey || rightKey ? 0.2 : 0) + Math.min(overlap, 1) * 0.2);
        candidates.push({ id: `suggest_${createHash('sha1').update(signature).digest('hex').slice(0, 12)}`, left: { tableId: leftTable.id, sheetName: leftSheet.name, fields: [leftField] }, right: { tableId: rightTable.id, sheetName: rightSheet.name, fields: [rightField] }, cardinality, confidence: Number(confidence.toFixed(2)), reasons });
      }
    }
  }
  return candidates.sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id)).slice(0, 20);
}

export interface GenerationPlan {
  id: string;
  templateId: string;
  templateVersion: string;
  instanceId: string;
  baseRevision?: string;
  selection: TemplateSelection;
  parameters: JsonObject;
  summary: GenerationSummary;
  artifacts: TemplateArtifactBundle;
  preview?: JsonObject;
  conflicts: Array<{ code: string; resourceId: string; message: string }>;
}

function extractBehaviorArtifacts(
  template: Pick<OperationTemplateDefinition, 'generation'>,
  forms: JsonObject[] = [],
) {
  const rules: TemplateRuleArtifact[] = [];
  const behaviors: TemplateBehaviorArtifact[] = [];
  for (const form of forms) {
    const ownerFormId = String(form.id || '');
    if (String(form.ruleCode || '').trim()) {
      rules.push({
        id: `${ownerFormId}::rule`,
        kind: 'rule',
        ownerFormId,
        implementationLayer: 'rule',
        reasonCode: 'field-validation-and-submit-guard',
        businessGoal: 'field-validation-and-submit-guard',
        relatedFields: (form.design?.components || []).filter((component: JsonObject) => typeof component.fieldBinding === 'string' && component.fieldBinding).map((component: JsonObject) => String(component.fieldBinding)),
        ruleCode: form.ruleCode,
      });
    }
    for (const behavior of form.behaviors || []) {
      behaviors.push({
        id: `${ownerFormId}::behavior::${behavior.id}`,
        kind: 'behavior',
        ownerFormId,
        implementationLayer: 'event',
        reasonCode: 'ui-runtime-fallback',
        businessGoal: String(behavior.name || behavior.id || 'ui-runtime-fallback'),
        eventFallbackReason: behavior.eventFallbackReason as EventFallbackReason | undefined,
        behavior,
      });
    }
    if (rules.length + behaviors.length < template.generation.behaviors) {
      const triggerComponent = (form.design?.components || []).find((component: JsonObject) => Object.values(component.props?.flowTriggers || {}).some((trigger: any) => trigger?.enabled && trigger?.workflowId));
      if (triggerComponent) {
        behaviors.push({
          id: `${ownerFormId}::trigger::${triggerComponent.id}`,
          kind: 'flow-trigger',
          ownerFormId,
          implementationLayer: 'workflow',
          reasonCode: 'workflow-triggered-action',
          businessGoal: String(triggerComponent.props?.name || triggerComponent.id || 'workflow-triggered-action'),
          componentId: triggerComponent.id,
          trigger: structuredClone(triggerComponent.props?.flowTriggers || {}),
        });
      }
    }
  }
  return { rules, behaviors };
}

function summarizeArtifacts(bundle: TemplateArtifactBundle, template: Pick<OperationTemplateDefinition, 'generation'>): GenerationSummary {
  return {
    forms: bundle.forms.length,
    workflows: bundle.workflows.length,
    behaviors: bundle.rules.length + bundle.behaviors.length,
    outputs: bundle.outputs.length,
    tests: bundle.tests.length,
    modifiesData: template.generation.modifiesData,
    destructive: template.generation.destructive,
  };
}

function assertBehaviorArtifactsValid(bundle: TemplateArtifactBundle) {
  for (const artifact of bundle.behaviors) {
    if (artifact.implementationLayer === 'event' && !artifact.eventFallbackReason) {
      throw toolError('EVENT_FALLBACK_REASON_REQUIRED', `事件行为 ${artifact.id} 缺少 eventFallbackReason，不能作为模板主路径兜底。`, 'artifacts.behaviors');
    }
    if (artifact.implementationLayer === 'workflow' && artifact.kind === 'flow-trigger' && artifact.trigger && Object.values(artifact.trigger).some((entry: any) => !entry?.workflowId)) {
      throw toolError('FLOW_TRIGGER_INVALID', `行为 ${artifact.id} 的 flow trigger 缺少 workflowId。`, 'artifacts.behaviors');
    }
  }
}

function assertGenerationSummaryMatches(template: OperationTemplateDefinition, bundle: TemplateArtifactBundle) {
  const actual = summarizeArtifacts(bundle, template);
  const expected = template.generation;
  const mismatches = [
    ['forms', expected.forms, actual.forms],
    ['workflows', expected.workflows, actual.workflows],
    ['behaviors', expected.behaviors, actual.behaviors],
    ['outputs', expected.outputs, actual.outputs],
    ['tests', expected.tests, actual.tests],
  ].filter(([, left, right]) => left !== right);
  if (mismatches.length) {
    throw toolError(
      'GENERATED_ARTIFACT_SUMMARY_MISMATCH',
      `模板 ${template.id} 的声明生成物数量与实际生成结果不一致`,
      'template.generation',
      { templateId: template.id, expected, actual, mismatches: mismatches.map(([key, left, right]) => ({ key, expected: left, actual: right })) },
    );
  }
  return actual;
}

function generatedMetadata(template: OperationTemplateDefinition, instanceId: string, generatedAt: string) {
  return { templateId: template.id, templateVersion: template.version, instanceId, generatedAt };
}

function sampleFieldValue(sheet: JsonObject | undefined, field: string, fallbackIndex: number) {
  const previewRow = Array.isArray(sheet?.preview) ? sheet.preview[0] as JsonObject | undefined : undefined;
  if (previewRow && previewRow[field] !== undefined && previewRow[field] !== null && previewRow[field] !== '') return previewRow[field];
  const column = sheet?.columns?.find((item: JsonObject) => item.name === field);
  if (column?.dataType === 'number') return fallbackIndex + 1;
  if (column?.dataType === 'boolean') return false;
  if (column?.dataType === 'date') return '2026-07-26';
  return `测试值${fallbackIndex + 1}`;
}

function buildTemplateTestArtifacts(
  project: JsonObject,
  template: OperationTemplateDefinition,
  selection: TemplateSelection,
  suppliedParameters: JsonObject,
  forms: JsonObject[],
  workflows: JsonObject[],
  outputs: JsonObject[],
  now: string,
  safe: string,
) {
  const table = resolveTables(project, selection)[0];
  const sheet = selectedSheet(table, selection);
  const fields = resolveSelectedFieldSet(selection, suppliedParameters, normalizeSheetFields(table, sheet)).effectiveFields as string[];
  const keyField = String(sheet?.config?.keyFields?.[0] || fields[0] || '');
  const editableInputs = Object.fromEntries(fields.map((field, index) => [field, sampleFieldValue(sheet, field, index)]));
  const workflowIds = workflows.map((item) => item.id);
  const outputIds = outputs.map((item) => item.id);
  const coverage = {
    implementationOrder: ['rule', 'workflow', 'event'],
    fields,
    workflowIds,
    outputIds,
    behaviorCount: forms.reduce((count, form) => count + (String(form.ruleCode || '').trim() ? 1 : 0) + (form.behaviors?.length || 0), 0),
  };
  const scenarios: Array<{ name: string; category: string; inputs: JsonObject; expected: JsonObject }> = [
    {
      name: '主路径可运行',
      category: 'happy-path',
      inputs: editableInputs,
      expected: {
        valid: true,
        ruleResult: 'pass',
        triggeredWorkflowIds: workflowIds,
        outputIds,
      },
    },
    {
      name: '规则守卫拦截非法输入',
      category: 'rule-guard',
      inputs: keyField ? { ...editableInputs, [keyField]: '' } : {},
      expected: {
        valid: false,
        blockedBy: 'rule',
      },
    },
  ];
  if (template.id === 'single-table-lookup-edit') {
    scenarios.push(
      {
        name: '查询无结果时不给保存',
        category: 'lookup-not-found',
        inputs: Object.fromEntries(stringList(suppliedParameters.queryFields).map((field, index) => [field, `NOT_FOUND_${index + 1}`])),
        expected: { valid: true, lookup: 'not-found', saveEnabled: false, blockedBy: 'workflow' },
      },
      {
        name: '查询命中多条结果时要求继续收窄条件',
        category: 'lookup-multiple-match',
        inputs: {
          criteria: Object.fromEntries(stringList(suppliedParameters.queryFields).map((field) => [field, sampleFieldValue(sheet, field, 1)])),
          duplicateMatches: true,
          queryLimit: Number(suppliedParameters.queryLimit || 2),
        },
        expected: { valid: true, lookup: 'multiple-match', saveEnabled: false, blockedBy: 'workflow' },
      },
      {
        name: '唯一命中后只允许更新编辑字段',
        category: 'lookup-unique-match',
        inputs: {
          ...Object.fromEntries(stringList(suppliedParameters.queryFields).map((field, index) => [field, sampleFieldValue(sheet, field, index)])),
          ...Object.fromEntries(stringList(suppliedParameters.editableFields).map((field, index) => [field, sampleFieldValue(sheet, field, index + 10)])),
        },
        expected: { valid: true, lookup: 'unique-match', dirtyOnly: true, triggeredWorkflowIds: workflowIds.slice(-1) },
      },
      {
        name: '保存后按配置重新查询并确认回填一致',
        category: 'lookup-refetch-after-save',
        inputs: {
          ...Object.fromEntries(stringList(suppliedParameters.queryFields).map((field, index) => [field, sampleFieldValue(sheet, field, index)])),
          ...Object.fromEntries(stringList(suppliedParameters.editableFields).map((field, index) => [field, sampleFieldValue(sheet, field, index + 20)])),
        },
        expected: { valid: true, dirtyOnly: suppliedParameters.dirtyOnly !== false, refetchAfterSave: suppliedParameters.refetchAfterSave !== false, requeryConsistent: true, triggeredWorkflowIds: workflowIds },
      },
      {
        name: '并发版本冲突时阻断保存并返回冲突字段',
        category: 'lookup-conflict',
        inputs: {
          ...Object.fromEntries(stringList(suppliedParameters.queryFields).map((field, index) => [field, sampleFieldValue(sheet, field, index)])),
          ...Object.fromEntries(stringList(suppliedParameters.editableFields).map((field, index) => [field, sampleFieldValue(sheet, field, index + 30)])),
          conflict: true,
        },
        expected: { valid: false, blockedBy: 'workflow', conflictPolicy: String(suppliedParameters.conflictPolicy || 'error'), staleFields: stringList(suppliedParameters.editableFields) },
      },
    );
  }
  if (template.id.includes('batch-update')) {
    scenarios.push(
      {
        name: '无改动时禁止提交',
        category: 'no-dirty-rows',
        inputs: { dirtyRows: [] },
        expected: { valid: true, submitEnabled: false, blockedBy: 'rule' },
      },
      {
        name: '只提交脏行',
        category: 'dirty-row-commit',
        inputs: { dirtyRows: [{ [keyField]: sampleFieldValue(sheet, keyField, 0), changes: Object.fromEntries(fields.slice(1, 2).map((field, index) => [field, sampleFieldValue(sheet, field, index + 20)])) }] },
        expected: { valid: true, dirtyOnly: true, triggeredWorkflowIds: workflowIds },
      },
    );
    if (template.id === 'single-table-batch-update') {
      const maxChanges = Number(suppliedParameters.maxChanges || 100);
      scenarios.push(
        {
          name: '超过最大变更数时禁止提交',
          category: 'max-changes-exceeded',
          inputs: { dirtyRows: Array.from({ length: maxChanges + 1 }, (_, index) => ({ [keyField]: `${sampleFieldValue(sheet, keyField, 0)}_${index + 1}`, changes: { [fields[1] || keyField]: sampleFieldValue(sheet, fields[1] || keyField, index + 20) } })) },
          expected: { valid: false, submitEnabled: false, blockedBy: 'rule', maxChanges },
        },
        {
          name: '单行冲突时整批回滚且保留待提交脏行',
          category: 'single-target-conflict-rolls-back-all',
          inputs: { dirtyRows: [{ [keyField]: sampleFieldValue(sheet, keyField, 0), conflict: true, changes: { [fields[1] || keyField]: sampleFieldValue(sheet, fields[1] || keyField, 33) } }] },
          expected: { valid: false, blockedBy: 'workflow', atomicRolledBack: true, dirtyRowsPreserved: true, noInsertOrDelete: true },
        },
      );
    }
  }
  if (template.id === 'multi-table-batch-update') {
    const maxChanges = Number(suppliedParameters.maxChanges || 200);
    scenarios.push(
      {
        name: '无任何脏行时保持提交禁用',
        category: 'no-dirty-rows',
        inputs: {
          totalDirtyRows: 0,
          dirtyRowsByTable: Object.fromEntries(resolveTables(project, selection).map((table: JsonObject) => [String(table.id), []])),
        },
        expected: { valid: false, submitEnabled: false, blockedBy: 'rule' },
      },
      {
        name: '超过总变更上限时禁止整批提交',
        category: 'max-changes-exceeded',
        inputs: {
          totalDirtyRows: maxChanges + 1,
          dirtyRowsByTable: Object.fromEntries(resolveTables(project, selection).map((table: JsonObject) => [String(table.id), Array.from({ length: Math.ceil((maxChanges + 1) / Math.max(1, resolveTables(project, selection).length)) }, (_, index) => ({ row: index + 1 }))])),
        },
        expected: { valid: false, submitEnabled: false, blockedBy: 'rule' },
      },
      {
        name: '任一目标表冲突时整批回滚且不清空已编辑脏行',
        category: 'single-target-conflict-rolls-back-all',
        inputs: {
          dirtyRowsByTable: Object.fromEntries(resolveTables(project, selection).map((table: JsonObject, index: number) => [String(table.id), [{ rowKey: `${table.id}_${index + 1}`, conflict: index === 0 }]])),
        },
        expected: { valid: false, blockedBy: 'workflow', atomicRolledBack: true, dirtyRowsPreserved: true },
      },
    );
  }
  if (template.id === 'parallel-cross-table-entry') {
    scenarios.push(
      {
        name: 'existingPolicy=error 时命中既有键阻止提交',
        category: 'existing-key-conflict',
        inputs: { existingPolicy: suppliedParameters.existingPolicy || 'error', duplicateKeys: true },
        expected: { valid: false, blockedBy: 'workflow', conflictPolicy: 'error' },
      },
      {
        name: 'existingPolicy=skip 时保留既有记录并继续提交其余表',
        category: 'existing-key-skip',
        inputs: { existingPolicy: 'skip', duplicateKeys: true },
        expected: { valid: true, atomic: true, conflictPolicy: 'skip', skippedExisting: true, triggeredWorkflowIds: workflowIds },
      },
      {
        name: 'existingPolicy=update 时改写既有记录并保持原子提交',
        category: 'existing-key-update',
        inputs: { existingPolicy: 'update', duplicateKeys: true },
        expected: { valid: true, atomic: true, conflictPolicy: 'update', updatesExisting: true, triggeredWorkflowIds: workflowIds },
      },
      {
        name: '所有目标通过预检后原子提交',
        category: 'atomic-commit',
        inputs: { existingPolicy: suppliedParameters.existingPolicy || 'error', duplicateKeys: false },
        expected: { valid: true, atomic: true, triggeredWorkflowIds: workflowIds },
      },
    );
  }
      if (template.id === 'master-detail-entry') {
        scenarios.push(
          {
            name: '主记录保存后自动传播主键到新增明细',
            category: 'detail-foreign-key-propagation',
        inputs: {
          ...editableInputs,
          _明细: [{ ...Object.fromEntries((resolveTables(project, selection)[1]?.sheets?.[0]?.headers || []).map((field: string, index: number) => [field, sampleFieldValue(resolveTables(project, selection)[1]?.sheets?.[0], field, index + 10)])), [String((project.relations || []).find((item: DataRelation) => item.id === String(suppliedParameters.relationId || selection.relationIds?.[0] || ''))?.right.fields?.[0] || '')]: '' }],
        },
        expected: { valid: true, foreignKeyPropagated: true, atomic: true, triggeredWorkflowIds: workflowIds },
      },
          {
            name: '明细键冲突时主从整体失败并回滚',
            category: 'detail-key-conflict',
            inputs: {
              ...editableInputs,
              duplicateDetailKey: true,
              _明细: [{ duplicate: true }],
            },
            expected: { valid: false, blockedBy: 'workflow', atomicRolledBack: true },
          },
          {
            name: '明细外键错误时阻止主从提交',
            category: 'detail-foreign-key-mismatch',
            inputs: {
              ...editableInputs,
              _明细: [{ ...Object.fromEntries((resolveTables(project, selection)[1]?.sheets?.[0]?.headers || []).map((field: string, index: number) => [field, sampleFieldValue(resolveTables(project, selection)[1]?.sheets?.[0], field, index + 20)])), [String((project.relations || []).find((item: DataRelation) => item.id === String(suppliedParameters.relationId || selection.relationIds?.[0] || ''))?.right.fields?.[0] || '')]: '__wrong_fk__' }],
            },
            expected: { valid: false, blockedBy: 'workflow', conflictCode: 'FOREIGN_KEY_MISMATCH' },
          },
        );
        if (suppliedParameters.allowEmptyDetails === false) {
          scenarios.push({
            name: '空明细时阻止事务提交',
            category: 'empty-details',
        inputs: { ...editableInputs, _明细: [] },
        expected: { valid: false, blockedBy: 'rule', submitEnabled: false },
      });
    }
  }
  if (template.id === 'master-detail-view') {
    scenarios.push(
      {
        name: 'left join 保留无明细主记录',
        category: 'left-join-empty-details',
        inputs: { joinType: suppliedParameters.joinType || 'left', includeEmptyMasters: true },
        expected: { valid: true, joinType: suppliedParameters.joinType || 'left', keepsEmptyMasters: (suppliedParameters.joinType || 'left') === 'left', triggeredWorkflowIds: workflowIds },
      },
      {
        name: '结果可导出并保留来源键',
        category: 'exportable-master-detail',
        inputs: { exportFormat: suppliedParameters.exportFormat || 'json' },
        expected: { valid: true, exportFormat: suppliedParameters.exportFormat || 'json', sourceQualified: true, outputIds },
      },
    );
  }
  if (template.category === 'analysis' || template.category === 'prediction') {
    scenarios.push({
      name: '运行后生成结果结构',
      category: 'analysis-run',
      inputs: { selectedFields: fields },
      expected: {
        valid: true,
        triggeredWorkflowIds: workflowIds,
        resultBinding: '_分析结果',
        reportKind: template.category === 'prediction' ? 'prediction-report' : 'analysis-report',
      },
    });
  }
  while (scenarios.length < template.generation.tests) scenarios.push(structuredClone(scenarios[scenarios.length % Math.max(1, scenarios.length)]));
  return scenarios.slice(0, template.generation.tests).map((scenario, index) => ({
    id: `${safe}_test_${index + 1}`,
    name: `${template.name}测试${index + 1}`,
    templateId: template.id,
    isolated: true,
    formId: forms[0]?.id,
    workflowIds,
    outputIds,
    coverage,
    cases: [{
      id: `${safe}_case_${index + 1}`,
      name: scenario.name,
      category: scenario.category,
      inputs: scenario.inputs,
      expected: scenario.expected,
    }],
    createdAt: now,
    generatedBy: generatedMetadata(template, String(forms[0]?.generatedBy?.instanceId || ''), now),
  }));
}

const analyticalPresentation: Record<string, { chartType: string; resultLabel: string; resultColumns: string[] }> = {
  'data-overview': { chartType: 'bar', resultLabel: '数据质量与分布', resultColumns: ['字段', '类型', '缺失数', '唯一值', '非空率', '常量列', '样本值', '分布摘要'] },
  'kpi-dashboard': { chartType: 'bar', resultLabel: '指标汇总', resultColumns: ['指标', '汇总值', '均值', '变化'] },
  'group-comparison': { chartType: 'bar', resultLabel: '分组对比', resultColumns: ['分组', '指标', '聚合值', '记录数'] },
  'pivot-analysis': { chartType: 'bar', resultLabel: '透视矩阵', resultColumns: ['行维度', '列维度', '指标值'] },
  'trend-analysis': { chartType: 'line', resultLabel: '趋势与周期变化', resultColumns: ['时间', '指标值', '移动平均', '变化率', '同比变化率'] },
  'correlation-analysis': { chartType: 'bar', resultLabel: '相关矩阵', resultColumns: ['字段 A', '字段 B', '相关系数'] },
  'anomaly-detection': { chartType: 'line', resultLabel: '异常记录', resultColumns: ['记录', '异常得分', '判定', '复核状态'] },
  'cross-table-summary': { chartType: 'bar', resultLabel: '跨表汇总', resultColumns: ['分组', '指标', '聚合值', '来源记录'] },
  'regression-prediction': { chartType: 'line', resultLabel: '回归评估与预测', resultColumns: ['指标', '模型值', '基线值', '结论'] },
  'classification-prediction': { chartType: 'bar', resultLabel: '分类评估与预测', resultColumns: ['类别', '精确率', '召回率', '样本数'] },
  'time-series-prediction': { chartType: 'line', resultLabel: '回测与预测区间', resultColumns: ['时间', '实际值', '预测值', '预测区间'] },
};

function editableTableColumns(sheet: JsonObject, headers: string[], keyField: string) {
  return headers.map((field) => {
    const column = (sheet.columns || []).find((item: JsonObject) => item.name === field) || {};
    const dataType = String(column.dataType || 'string');
    const editor = dataType === 'number' ? 'number'
      : dataType === 'date' ? 'date'
        : dataType === 'boolean' ? 'boolean'
          : dataType === 'enum' ? 'select'
            : 'text';
    const optionValues = [...new Set([...(column.enum || []), ...(column.sampleValues || [])]
      .filter((value: unknown) => value !== null && value !== undefined && value !== '')
      .map((value: unknown) => String(value)))].slice(0, 50);
    return {
      title: String(column.title || field),
      dataIndex: field,
      type: dataType === 'string' || dataType === 'unknown' ? 'text' : dataType,
      editor,
      editable: field !== keyField && column.locked !== true,
      required: field === keyField || column.nullable === false,
      ...(editor === 'select' ? { options: optionValues.map((value) => ({ label: value, value })) } : {}),
      ...(Number(column.width) > 0 ? { width: Number(column.width) } : {}),
      ...(column.format ? { format: column.format } : {}),
    };
  });
}

function objectRecord(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function editableTableColumnsWithProjection(sheet: JsonObject, headers: string[], keyField: string, editableFields: string[] = []) {
  const editableSet = new Set(editableFields.map(String));
  return headers.map((field) => {
    const column = (sheet.columns || []).find((item: JsonObject) => item.name === field) || {};
    const dataType = String(column.dataType || 'string');
    const editor = dataType === 'number' ? 'number'
      : dataType === 'date' ? 'date'
        : dataType === 'boolean' ? 'boolean'
          : dataType === 'enum' ? 'select'
            : 'text';
    const optionValues = [...new Set([...(column.enum || []), ...(column.sampleValues || [])]
      .filter((value: unknown) => value !== null && value !== undefined && value !== '')
      .map((value: unknown) => String(value)))].slice(0, 50);
    return {
      title: String(column.title || field),
      dataIndex: field,
      type: dataType === 'string' || dataType === 'unknown' ? 'text' : dataType,
      editor,
      editable: field !== keyField && column.locked !== true && (!editableSet.size || editableSet.has(field)),
      required: field === keyField || column.nullable === false,
      ...(editor === 'select' ? { options: optionValues.map((value) => ({ label: value, value })) } : {}),
      ...(Number(column.width) > 0 ? { width: Number(column.width) } : {}),
      ...(column.format ? { format: column.format } : {}),
    };
  });
}

function finiteFieldValues(rows: JsonObject[], field: string) {
  return rows
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter(Number.isFinite);
}

function aggregateField(rows: JsonObject[], field: string, aggregation: string) {
  const values = finiteFieldValues(rows, field);
  if (aggregation === 'count') return rows.filter((row) => row[field] !== null && row[field] !== undefined && row[field] !== '').length;
  if (!values.length) return 0;
  if (aggregation === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === 'min') return Math.min(...values);
  if (aggregation === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function correlationValue(left: number[], right: number[]) {
  const size = Math.min(left.length, right.length);
  if (size < 2) return 0;
  const x = left.slice(0, size); const y = right.slice(0, size);
  const xMean = x.reduce((sum, value) => sum + value, 0) / size;
  const yMean = y.reduce((sum, value) => sum + value, 0) / size;
  const numerator = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0);
  const denominator = Math.sqrt(
    x.reduce((sum, value) => sum + (value - xMean) ** 2, 0)
    * y.reduce((sum, value) => sum + (value - yMean) ** 2, 0),
  );
  return denominator ? numerator / denominator : 0;
}

interface AnalyticalPreview {
  chartTitle: string;
  chartType: 'bar' | 'line';
  chartData?: JsonObject;
  resultLabel: string;
  resultColumns: string[];
  resultRows: JsonObject[];
  configuration: string;
}

function configuredPreviewRows(parameters: JsonObject, fallback = 8) {
  return Math.max(1, Math.min(50, Number(parameters.previewRows || fallback) || fallback));
}

function configuredDetailRows(parameters: JsonObject, fallback = 8) {
  return Math.max(1, Math.min(50, Number(parameters.detailRows || fallback) || fallback));
}

function configuredSampleRows(parameters: JsonObject, fallback = 8) {
  return Math.max(1, Math.min(50, Number(parameters.sampleRows || fallback) || fallback));
}

function configuredChartLimit(parameters: JsonObject, fallback = 8) {
  return Math.max(1, Math.min(20, Number(parameters.chartLimit || fallback) || fallback));
}

function summarizeDistinctValues(values: unknown[], limit = 3) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => `${value}×${count}`)
    .join('，');
}

function parseTimeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function isoWeekParts(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { isoYear, isoWeek };
}

function timeBucketKey(date: Date, grain: string) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (grain === 'day') return `${year}-${pad2(month)}-${pad2(day)}`;
  if (grain === 'week') {
    const { isoYear, isoWeek } = isoWeekParts(date);
    return `${isoYear}-W${pad2(isoWeek)}`;
  }
  if (grain === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  if (grain === 'year') return `${year}`;
  return `${year}-${pad2(month)}`;
}

function bucketSortValue(key: string, grain: string) {
  if (grain === 'quarter') {
    const matched = /^(\d{4})-Q([1-4])$/.exec(key);
    return matched ? Number(matched[1]) * 10 + Number(matched[2]) : Number.MAX_SAFE_INTEGER;
  }
  if (grain === 'week') {
    const matched = /^(\d{4})-W(\d{2})$/.exec(key);
    return matched ? Number(matched[1]) * 100 + Number(matched[2]) : Number.MAX_SAFE_INTEGER;
  }
  return key;
}

function nextBucketKey(key: string, grain: string) {
  if (grain === 'year') return String(Number(key) + 1);
  if (grain === 'quarter') {
    const matched = /^(\d{4})-Q([1-4])$/.exec(key);
    if (!matched) return key;
    const year = Number(matched[1]); const quarter = Number(matched[2]);
    return quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
  }
  if (grain === 'month') {
    const matched = /^(\d{4})-(\d{2})$/.exec(key);
    if (!matched) return key;
    const year = Number(matched[1]); const month = Number(matched[2]);
    return month === 12 ? `${year + 1}-01` : `${year}-${pad2(month + 1)}`;
  }
  if (grain === 'week') {
    const matched = /^(\d{4})-W(\d{2})$/.exec(key);
    if (!matched) return key;
    const year = Number(matched[1]); const week = Number(matched[2]);
    return `${year}-W${pad2(week + 1)}`;
  }
  const date = parseTimeValue(key);
  if (!date) return key;
  date.setUTCDate(date.getUTCDate() + 1);
  return timeBucketKey(date, 'day');
}

function fillTimeBuckets(keys: string[], grain: string, limit: number) {
  if (!keys.length) return [];
  const ordered = [...new Set(keys)].sort((left, right) => {
    const leftValue = bucketSortValue(left, grain);
    const rightValue = bucketSortValue(right, grain);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  });
  const filled = [ordered[0]];
  let cursor = ordered[0];
  let guard = 0;
  while (cursor !== ordered[ordered.length - 1] && guard < 500) {
    cursor = nextBucketKey(cursor, grain);
    filled.push(cursor);
    guard += 1;
  }
  return filled.slice(-limit);
}

function previousYearBucketKey(key: string, grain: string) {
  if (grain === 'year') return String(Number(key) - 1);
  if (grain === 'quarter') {
    const matched = /^(\d{4})-Q([1-4])$/.exec(key);
    return matched ? `${Number(matched[1]) - 1}-Q${matched[2]}` : null;
  }
  if (grain === 'month') {
    const matched = /^(\d{4})-(\d{2})$/.exec(key);
    return matched ? `${Number(matched[1]) - 1}-${matched[2]}` : null;
  }
  if (grain === 'week') {
    const matched = /^(\d{4})-W(\d{2})$/.exec(key);
    return matched ? `${Number(matched[1]) - 1}-W${matched[2]}` : null;
  }
  const date = parseTimeValue(key);
  if (!date) return null;
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return timeBucketKey(date, 'day');
}

function applyGeneratedPresentation(form: JsonObject, template: OperationTemplateDefinition, suppliedParameters: JsonObject, fallbackSubtitle = '') {
  const title = String(suppliedParameters.title || suppliedParameters.name || template.name);
  const subtitle = String(suppliedParameters.subtitle || fallbackSubtitle || template.description || '');
  form.name = String(suppliedParameters.name || form.name || template.name);
  form.design ||= {};
  form.design.formWindow ||= {};
  form.design.formWindow = {
    ...form.design.formWindow,
    props: {
      ...(form.design.formWindow.props || {}),
      title,
      subtitle,
      showFooter: false,
    },
  };
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function sameFieldSequence(left: string[], right: string[]) {
  return left.length === right.length && left.every((field, index) => field === right[index]);
}

function resolveSelectedFieldSet(
  selection: TemplateSelection,
  suppliedParameters: JsonObject,
  normalizedFields: NormalizedField[],
) {
  const selectionFields = uniqueStrings((selection.fields || []).map(String));
  const parameterSelectedFields = uniqueStrings(stringList(suppliedParameters.selectedFields));
  const effectiveFields = selectionFields.length
    ? selectionFields
    : parameterSelectedFields.length
      ? parameterSelectedFields
      : normalizedFields.map((field) => field.name);
  return {
    selectionFields,
    parameterSelectedFields,
    effectiveFields,
  };
}

function relationScopedTables(project: JsonObject, selection: TemplateSelection, relation: DataRelation | undefined) {
  if (!relation) return resolveTables(project, selection);
  return [relation.left.tableId, relation.right.tableId]
    .map((id) => (project.srcTable || []).find((item: JsonObject) => item.id === id))
    .filter(Boolean) as JsonObject[];
}

function crossTableFieldCatalog(project: JsonObject, selection: TemplateSelection, relation: DataRelation | undefined) {
  const tables = relationScopedTables(project, selection, relation);
  const relationSheets = new Map<string, string>();
  if (relation) {
    relationSheets.set(relation.left.tableId, relation.left.sheetName);
    relationSheets.set(relation.right.tableId, relation.right.sheetName);
  }
  return tables.flatMap((table) => {
    const sheetName = relationSheets.get(String(table.id || ''));
    const sheet = table.sheets?.find((item: JsonObject) => item.name === sheetName) || table.sheets?.[0];
    return normalizeSheetFields(table, sheet).map((field) => ({
      input: field.qualifiedName,
      field: field.name,
      tableId: field.tableId,
      sheetName: field.sheetName,
      tableQualifiedName: `${field.tableId}.${field.name}`,
      qualifiedName: field.qualifiedName,
      rowKey: `${field.tableId}.${field.name}`,
      type: field.type,
      normalized: field,
    } satisfies ResolvedFieldReference));
  });
}

function resolveCrossTableFieldReference(
  references: ResolvedFieldReference[],
  input: string,
): { resolved?: ResolvedFieldReference; error?: 'not-found' | 'ambiguous'; candidates?: ResolvedFieldReference[] } {
  const value = String(input || '');
  const exact = references.find((item) => item.qualifiedName === value || item.tableQualifiedName === value);
  if (exact) return { resolved: { ...exact, input: value } };
  const byField = references.filter((item) => item.field === value);
  if (byField.length === 1) return { resolved: { ...byField[0], input: value } };
  if (byField.length > 1) return { error: 'ambiguous', candidates: byField };
  return { error: 'not-found', candidates: [] };
}

function resolveCrossTableFieldReferences(
  references: ResolvedFieldReference[],
  inputs: string[],
) {
  const resolved: ResolvedFieldReference[] = [];
  const errors: Array<{ input: string; error: 'not-found' | 'ambiguous'; candidates: ResolvedFieldReference[] }> = [];
  for (const input of inputs) {
    const result = resolveCrossTableFieldReference(references, input);
    if (result.resolved) resolved.push(result.resolved);
    else if (result.error) errors.push({ input, error: result.error, candidates: result.candidates || [] });
  }
  return { resolved, errors };
}

function autoLayoutColumns(fieldCount: number) {
  if (fieldCount <= 1) return 1;
  if (fieldCount <= 4) return 2;
  return 3;
}

function fieldValidatorName(field: NormalizedField) {
  if (field.type === 'email') return 'email';
  if (field.type === 'phone') return 'phone';
  if (field.type === 'url') return 'url';
  if (field.type === 'integer') return 'integer';
  if (['number', 'decimal', 'currency', 'percentage'].includes(field.type)) return 'number';
  if (field.pattern) return 'pattern';
  return undefined;
}

function expressionFieldRefs(expression: string) {
  const refs = [...String(expression || '').matchAll(/\$(?:form\.)?([A-Za-z0-9_\u4e00-\u9fff]+)/g)].map((match) => String(match[1] || '').trim()).filter(Boolean);
  return uniqueStrings(refs);
}

function inferDateOrderPairs(fields: NormalizedField[]) {
  const dateLike = fields.filter((field) => ['date', 'datetime', 'time'].includes(field.type));
  const starts = dateLike.filter((field) => /^(开始|起始|生效|入职|创建|下单|申请|start|begin|from)/i.test(field.name));
  const ends = dateLike.filter((field) => /^(结束|截止|失效|离职|完成|到期|end|finish|to|until)/i.test(field.name));
  const pairs: Array<{ start: NormalizedField; end: NormalizedField }> = [];
  for (const end of ends) {
    const start = starts.find((candidate) => candidate.name !== end.name);
    if (start) pairs.push({ start, end });
  }
  if (!pairs.length && dateLike.length >= 2) {
    const nameMap = new Map(dateLike.map((field) => [field.name, field]));
    const knownPairs: Array<[string, string]> = [
      ['创建时间', '实际完成时间'],
      ['开始日期', '结束日期'],
      ['开始时间', '结束时间'],
      ['生效日期', '失效日期'],
      ['入职日期', '离职日期'],
    ];
    for (const [startName, endName] of knownPairs) {
      const start = nameMap.get(startName);
      const end = nameMap.get(endName);
      if (start && end) pairs.push({ start, end });
    }
  }
  return pairs.filter((pair, index, all) => all.findIndex((item) => item.start.name === pair.start.name && item.end.name === pair.end.name) === index);
}

function configuredLinkageDsl(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).join('\n');
  return '';
}

function applyTemplateFieldOverrides(normalizedFields: NormalizedField[], suppliedParameters: JsonObject = {}) {
  const defaultValues = objectRecord(suppliedParameters.defaultValues);
  const computedExpressions = objectRecord(suppliedParameters.computedExpressions);
  return normalizedFields.map((field) => {
    const next: NormalizedField = { ...field, reasons: [...field.reasons] };
    if (Object.prototype.hasOwnProperty.call(defaultValues, field.name)) {
      next.defaultValue = defaultValues[field.name];
      next.reasons = uniqueStrings([...next.reasons, '字段默认值由模板参数 defaultValues 显式指定']);
    }
    const computedExpression = computedExpressions[field.name];
    if (typeof computedExpression === 'string' && computedExpression.trim()) {
      next.computed = true;
      next.readOnly = true;
      next.required = false;
      next.defaultValue = computedExpression.trim();
      next.type = 'computed';
      next.typeConfidence = 1;
      next.reasons = uniqueStrings([...next.reasons, '字段计算规则由模板参数 computedExpressions 显式指定']);
    }
    return next;
  });
}

function buildTemplateRuleLines(
  templateId: string,
  normalizedFields: NormalizedField[],
  options: {
    visibleFields?: string[];
    queryFields?: string[];
    editableFields?: string[];
    flowId?: string;
    successMessage?: string;
    extraLines?: string[];
  } = {},
) {
  const visibleSet = new Set((options.visibleFields || []).map(String));
  const querySet = new Set((options.queryFields || []).map(String));
  const editableSet = new Set((options.editableFields || []).map(String));
  const flowId = String(options.flowId || '');
  const successMessage = String(options.successMessage || '保存成功');
  const extraLines = (options.extraLines || []).map((line) => String(line || '').trim()).filter(Boolean);
  const activeFields = normalizedFields.filter((field) => !visibleSet.size || visibleSet.has(field.name));
  const lines: string[] = [];

  if (templateId === 'single-table-entry') {
    for (const field of activeFields) {
      if (field.computed && typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
        const watchFields = expressionFieldRefs(String(field.defaultValue)).filter((name) => name !== field.name);
        if (watchFields.length) lines.push(`compute $${field.name} = ${String(field.defaultValue).trim()} watch(${watchFields.map((name) => `$${name}`).join(', ')})`);
      }
      if (field.required && !field.computed && !field.readOnly) lines.push(`before submit -> require($${field.name})`);
      const validator = fieldValidatorName(field);
      if (validator === 'pattern' && field.pattern) lines.push(`before submit -> validate($${field.name}, pattern("${field.pattern}"))`);
      else if (validator) lines.push(`before submit -> validate($${field.name}, ${validator})`);
      if (field.min !== undefined || field.max !== undefined) lines.push(`before submit -> range($${field.name}, ${field.min ?? 'null'}, ${field.max ?? 'null'})`);
      if (field.minLength !== undefined || field.maxLength !== undefined) lines.push(`before submit -> length($${field.name}, ${field.minLength ?? 'null'}, ${field.maxLength ?? 'null'})`);
      if (field.computed) lines.push(`before submit -> keepReadonly($${field.name})`);
    }
    for (const { start, end } of inferDateOrderPairs(activeFields)) {
      lines.push(`before submit -> compare($${end.name}, ">=", $${start.name})`);
    }
  }

  if (templateId === 'single-table-lookup-edit') {
    const queryFields = normalizedFields.filter((field) => querySet.has(field.name));
    if (queryFields.length) lines.push(`before click("lookup") -> requireAny(${queryFields.map((field) => `$${field.name}`).join(', ')})`);
    for (const field of queryFields) {
      const validator = fieldValidatorName(field);
      if (validator === 'pattern' && field.pattern) lines.push(`before click("lookup") -> validate($${field.name}, pattern("${field.pattern}"))`);
      else if (validator) lines.push(`before click("lookup") -> validate($${field.name}, ${validator})`);
    }
    lines.push('before submit -> require($_lookupMatched)');
    const editableFields = normalizedFields.filter((field) => editableSet.has(field.name));
    for (const field of editableFields) {
      if (field.required && !field.readOnly && !field.computed) lines.push(`before submit -> require($${field.name})`);
      const validator = fieldValidatorName(field);
      if (validator === 'pattern' && field.pattern) lines.push(`before submit -> validate($${field.name}, pattern("${field.pattern}"))`);
      else if (validator) lines.push(`before submit -> validate($${field.name}, ${validator})`);
      if (field.min !== undefined || field.max !== undefined) lines.push(`before submit -> range($${field.name}, ${field.min ?? 'null'}, ${field.max ?? 'null'})`);
      if (field.minLength !== undefined || field.maxLength !== undefined) lines.push(`before submit -> length($${field.name}, ${field.minLength ?? 'null'}, ${field.maxLength ?? 'null'})`);
    }
    if (editableFields.length) lines.push(`before submit -> requireDirty(${editableFields.map((field) => `$${field.name}`).join(', ')})`);
  }

  lines.push(...extraLines);
  if (flowId) lines.push(`on submit -> run("${flowId}"); message("${successMessage}", success)`);
  return uniqueStrings(lines);
}

function applyNormalizedFieldSemantics(form: JsonObject, normalizedFields: NormalizedField[]) {
  for (const component of form.design?.components || []) {
    const fieldName = typeof component.fieldBinding === 'string' ? String(component.fieldBinding) : '';
    if (!fieldName || fieldName.startsWith('_')) continue;
    const field = normalizedFields.find((item) => item.name === fieldName);
    if (!field) continue;
    const props = { ...(component.props || {}) };
    props.generatedFieldType = field.type;
    props.generatedFieldConfidence = field.typeConfidence;
    props.required = field.required || props.required === true;
    props.readonly = field.readOnly || props.readonly === true;
    if (field.defaultValue !== undefined && props.defaultValue === undefined) props.defaultValue = field.defaultValue;
    if (['enum', 'multi-enum'].includes(field.type) && (!Array.isArray(props.options) || !props.options.length) && field.enumValues?.length) {
      props.options = field.enumValues.map((value) => ({ label: value, value }));
    }
    const validator = fieldValidatorName(field);
    if (validator === 'pattern' && field.pattern) {
      props.validator = 'pattern';
      props.pattern = field.pattern;
      props.patternMessage ||= `${field.name} 格式不正确`;
    } else if (validator) {
      props.validator = validator === 'number' && props.validator === 'integer' ? props.validator : validator;
    }
    if (field.min !== undefined && props.min === undefined) props.min = field.min;
    if (field.max !== undefined && props.max === undefined) props.max = field.max;
    if (field.minLength !== undefined && props.minLength === undefined) props.minLength = field.minLength;
    if (field.maxLength !== undefined && props.maxLength === undefined) props.maxLength = field.maxLength;
    component.props = props;
    if (field.type === 'long-text' && component.type === 'input') {
      component.type = 'textarea';
      component.height = Math.max(Number(component.height || 0), 116);
    }
  }
  return form;
}

function qualifyFormFieldBindings(form: JsonObject, tableId: string, fieldNames: string[], labelPrefix?: string) {
  const fieldSet = new Set(fieldNames.map(String));
  for (const component of form.design?.components || []) {
    const binding = typeof component.fieldBinding === 'string' ? String(component.fieldBinding) : '';
    if (!binding || binding.startsWith('_') || !fieldSet.has(binding)) continue;
    const qualified = `${tableId}.${binding}`;
    component.fieldBinding = qualified;
    component.props = {
      ...(component.props || {}),
      name: String(component.props?.name || qualified) === binding ? qualified : component.props?.name,
      ...(labelPrefix ? { label: `${labelPrefix} · ${binding}` } : {}),
      sourceTableId: tableId,
      qualifiedFieldBinding: qualified,
    };
  }
  const projected = form.design?.templateParameters?.fieldProjection;
  if (projected?.visibleFields) projected.visibleFields = stringList(projected.visibleFields).map((field) => fieldSet.has(field) ? `${tableId}.${field}` : field);
  if (projected?.internalFields) projected.internalFields = stringList(projected.internalFields).map((field) => fieldSet.has(field) ? `${tableId}.${field}` : field);
  return form;
}

function fieldProjectionSummary(form: JsonObject, selection: TemplateSelection, sheet: JsonObject | undefined) {
  const projected = form.design?.templateParameters?.fieldProjection || {};
  const visibleFields = stringList(projected.visibleFields).length
    ? stringList(projected.visibleFields)
    : (selection.fields?.length ? selection.fields : (sheet?.headers || []).map(String));
  const internalFields = stringList(projected.internalFields);
  const queryFields = stringList(projected.queryFields);
  const displayFields = stringList(projected.displayFields);
  const editableFields = stringList(projected.editableFields);
  return {
    visibleFields,
    internalFields,
    queryFields,
    displayFields,
    editableFields,
  };
}

function summarizeRuleCode(ruleCode: string) {
  return String(ruleCode || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function definedRecord<T extends Record<string, any>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function buildPlanPreview(
  template: OperationTemplateDefinition,
  selection: TemplateSelection,
  suppliedParameters: JsonObject,
  sheet: JsonObject | undefined,
  normalizedFields: NormalizedField[],
  bundle: TemplateArtifactBundle,
) {
  const form = bundle.forms[0];
  const fieldProjection = form ? fieldProjectionSummary(form, selection, sheet) : { visibleFields: [], internalFields: [], queryFields: [], displayFields: [], editableFields: [] };
  const layout = form ? {
    window: {
      width: Number(form.design?.formWindow?.width || 0),
      height: Number(form.design?.formWindow?.height || 0),
      title: String(form.design?.formWindow?.props?.title || template.name),
      subtitle: String(form.design?.formWindow?.props?.subtitle || ''),
    },
    componentCount: Array.isArray(form.design?.components) ? form.design.components.length : 0,
    columns: Number(form.design?.templateParameters?.layout?.columns || suppliedParameters.columns || 0) || undefined,
    includeReset: form.design?.templateParameters?.layout?.includeReset,
    mode: form.design?.templateParameters?.layout?.mode,
    sectionMode: form.design?.templateParameters?.layout?.sectionMode,
    dense: form.design?.templateParameters?.layout?.dense,
    templateKey: form.design?.templateKey,
    generatedRoles: (form.design?.components || [])
      .filter((component: JsonObject) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'))
      .map((component: JsonObject) => ({
        field: String(component.fieldBinding),
        role: String(component.props?.generatedRole || 'visible'),
        type: String(component.type || ''),
        readonly: !!component.props?.readonly,
        disabled: !!component.props?.disabled,
        required: !!component.props?.required,
        validator: component.props?.validator,
        defaultValue: component.props?.defaultValue,
        min: component.props?.min,
        max: component.props?.max,
        minLength: component.props?.minLength,
        maxLength: component.props?.maxLength,
        pattern: component.props?.pattern,
      })),
  } : undefined;
  const ruleSummary = bundle.rules.map((artifact) => ({
    id: artifact.id,
    ownerFormId: artifact.ownerFormId,
    reasonCode: artifact.reasonCode,
    lines: summarizeRuleCode(artifact.ruleCode),
  }));
  const workflowSummary = bundle.workflows.map((workflow) => ({
    id: String(workflow.id || ''),
    name: String(workflow.name || ''),
    nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : 0,
    edgeCount: Array.isArray(workflow.edges) ? workflow.edges.length : 0,
    specIds: (workflow.nodes || []).map((node: JsonObject) => String(node.specId || node.type || '')).filter(Boolean),
  }));
  const buttonTriggers = form ? (form.design?.components || [])
    .filter((component: JsonObject) => component.type === 'button')
    .map((component: JsonObject) => ({
      id: String(component.id || ''),
      label: String(component.props?.label || component.props?.name || component.id || ''),
      workflowIds: Object.values(component.props?.flowTriggers || {})
        .map((entry: any) => String(entry?.workflowId || ''))
        .filter(Boolean),
      disabledExpression: component.props?.disabledExpression,
    })) : [];
  const exactConfiguration = form ? (() => {
    const templateParameters = form.design?.templateParameters || {};
    const internalBindings = (form.design?.components || [])
      .filter((component: JsonObject) => typeof component.fieldBinding === 'string' && String(component.fieldBinding).startsWith('_'))
      .map((component: JsonObject) => ({
        field: String(component.fieldBinding),
        type: String(component.type || ''),
        label: String(component.props?.label || component.props?.name || component.id || ''),
      }));
    const policy = definedRecord({
      entryPolicy: templateParameters.entryPolicy,
      lookupPolicy: templateParameters.lookupPolicy,
      batchEditor: templateParameters.batchEditor,
      detailPolicy: templateParameters.detailPolicy,
      joinPolicy: templateParameters.joinPolicy,
      transactionPolicy: templateParameters.transactionPolicy,
      presentation: templateParameters.presentation,
    });
    const previewControls = definedRecord({
      previewRows: templateParameters.preview?.previewRows ?? suppliedParameters.previewRows,
      detailRows: templateParameters.preview?.detailRows ?? suppliedParameters.detailRows,
      sampleRows: templateParameters.preview?.sampleRows ?? suppliedParameters.sampleRows,
      chartLimit: templateParameters.preview?.chartLimit ?? suppliedParameters.chartLimit,
    });
    const resultBindings = definedRecord({
      resultField: templateParameters.resultField ?? suppliedParameters.resultField,
      summaryField: templateParameters.summaryField ?? suppliedParameters.summaryField,
      chartField: templateParameters.chartField ?? suppliedParameters.chartField,
      messageField: templateParameters.messageField ?? suppliedParameters.messageField,
      sampleField: templateParameters.sampleField ?? suppliedParameters.sampleField,
      changeLogField: templateParameters.changeLogField ?? suppliedParameters.changeLogField ?? templateParameters.transactionPolicy?.diffField ?? (internalBindings.some((item) => item.field === '_变更差异') ? '_变更差异' : undefined),
      writeBackField: templateParameters.writeBackField ?? suppliedParameters.writeBackField ?? templateParameters.transactionPolicy?.statusField ?? (internalBindings.some((item) => ['_写回状态', '_更新状态', '_事务状态', '_批量状态'].includes(item.field)) ? internalBindings.find((item) => ['_写回状态', '_更新状态', '_事务状态', '_批量状态'].includes(item.field))?.field : undefined),
    });
    return {
      copy: definedRecord({
        title: String(form.design?.formWindow?.props?.title || template.name),
        subtitle: form.design?.formWindow?.props?.subtitle ? String(form.design.formWindow.props.subtitle) : undefined,
        successMessage: templateParameters.successMessage ?? suppliedParameters.successMessage ?? '操作成功',
      }),
      buttons: buttonTriggers,
      previewControls,
      fieldProjection,
      resultBindings,
      policy,
      crossTableSources: structuredClone(templateParameters.crossTableSources || []),
      internalBindings,
    };
  })() : undefined;
  const outputs = bundle.outputs.map((output) => ({ id: String(output.id || ''), name: String(output.name || ''), format: String(output.format || 'json') }));
  const tests = bundle.tests.map((suite) => ({
    id: String(suite.id || ''),
    name: String(suite.name || ''),
    caseCount: Array.isArray(suite.cases) ? suite.cases.length : 0,
    categories: Array.from(new Set((suite.cases || []).map((item: JsonObject) => String(item.category || '')))).filter(Boolean),
  }));
  return {
    templateId: template.id,
    category: template.category,
    parameters: structuredClone(suppliedParameters),
    selection: structuredClone(selection),
    normalizedFields: normalizedFields.map((field) => ({
      name: field.name,
      qualifiedName: field.qualifiedName,
      type: field.type,
      typeConfidence: field.typeConfidence,
      required: field.required,
      readOnly: field.readOnly,
      key: field.key,
      computed: field.computed,
      defaultValue: field.defaultValue,
      enumValues: field.enumValues,
      sampleQuality: field.sampleQuality,
      needsConfiguration: field.needsConfiguration,
    })),
    fieldProjection,
    layout,
    rules: ruleSummary,
    workflows: workflowSummary,
    buttonTriggers,
    exactConfiguration,
    outputs,
    tests,
  };
}

function initialAnalyticalPreview(
  template: OperationTemplateDefinition,
  rows: JsonObject[],
  sheet: JsonObject,
  fields: string[],
  numericFields: string[],
  parameters: JsonObject,
  fieldAliases: Record<string, string> = {},
): AnalyticalPreview {
  const selected = `选中字段：${fields.join('、')}`;
  const previewRows = configuredPreviewRows(parameters, 8);
  const detailRows = configuredDetailRows(parameters, 8);
  const chartLimit = configuredChartLimit(parameters, 8);
  const sample = rows.slice(0, Math.max(previewRows, detailRows, chartLimit, 8));
  const sampleValueLimit = Math.max(1, Math.min(10, Number(parameters.sampleValueLimit || 3) || 3));
  const distributionLimit = Math.max(1, Math.min(10, Number(parameters.distributionLimit || 3) || 3));
  if (template.id === 'data-overview') {
    const chartMetric = String(parameters.chartMetric || '唯一值');
    const resultRows = fields.map((field) => {
      const values = rows.map((row) => row[field]);
      const valid = values.filter((value) => value !== null && value !== undefined && value !== '');
      const numbers = finiteFieldValues(rows, field);
      const sampleValues = valid.slice(0, sampleValueLimit).map(String).join('，');
      const distribution = summarizeDistinctValues(valid, distributionLimit);
      return {
        字段: field,
        类型: String(sheet.columns?.find((column: JsonObject) => column.name === field)?.dataType || 'unknown'),
        缺失数: values.length - valid.length,
        唯一值: new Set(valid.map(String)).size,
        非空率: values.length ? valid.length / values.length : 0,
        常量列: valid.length > 0 && new Set(valid.map(String)).size === 1,
        样本值: sampleValues,
        分布摘要: distribution,
        ...(numbers.length ? { 均值: numbers.reduce((sum, value) => sum + value, 0) / numbers.length } : {}),
      };
    });
    return {
      chartTitle: String(parameters.chartTitle || (chartMetric === '缺失数' ? '选中字段缺失数量' : '选中字段唯一值数量')),
      chartType: 'bar',
      chartData: { labels: fields.slice(0, chartLimit), datasets: [{ label: chartMetric, data: resultRows.slice(0, chartLimit).map((row) => chartMetric === '缺失数' ? row.缺失数 : row.唯一值), backgroundColor: 'rgba(0,122,255,0.28)', borderColor: '#007aff' }] },
      resultLabel: String(parameters.resultLabel || '数据质量与分布'),
      resultColumns: ['字段', '类型', '缺失数', '唯一值', '非空率', '常量列', '样本值', '分布摘要', '均值'],
      resultRows: resultRows.slice(0, detailRows),
      configuration: `${selected}　·　${rows.length} 行　·　图表指标 ${chartMetric}　·　图表上限 ${chartLimit} 项　·　样本值上限 ${sampleValueLimit} 项　·　分布摘要上限 ${distributionLimit} 项　·　预览样本 ${previewRows} 行　·　结果展示 ${detailRows} 行`,
    };
  }
  if (template.id === 'group-comparison' || template.id === 'cross-table-summary') {
    const dimensions = (Array.isArray(parameters.dimensions) ? parameters.dimensions : []).map(String);
    const metrics = (Array.isArray(parameters.metrics) ? parameters.metrics : []).map(String);
    const dimension = fieldAliases[dimensions[0]] || dimensions[0] || fields.find((field) => !numericFields.includes(field)) || fields[0];
    const metric = fieldAliases[metrics[0]] || metrics[0] || numericFields[0];
    const aggregation = String(parameters.aggregation || 'sum');
    const groups = new Map<string, JsonObject[]>();
    for (const row of rows) { const key = String(row[dimension] ?? '空值'); groups.set(key, [...(groups.get(key) || []), row]); }
    const groupedRows = [...groups.entries()].map(([name, members]) => ({ 分组: name, 指标: metric, 聚合值: aggregateField(members, metric, aggregation), 记录数: members.length }));
    const resultRows = groupedRows.slice(0, detailRows);
    const chartRows = groupedRows.slice(0, chartLimit);
    return {
      chartTitle: `${dimension} · ${metric}`,
      chartType: 'bar',
      chartData: { labels: chartRows.map((row) => row.分组), datasets: [{ label: `${aggregation}(${metric})`, data: chartRows.map((row) => row.聚合值), backgroundColor: 'rgba(0,122,255,0.28)', borderColor: '#007aff' }] },
      resultLabel: template.id === 'cross-table-summary' ? '跨表汇总' : '分组对比',
      resultColumns: ['分组', '指标', '聚合值', '记录数'],
      resultRows,
      configuration: `${selected}　·　维度：${dimension}　·　指标：${metric}　·　聚合：${aggregation}　·　图表上限 ${chartLimit} 组　·　结果展示 ${detailRows} 行`,
    };
  }
  if (template.id === 'pivot-analysis') {
    const rowDimension = String(parameters.rowDimension || fields.find((field) => !numericFields.includes(field)) || fields[0]);
    const columnDimension = String(parameters.columnDimension || fields.find((field) => field !== rowDimension && !numericFields.includes(field)) || fields[1] || fields[0]);
    const metric = String(parameters.metric || numericFields[0]);
    const aggregation = String(parameters.aggregation || 'sum');
    const rowValues = [...new Set(rows.map((row) => String(row[rowDimension] ?? '空值')))].slice(0, detailRows);
    const columnValues = [...new Set(rows.map((row) => String(row[columnDimension] ?? '空值')))].slice(0, chartLimit);
    const resultRows = rowValues.map((rowValue) => ({
      [rowDimension]: rowValue,
      ...Object.fromEntries(columnValues.map((columnValue) => [columnValue, aggregateField(rows.filter((row) => String(row[rowDimension] ?? '空值') === rowValue && String(row[columnDimension] ?? '空值') === columnValue), metric, aggregation)])),
    }));
    return {
      chartTitle: `${rowDimension} · ${metric}`,
      chartType: 'bar',
      chartData: { labels: rowValues, datasets: [{ label: metric, data: rowValues.map((value) => aggregateField(rows.filter((row) => String(row[rowDimension] ?? '空值') === value), metric, aggregation)), backgroundColor: 'rgba(0,122,255,0.28)', borderColor: '#007aff' }] },
      resultLabel: '透视矩阵',
      resultColumns: [rowDimension, ...columnValues],
      resultRows,
      configuration: `${selected}　·　行：${rowDimension}　·　列：${columnDimension}　·　值：${metric}　·　聚合：${aggregation}　·　图表上限 ${chartLimit} 列`,
    };
  }
  if (template.id === 'trend-analysis') {
    const timeField = String(parameters.timeField || fields.find((field) => sheet.columns?.find((column: JsonObject) => column.name === field)?.dataType === 'date') || fields[0]);
    const metric = String(parameters.metric || numericFields[0]);
    const grain = String(parameters.grain || 'month');
    const parsedRows = rows
      .map((row) => ({ row, date: parseTimeValue(row[timeField]), metricValue: Number(row[metric]) }))
      .filter((item) => item.date && Number.isFinite(item.metricValue)) as Array<{ row: JsonObject; date: Date; metricValue: number }>;
    const grouped = new Map<string, number[]>();
    for (const item of parsedRows) {
      const key = timeBucketKey(item.date, grain);
      grouped.set(key, [...(grouped.get(key) || []), item.metricValue]);
    }
    const allBucketKeys = fillTimeBuckets([...grouped.keys()], grain, 500);
      const bucketSums = new Map(allBucketKeys.map((key) => [key, (grouped.get(key) || []).reduce((total, value) => total + value, 0)]));
      const aggregatedRows = allBucketKeys.map((key, index) => {
        const values = grouped.get(key) || [];
        const sum = bucketSums.get(key) || 0;
        const average = values.length ? sum / values.length : 0;
        const previous = index > 0 ? (bucketSums.get(allBucketKeys[index - 1]) || 0) : null;
        const movingWindow = allBucketKeys.slice(Math.max(0, index - 2), index + 1).map((bucket) => {
          return bucketSums.get(bucket) || 0;
        });
        const movingAverage = movingWindow.length ? movingWindow.reduce((total, value) => total + value, 0) / movingWindow.length : 0;
        const previousYearKey = previousYearBucketKey(key, grain);
        const previousYear = previousYearKey ? bucketSums.get(previousYearKey) : null;
        return {
          时间: key,
          指标: metric,
          指标值: sum,
          记录数: values.length,
          缺失周期: values.length === 0,
          移动平均: movingAverage,
          变化率: previous === null ? null : (previous === 0 ? (sum === 0 ? 0 : 1) : (sum - previous) / previous),
          同比变化率: previousYear == null ? null : (previousYear === 0 ? (sum === 0 ? 0 : 1) : (sum - previousYear) / previousYear),
          聚合方式: 'sum',
          粒度: grain,
          平均值: average,
        };
      });
      const ordered = aggregatedRows.slice(-Math.max(previewRows, detailRows, 8));
      const resultRows = ordered.slice(-detailRows).map((row) => ({ 时间: row.时间, 指标: row.指标, 指标值: row.指标值, 移动平均: row.移动平均, 变化率: row.变化率, 同比变化率: row.同比变化率, 缺失周期: row.缺失周期 }));
    return {
      chartTitle: `${metric}趋势`,
      chartType: 'line',
      chartData: { labels: ordered.map((row) => String(row.时间)), datasets: [{ label: metric, data: ordered.map((row) => Number(row.指标值) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.18)' }] },
      resultLabel: '趋势明细',
      resultColumns: ['时间', '指标', '指标值', '移动平均', '变化率', '同比变化率', '缺失周期'],
      resultRows,
      configuration: `${selected}　·　时间：${timeField}　·　指标：${metric}　·　粒度：${grain}　·　预览样本 ${previewRows} 行`,
    };
  }
  if (template.id === 'time-series-prediction') {
    const timeField = String(parameters.timeField || fields.find((field) => sheet.columns?.find((column: JsonObject) => column.name === field)?.dataType === 'date') || fields[0]);
    const metric = String(parameters.target || numericFields[0]);
    const ordered = [...rows].filter((row) => row[timeField] !== undefined).sort((left, right) => String(left[timeField]).localeCompare(String(right[timeField]))).slice(-Math.max(previewRows, detailRows, 8));
    const resultRows = ordered.slice(-detailRows).map((row) => ({ 时间: row[timeField], 指标: metric, 指标值: row[metric] }));
    return {
      chartTitle: `${metric}历史序列与预测输入`,
      chartType: 'line',
      chartData: { labels: ordered.map((row) => String(row[timeField])), datasets: [{ label: metric, data: ordered.map((row) => Number(row[metric]) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.18)' }] },
      resultLabel: '时间序列输入',
      resultColumns: ['时间', '指标', '指标值'],
      resultRows,
      configuration: `${selected}　·　时间：${timeField}　·　指标：${metric}　·　预测期：${parameters.horizon}　·　预览样本 ${previewRows} 行`,
    };
  }
  if (template.id === 'correlation-analysis') {
    const correlationFields = (Array.isArray(parameters.fields) ? parameters.fields.map(String) : numericFields).filter((field) => numericFields.includes(field));
    const pairs: JsonObject[] = [];
    for (let left = 0; left < correlationFields.length; left += 1) for (let right = left + 1; right < correlationFields.length; right += 1) {
      pairs.push({ '字段 A': correlationFields[left], '字段 B': correlationFields[right], 相关系数: correlationValue(finiteFieldValues(rows, correlationFields[left]), finiteFieldValues(rows, correlationFields[right])) });
    }
    return {
      chartTitle: '选中字段相关系数',
      chartType: 'bar',
      chartData: { labels: pairs.map((row) => `${row['字段 A']} × ${row['字段 B']}`), datasets: [{ label: '相关系数', data: pairs.map((row) => row.相关系数), backgroundColor: 'rgba(0,122,255,0.28)', borderColor: '#007aff' }] },
      resultLabel: '相关矩阵摘要',
      resultColumns: ['字段 A', '字段 B', '相关系数'],
      resultRows: pairs.slice(0, detailRows),
      configuration: `${selected}　·　${correlationFields.length} 个数值字段　·　结果展示 ${detailRows} 行`,
    };
  }
  if (template.id === 'anomaly-detection') {
    const anomalyFields = (Array.isArray(parameters.fields) ? parameters.fields.map(String) : numericFields).filter((field) => numericFields.includes(field));
    const contamination = Math.max(0, Math.min(0.5, Number(parameters.contamination ?? 0.1) || 0.1));
    const stats = Object.fromEntries(anomalyFields.map((field) => {
      const values = finiteFieldValues(rows, field);
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;
      return [field, { mean, std: Math.sqrt(variance) || 1 }];
    }));
    const scoredRows = rows.map((row, index) => {
      const score = anomalyFields.reduce((total, field) => {
        const value = Number(row[field]);
        if (!Number.isFinite(value)) return total;
        const stat = stats[field] as { mean: number; std: number };
        return total + Math.abs((value - stat.mean) / stat.std);
      }, 0);
      return { 记录: index + 1, ...Object.fromEntries(anomalyFields.map((field) => [field, row[field]])), 异常得分: score, 判定: '正常', 复核状态: '待复核' };
    }).sort((left, right) => Number(right.异常得分) - Number(left.异常得分));
    const flaggedCount = Math.min(scoredRows.length, Math.max(1, Math.round(scoredRows.length * contamination)));
    const resultRows = scoredRows.slice(0, detailRows).map((row, index) => ({ ...row, 判定: index < flaggedCount ? '异常' : '正常' }));
    return {
      chartTitle: '异常得分排序',
      chartType: 'line',
      chartData: { labels: scoredRows.slice(0, chartLimit).map((row) => String(row.记录)), datasets: [{ label: '异常得分', data: scoredRows.slice(0, chartLimit).map((row) => Number(row.异常得分) || 0), borderColor: '#ff3b30', backgroundColor: 'rgba(255,59,48,0.18)' }] },
      resultLabel: '异常检测结果',
      resultColumns: ['记录', ...anomalyFields, '异常得分', '判定', '复核状态'],
      resultRows,
      configuration: `${selected}　·　预期异常比例：${contamination * 100}%　·　图表上限 ${chartLimit} 行　·　预览样本 ${previewRows} 行`,
    };
  }
  if (template.id === 'classification-prediction') {
    const target = String(parameters.target || fields.find((field) => !numericFields.includes(field)) || fields[0]);
    const features = (Array.isArray(parameters.features) ? parameters.features.map(String) : fields.filter((field) => field !== target));
    const counts = new Map<string, number>();
    for (const row of rows) { const name = String(row[target] ?? '空值'); counts.set(name, (counts.get(name) || 0) + 1); }
    const resultRows = [...counts.entries()].slice(0, detailRows).map(([category, count]) => ({ 类别: category, 样本数: count, 占比: rows.length ? count / rows.length : 0 }));
    return {
      chartTitle: `${target}类别分布`,
      chartType: 'bar',
      chartData: { labels: resultRows.map((row) => row.类别), datasets: [{ label: '样本数', data: resultRows.map((row) => row.样本数), backgroundColor: 'rgba(0,122,255,0.28)', borderColor: '#007aff' }] },
      resultLabel: '训练样本类别',
      resultColumns: ['类别', '样本数', '占比'],
      resultRows,
      configuration: `${selected}　·　目标：${target}　·　特征：${features.join('、')}　·　结果展示 ${detailRows} 行`,
    };
  }
  if (template.id === 'regression-prediction') {
    const target = String(parameters.target || numericFields[numericFields.length - 1]);
    const features = (Array.isArray(parameters.features) ? parameters.features.map(String) : numericFields.filter((field) => field !== target));
    return {
      chartTitle: `${target}与特征输入`,
      chartType: 'line',
      chartData: { labels: sample.map((_row, index) => String(index + 1)), datasets: [target, ...features].map((field, index) => ({ label: field, data: sample.map((row) => Number(row[field]) || 0), borderColor: ['#007aff', '#ff9500', '#34c759', '#af52de'][index % 4], backgroundColor: 'transparent' })) },
      resultLabel: '训练字段角色',
      resultColumns: ['角色', '字段'],
      resultRows: [{ 角色: '预测目标', 字段: target }, ...features.map((field) => ({ 角色: '输入特征', 字段: field }))].slice(0, detailRows),
      configuration: `${selected}　·　目标：${target}　·　特征：${features.join('、')}　·　验证比例：${parameters.validationRatio ?? 0.2}`,
    };
  }
  const resultRows = sample.slice(0, detailRows).map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
  return {
    chartTitle: `${template.name}输入预览`,
    chartType: analyticalPresentation[template.id]?.chartType === 'line' ? 'line' : 'bar',
    chartData: numericFields[0] ? { labels: sample.map((_row, index) => String(index + 1)), datasets: [{ label: numericFields[0], data: sample.map((row) => Number(row[numericFields[0]]) || 0), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.18)' }] } : undefined,
    resultLabel: analyticalPresentation[template.id]?.resultLabel || '分析输入',
    resultColumns: fields,
    resultRows,
    configuration: `${selected}　·　预览样本 ${previewRows} 行　·　结果展示 ${detailRows} 行`,
  };
}

function analyticalForm(
  project: JsonObject,
  template: OperationTemplateDefinition,
  table: JsonObject,
  sheet: JsonObject,
  selection: TemplateSelection,
  suppliedParameters: JsonObject,
  safe: string,
) {
  const form = generatedForm(table, { ...sheet, headers: [], columns: [] }, { id: safe, name: suppliedParameters.name || template.name, mode: 'detail' });
  const fields = resolveSelectedFieldSet(selection, suppliedParameters, normalizeSheetFields(table, sheet)).effectiveFields as string[];
  let allSourceRows = fullSourceRows(project, table, sheet);
  let analyticalFieldAliases: Record<string, string> = {};
  if (template.id === 'cross-table-summary' && suppliedParameters.relationId) {
    try {
      allSourceRows = queryRelationRows(project, { relationId: String(suppliedParameters.relationId), exportAll: true }).rows;
      const relation = (project.relations || []).find((item: DataRelation) => item.id === String(suppliedParameters.relationId)) as DataRelation | undefined;
      analyticalFieldAliases = Object.fromEntries(
        crossTableFieldCatalog(project, selection, relation).flatMap((field) => ([
          [field.input, field.rowKey],
          [field.qualifiedName, field.rowKey],
          [field.tableQualifiedName, field.rowKey],
        ])),
      );
    } catch { /* feasibility report owns the actionable relation error */ }
  }
  const previewRows = configuredPreviewRows(suppliedParameters, 8);
  const detailRows = configuredDetailRows(suppliedParameters, 8);
  const sampleRowCount = configuredSampleRows(suppliedParameters, previewRows);
  const sourceRows = allSourceRows.slice(0, sampleRowCount);
  const sampleRows = sourceRows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
  const numericFields = fields.filter((field) => sheet.columns?.find((column: JsonObject) => column.name === field)?.dataType === 'number');
  form.design.formWindow = { ...form.design.formWindow, width: 920, height: 860, props: { ...(form.design.formWindow?.props || {}), title: template.name, showFooter: false } };
  form.design.formMode = 'detail';
  if (template.id === 'kpi-dashboard') {
    const configuredMetrics = Array.isArray(suppliedParameters.metrics) ? suppliedParameters.metrics.map(String) : [];
    const configuredDimensions = Array.isArray(suppliedParameters.dimensions) ? suppliedParameters.dimensions.map(String) : [];
    const aggregation = String(suppliedParameters.aggregation || 'average');
    const metrics = configuredMetrics.filter((field) => numericFields.includes(field));
    const visibleMetrics = metrics.length ? metrics : numericFields;
    const dimension = configuredDimensions.find((field) => fields.includes(field));
    const summaries = visibleMetrics.map((field) => {
      const values = allSourceRows.map((row) => Number(row[field])).filter(Number.isFinite);
      const sum = values.reduce((total, value) => total + value, 0);
      return {
        field,
        sum,
        average: values.length ? sum / values.length : 0,
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        count: values.length,
        current: aggregation === 'sum' ? sum : aggregation === 'min' ? (values.length ? Math.min(...values) : 0) : aggregation === 'max' ? (values.length ? Math.max(...values) : 0) : aggregation === 'count' ? values.length : (values.length ? sum / values.length : 0),
      };
    });
    const groupedRows = dimension
      ? [...new Map(allSourceRows.map((row) => [String(row[dimension] ?? '空值'), allSourceRows.filter((candidate) => String(candidate[dimension] ?? '空值') === String(row[dimension] ?? '空值'))])).entries()]
        .map(([group, members]) => ({ [dimension]: group, ...Object.fromEntries(visibleMetrics.map((field) => [field, aggregateField(members, field, aggregation)])), 记录数: members.length }))
      : [];
    const cardWidth = Math.floor(800 / Math.min(3, Math.max(1, summaries.length))) - 16;
    const cardComponents = summaries.flatMap((summary, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 60 + column * 272;
      const y = 226 + row * 100;
      return [
        { id: `${safe}_kpi_label_${index + 1}`, type: 'text', x, y, width: cardWidth, height: 26, zIndex: 2, props: { content: `${summary.field} · ${aggregation}`, fontSize: 13, fontWeight: '600', color: '#475569' } },
        { id: `${safe}_kpi_value_${index + 1}`, type: 'animatedNumber', x, y: y + 28, width: cardWidth, height: 52, zIndex: 2, fieldBinding: `_KPI_${summary.field}`, props: { name: `_KPI_${summary.field}`, content: summary.current, templateMetric: summary.field, duration: 0, decimals: 2, fontSize: 30, fontWeight: '700', color: '#007aff', useGrouping: true } },
      ];
    });
    const cardsBottom = 226 + Math.max(1, Math.ceil(summaries.length / 3)) * 100;
    const chartData = dimension
      ? {
        labels: groupedRows.slice(0, configuredChartLimit(suppliedParameters, 8)).map((item) => String(item[dimension])),
        datasets: visibleMetrics.slice(0, 3).map((field, index) => ({ label: `${aggregation}(${field})`, data: groupedRows.slice(0, configuredChartLimit(suppliedParameters, 8)).map((item) => Number(item[field]) || 0), borderColor: ['#007aff', '#ff9500', '#34c759'][index % 3], backgroundColor: ['rgba(0,122,255,0.28)', 'rgba(255,149,0,0.28)', 'rgba(52,199,89,0.28)'][index % 3] })),
      }
      : {
        labels: summaries.map((item) => item.field),
        datasets: [{ label: aggregation, data: summaries.map((item) => item.current), borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.28)' }],
      };
    const resultRows = dimension
      ? groupedRows.slice(0, detailRows)
      : summaries.slice(0, detailRows).map((item) => ({ 指标: item.field, 汇总值: item.sum, 均值: item.average, 有效记录数: item.count }));
    const resultY = cardsBottom + 24;
    form.design.formWindow.height = resultY + 350;
    form.design.components = [
      { id: `${safe}_title`, type: 'text', x: 60, y: 48, width: 800, height: 42, zIndex: 2, props: { content: template.name, fontSize: 24, fontWeight: '700', color: '#1c1c1e' } },
      { id: `${safe}_description`, type: 'text', x: 60, y: 92, width: 800, height: 34, zIndex: 2, props: { content: String(suppliedParameters.subtitle || template.description), fontSize: 13, color: '#475569' } },
      { id: `${safe}_status`, type: 'text', x: 60, y: 138, width: 800, height: 44, zIndex: 2, fieldBinding: '_分析状态', props: { name: '_分析状态', content: `已按选中的 ${visibleMetrics.length} 个指标生成看板；当前展示上次保存数据的汇总预览。`, fontSize: 13, fontWeight: '600', color: '#166534' } },
      { id: `${safe}_selected_fields`, type: 'text', x: 60, y: 188, width: 800, height: 28, zIndex: 2, props: { content: `选中字段：${fields.join('、')}　·　指标：${visibleMetrics.join('、')}　·　维度：${dimension || '无'}　·　聚合：${aggregation}　·　输入样本 ${sampleRowCount} 行　·　结果展示 ${detailRows} 行`, fontSize: 12, color: '#334155' } },
      ...cardComponents,
      { id: `${safe}_sample_chart`, type: 'chart', x: 60, y: resultY, width: 500, height: 280, zIndex: 2, props: { name: '_输入样本图', title: dimension ? `${dimension} 分组 ${aggregation}` : `选中指标${aggregation}`, chartType: 'bar', chartData, showLegend: dimension, showValues: true } },
      { id: `${safe}_result_table`, type: 'table', x: 580, y: resultY, width: 280, height: 280, zIndex: 2, fieldBinding: '_分析结果', props: { name: '_分析结果', label: dimension ? '分组 KPI 汇总' : '选中指标汇总', columns: dimension ? [dimension, ...visibleMetrics, '记录数'] : ['指标', '汇总值', '均值', '有效记录数'], data: resultRows, rows: Math.min(detailRows, Math.max(3, resultRows.length)), striped: true, showGrid: true } },
      ];
    applyGeneratedPresentation(form, template, suppliedParameters, template.description);
    return form;
  }
  const preview = initialAnalyticalPreview(template, allSourceRows, sheet, fields, numericFields, suppliedParameters, analyticalFieldAliases);
  form.design.components = [
    { id: `${safe}_title`, type: 'text', x: 60, y: 48, width: 800, height: 42, zIndex: 2, props: { content: String(suppliedParameters.title || template.name), fontSize: 24, fontWeight: '700', color: '#1c1c1e' } },
    { id: `${safe}_description`, type: 'text', x: 60, y: 92, width: 800, height: 34, zIndex: 2, props: { content: String(suppliedParameters.subtitle || template.description), fontSize: 13, color: '#475569' } },
    { id: `${safe}_status`, type: 'text', x: 60, y: 138, width: 800, height: 44, zIndex: 2, fieldBinding: '_分析状态', props: { name: '_分析状态', content: `已按选中的 ${fields.length} 个字段生成${template.name}；当前展示上次保存数据的运行前预览。`, fontSize: 13, fontWeight: '600', color: '#166534' } },
    { id: `${safe}_preview_heading`, type: 'text', x: 60, y: 184, width: 800, height: 28, zIndex: 2, props: { content: '输入样本预览（非模型结果）', fontSize: 15, fontWeight: '700', color: '#1f2937' } },
    { id: `${safe}_preview_note`, type: 'text', x: 60, y: 214, width: 800, height: 34, zIndex: 2, props: { content: '创建后会基于当前保存的数据自动运行分析或预测流程；这里先展示字段角色、输入样本和预计结果结构。', fontSize: 12, color: '#475569', lineHeight: 1.6 } },
    { id: `${safe}_selected_fields`, type: 'text', x: 60, y: 252, width: 800, height: 28, zIndex: 2, props: { content: `选中字段：${fields.join('、')}`, fontSize: 12, color: '#334155' } },
    { id: `${safe}_sample_chart`, type: 'chart', x: 60, y: 296, width: 500, height: 280, zIndex: 2, props: { name: '_输入样本图', title: preview.chartTitle, chartType: preview.chartType, chartData: preview.chartData, sourceFields: fields, showLegend: true, showValues: preview.chartType === 'bar' } },
    { id: `${safe}_result_table`, type: 'table', x: 580, y: 296, width: 280, height: 280, zIndex: 2, fieldBinding: '_分析结果', props: { name: '_分析结果', label: preview.resultLabel, columns: preview.resultColumns, data: preview.resultRows, sourceFields: fields, rows: Math.min(detailRows, Math.max(3, preview.resultRows.length)), striped: true, showGrid: true } },
    { id: `${safe}_configuration`, type: 'text', x: 60, y: 600, width: 800, height: 36, zIndex: 2, props: { content: `运行配置　${preview.configuration}`, fontSize: 12, color: '#334155', lineHeight: 1.6 } },
    { id: `${safe}_sample_table`, type: 'table', x: 60, y: 652, width: 800, height: 130, zIndex: 2, props: { name: '_输入样本', label: '输入数据样本', columns: fields, data: sampleRows, rows: Math.min(sampleRowCount, Math.max(1, sampleRows.length)), striped: true, showGrid: true } },
  ];
  applyGeneratedPresentation(form, template, suppliedParameters, template.description);
  return form;
}

export function planOperationTemplate(project: JsonObject, templateId: string, selection: TemplateSelection, suppliedParameters: JsonObject = {}): GenerationPlan {
  const report = analyzeOperationTemplate(project, templateId, selection, suppliedParameters);
  if (report.status === 'blocked' || report.status === 'not-applicable') throw toolError('TEMPLATE_NOT_FEASIBLE', report.summary, 'selection', report);
  if (report.status === 'needs-configuration') throw toolError('TEMPLATE_PARAMETERS_REQUIRED', report.summary, 'parameters', report);
  const template = getOperationTemplate(templateId, project); const instanceId = `tpl_${randomUUID()}`; const now = new Date().toISOString();
  const table = resolveTables(project, selection)[0]; const sheet = selectedSheet(table, selection);
  const normalizedFields = applyTemplateFieldOverrides(normalizeSheetFields(table, sheet), suppliedParameters);
  const { effectiveFields } = resolveSelectedFieldSet(selection, suppliedParameters, normalizedFields);
  const rawId = String(suppliedParameters.formId || `${template.id}_${table?.id || 'project'}_${sheet?.name || 'main'}`);
  const safe = rawId.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || `${template.id}_${createHash('sha1').update(rawId).digest('hex').slice(0, 10)}`;
  const artifacts: GenerationPlan['artifacts'] = { forms: [], rules: [], behaviors: [], workflows: [], outputs: [], tests: [] };
  if (template.generation.forms && table && sheet) {
    const isScaffoldTemplate = template.id === 'single-table-entry' || template.id === 'single-table-lookup-edit';
    const mode = template.id === 'single-table-entry' ? 'create' : template.category === 'maintenance' || template.category === 'cross-table' ? 'edit' : 'detail';
    const scaffold = isScaffoldTemplate ? generateFormScaffold(table as any, sheet.name, {
      idPrefix: safe,
      name: String(suppliedParameters.name || template.name),
      purpose: template.id === 'single-table-lookup-edit' ? 'lookup-edit' : 'entry',
      mode,
      selectedFields: effectiveFields.length ? effectiveFields : undefined,
      now,
      columns: [1, 2, 3].includes(Number(suppliedParameters.columns)) ? Number(suppliedParameters.columns) as 1 | 2 | 3 : undefined,
      includeReset: suppliedParameters.includeReset === undefined ? true : !!suppliedParameters.includeReset,
    }) : undefined;
    const isAnalyticalTemplate = template.category === 'analysis' || template.category === 'prediction';
    const form = scaffold
      ? scaffold.form as unknown as JsonObject
      : isAnalyticalTemplate
      ? analyticalForm(project, template, table, sheet, selection, suppliedParameters, safe)
        : generatedForm(table, { ...sheet, headers: effectiveFields.length ? effectiveFields : sheet.headers }, { id: safe, name: suppliedParameters.name || template.name, mode });
    if (scaffold) {
      form.id = safe;
      form.name = suppliedParameters.name || template.name;
      const saveButton = form.design.components.find((component: JsonObject) => component.type === 'button' && String(component.props?.label || '').includes('保存'));
      if (saveButton) {
        saveButton.props = { ...(saveButton.props || {}), ...(suppliedParameters.saveLabel ? { label: String(suppliedParameters.saveLabel) } : {}), events: undefined };
      }
      const resetButton = form.design.components.find((component: JsonObject) => component.type === 'button' && String(component.props?.label || '').includes('重置'));
      if (resetButton && suppliedParameters.resetLabel) resetButton.props = { ...(resetButton.props || {}), label: String(suppliedParameters.resetLabel) };
      const lookupButton = form.design.components.find((component: JsonObject) => component.type === 'button' && String(component.props?.label || '').includes('查询'));
      if (lookupButton && suppliedParameters.lookupLabel) lookupButton.props = { ...(lookupButton.props || {}), label: String(suppliedParameters.lookupLabel) };
      if (template.id === 'single-table-lookup-edit') {
        const queryFields = stringList(suppliedParameters.queryFields);
        const displayFields = stringList(suppliedParameters.displayFields);
        const editableFields = stringList(suppliedParameters.editableFields);
        const projectedFields = [...new Set([...queryFields, ...displayFields, ...editableFields])];
        const keyFields = new Set(sheet.config?.keyFields || []);
        const fieldComponents = form.design.components.filter((component: JsonObject) => component.fieldBinding && !String(component.fieldBinding).startsWith('_'));
        let queryIndex = 0;
        let displayIndex = 0;
        let editIndex = 0;
        const columns = [1, 2, 3].includes(Number(suppliedParameters.columns)) ? Number(suppliedParameters.columns) : 2;
        const fieldWidth = columns === 1 ? 620 : columns === 2 ? 300 : 236;
        const querySet = new Set(queryFields);
        const displaySet = new Set(displayFields);
        const editableSet = new Set(editableFields);
        for (const component of fieldComponents) {
          const field = String(component.fieldBinding || '');
          const isQuery = querySet.has(field);
          const isDisplay = displaySet.has(field);
          const isEditable = editableSet.has(field);
          const index = isQuery ? queryIndex++ : isDisplay ? displayIndex++ : editIndex++;
          const col = index % columns;
          const row = Math.floor(index / columns);
          component.x = 72 + col * (fieldWidth + 24);
          component.width = fieldWidth;
          component.y = isQuery ? 148 + row * 92 : isDisplay ? 352 + row * 92 : 556 + row * 92;
          component.props = {
            ...(component.props || {}),
            readonly: isQuery ? false : isDisplay ? true : !isEditable || keyFields.has(field),
            disabled: isQuery ? false : true,
            generatedRole: isQuery ? 'query' : isDisplay ? 'display' : 'editable',
          };
        }
        const querySection = { id: `${safe}_query_section`, type: 'text', x: 72, y: 112, width: 720, height: 24, zIndex: 1, props: { name: `${safe}_query_section`, content: '查询条件', fontSize: 14, fontWeight: 650, color: '#334155' } };
        const displaySection = { id: `${safe}_display_section`, type: 'text', x: 72, y: 316, width: 720, height: 24, zIndex: 1, props: { name: `${safe}_display_section`, content: '结果展示（查询命中后回填）', fontSize: 14, fontWeight: 650, color: '#334155' } };
        const editSection = { id: `${safe}_edit_section`, type: 'text', x: 72, y: 520, width: 720, height: 24, zIndex: 1, props: { name: `${safe}_edit_section`, content: '编辑字段（查询命中后解锁）', fontSize: 14, fontWeight: 650, color: '#334155' } };
        form.design.components = [
          ...form.design.components.filter((component: JsonObject) => ![querySection.id, displaySection.id, editSection.id].includes(String(component.id || ''))),
          querySection,
          displaySection,
          editSection,
        ];
        const displayComponentIds = fieldComponents
          .filter((component: JsonObject) => displaySet.has(String(component.fieldBinding || '')))
          .map((component: JsonObject) => String(component.id || ''))
          .filter(Boolean);
        const saveButton = form.design.components.find((component: JsonObject) => component.type === 'button' && (String(component.id || '').endsWith('_save') || String(component.props?.name || '').endsWith('_save') || String(component.props?.label || '').includes('保存') || String(component.props?.label || '').includes('提交')));
        const resetActionButton = form.design.components.find((component: JsonObject) => component.type === 'button' && (String(component.id || '').endsWith('_reset') || String(component.props?.name || '').endsWith('_reset') || String(component.props?.label || '').includes('重置')));
        const editableComponentIds = fieldComponents
          .filter((component: JsonObject) => editableSet.has(String(component.fieldBinding || '')))
          .map((component: JsonObject) => String(component.id || ''))
          .filter(Boolean);
        const queryBottom = 148 + Math.ceil(Math.max(1, queryFields.length) / columns) * 92;
        const displayBottom = 352 + Math.ceil(Math.max(1, displayFields.length) / columns) * 92;
        const editBottom = 556 + Math.ceil(Math.max(1, editableFields.length) / columns) * 92;
        const actionY = Math.max(editBottom + 36, displayBottom + 36, queryBottom + 36);
        if (saveButton) saveButton.props = {
          ...(saveButton.props || {}),
          disabled: true,
          disabledExpression: suppliedParameters.dirtyOnly === false
            ? '($_lookupMatched != true) || ($_lookupUnique != true)'
            : '($_lookupMatched != true) || ($_lookupUnique != true) || ($_lookupMatchCount != 1)',
          generatedUnlock: 'afterLookupSuccess',
          flowTriggers: {
            onClick: {
              enabled: true,
              workflowId: `${safe}_save_flow`,
              parameterMap: {
                'workflow_import.formData': Object.fromEntries(projectedFields.map((field) => [field, `$form.${field}`])),
                'workflow_import.originalData': Object.fromEntries(projectedFields.map((field) => [field, `$form._original_${field}`])),
              },
            },
          },
        };
        if (saveButton) {
          saveButton.x = 72;
          saveButton.y = actionY;
        }
        if (resetActionButton) {
          resetActionButton.x = 276;
          resetActionButton.y = actionY;
        }
        if (form.design.formWindow) form.design.formWindow.height = Math.max(Number(form.design.formWindow.height || 0), actionY + 140);
        const lookupActionButton = form.design.components.find((component: JsonObject) => component.type === 'button' && (String(component.id || '').endsWith('_lookup') || String(component.props?.name || '').endsWith('_lookup') || String(component.props?.label || '').includes('查询') || String(component.props?.label || '').includes('查找')));
        if (lookupActionButton) lookupActionButton.props = {
          ...(lookupActionButton.props || {}),
          generatedQueryFields: queryFields,
          events: undefined,
          autoTriggerOnLoad: suppliedParameters.autoQueryOnLoad === true,
          flowTriggers: {
            onClick: {
              enabled: true,
              workflowId: `${safe}_lookup_flow`,
              parameterMap: {
                'workflow_import.criteria': Object.fromEntries(queryFields.map((field) => [field, `$form.${field}`])),
              },
            },
          },
        };
        if (lookupActionButton) {
          lookupActionButton.x = 72;
          lookupActionButton.y = actionY;
        }
        form.design.templateParameters = {
          ...form.design.templateParameters,
          resultField: String(suppliedParameters.resultField || '_查询结果'),
          changeLogField: String(suppliedParameters.changeLogField || '_变更差异'),
          writeBackField: String(suppliedParameters.writeBackField || '_更新状态'),
          fieldProjection: {
            visibleFields: [...new Set([...queryFields, ...displayFields, ...editableFields])],
            queryFields,
            displayFields,
            editableFields,
            internalFields: [...keyFields].filter((field) => !querySet.has(field) && !displaySet.has(field) && !editableSet.has(field)),
          },
          lookupPolicy: {
            requireUniqueMatch: true,
            disableSaveUntilQuery: true,
            unlockComponentIds: [...displayComponentIds, ...editableComponentIds, String(saveButton?.id || '')].filter(Boolean),
            autoQueryOnLoad: suppliedParameters.autoQueryOnLoad === true,
            queryMode: String(suppliedParameters.queryMode || 'exact'),
            queryLimit: Math.max(1, Math.min(20, Number(suppliedParameters.queryLimit || 2) || 2)),
            dirtyOnly: suppliedParameters.dirtyOnly === undefined ? true : !!suppliedParameters.dirtyOnly,
            refetchAfterSave: suppliedParameters.refetchAfterSave === undefined ? true : !!suppliedParameters.refetchAfterSave,
            conflictPolicy: String(suppliedParameters.conflictPolicy || 'error'),
            emptyResultMessage: String(suppliedParameters.emptyResultMessage || '未找到匹配记录'),
            multipleResultMessage: String(suppliedParameters.multipleResultMessage || '命中多条记录，请补充查询条件'),
          },
        };
      } else if (template.id === 'single-table-entry') {
        form.design.templateParameters = {
          ...form.design.templateParameters,
          entryPolicy: {
            keyStrategy: String(suppliedParameters.keyStrategy || 'upsert'),
            duplicatePolicy: String(suppliedParameters.duplicatePolicy || 'error'),
            submitMode: String(suppliedParameters.submitMode || 'create'),
            resultField: String(suppliedParameters.resultField || '_写回结果'),
            changeLogField: String(suppliedParameters.changeLogField || '_写回差异'),
            writeBackField: String(suppliedParameters.writeBackField || '_写回状态'),
            defaultValues: structuredClone(objectRecord(suppliedParameters.defaultValues)),
            computedExpressions: structuredClone(objectRecord(suppliedParameters.computedExpressions)),
            linkageDsl: stringList(suppliedParameters.linkageDsl),
          },
        };
      }
      applyGeneratedPresentation(form, template, suppliedParameters, `基于 ${table.fileName} / ${sheet.name} 生成`);
      const visibleFieldCount = (
        (effectiveFields.length ? normalizedFields.filter((field) => effectiveFields.includes(field.name) && !field.key).length : normalizedFields.filter((field) => !field.key).length)
        || effectiveFields.length
        || sheet.headers.length
        || 0
      );
      form.design.templateParameters = {
        ...form.design.templateParameters,
        ...suppliedParameters,
        fieldProjection: form.design.templateParameters?.fieldProjection || { visibleFields: effectiveFields.length ? effectiveFields : sheet.headers, internalFields: [] },
        layout: {
          columns: Number(suppliedParameters.columns || 0) || form.design.templateParameters?.layout?.columns || autoLayoutColumns(visibleFieldCount),
          includeReset: suppliedParameters.includeReset === undefined ? true : !!suppliedParameters.includeReset,
          mode: String(suppliedParameters.layoutMode || 'auto'),
          sectionMode: String(suppliedParameters.sectionMode || 'auto'),
          dense: !!suppliedParameters.denseLayout,
        },
      };
    }
    applyNormalizedFieldSemantics(form, normalizedFields);
    if (scaffold) {
      const scaffoldFlowId = template.id === 'single-table-entry' || template.id === 'single-table-lookup-edit'
        ? `${safe}_save_flow`
        : undefined;
      const projected = form.design.templateParameters?.fieldProjection || {};
      const extraRuleLines = template.id === 'single-table-entry'
        ? configuredLinkageDsl(suppliedParameters.linkageDsl).split('\n').map((line) => line.trim()).filter(Boolean)
        : [];
      form.ruleCode = buildTemplateRuleLines(template.id, normalizedFields, {
        visibleFields: effectiveFields.length ? effectiveFields : normalizedFields.map((field) => field.name),
        queryFields: stringList(projected.queryFields),
        editableFields: stringList(projected.editableFields),
        flowId: scaffoldFlowId,
        successMessage: String(suppliedParameters.successMessage || '保存成功'),
        extraLines: extraRuleLines,
      }).join('\n');
      if (template.id === 'single-table-entry' && extraRuleLines.length) {
        const applied = applyBehaviorDslToComponents(form.design.components || [], form.ruleCode, form.design.formWindow);
        form.design.components = applied.components;
        if (applied.formWindow) form.design.formWindow = applied.formWindow;
      }
    }
    form.generatedBy = generatedMetadata(template, instanceId, now); form.design.generatedBy = form.generatedBy;
    form.design.templateKey = template.id;
    form.design.templateParameters = template.id === 'single-table-batch-update'
      ? { ...(form.design.templateParameters || {}), ...suppliedParameters, batchEditor: { tableId: table.id, sheetName: sheet.name, maxChanges: Number(suppliedParameters.maxChanges || 100), crossPage: true, atomic: true, versionProtected: true } }
      : isAnalyticalTemplate
        ? { ...(form.design.templateParameters || {}), ...suppliedParameters, presentation: { kind: template.category === 'prediction' ? 'prediction-report' : 'analysis-report', previewKind: template.id, resultLabel: analyticalPresentation[template.id]?.resultLabel || '分析结果' } }
        : { ...(form.design.templateParameters || {}), ...suppliedParameters };
    artifacts.forms.push(form);
    const transactionTemplateIds = new Set(['parallel-cross-table-entry', 'master-detail-entry', 'multi-table-batch-update']);
    if (transactionTemplateIds.has(template.id)) {
      const relationId = String(suppliedParameters.relationId || selection.relationIds?.[0] || ''); const relation = (project.relations || []).find((item: DataRelation) => item.id === relationId) as DataRelation | undefined;
      const resolvedTransactionTables = resolveTables(project, selection);
      const tableOrder = stringList(suppliedParameters.tableOrder);
      const orderedTables = tableOrder.length
        ? [...resolvedTransactionTables].sort((left: JsonObject, right: JsonObject) => {
            const leftIndex = tableOrder.indexOf(String(left.id || ''));
            const rightIndex = tableOrder.indexOf(String(right.id || ''));
            return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
          })
        : resolvedTransactionTables;
      const transactionTables = template.id === 'master-detail-entry' && relation ? [relation.left.tableId, relation.right.tableId].map((id) => orderedTables.find((item: JsonObject) => item.id === id)).filter(Boolean) : orderedTables;
      const formWindow = form.design.formWindow;
      const tableTitles = objectRecord(suppliedParameters.tableTitles);
      const fieldsByTable = objectRecord(suppliedParameters.fieldsByTable);
      const editableFieldsByTable = objectRecord(suppliedParameters.editableFieldsByTable);
      const statusField = String(
        (template.id === 'multi-table-batch-update' ? suppliedParameters.statusField : undefined)
        || (template.id === 'parallel-cross-table-entry' ? suppliedParameters.statusField : undefined)
        || (template.id === 'master-detail-entry' ? suppliedParameters.statusField : undefined)
        || '_事务状态',
      );
      const diffField = String(
        (template.id === 'multi-table-batch-update' ? suppliedParameters.changeLogField : undefined)
        || (template.id === 'parallel-cross-table-entry' ? suppliedParameters.diffField : undefined)
        || (template.id === 'master-detail-entry' ? suppliedParameters.changeLogField : undefined)
        || '_变更差异',
      );
      const primaryTransactionTable = transactionTables[0];
      const primaryTransactionSheet = primaryTransactionTable?.sheets?.find((item: JsonObject) => relation && (item.name === relation.left.sheetName || item.name === relation.right.sheetName)) || primaryTransactionTable?.sheets?.[0];
      const masterFields = template.id === 'master-detail-entry'
        ? (stringList(suppliedParameters.masterFields).length ? stringList(suppliedParameters.masterFields) : (primaryTransactionSheet?.headers || []))
        : [];
      const detailFields = template.id === 'master-detail-entry' && relation
        ? (() => {
            const detailTable = transactionTables.find((item: JsonObject) => item.id === relation.right.tableId);
            const detailSheet = detailTable?.sheets?.find((item: JsonObject) => item.name === relation.right.sheetName) || detailTable?.sheets?.[0];
            return stringList(suppliedParameters.detailFields).length ? stringList(suppliedParameters.detailFields) : (detailSheet?.headers || []);
          })()
        : [];
      const detailEditableMode = String(suppliedParameters.detailEditableMode || 'editable');
      const duplicateDetailPolicy = String(suppliedParameters.duplicateDetailPolicy || 'error');
      const detailTitle = String(suppliedParameters.detailTitle || (relation ? `${relation.name} 明细` : '明细表'));
      const transactionResultField = String((template.id === 'master-detail-entry' ? suppliedParameters.resultField : undefined) || '_主从提交结果');
      if (template.id === 'parallel-cross-table-entry' && primaryTransactionTable && primaryTransactionSheet) {
        const primaryProjectedFields = stringList(fieldsByTable[String(primaryTransactionTable.id || '')]).length
          ? stringList(fieldsByTable[String(primaryTransactionTable.id || '')])
          : primaryTransactionSheet.headers;
        form.design.components = (form.design.components || []).filter((component: JsonObject) => {
          const fieldBinding = typeof component.fieldBinding === 'string' ? String(component.fieldBinding) : '';
          return !fieldBinding || fieldBinding.startsWith('_') || fieldBinding.includes('.');
        });
        for (const [fieldIndex, field] of primaryProjectedFields.entries()) {
          const column = primaryTransactionSheet.columns?.find((item: JsonObject) => item.name === field);
          const primaryLabelPrefix = template.id === 'parallel-cross-table-entry'
            ? String(tableTitles[String(primaryTransactionTable.id || '')] || primaryTransactionTable.fileName || primaryTransactionTable.id || '')
            : '';
          form.design.components.push({
            id: `${safe}_primary_field_${fieldIndex + 1}`,
            type: column?.dataType === 'number' ? 'number' : column?.dataType === 'date' ? 'datePicker' : 'input',
            x: 80 + (fieldIndex % 2) * 390,
            y: 140 + Math.floor(fieldIndex / 2) * 92,
            width: 340,
            height: 76,
            zIndex: 2,
            fieldBinding: `${primaryTransactionTable.id}.${field}`,
            props: {
              name: `${primaryTransactionTable.id}.${field}`,
              label: primaryLabelPrefix ? `${primaryLabelPrefix} · ${field}` : field,
              required: (primaryTransactionSheet.config?.keyFields || []).includes(field),
              generatedRole: 'editable',
            },
          });
        }
      }
      if (primaryTransactionTable && primaryTransactionSheet && ['parallel-cross-table-entry', 'master-detail-entry'].includes(template.id)) {
        qualifyFormFieldBindings(
          form,
          String(primaryTransactionTable.id || ''),
          primaryTransactionSheet.headers || [],
          template.id === 'parallel-cross-table-entry'
            ? String(tableTitles[String(primaryTransactionTable.id || '')] || primaryTransactionTable.fileName || primaryTransactionTable.id || '')
            : undefined,
        );
      }
      if (template.id === 'master-detail-entry' && primaryTransactionTable && primaryTransactionSheet) {
        const masterFieldSet = new Set(masterFields.map(String));
        form.design.components = (form.design.components || []).filter((component: JsonObject) => {
          const fieldBinding = typeof component.fieldBinding === 'string' ? String(component.fieldBinding) : '';
          return !fieldBinding
            || fieldBinding.startsWith('_')
            || !fieldBinding.startsWith(`${primaryTransactionTable.id}.`)
            || masterFieldSet.has(fieldBinding.replace(`${primaryTransactionTable.id}.`, ''));
        });
        for (const [fieldIndex, field] of masterFields.entries()) {
          const component = form.design.components.find((item: JsonObject) => item.fieldBinding === `${primaryTransactionTable.id}.${field}`);
          if (!component) continue;
          component.x = 80 + (fieldIndex % 2) * 390;
          component.y = 140 + Math.floor(fieldIndex / 2) * 92;
          component.width = 340;
          component.height = 76;
          component.props = {
            ...(component.props || {}),
            generatedRole: 'master-editable',
          };
        }
      }
      const targets = transactionTables.map((targetTable: JsonObject, index: number) => {
        const targetSheet = targetTable.sheets.find((item: JsonObject) => relation && (item.name === relation.left.sheetName || item.name === relation.right.sheetName)) || targetTable.sheets[0];
        const keyField = String(targetSheet.config?.keyFields?.[0] || targetSheet.headers[0]);
        if (template.id === 'master-detail-entry' && relation && targetTable.id === relation.right.tableId) {
          const mappedDetailFields = [...new Set([keyField, ...detailFields].filter(Boolean))];
          return { id: `detail_${index + 1}`, tableId: targetTable.id, sheetName: targetSheet.name, keyField, mode: 'insert', sourceField: '_明细', duplicatePolicy: duplicateDetailPolicy, fieldMap: Object.fromEntries(mappedDetailFields.map((field: string) => [field, field])), foreignKey: { field: relation.right.fields[0], fromTarget: 'master_1', fromField: relation.left.fields[0] } };
        }
        if (template.id === 'join-query-update') return { id: `joined_${index + 1}`, tableId: targetTable.id, sheetName: targetSheet.name, keyField, mode: 'update', sourceField: '_联合查询结果', fieldMap: Object.fromEntries(targetSheet.headers.map((field: string) => [field, `${targetTable.id}.${field}`])) };
        if (template.id === 'multi-table-batch-update') {
          const projectedFields = stringList(fieldsByTable[String(targetTable.id || '')]);
          const visibleFields = projectedFields.length ? projectedFields : targetSheet.headers;
          const mappedFields = [...new Set([keyField, ...visibleFields].filter(Boolean))];
          return { id: `batch_${index + 1}`, tableId: targetTable.id, sheetName: targetSheet.name, keyField, mode: 'upsert', sourceField: `_批量变更_${targetTable.id}`, fieldMap: Object.fromEntries(mappedFields.map((field: string) => [field, field])) };
        }
        const projectedFields = template.id === 'parallel-cross-table-entry'
          ? (stringList(fieldsByTable[String(targetTable.id || '')]).length ? stringList(fieldsByTable[String(targetTable.id || '')]) : targetSheet.headers)
          : targetSheet.headers;
        return {
          id: index === 0 ? 'master_1' : `parallel_${index + 1}`,
          tableId: targetTable.id,
          sheetName: targetSheet.name,
          keyField,
          mode: suppliedParameters.existingPolicy === 'error' ? 'insert' : 'upsert',
          existingPolicy: String(suppliedParameters.existingPolicy || 'error'),
          fieldMap: Object.fromEntries(projectedFields.map((field: string) => [field, `${targetTable.id}.${field}`])),
        };
      });
      const baseY = Number(formWindow?.height || 500); const flowId = `${safe}_transaction_flow`; const statusId = `${safe}_transaction_status`; const diffId = `${safe}_transaction_diff`; const buttonId = `${safe}_transaction_commit`;
      let editorBottom = baseY;
      if (template.id === 'parallel-cross-table-entry') {
        for (const [tableIndex, targetTable] of transactionTables.slice(1).entries()) {
          const targetSheet = targetTable.sheets[0];
          const projectedFields = stringList(fieldsByTable[String(targetTable.id || '')]).length ? stringList(fieldsByTable[String(targetTable.id || '')]) : targetSheet.headers;
          const sectionY = baseY + tableIndex * Math.max(180, projectedFields.length * 48 + (String(suppliedParameters.sectionMode || 'by-table') === 'by-table' ? 48 : 0));
          if (String(suppliedParameters.sectionMode || 'by-table') !== 'compact') {
            form.design.components.push({ id: `${safe}_${targetTable.id}_section`, type: 'text', x: 80, y: sectionY - 32, width: 720, height: 24, zIndex: 1, props: { name: `${targetTable.id}_section`, content: String(tableTitles[String(targetTable.id || '')] || targetTable.fileName || targetTable.id), fontSize: 14, fontWeight: 650, color: '#334155' } });
          }
          for (const [fieldIndex, field] of projectedFields.entries()) {
            const column = targetSheet.columns?.find((item: JsonObject) => item.name === field);
            const componentId = `${safe}_${targetTable.id}_field_${fieldIndex + 1}`;
            form.design.components.push({ id: componentId, type: column?.dataType === 'number' ? 'number' : column?.dataType === 'date' ? 'datePicker' : 'input', x: 80 + (fieldIndex % 2) * 390, y: sectionY + Math.floor(fieldIndex / 2) * 92, width: 340, height: 76, zIndex: 2, fieldBinding: `${targetTable.id}.${field}`, props: { name: `${targetTable.id}.${field}`, label: `${String(tableTitles[String(targetTable.id || '')] || targetTable.fileName || targetTable.id)} · ${field}`, required: (targetSheet.config?.keyFields || []).includes(field), generatedRole: 'editable' } });
          }
          editorBottom = Math.max(editorBottom, sectionY + Math.ceil(projectedFields.length / 2) * 92);
        }
      }
      if (template.id === 'master-detail-entry' || template.id === 'multi-table-batch-update') {
        const gridTables = template.id === 'master-detail-entry' ? transactionTables.slice(1) : transactionTables;
        for (const [gridIndex, targetTable] of gridTables.entries()) {
          const targetSheet = targetTable.sheets[0]; const componentId = `${safe}_${targetTable.id}_grid`;
          const fieldBinding = template.id === 'master-detail-entry' ? '_明细' : `_批量变更_${targetTable.id}`;
          const data = template.id === 'multi-table-batch-update' ? fullSourceRows(project, targetTable, targetSheet).slice(0, 10) : [];
          const projectedFields = template.id === 'multi-table-batch-update'
            ? (stringList(fieldsByTable[String(targetTable.id || '')]).length ? stringList(fieldsByTable[String(targetTable.id || '')]) : targetSheet.headers)
            : detailFields;
          const perTableEditable = stringList(editableFieldsByTable[String(targetTable.id || '')]);
          const columns = template.id === 'multi-table-batch-update'
            ? editableTableColumnsWithProjection(targetSheet, projectedFields, String(targetSheet.config?.keyFields?.[0] || ''), perTableEditable)
            : editableTableColumnsWithProjection(targetSheet, projectedFields, String(targetSheet.config?.keyFields?.[0] || ''), detailEditableMode === 'readonly' ? [] : projectedFields.filter((field: string) => field !== String(targetSheet.config?.keyFields?.[0] || '')));
          const batch = template.id === 'multi-table-batch-update';
          const gridData = batch
            ? data.map((row: JsonObject) => Object.fromEntries([...new Set([String(targetSheet.config?.keyFields?.[0] || ''), ...projectedFields].filter(Boolean))].map((field) => [field, row[field]])))
            : data;
          form.design.components.push({ id: componentId, type: 'table', x: 80, y: baseY + gridIndex * 280, width: 740, height: 240, zIndex: 2, fieldBinding, props: { name: fieldBinding, label: template.id === 'master-detail-entry' ? detailTitle : (targetTable.fileName || targetTable.id), columns, data: gridData, dataSource: { tableId: targetTable.id, sheetName: targetSheet.name }, sourceTableId: targetTable.id, sourceQualifiedColumns: projectedFields.map((field: string) => `${targetTable.id}.${field}`), editable: template.id === 'master-detail-entry' ? detailEditableMode !== 'readonly' : true, addable: template.id === 'master-detail-entry' ? detailEditableMode !== 'readonly' : !batch, removable: template.id === 'master-detail-entry' ? detailEditableMode !== 'readonly' : !batch, rowKey: String(targetSheet.config?.keyFields?.[0] || ''), changeTracking: batch ? 'dirtyRows' : 'fullRows', showOnlyDirty: batch ? suppliedParameters.showOnlyDirty !== false : undefined, rows: template.id === 'master-detail-entry' ? configuredDetailRows(suppliedParameters, 8) : 5, showGrid: true } });
          editorBottom = Math.max(editorBottom, baseY + gridIndex * 280 + 240);
        }
      }
      const actionY = editorBottom + 28;
      if (formWindow) formWindow.height = actionY + (template.id === 'master-detail-entry' ? 390 : 230);
      const crossTableSources = transactionTables.map((targetTable: JsonObject) => {
        const targetSheet = targetTable.sheets.find((item: JsonObject) => relation && (item.name === relation.left.sheetName || item.name === relation.right.sheetName)) || targetTable.sheets[0];
        return {
          tableId: targetTable.id,
          sheetName: targetSheet.name,
          keyField: String(targetSheet.config?.keyFields?.[0] || targetSheet.headers[0] || ''),
          fields: targetSheet.headers.map((field: string) => `${targetTable.id}.${field}`),
        };
      });
      const multiBatchSets = template.id === 'multi-table-batch-update'
        ? transactionTables.map((targetTable: JsonObject) => {
            const targetSheet = targetTable.sheets.find((item: JsonObject) => relation && (item.name === relation.left.sheetName || item.name === relation.right.sheetName)) || targetTable.sheets[0];
            const projectedFields = stringList(fieldsByTable[String(targetTable.id || '')]).length ? stringList(fieldsByTable[String(targetTable.id || '')]) : targetSheet.headers;
            const perTableEditable = stringList(editableFieldsByTable[String(targetTable.id || '')]);
            return {
              tableId: targetTable.id,
              sheetName: targetSheet.name,
              keyField: String(targetSheet.config?.keyFields?.[0] || targetSheet.headers[0] || ''),
              sourceField: `_批量变更_${targetTable.id}`,
              qualifiedColumns: projectedFields.map((field: string) => `${targetTable.id}.${field}`),
              editableColumns: perTableEditable.length ? perTableEditable.map((field: string) => `${targetTable.id}.${field}`) : projectedFields.filter((field: string) => field !== String(targetSheet.config?.keyFields?.[0] || '')).map((field: string) => `${targetTable.id}.${field}`),
            };
          })
        : [];
      const multiBatchDirtyStats = template.id === 'multi-table-batch-update'
        ? multiBatchSets.map((item: any) => ({
            tableId: item.tableId,
            sourceField: item.sourceField,
            previewRowCount: Math.min(configuredPreviewRows(suppliedParameters, 10), Number((transactionTables.find((table: JsonObject) => table.id === item.tableId)?.sheets?.[0]?.rowCount) || 0)),
            initialDirtyRows: 0,
            editableColumnCount: Array.isArray(item.editableColumns) ? item.editableColumns.length : 0,
            qualifiedColumns: item.qualifiedColumns,
          }))
        : [];
      form.design.components.push(
        { id: statusId, type: 'text', x: 80, y: actionY, width: 740, height: 28, zIndex: 3, fieldBinding: statusField, props: { name: statusField, content: '尚未提交；运行前会检查全部目标和主键冲突。', color: '#475569' } },
        ...(template.id === 'parallel-cross-table-entry' && suppliedParameters.showDiffPreview === false ? [] : [{ id: diffId, type: 'table', x: 80, y: actionY + 40, width: 540, height: 150, zIndex: 3, fieldBinding: diffField, props: { name: diffField, columns: ['target', 'mode', 'key', 'fields'], rows: Math.min(configuredDetailRows(suppliedParameters, 4), 6), striped: true, showGrid: true } }]),
        ...(template.id === 'master-detail-entry' ? [{ id: `${safe}_transaction_result`, type: 'table', x: 80, y: actionY + 210, width: 540, height: 150, zIndex: 3, fieldBinding: transactionResultField, props: { name: transactionResultField, label: '主从提交结果', columns: ['target', 'mode', 'key', 'fields'], rows: Math.min(configuredDetailRows(suppliedParameters, 4), 6), striped: true, showGrid: true } } as JsonObject] : []),
        { id: buttonId, type: 'button', x: 650, y: actionY + 40, width: 170, height: 48, zIndex: 4, props: { name: '预检并原子提交', label: String(suppliedParameters.submitLabel || '预检并原子提交'), variant: 'primary', ...(template.id === 'multi-table-batch-update' ? { disabledExpression: `((${transactionTables.map((targetTable: JsonObject) => `len($_批量变更_${targetTable.id})`).join(' + ')}) == 0) || ((${transactionTables.map((targetTable: JsonObject) => `len($_批量变更_${targetTable.id})`).join(' + ')}) > ${Number(suppliedParameters.maxChanges || 200)})` } : {}), ...(template.id === 'master-detail-entry' && suppliedParameters.allowEmptyDetails === false ? { disabledExpression: 'len($_明细) == 0' } : {}), flowTriggers: { onClick: { enabled: true, workflowId: flowId, parameterMap: { 'transaction_import.formData': '$values' } } } } },
      );
      if (template.id === 'master-detail-entry') {
        const masterKeyField = String(primaryTransactionSheet?.config?.keyFields?.[0] || primaryTransactionSheet?.headers?.[0] || '');
        const detailInternalFields = relation?.right.fields?.filter((field: string) => !detailFields.includes(field)).map((field: string) => `${relation.right.tableId}.${field}`) || [];
        const masterInternalFields = masterKeyField && !masterFields.includes(masterKeyField) ? [`${primaryTransactionTable.id}.${masterKeyField}`] : [];
        form.design.templateParameters = {
          ...form.design.templateParameters,
          fieldProjection: {
            visibleFields: [
              ...masterFields.map((field: string) => `${primaryTransactionTable.id}.${field}`),
              ...detailFields.map((field: string) => `${relation?.right.tableId}.${field}`),
            ],
            internalFields: [...masterInternalFields, ...detailInternalFields],
          },
          crossTableSources,
          detailPolicy: {
            allowEmptyDetails: suppliedParameters.allowEmptyDetails === undefined ? false : !!suppliedParameters.allowEmptyDetails,
            relationId: relationId || undefined,
            detailTitle,
            detailRows: configuredDetailRows(suppliedParameters, 8),
            detailEditableMode,
            duplicateDetailPolicy,
            masterFields: masterFields.map((field: string) => `${primaryTransactionTable.id}.${field}`),
            detailFields: detailFields.map((field: string) => `${relation?.right.tableId}.${field}`),
          },
          transactionPolicy: {
            atomic: true,
            resultField: transactionResultField,
            statusField,
            diffField,
            successMessage: String(suppliedParameters.successMessage || '已准备主从变更，提交过程保持原子性'),
            targets: targets.map((target: any) => ({ tableId: target.tableId, sheetName: target.sheetName, keyField: target.keyField, mode: target.mode, duplicatePolicy: target.duplicatePolicy, sourceField: target.sourceField })),
          },
          resultField: transactionResultField,
        };
        const detailGrid = form.design.components.find((component: JsonObject) => component.fieldBinding === '_明细');
        if (detailGrid) detailGrid.props = {
          ...(detailGrid.props || {}),
          emptyStateText: suppliedParameters.allowEmptyDetails === false ? '至少新增一条明细后才能提交' : '可以留空明细后提交',
        };
      }
      if (template.id === 'parallel-cross-table-entry' || template.id === 'multi-table-batch-update') {
        const multiBatchVisibleFields = template.id === 'multi-table-batch-update'
          ? multiBatchSets.flatMap((item: any) => item.qualifiedColumns || [])
          : template.id === 'parallel-cross-table-entry'
            ? transactionTables.flatMap((targetTable: JsonObject) => {
                const targetSheet = targetTable.sheets.find((item: JsonObject) => relation && (item.name === relation.left.sheetName || item.name === relation.right.sheetName)) || targetTable.sheets[0];
                const projectedFields = stringList(fieldsByTable[String(targetTable.id || '')]).length ? stringList(fieldsByTable[String(targetTable.id || '')]) : targetSheet.headers;
                return projectedFields.map((field: string) => `${targetTable.id}.${field}`);
              })
            : crossTableSources.flatMap((item: any) => item.fields || []);
        const multiBatchInternalFields = template.id === 'multi-table-batch-update'
          ? transactionTables.flatMap((targetTable: JsonObject) => {
              const targetSheet = targetTable.sheets.find((item: JsonObject) => relation && (item.name === relation.left.sheetName || item.name === relation.right.sheetName)) || targetTable.sheets[0];
              const keyField = String(targetSheet.config?.keyFields?.[0] || '');
              const projectedFields = stringList(fieldsByTable[String(targetTable.id || '')]).length ? stringList(fieldsByTable[String(targetTable.id || '')]) : targetSheet.headers;
              return keyField && !projectedFields.includes(keyField) ? [`${targetTable.id}.${keyField}`] : [];
            })
          : [];
        form.design.templateParameters = {
          ...form.design.templateParameters,
          crossTableSources,
          fieldProjection: {
            visibleFields: multiBatchVisibleFields,
            internalFields: multiBatchInternalFields,
          },
          transactionPolicy: template.id === 'parallel-cross-table-entry'
            ? {
                atomic: true,
                existingPolicy: String(suppliedParameters.existingPolicy || 'error'),
                sectionMode: String(suppliedParameters.sectionMode || 'by-table'),
                statusField,
                diffField,
                showDiffPreview: suppliedParameters.showDiffPreview !== false,
                targets: targets.map((target: any) => ({ tableId: target.tableId, sheetName: target.sheetName, keyField: target.keyField, mode: target.mode, existingPolicy: target.existingPolicy })),
              }
            : {
                atomic: true,
                maxChanges: Number(suppliedParameters.maxChanges || 200),
                showOnlyDirty: suppliedParameters.showOnlyDirty !== false,
                statusField,
                diffField,
                targets: targets.map((target: any) => ({ tableId: target.tableId, sheetName: target.sheetName, keyField: target.keyField, mode: target.mode })),
                batchSets: multiBatchSets,
                dirtyStats: multiBatchDirtyStats,
              },
        };
      }
      artifacts.workflows.push({ id: flowId, name: `${template.name}原子写回`, description: '先生成逐表差异并完成冲突预检；只有全部目标有效时才返回一个原子写回组。', nodes: [
        { id: 'transaction_import', type: 'formflow', specId: 'workflow:import', position: { x: 80, y: 120 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'formData', type: 'object', label: '复合表单数据' }] }), connectedPortsJson: '[]' } },
        { id: 'transaction_write', type: 'formflow', specId: 'data:transaction-write', position: { x: 390, y: 120 }, data: { propertiesJson: JSON.stringify({ targets: template.id === 'multi-table-batch-update' ? targets.map((target: any) => {
          const batchSet = multiBatchSets.find((item: any) => item.tableId === target.tableId);
          return {
            ...target,
            conflictCheckFields: (batchSet?.editableColumns || []).map((field: string) => String(field).replace(`${target.tableId}.`, '')).filter((field: string) => field !== target.keyField),
          };
        }) : targets, resultField: template.id === 'master-detail-entry' ? transactionResultField : undefined, statusField, diffField, maxChanges: suppliedParameters.maxChanges || 1000, successMessage: template.id === 'multi-table-batch-update' ? String(suppliedParameters.successMessage || '已准备跨表批量变更，提交过程保持原子性') : template.id === 'parallel-cross-table-entry' ? String(suppliedParameters.successMessage || '已准备跨表变更，提交过程保持原子性') : template.id === 'master-detail-entry' ? String(suppliedParameters.successMessage || '已准备主从变更，提交过程保持原子性') : undefined, failureMessage: template.id === 'parallel-cross-table-entry' ? String(suppliedParameters.failureMessage || '事务未提交：发现冲突，请先修正后再试') : undefined, clearSourceFieldsOnSuccess: template.id === 'multi-table-batch-update' }), connectedPortsJson: '[]' } },
      ], edges: [{ id: 'transaction_form_data', source: 'transaction_import', target: 'transaction_write', sourceHandle: 'out:formData', targetHandle: 'in:formData' }], createdAt: now, updatedAt: now, generatedBy: generatedMetadata(template, instanceId, now) });
    }
    if (template.id === 'single-table-batch-update') {
      const keyField = String(sheet.config?.keyFields?.[0] || '');
      const visibleFields = effectiveFields.length ? effectiveFields as string[] : sheet.headers as string[];
      const sourceFields = [...new Set([keyField, ...visibleFields].filter(Boolean))];
      const sourceRows = fullSourceRows(project, table, sheet).slice(0, 20).map((row) => Object.fromEntries(sourceFields.map((field) => [field, row[field]])));
      const columns = editableTableColumns(sheet, visibleFields, keyField);
      const flowId = `${safe}_batch_flow`;
      form.design.templateParameters = {
        ...form.design.templateParameters,
        changeLogField: String(suppliedParameters.changeLogField || '_变更差异'),
        writeBackField: String(suppliedParameters.writeBackField || '_批量状态'),
        fieldProjection: {
          visibleFields,
          internalFields: keyField && !visibleFields.includes(keyField) ? [keyField] : [],
        },
        preview: {
          previewRows: configuredPreviewRows(suppliedParameters, 10),
          detailRows: configuredDetailRows(suppliedParameters, 4),
        },
      };
      form.design.formWindow = { ...form.design.formWindow, width: 920, height: 690, props: { ...(form.design.formWindow?.props || {}), title: template.name, showFooter: false } };
      form.design.components = [
        { id: `${safe}_title`, type: 'text', x: 60, y: 48, width: 800, height: 42, zIndex: 2, props: { content: String(suppliedParameters.title || template.name), fontSize: 24, fontWeight: '700', color: '#1c1c1e' } },
        { id: `${safe}_instructions`, type: 'text', x: 60, y: 94, width: 800, height: 48, zIndex: 2, props: { content: String(suppliedParameters.subtitle || `已按选中的 ${visibleFields.length} 个字段生成。可编辑当前页数据，最多提交 ${Number(suppliedParameters.maxChanges || 100)} 项变更；主键仅在后台用于定位记录。`), fontSize: 13, color: '#475569' } },
        { id: `${safe}_batch_grid`, type: 'table', x: 60, y: 164, width: 800, height: 330, zIndex: 2, fieldBinding: '_批量变更', props: { name: '_批量变更', label: `${table.fileName || table.id} / ${sheet.name}`, columns, data: sourceRows.slice(0, configuredPreviewRows(suppliedParameters, 10)), dataSource: { tableId: table.id, sheetName: sheet.name }, editable: true, addable: false, removable: false, rowKey: keyField, changeTracking: 'dirtyRows', rows: configuredPreviewRows(suppliedParameters, 10), striped: true, showGrid: true } },
        { id: `${safe}_batch_status`, type: 'text', x: 60, y: 516, width: 540, height: 42, zIndex: 2, fieldBinding: '_批量状态', props: { name: '_批量状态', content: '暂无需要提交的修改。所有变更会在同一原子操作中写入。', fontSize: 12, color: '#475569' } },
        { id: `${safe}_batch_diff`, type: 'table', x: 60, y: 564, width: 570, height: 90, zIndex: 2, fieldBinding: '_变更差异', props: { name: '_变更差异', columns: ['target', 'mode', 'key', 'fields'], rows: Math.min(configuredDetailRows(suppliedParameters, 4), 6), striped: true, showGrid: true } },
        { id: `${safe}_batch_commit`, type: 'button', x: 660, y: 570, width: 200, height: 52, zIndex: 3, props: { name: '预检并提交变更', label: String(suppliedParameters.submitLabel || '预检并提交变更'), variant: 'primary', disabledExpression: `(len($_批量变更) == 0) || (len($_批量变更) > ${Number(suppliedParameters.maxChanges || 100)})`, flowTriggers: { onClick: { enabled: true, workflowId: flowId, parameterMap: {} } } } },
      ];
      applyGeneratedPresentation(form, template, suppliedParameters, template.description);
      artifacts.workflows.push({ id: flowId, name: `${template.name}原子写回`, description: '根据稳定主键生成差异并原子提交当前批次。', nodes: [
        { id: 'batch_import', type: 'formflow', specId: 'workflow:import', position: { x: 80, y: 120 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'formData', type: 'object', label: '批量变更' }] }), connectedPortsJson: '[]' } },
        { id: 'batch_write', type: 'formflow', specId: 'data:transaction-write', position: { x: 390, y: 120 }, data: { propertiesJson: JSON.stringify({ targets: [{ id: 'batch_1', tableId: table.id, sheetName: sheet.name, keyField, mode: 'update', sourceField: '_批量变更', fieldMap: Object.fromEntries(sourceFields.map((field) => [field, field])) }], statusField: '_批量状态', diffField: '_变更差异', maxChanges: Number(suppliedParameters.maxChanges || 100), clearSourceFieldsOnSuccess: true }), connectedPortsJson: '[]' } },
      ], edges: [{ id: 'batch_form_data', source: 'batch_import', target: 'batch_write', sourceHandle: 'out:formData', targetHandle: 'in:formData' }], createdAt: now, updatedAt: now, generatedBy: generatedMetadata(template, instanceId, now) });
    }
    if (template.id === 'join-query-update') {
      const relationId = String(suppliedParameters.relationId || selection.relationIds?.[0] || '');
      const relation = (project.relations || []).find((item: DataRelation) => item.id === relationId) as DataRelation;
      const leftTable = (project.srcTable || []).find((item: JsonObject) => item.id === relation.left.tableId);
      const rightTable = (project.srcTable || []).find((item: JsonObject) => item.id === relation.right.tableId);
      const leftSheet = leftTable?.sheets?.find((item: JsonObject) => item.name === relation.left.sheetName);
      const rightSheet = rightTable?.sheets?.find((item: JsonObject) => item.name === relation.right.sheetName);
      const joinType = String(suppliedParameters.joinType || relation.defaultJoinType || 'left');
      const queryLimit = Math.max(1, Math.min(20, Number(suppliedParameters.queryLimit || 2) || 2));
      const resultField = String(suppliedParameters.resultField || '_联合查询结果');
      const statusField = String(suppliedParameters.statusField || suppliedParameters.messageField || '_联合查询状态');
      const changeLogField = String(suppliedParameters.changeLogField || '_变更差异');
      const writeBackField = String(suppliedParameters.writeBackField || '_更新状态');
      const ambiguousResultMessage = String(suppliedParameters.ambiguousResultMessage || suppliedParameters.multipleResultMessage || '命中多条记录，请继续收窄查询条件');
      const refs = crossTableFieldCatalog(project, selection, relation);
      const resolveOrFallback = (name: string, fallback: string[]) => {
        const requested = stringList(suppliedParameters[name]);
        const resolved = resolveCrossTableFieldReferences(refs, requested.length ? requested : fallback).resolved;
        return uniqueStrings(resolved.map((field) => field.tableQualifiedName));
      };
      const queryFields = resolveOrFallback('queryFields', [`${leftTable.id}.${relation.left.fields[0]}`]);
      const editableFieldsLeft = resolveOrFallback('editableFieldsLeft', (leftSheet?.headers || []).filter((field: string) => ![...(leftSheet?.config?.keyFields || []), ...relation.left.fields].includes(field)).map((field: string) => `${leftTable.id}.${field}`));
      const editableFieldsRight = resolveOrFallback('editableFieldsRight', (rightSheet?.headers || []).filter((field: string) => ![...(rightSheet?.config?.keyFields || []), ...relation.right.fields].includes(field)).map((field: string) => `${rightTable.id}.${field}`));
      const displayFallback = uniqueStrings([...(selection.fields || []).map((field: string) => `${leftTable.id}.${field}`), ...editableFieldsLeft, ...editableFieldsRight]);
      const displayFields = resolveOrFallback('displayFields', displayFallback.length ? displayFallback : refs.slice(0, 8).map((field) => field.tableQualifiedName));
      const visibleFields = uniqueStrings([...displayFields, ...editableFieldsLeft, ...editableFieldsRight]);
      const hiddenRequiredFields = uniqueStrings([
        `${leftTable.id}.${relation.left.fields[0]}`,
        `${rightTable.id}.${relation.right.fields[0]}`,
        ...(leftSheet?.config?.keyFields || []).map((field: string) => `${leftTable.id}.${field}`),
        ...(rightSheet?.config?.keyFields || []).map((field: string) => `${rightTable.id}.${field}`),
      ]);
      const internalFields = hiddenRequiredFields.filter((field) => !visibleFields.includes(field));
      const editableSet = new Set([...editableFieldsLeft, ...editableFieldsRight]);
      const protectedFields = new Set([
        ...hiddenRequiredFields,
        ...relation.left.fields.map((field: string) => `${leftTable.id}.${field}`),
        ...relation.right.fields.map((field: string) => `${rightTable.id}.${field}`),
      ]);
      const previewRows = queryRelationRows(project, { relationId, joinType, exportAll: true }).rows
        .slice(0, configuredPreviewRows(suppliedParameters, 5))
        .map((row: JsonObject) => Object.fromEntries([...visibleFields, ...internalFields].map((field) => [field, row[field]])));
      const fieldByQualified = new Map(refs.map((field) => [field.tableQualifiedName, field]));
      const inputType = (type: string) => type === 'number' || type === 'integer' || type === 'decimal' || type === 'currency' || type === 'percentage'
        ? 'number'
        : ['date', 'datetime', 'time'].includes(type)
          ? 'datePicker'
          : type === 'boolean'
            ? 'switch'
            : 'input';
      const queryComponents = queryFields.map((qualified, index) => {
        const field = fieldByQualified.get(qualified);
        const normalized = field?.normalized;
        return {
          id: `${safe}_join_query_${index + 1}`,
          type: inputType(String(normalized?.type || 'string')),
          x: 72 + (index % 2) * 360,
          y: 138 + Math.floor(index / 2) * 92,
          width: 320,
          height: 72,
          zIndex: 2,
          fieldBinding: qualified,
          props: {
            name: qualified,
            label: `查询 · ${qualified}`,
            generatedRole: 'query',
            required: index === 0,
          },
        };
      });
      const queryBottom = 138 + Math.ceil(Math.max(1, queryComponents.length) / 2) * 92;
      const resultColumns = visibleFields.map((qualified) => {
        const ref = fieldByQualified.get(qualified);
        const column = ref?.normalized;
        const type = String(column?.type || 'string');
        return {
          title: qualified,
          dataIndex: qualified,
          type: type === 'string' || type === 'unknown' ? 'text' : type,
          editor: type === 'number' || type === 'integer' || type === 'decimal' || type === 'currency' || type === 'percentage' ? 'number' : ['date', 'datetime', 'time'].includes(type) ? 'date' : type === 'boolean' ? 'boolean' : 'text',
          editable: editableSet.has(qualified) && !protectedFields.has(qualified),
          required: column?.required === true,
        };
      });
      const flowId = `${safe}_join_flow`;
      const saveFlowId = `${safe}_join_save_flow`;
      const formWindow = form.design.formWindow;
      if (formWindow) formWindow.height = queryBottom + 560;
      form.design.components = [
        { id: `${safe}_join_query_section`, type: 'text', x: 72, y: 102, width: 760, height: 24, zIndex: 1, props: { name: `${safe}_join_query_section`, content: '查询条件', fontSize: 14, fontWeight: 650, color: '#334155' } },
        ...queryComponents,
        { id: `${safe}_join_status`, type: 'text', x: 72, y: queryBottom + 8, width: 760, height: 28, zIndex: 2, fieldBinding: statusField, props: { name: statusField, content: '请输入查询条件后加载联合结果；仅允许在唯一命中时提交分表更新。', color: '#475569' } },
        { id: `${safe}_join_run`, type: 'button', x: 72, y: queryBottom + 48, width: 180, height: 48, zIndex: 3, props: { name: '加载联合数据', label: String(suppliedParameters.lookupLabel || '加载联合数据'), variant: 'primary', flowTriggers: { onClick: { enabled: true, workflowId: flowId, parameterMap: { 'join_import.criteria': Object.fromEntries(queryFields.map((field) => [field, `$form.${field}`])) } } } } },
        { id: `${safe}_join_results`, type: 'table', x: 72, y: queryBottom + 116, width: 760, height: 240, zIndex: 2, fieldBinding: resultField, props: { name: resultField, label: '联合结果（仅允许编辑来源可写字段）', columns: resultColumns, data: previewRows.slice(0, configuredPreviewRows(suppliedParameters, 5)), editable: true, addable: false, removable: false, rowKey: `${leftTable.id}.${relation.left.fields[0]}`, rows: configuredPreviewRows(suppliedParameters, 5), striped: true, showGrid: true, sourceQualifiedColumns: visibleFields, emptyStateText: String(suppliedParameters.emptyResultMessage || '未找到匹配记录') } },
        { id: `${safe}_join_diff`, type: 'table', x: 72, y: queryBottom + 376, width: 560, height: 120, zIndex: 2, fieldBinding: changeLogField, props: { name: changeLogField, columns: ['target', 'mode', 'key', 'fields'], rows: configuredDetailRows(suppliedParameters, 4), striped: true, showGrid: true } },
        { id: `${safe}_join_save`, type: 'button', x: 652, y: queryBottom + 404, width: 180, height: 52, zIndex: 3, props: { name: '原子提交更新', label: String(suppliedParameters.submitLabel || '原子提交更新'), variant: 'primary', disabledExpression: `len($${resultField}) != 1`, flowTriggers: { onClick: { enabled: true, workflowId: saveFlowId, parameterMap: { 'transaction_import.formData': '$values' } } } } },
      ];
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        resultField,
        statusField,
        messageField: statusField,
        changeLogField,
        writeBackField,
        preview: {
          previewRows: configuredPreviewRows(suppliedParameters, 5),
          detailRows: configuredDetailRows(suppliedParameters, 4),
        },
        fieldProjection: {
          visibleFields,
          internalFields,
          queryFields,
          editableFields: [...editableFieldsLeft, ...editableFieldsRight],
        },
        crossTableSources: [
          { tableId: leftTable.id, sheetName: leftSheet.name, keyField: relation.left.fields[0], fields: leftSheet.headers.map((field: string) => `${leftTable.id}.${field}`) },
          { tableId: rightTable.id, sheetName: rightSheet.name, keyField: relation.right.fields[0], fields: rightSheet.headers.map((field: string) => `${rightTable.id}.${field}`) },
        ],
        joinPolicy: {
          relationId,
          joinType,
          queryLimit,
          autoQueryOnLoad: suppliedParameters.autoQueryOnLoad === true,
          atomic: true,
          conflictPolicy: String(suppliedParameters.conflictPolicy || 'error'),
          statusField,
          resultField,
          changeLogField,
          writeBackField,
          emptyResultMessage: String(suppliedParameters.emptyResultMessage || '未找到匹配记录'),
          ambiguousResultMessage,
          displayFields,
          editableFieldsLeft,
          editableFieldsRight,
          protectedFields: [...protectedFields],
          readonlyFields: visibleFields.filter((field) => !editableSet.has(field) || protectedFields.has(field)),
          targets: [
            { tableId: leftTable.id, sheetName: leftSheet.name, keyField: relation.left.fields[0], conflictCheckFields: leftSheet.headers.filter((field: string) => editableFieldsLeft.includes(`${leftTable.id}.${field}`)) },
            { tableId: rightTable.id, sheetName: rightSheet.name, keyField: relation.right.fields[0], conflictCheckFields: rightSheet.headers.filter((field: string) => editableFieldsRight.includes(`${rightTable.id}.${field}`)) },
          ],
        },
      };
      applyGeneratedPresentation(form, template, suppliedParameters, template.description);
      artifacts.workflows.push(
        {
          id: flowId,
          name: `${template.name}联合查询`,
          description: `按正式关系 ${relation.name} 加载两张表并按配置过滤联合结果。`,
          nodes: [
            { id: 'join_import', type: 'formflow', specId: 'workflow:import', position: { x: 60, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'criteria', type: 'object', label: '查询条件' }] }), connectedPortsJson: '[]' } },
            { id: 'left_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 240, y: 60 }, data: { propertiesJson: JSON.stringify({ tableId: leftTable.id, sheetName: leftSheet.name, successMessage: '左表已加载 {count} 条候选记录', emptyMessage: '左表无可用记录' }), connectedPortsJson: '[]' } },
            { id: 'right_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 240, y: 250 }, data: { propertiesJson: JSON.stringify({ tableId: rightTable.id, sheetName: rightSheet.name, successMessage: '右表已加载 {count} 条候选记录', emptyMessage: '右表无可用记录' }), connectedPortsJson: '[]' } },
            { id: 'join', type: 'formflow', specId: 'data:lookup-join', position: { x: 500, y: 160 }, data: { propertiesJson: JSON.stringify({ leftKey: relation.left.fields[0], rightKey: relation.right.fields[0], leftPrefix: `${leftTable.id}.`, rightPrefix: `${rightTable.id}.`, joinType, maxMatches: queryLimit, resultField, messageField: statusField, emptyMessage: String(suppliedParameters.emptyResultMessage || '未找到匹配记录'), multipleMessage: ambiguousResultMessage, sourceKeyFields: { left: leftSheet.config?.keyFields || [relation.left.fields[0]], right: rightSheet.config?.keyFields || [relation.right.fields[0]] } }), connectedPortsJson: '[]' } },
          ],
          edges: [
            { id: 'join_left_rows', source: 'left_query', target: 'join', sourceHandle: 'out:rows', targetHandle: 'in:left' },
            { id: 'join_right_rows', source: 'right_query', target: 'join', sourceHandle: 'out:rows', targetHandle: 'in:right' },
            { id: 'join_criteria', source: 'join_import', target: 'join', sourceHandle: 'out:criteria', targetHandle: 'in:criteria' },
          ],
          createdAt: now,
          updatedAt: now,
          generatedBy: generatedMetadata(template, instanceId, now),
        },
        {
          id: saveFlowId,
          name: `${template.name}分表更新`,
          description: '基于联合结果中的来源快照生成逐表差异，并在冲突预检通过后原子提交。',
          nodes: [
            { id: 'transaction_import', type: 'formflow', specId: 'workflow:import', position: { x: 80, y: 120 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'formData', type: 'object', label: '表单状态' }] }), connectedPortsJson: '[]' } },
            { id: 'transaction_write', type: 'formflow', specId: 'data:transaction-write', position: { x: 390, y: 120 }, data: { propertiesJson: JSON.stringify({ targets: [
              { id: `joined_${leftTable.id}`, tableId: leftTable.id, sheetName: leftSheet.name, keyField: relation.left.fields[0], mode: 'update', sourceField: resultField, fieldMap: Object.fromEntries(leftSheet.headers.map((field: string) => [field, `${leftTable.id}.${field}`])), originalFieldMap: Object.fromEntries(leftSheet.headers.map((field: string) => [field, `_original_${leftTable.id}.${field}`])), conflictPolicy: String(suppliedParameters.conflictPolicy || 'error'), conflictCheckFields: leftSheet.headers.filter((field: string) => editableFieldsLeft.includes(`${leftTable.id}.${field}`)) },
              { id: `joined_${rightTable.id}`, tableId: rightTable.id, sheetName: rightSheet.name, keyField: relation.right.fields[0], mode: 'update', sourceField: resultField, fieldMap: Object.fromEntries(rightSheet.headers.map((field: string) => [field, `${rightTable.id}.${field}`])), originalFieldMap: Object.fromEntries(rightSheet.headers.map((field: string) => [field, `_original_${rightTable.id}.${field}`])), conflictPolicy: String(suppliedParameters.conflictPolicy || 'error'), conflictCheckFields: rightSheet.headers.filter((field: string) => editableFieldsRight.includes(`${rightTable.id}.${field}`)) },
            ], statusField: writeBackField, diffField: changeLogField, maxChanges: 1 }), connectedPortsJson: '[]' } },
          ],
          edges: [
            { id: 'join_save_form_data', source: 'transaction_import', target: 'transaction_write', sourceHandle: 'out:formData', targetHandle: 'in:formData' },
          ],
          createdAt: now,
          updatedAt: now,
          generatedBy: generatedMetadata(template, instanceId, now),
        },
      );
    }
    if (template.id === 'master-detail-view') {
      const relationId = String(suppliedParameters.relationId || selection.relationIds?.[0] || ''); const relation = (project.relations || []).find((item: DataRelation) => item.id === relationId) as DataRelation;
      const masterTable = (project.srcTable || []).find((item: JsonObject) => item.id === relation.left.tableId); const detailTable = (project.srcTable || []).find((item: JsonObject) => item.id === relation.right.tableId); const masterSheet = masterTable.sheets.find((item: JsonObject) => item.name === relation.left.sheetName); const detailSheet = detailTable.sheets.find((item: JsonObject) => item.name === relation.right.sheetName);
      const pageSize = Math.max(1, Math.min(50, Number(suppliedParameters.pageSize || suppliedParameters.detailRows || 5) || 5));
      const joinType = String(suppliedParameters.joinType || 'left');
      const exportFormat = String(suppliedParameters.exportFormat || 'json');
      const masterRows = fullSourceRows(project, masterTable, masterSheet);
      const detailRows = fullSourceRows(project, detailTable, detailSheet);
      const groupedDetails = new Map<string, JsonObject[]>();
      for (const detailRow of detailRows) {
        const key = String(detailRow[relation.right.fields[0]] ?? '');
        groupedDetails.set(key, [...(groupedDetails.get(key) || []), detailRow]);
      }
      const visibleMasters = masterRows
        .map((row) => {
          const children = groupedDetails.get(String(row[relation.left.fields[0]] ?? '')) || [];
          return { ...row, 明细数量: children.length, 明细: children };
        })
        .filter((row) => joinType === 'inner' ? Number(row.明细数量 || 0) > 0 : true);
      const firstMaster = visibleMasters[0] || masterRows[0] || {};
      const firstMasterDetails = Array.isArray(firstMaster.明细) ? firstMaster.明细 as JsonObject[] : [];
      const formWindow = form.design.formWindow; const baseY = Number(formWindow?.height || 500); const resultId = `${safe}_master_detail_results`; const statusId = `${safe}_master_detail_status`; const buttonId = `${safe}_master_detail_run`; const flowId = `${safe}_master_detail_flow`;
      const readonlyFields = masterSheet.headers.map((field: string, index: number) => {
        const column = masterSheet.columns?.find((item: JsonObject) => item.name === field);
        return {
          id: `${safe}_master_field_${index + 1}`,
          type: column?.dataType === 'number' ? 'number' : column?.dataType === 'date' ? 'datePicker' : 'input',
          x: 80 + (index % 2) * 360,
          y: baseY + 22 + Math.floor(index / 2) * 86,
          width: 320,
          height: 72,
          zIndex: 2,
          fieldBinding: `${masterTable.id}.${field}`,
          props: {
            name: `${masterTable.id}.${field}`,
            label: `主记录 · ${field}`,
            value: firstMaster[field],
            readonly: true,
            disabled: true,
          },
        };
      });
      const readonlyBottom = baseY + 22 + Math.ceil(masterSheet.headers.length / 2) * 86;
      const masterTableY = readonlyBottom + 24;
      const detailTableY = masterTableY + 210;
      const resultTableY = detailTableY + 250;
      if (formWindow) formWindow.height = resultTableY + 230;
      form.design.components.push(
        { id: statusId, type: 'text', x: 80, y: baseY - 30, width: 740, height: 28, zIndex: 2, fieldBinding: '_主从详情状态', props: { name: '_主从详情状态', content: '点击“加载主从详情”开始查询；只读展示主记录和嵌套明细。', color: '#475569' } },
        { id: `${safe}_master_heading`, type: 'text', x: 80, y: baseY - 2, width: 320, height: 22, zIndex: 2, props: { content: '主记录快照（只读）', fontSize: 14, fontWeight: '700', color: '#1f2937' } },
        ...readonlyFields,
        { id: `${safe}_master_table`, type: 'table', x: 80, y: masterTableY, width: 740, height: 180, zIndex: 2, fieldBinding: '_主记录列表', props: { name: '_主记录列表', label: '主记录列表', columns: [...masterSheet.headers, '明细数量'], data: visibleMasters.slice(0, pageSize).map((row) => Object.fromEntries([...masterSheet.headers, '明细数量'].map((field) => [field, row[field]]))), rowKey: relation.left.fields[0], editable: false, addable: false, removable: false, rows: pageSize, striped: true, showGrid: true, sourceQualifiedColumns: [...masterSheet.headers.map((field: string) => `${masterTable.id}.${field}`), `${detailTable.id}.__count`] } },
        { id: `${safe}_detail_table`, type: 'table', x: 80, y: detailTableY, width: 740, height: 220, zIndex: 2, fieldBinding: '_当前明细', props: { name: '_当前明细', label: '当前主记录明细', columns: detailSheet.headers, data: firstMasterDetails.slice(0, pageSize), rowKey: relation.right.fields[0], editable: false, addable: false, removable: false, rows: pageSize, striped: true, showGrid: true, sourceQualifiedColumns: detailSheet.headers.map((field: string) => `${detailTable.id}.${field}`), emptyStateText: '当前主记录暂无明细' } },
        { id: buttonId, type: 'button', x: 640, y: resultTableY + 160, width: 180, height: 48, zIndex: 3, props: { name: '加载主从详情', label: String(suppliedParameters.submitLabel || '加载主从详情'), variant: 'primary', flowTriggers: { onClick: { enabled: true, workflowId: flowId, parameterMap: {} } } } },
        { id: resultId, type: 'table', x: 80, y: resultTableY, width: 540, height: 200, zIndex: 2, fieldBinding: '_主从详情结果', props: { name: '_主从详情结果', label: '可导出主从结果', columns: [...masterSheet.headers, '明细数量', '明细'], data: visibleMasters.slice(0, pageSize), sourceQualifiedColumns: [...masterSheet.headers.map((field: string) => `${masterTable.id}.${field}`), `${detailTable.id}.__count`, `${detailTable.id}.__details`], rows: pageSize, striped: true, showGrid: true } },
      );
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        crossTableSources: [
          { tableId: masterTable.id, sheetName: masterSheet.name, fields: masterSheet.headers.map((field: string) => `${masterTable.id}.${field}`) },
          { tableId: detailTable.id, sheetName: detailSheet.name, fields: detailSheet.headers.map((field: string) => `${detailTable.id}.${field}`) },
        ],
        fieldProjection: {
          visibleFields: masterSheet.headers.map((field: string) => `${masterTable.id}.${field}`),
          internalFields: [],
        },
        detailView: {
          joinType,
          pageSize,
          exportFormat,
          masterKey: relation.left.fields[0],
          detailKey: relation.right.fields[0],
        },
      };
      artifacts.workflows.push({ id: flowId, name: `${template.name}查询`, description: `按 ${relation.name} 组装主记录与明细数组。`, nodes: [
        { id: 'master_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 60 }, data: { propertiesJson: JSON.stringify({ tableId: masterTable.id, sheetName: masterSheet.name }), connectedPortsJson: '[]' } },
        { id: 'detail_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 260 }, data: { propertiesJson: JSON.stringify({ tableId: detailTable.id, sheetName: detailSheet.name }), connectedPortsJson: '[]' } },
        { id: 'group_details', type: 'formflow', specId: 'data:master-detail', position: { x: 430, y: 160 }, data: { propertiesJson: JSON.stringify({ masterKey: relation.left.fields[0], detailKey: relation.right.fields[0], detailField: '明细', joinType, resultField: '_主从详情结果', messageField: '_主从详情状态' }), connectedPortsJson: '[]' } },
      ], edges: [
        { id: 'master_rows', source: 'master_query', target: 'group_details', sourceHandle: 'out:rows', targetHandle: 'in:masters' },
        { id: 'detail_rows', source: 'detail_query', target: 'group_details', sourceHandle: 'out:rows', targetHandle: 'in:details' },
      ], createdAt: now, updatedAt: now, generatedBy: generatedMetadata(template, instanceId, now) });
    }
    if (scaffold?.workflow) {
      const workflow = scaffold.workflow as unknown as JsonObject;
      if (workflow.nodes?.some((node: JsonObject) => node.id === 'submit' && node.specId === 'behavior:submit')) {
        const submitNode = workflow.nodes.find((node: JsonObject) => node.id === 'submit' && node.specId === 'behavior:submit') as JsonObject | undefined;
        if (submitNode?.data?.propertiesJson) {
          const properties = JSON.parse(String(submitNode.data.propertiesJson || '{}'));
          if (template.id === 'single-table-entry') {
            properties.writeBackMode = String(suppliedParameters.keyStrategy || 'upsert');
          }
          if (template.id === 'single-table-lookup-edit') {
            const submitQueryFields = stringList(suppliedParameters.queryFields);
            const submitDisplayFields = stringList(suppliedParameters.displayFields);
            const submitEditableFields = stringList(suppliedParameters.editableFields);
            const submitProjectedFields = [...new Set([...submitQueryFields, ...submitDisplayFields, ...submitEditableFields])];
            properties.writeBackMode = suppliedParameters.dirtyOnly === false ? 'upsert' : 'update';
            properties.dirtyOnly = suppliedParameters.dirtyOnly === undefined ? true : !!suppliedParameters.dirtyOnly;
            properties.conflictPolicy = String(suppliedParameters.conflictPolicy || 'error');
            properties.refetchAfterSave = suppliedParameters.refetchAfterSave === undefined ? true : !!suppliedParameters.refetchAfterSave;
            properties.successMessage = String(suppliedParameters.successMessage || '操作成功');
            properties.refreshOriginalFieldMap = Object.fromEntries(submitProjectedFields.map((field) => [field, `_original_${field}`]));
            properties.conflictCheckFields = submitEditableFields;
          }
          submitNode.data = { ...(submitNode.data || {}), propertiesJson: JSON.stringify(properties) };
        }
      }
      workflow.generatedBy = generatedMetadata(template, instanceId, now);
      artifacts.workflows.push(workflow);
    }
    if (template.id === 'single-table-lookup-edit') {
      const queryFields = stringList(suppliedParameters.queryFields);
      const displayFields = stringList(suppliedParameters.displayFields);
      const editableFields = stringList(suppliedParameters.editableFields);
      const projectedFields = [...new Set([...queryFields, ...displayFields, ...editableFields])];
      const unlockComponentIds = stringList(form.design?.templateParameters?.lookupPolicy?.unlockComponentIds);
      artifacts.workflows.push({
      id: `${safe}_lookup_flow`, name: `${template.name}查询回填`, description: '按查询条件要求唯一命中；无结果和多结果都会返回可操作提示。',
      nodes: [
        { id: 'workflow_import', type: 'formflow', specId: 'workflow:import', position: { x: 80, y: 120 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'criteria', type: 'object', label: '查询条件' }] }), connectedPortsJson: '[]' } },
        { id: 'lookup', type: 'formflow', specId: 'form:lookup-fill', position: { x: 380, y: 120 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, queryFields, queryMode: String(suppliedParameters.queryMode || 'exact'), fieldMap: Object.fromEntries(projectedFields.map((field) => [field, field])), originalFieldMap: Object.fromEntries(projectedFields.map((field) => [field, `_original_${field}`])), enableComponentIds: unlockComponentIds, disableComponentIds: unlockComponentIds, matchedField: '_lookupMatched', uniqueField: '_lookupUnique', matchCountField: '_lookupMatchCount', requireUniqueMatch: true, maxMatches: Math.max(1, Math.min(20, Number(suppliedParameters.queryLimit || 2) || 2)), notFoundMessage: String(suppliedParameters.emptyResultMessage || '未找到匹配记录'), multipleMatchMessage: String(suppliedParameters.multipleResultMessage || '查询结果不唯一，请收窄条件') }), connectedPortsJson: '[]' } },
        { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 680, y: 120 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'patch', type: 'object', label: '表单补丁' }, { name: 'matched', type: 'boolean', label: '是否命中' }, { name: 'unique', type: 'boolean', label: '是否唯一' }, { name: 'matchCount', type: 'number', label: '命中数量' }] }), connectedPortsJson: '[]' } },
      ],
      edges: [
        { id: 'criteria', source: 'workflow_import', target: 'lookup', sourceHandle: 'out:criteria', targetHandle: 'in:criteria' },
        { id: 'patch', source: 'lookup', target: 'workflow_export', sourceHandle: 'out:patch', targetHandle: 'in:patch' },
        { id: 'matched', source: 'lookup', target: 'workflow_export', sourceHandle: 'out:matched', targetHandle: 'in:matched' },
        { id: 'unique', source: 'lookup', target: 'workflow_export', sourceHandle: 'out:unique', targetHandle: 'in:unique' },
        { id: 'matchCount', source: 'lookup', target: 'workflow_export', sourceHandle: 'out:matchCount', targetHandle: 'in:matchCount' },
      ], createdAt: now, updatedAt: now, generatedBy: generatedMetadata(template, instanceId, now),
    });
    }
    if (template.id === 'data-overview') {
      const workflowId = `${safe}_profile_flow`;
      const profileFields = effectiveFields.length ? effectiveFields : sheet.headers;
      const sampleField = String(suppliedParameters.sampleField || '_输入样本');
      const resultField = String(suppliedParameters.resultField || '_分析结果');
      const summaryField = String(suppliedParameters.summaryField || '_概览摘要');
      const chartField = String(suppliedParameters.chartField || '_概览图');
      const messageField = String(suppliedParameters.messageField || '_分析状态');
      const chartMetric = String(suppliedParameters.chartMetric || '唯一值');
      const chartLimit = configuredChartLimit(suppliedParameters, 8);
      const distributionLimit = Math.max(1, Math.min(10, Number(suppliedParameters.distributionLimit || 3) || 3));
      const sampleValueLimit = Math.max(1, Math.min(10, Number(suppliedParameters.sampleValueLimit || 3) || 3));
      artifacts.workflows.push({
        id: workflowId,
        name: `${template.name}画像分析`,
        description: '读取当前表数据并执行字段级概览画像，生成结果表、摘要和图表数据。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, resultField: sampleField, messageField, successMessage: '已加载 {count} 条待分析记录' }), connectedPortsJson: '[]' } },
          { id: 'profile_overview', type: 'formflow', specId: 'data:profile-overview', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ fields: profileFields, resultField, summaryField, chartField, messageField, chartMetric, chartLimit, distributionLimit, sampleValueLimit }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'profile', type: 'array', label: '字段画像结果' }, { name: 'summary', type: 'object', label: '画像摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_profile', source: 'source_query', target: 'profile_overview', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'profile_to_export', source: 'profile_overview', target: 'workflow_export', sourceHandle: 'out:profile', targetHandle: 'in:profile' },
          { id: 'summary_to_export', source: 'profile_overview', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        profile: {
          fields: profileFields,
          sampleField,
          resultField,
          summaryField,
          chartField,
          messageField,
          chartMetric,
          chartLimit,
          distributionLimit,
          sampleValueLimit,
          chartTitle: String(suppliedParameters.chartTitle || (chartMetric === '缺失数' ? '选中字段缺失数量' : '选中字段唯一值数量')),
          resultLabel: String(suppliedParameters.resultLabel || '数据质量与分布'),
        },
      };
    }
    if (template.id === 'kpi-dashboard') {
      const metrics = stringList(suppliedParameters.metrics).filter((field) => effectiveFields.includes(field) || sheet.headers.includes(field));
      const dimensions = stringList(suppliedParameters.dimensions).filter((field) => effectiveFields.includes(field) || sheet.headers.includes(field));
      const aggregation = String(suppliedParameters.aggregation || 'average');
      artifacts.workflows.push({
        id: `${safe}_kpi_flow`,
        name: `${template.name}汇总`,
        description: '读取当前表数据，计算 KPI 卡片与可选维度分组汇总。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条待汇总记录' }), connectedPortsJson: '[]' } },
          { id: 'kpi_dashboard', type: 'formflow', specId: 'data:kpi-dashboard', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ metrics, dimensions, aggregation, chartLimit: configuredChartLimit(suppliedParameters, 8), resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_KPI摘要'), chartField: String(suppliedParameters.chartField || '_KPI图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: 'KPI 结果' }, { name: 'summary', type: 'object', label: 'KPI 摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_kpi', source: 'source_query', target: 'kpi_dashboard', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'result_to_export', source: 'kpi_dashboard', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'summary_to_export', source: 'kpi_dashboard', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        kpi: {
          metrics,
          dimensions,
          aggregation,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_KPI摘要'),
          chartField: String(suppliedParameters.chartField || '_KPI图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
          chartLimit: configuredChartLimit(suppliedParameters, 8),
        },
      };
    }
    if (template.id === 'group-comparison') {
      const dimensions = stringList(suppliedParameters.dimensions);
      const metrics = stringList(suppliedParameters.metrics);
      const aggregation = String(suppliedParameters.aggregation || 'sum');
      artifacts.workflows.push({
        id: `${safe}_group_flow`,
        name: `${template.name}聚合`,
        description: '读取当前表数据并按指定维度、指标完成真实分组聚合。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条待分组记录' }), connectedPortsJson: '[]' } },
          { id: 'group_aggregate', type: 'formflow', specId: 'data:group-aggregate', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ dimensions, metrics, aggregation, chartLimit: configuredChartLimit(suppliedParameters, 8), resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_分组摘要'), chartField: String(suppliedParameters.chartField || '_分组图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '分组结果' }, { name: 'summary', type: 'object', label: '分组摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_group', source: 'source_query', target: 'group_aggregate', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'group_result_to_export', source: 'group_aggregate', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'group_summary_to_export', source: 'group_aggregate', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        grouping: {
          dimensions,
          metrics,
          aggregation,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_分组摘要'),
          chartField: String(suppliedParameters.chartField || '_分组图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
    if (template.id === 'pivot-analysis') {
      const rowDimension = String(suppliedParameters.rowDimension || '');
      const columnDimension = String(suppliedParameters.columnDimension || '');
      const metric = String(suppliedParameters.metric || '');
      const aggregation = String(suppliedParameters.aggregation || 'sum');
      artifacts.workflows.push({
        id: `${safe}_pivot_flow`,
        name: `${template.name}透视`,
        description: '读取当前表数据并输出真实透视矩阵。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条待透视记录' }), connectedPortsJson: '[]' } },
          { id: 'pivot_matrix', type: 'formflow', specId: 'data:pivot-matrix', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ rowDimension, columnDimension, metric, aggregation, chartLimit: configuredChartLimit(suppliedParameters, 8), resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_透视摘要'), chartField: String(suppliedParameters.chartField || '_透视图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '透视结果' }, { name: 'summary', type: 'object', label: '透视摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_pivot', source: 'source_query', target: 'pivot_matrix', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'pivot_result_to_export', source: 'pivot_matrix', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'pivot_summary_to_export', source: 'pivot_matrix', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        pivot: {
          rowDimension,
          columnDimension,
          metric,
          aggregation,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_透视摘要'),
          chartField: String(suppliedParameters.chartField || '_透视图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
    if (template.id === 'correlation-analysis') {
      const fields = stringList(suppliedParameters.fields);
      artifacts.workflows.push({
        id: `${safe}_correlation_flow`,
        name: `${template.name}分析`,
        description: '读取当前表数据并计算字段两两相关系数。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条待分析记录' }), connectedPortsJson: '[]' } },
          { id: 'correlation_matrix', type: 'formflow', specId: 'data:correlation-matrix', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ fields, chartLimit: configuredChartLimit(suppliedParameters, 8), resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_相关摘要'), chartField: String(suppliedParameters.chartField || '_相关图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '相关结果' }, { name: 'summary', type: 'object', label: '相关摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_correlation', source: 'source_query', target: 'correlation_matrix', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'correlation_result_to_export', source: 'correlation_matrix', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'correlation_summary_to_export', source: 'correlation_matrix', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        correlation: {
          fields,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_相关摘要'),
          chartField: String(suppliedParameters.chartField || '_相关图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
    if (template.id === 'anomaly-detection') {
      const fields = stringList(suppliedParameters.fields);
      const contamination = Number(suppliedParameters.contamination ?? 0.1);
      artifacts.workflows.push({
        id: `${safe}_anomaly_flow`,
        name: `${template.name}分析`,
        description: '读取当前表数据并按异常得分排序输出疑似异常记录。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条待检测记录' }), connectedPortsJson: '[]' } },
          { id: 'anomaly_score', type: 'formflow', specId: 'data:anomaly-score', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ fields, contamination, chartLimit: configuredChartLimit(suppliedParameters, 8), resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_异常摘要'), chartField: String(suppliedParameters.chartField || '_异常图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '异常结果' }, { name: 'summary', type: 'object', label: '异常摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_anomaly', source: 'source_query', target: 'anomaly_score', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'anomaly_result_to_export', source: 'anomaly_score', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'anomaly_summary_to_export', source: 'anomaly_score', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        anomaly: {
          fields,
          contamination,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_异常摘要'),
          chartField: String(suppliedParameters.chartField || '_异常图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
    if (template.id === 'cross-table-summary') {
      const relationId = String(suppliedParameters.relationId || selection.relationIds?.[0] || '');
      const relation = (project.relations || []).find((item: DataRelation) => item.id === relationId) as DataRelation | undefined;
      const leftTable = relation ? (project.srcTable || []).find((item: JsonObject) => item.id === relation.left.tableId) : undefined;
      const rightTable = relation ? (project.srcTable || []).find((item: JsonObject) => item.id === relation.right.tableId) : undefined;
      const leftSheet = relation && leftTable ? leftTable.sheets.find((item: JsonObject) => item.name === relation.left.sheetName) : undefined;
      const rightSheet = relation && rightTable ? rightTable.sheets.find((item: JsonObject) => item.name === relation.right.sheetName) : undefined;
      const dimensions = stringList(suppliedParameters.dimensions);
      const metrics = stringList(suppliedParameters.metrics);
      const aggregation = String(suppliedParameters.aggregation || 'sum');
      const joinType = String(suppliedParameters.joinType || 'left');
      if (relation && leftTable && rightTable && leftSheet && rightSheet) {
        artifacts.workflows.push({
          id: `${safe}_cross_summary_flow`,
          name: `${template.name}聚合`,
          description: `读取 ${relation.name} 两侧数据并执行受控 Join 后聚合。`,
          nodes: [
            { id: 'left_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 60 }, data: { propertiesJson: JSON.stringify({ tableId: leftTable.id, sheetName: leftSheet.name }), connectedPortsJson: '[]' } },
            { id: 'right_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 260 }, data: { propertiesJson: JSON.stringify({ tableId: rightTable.id, sheetName: rightSheet.name }), connectedPortsJson: '[]' } },
            { id: 'join_group', type: 'formflow', specId: 'data:qualified-join-group', position: { x: 430, y: 160 }, data: { propertiesJson: JSON.stringify({ leftKey: relation.left.fields[0], rightKey: relation.right.fields[0], leftPrefix: `${leftTable.id}.`, rightPrefix: `${rightTable.id}.`, dimensions, metrics, aggregation, joinType, chartLimit: configuredChartLimit(suppliedParameters, 8), resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_跨表摘要'), chartField: String(suppliedParameters.chartField || '_跨表图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
            { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 760, y: 160 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '跨表结果' }, { name: 'summary', type: 'object', label: '跨表摘要' }] }), connectedPortsJson: '[]' } },
          ],
          edges: [
            { id: 'left_rows_to_join', source: 'left_query', target: 'join_group', sourceHandle: 'out:rows', targetHandle: 'in:left' },
            { id: 'right_rows_to_join', source: 'right_query', target: 'join_group', sourceHandle: 'out:rows', targetHandle: 'in:right' },
            { id: 'join_result_to_export', source: 'join_group', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
            { id: 'join_summary_to_export', source: 'join_group', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
          ],
          createdAt: now,
          updatedAt: now,
          generatedBy: generatedMetadata(template, instanceId, now),
        });
        form.design.templateParameters = {
          ...(form.design.templateParameters || {}),
          crossSummary: {
            relationId,
            dimensions,
            metrics,
            aggregation,
            joinType,
            resultField: String(suppliedParameters.resultField || '_分析结果'),
            summaryField: String(suppliedParameters.summaryField || '_跨表摘要'),
            chartField: String(suppliedParameters.chartField || '_跨表图'),
            messageField: String(suppliedParameters.messageField || '_分析状态'),
          },
        };
      }
    }
    if (template.id === 'regression-prediction') {
      const target = String(suppliedParameters.target || '');
      const features = stringList(suppliedParameters.features);
      const validationRatio = Number(suppliedParameters.validationRatio ?? 0.2);
      artifacts.workflows.push({
        id: `${safe}_regression_flow`,
        name: `${template.name}训练评估`,
        description: '读取当前表数据并执行确定性回归训练/验证与基线比较。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条训练样本' }), connectedPortsJson: '[]' } },
          { id: 'regression_eval', type: 'formflow', specId: 'ml:regression-evaluate', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ target, features, validationRatio, resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_回归摘要'), chartField: String(suppliedParameters.chartField || '_回归图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '回归结果' }, { name: 'summary', type: 'object', label: '回归摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_regression', source: 'source_query', target: 'regression_eval', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'regression_result_to_export', source: 'regression_eval', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'regression_summary_to_export', source: 'regression_eval', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        regression: {
          target,
          features,
          validationRatio,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_回归摘要'),
          chartField: String(suppliedParameters.chartField || '_回归图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
    if (template.id === 'classification-prediction') {
      const target = String(suppliedParameters.target || '');
      const features = stringList(suppliedParameters.features);
      const validationRatio = Number(suppliedParameters.validationRatio ?? 0.2);
      artifacts.workflows.push({
        id: `${safe}_classification_flow`,
        name: `${template.name}训练评估`,
        description: '读取当前表数据并执行确定性分类评估与基线比较。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条分类样本' }), connectedPortsJson: '[]' } },
          { id: 'classification_eval', type: 'formflow', specId: 'ml:classification-evaluate', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ target, features, validationRatio, resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_分类摘要'), chartField: String(suppliedParameters.chartField || '_分类图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '分类结果' }, { name: 'summary', type: 'object', label: '分类摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_classification', source: 'source_query', target: 'classification_eval', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'classification_result_to_export', source: 'classification_eval', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'classification_summary_to_export', source: 'classification_eval', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        classification: {
          target,
          features,
          validationRatio,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_分类摘要'),
          chartField: String(suppliedParameters.chartField || '_分类图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
    if (template.id === 'time-series-prediction') {
      const timeField = String(suppliedParameters.timeField || '');
      const target = String(suppliedParameters.target || '');
      const horizon = Number(suppliedParameters.horizon || 6);
      artifacts.workflows.push({
        id: `${safe}_time_series_flow`,
        name: `${template.name}回测预测`,
        description: '读取当前表数据并按时间顺序回测、对比基线后生成预测区间。',
        nodes: [
          { id: 'source_query', type: 'formflow', specId: 'behavior-query-list', position: { x: 80, y: 140 }, data: { propertiesJson: JSON.stringify({ tableId: table.id, sheetName: sheet.name, messageField: '_分析状态', successMessage: '已加载 {count} 条时序样本' }), connectedPortsJson: '[]' } },
          { id: 'time_series_backtest', type: 'formflow', specId: 'ml:time-series-backtest', position: { x: 400, y: 140 }, data: { propertiesJson: JSON.stringify({ timeField, target, horizon, resultField: String(suppliedParameters.resultField || '_分析结果'), summaryField: String(suppliedParameters.summaryField || '_时序摘要'), chartField: String(suppliedParameters.chartField || '_时序图'), messageField: String(suppliedParameters.messageField || '_分析状态') }), connectedPortsJson: '[]' } },
          { id: 'workflow_export', type: 'formflow', specId: 'workflow:export', position: { x: 720, y: 140 }, data: { propertiesJson: JSON.stringify({ ports: [{ name: 'result', type: 'array', label: '时序结果' }, { name: 'summary', type: 'object', label: '时序摘要' }] }), connectedPortsJson: '[]' } },
        ],
        edges: [
          { id: 'rows_to_time_series', source: 'source_query', target: 'time_series_backtest', sourceHandle: 'out:rows', targetHandle: 'in:rows' },
          { id: 'time_series_result_to_export', source: 'time_series_backtest', target: 'workflow_export', sourceHandle: 'out:result', targetHandle: 'in:result' },
          { id: 'time_series_summary_to_export', source: 'time_series_backtest', target: 'workflow_export', sourceHandle: 'out:summary', targetHandle: 'in:summary' },
        ],
        createdAt: now,
        updatedAt: now,
        generatedBy: generatedMetadata(template, instanceId, now),
      });
      form.design.templateParameters = {
        ...(form.design.templateParameters || {}),
        timeSeries: {
          timeField,
          target,
          horizon,
          resultField: String(suppliedParameters.resultField || '_分析结果'),
          summaryField: String(suppliedParameters.summaryField || '_时序摘要'),
          chartField: String(suppliedParameters.chartField || '_时序图'),
          messageField: String(suppliedParameters.messageField || '_分析状态'),
        },
      };
    }
  }
  for (let index = artifacts.workflows.length; index < template.generation.workflows; index += 1) artifacts.workflows.push({ id: `${safe}_flow_${index + 1}`, name: `${template.name}流程${index + 1}`, description: '由模板生成；运行时步骤由模板实例参数驱动。', nodes: [{ id: 'operation', type: 'formflow', specId: 'data:transform', position: { x: 120, y: 120 }, data: { propertiesJson: JSON.stringify({ templateId, selection, parameters: suppliedParameters }), connectedPortsJson: '[]' } }], edges: [], createdAt: now, updatedAt: now, generatedBy: generatedMetadata(template, instanceId, now) });
  for (let index = 0; index < template.generation.outputs; index += 1) artifacts.outputs.push({ id: `${safe}_output_${index + 1}`, name: `${template.name}输出${index + 1}`, format: template.id === 'master-detail-view' ? String(suppliedParameters.exportFormat || 'json') : 'json', size: 0, createdAt: now, generatedBy: generatedMetadata(template, instanceId, now) });
  artifacts.tests.push(...buildTemplateTestArtifacts(project, template, selection, suppliedParameters, artifacts.forms, artifacts.workflows, artifacts.outputs, now, safe));
  const extractedArtifacts = extractBehaviorArtifacts(template, artifacts.forms);
  artifacts.rules = extractedArtifacts.rules;
  artifacts.behaviors = extractedArtifacts.behaviors;
  assertBehaviorArtifactsValid(artifacts);
  const summary = assertGenerationSummaryMatches(template, artifacts);
  const preview = buildPlanPreview(template, selection, suppliedParameters, sheet, normalizedFields, artifacts);
  const resources = [...artifacts.forms, ...artifacts.workflows, ...artifacts.outputs];
  const existing = [...(project.forms || []), ...(project.workflows || []), ...(project.outputs || [])];
  const conflicts = resources.filter((item) => existing.some((current: JsonObject) => current.id === item.id)).map((item) => ({ code: 'RESOURCE_ID_CONFLICT', resourceId: item.id, message: `资源 ${item.id} 已存在` }));
  return { id: `plan_${randomUUID()}`, templateId, templateVersion: template.version, instanceId, selection, parameters: suppliedParameters, summary, artifacts, preview, conflicts };
}

export function applyOperationPlan(project: JsonObject, plan: GenerationPlan): JsonObject {
  if (plan.conflicts.length) throw toolError('GENERATION_CONFLICT', plan.conflicts[0].message, 'plan.conflicts', plan.conflicts);
  const next = structuredClone(project); const now = new Date().toISOString();
  const normalizedForms = plan.artifacts.forms.map((form) => ({ ...form, behaviors: [], ruleCode: '', design: normalizeFormDesign(form.design || {}) }));
  for (const ruleArtifact of plan.artifacts.rules || []) {
    const owner = normalizedForms.find((form) => form.id === ruleArtifact.ownerFormId);
    if (!owner) throw toolError('BEHAVIOR_OWNER_NOT_FOUND', `规则产物缺少所属表单 ${ruleArtifact.ownerFormId}`, 'plan.artifacts.rules');
    owner.ruleCode = String(ruleArtifact.ruleCode || '');
  }
  for (const behaviorArtifact of plan.artifacts.behaviors || []) {
    const owner = normalizedForms.find((form) => form.id === behaviorArtifact.ownerFormId);
    if (!owner) throw toolError('BEHAVIOR_OWNER_NOT_FOUND', `行为产物缺少所属表单 ${behaviorArtifact.ownerFormId}`, 'plan.artifacts.behaviors');
    if (behaviorArtifact.kind === 'behavior') owner.behaviors = [...(owner.behaviors || []), structuredClone(behaviorArtifact.behavior)];
  }
  next.forms = [...(next.forms || []), ...normalizedForms];
  next.workflows = [...(next.workflows || []), ...plan.artifacts.workflows];
  next.outputs = [...(next.outputs || []), ...plan.artifacts.outputs];
  next.testing ||= { profiles: [], suites: [], fixtures: [], runs: [] };
  next.testing.suites = [...(next.testing.suites || []), ...plan.artifacts.tests];
  const generatedResources = [...normalizedForms, ...plan.artifacts.workflows, ...plan.artifacts.outputs, ...plan.artifacts.tests];
  next.templateInstances = [...(next.templateInstances || []), { id: plan.instanceId, templateId: plan.templateId, templateVersion: plan.templateVersion, selection: plan.selection, parameters: plan.parameters, resources: { formIds: plan.artifacts.forms.map((item) => item.id), ruleIds: (plan.artifacts.rules || []).map((item) => item.id), behaviorIds: (plan.artifacts.behaviors || []).map((item) => item.id), workflowIds: plan.artifacts.workflows.map((item) => item.id), outputIds: plan.artifacts.outputs.map((item) => item.id), testIds: plan.artifacts.tests.map((item) => item.id) }, fingerprints: Object.fromEntries([...generatedResources.map((item) => [item.id, resourceFingerprint(item)]), ...(plan.artifacts.rules || []).map((item) => [item.id, resourceFingerprint(item as unknown as JsonObject)]), ...(plan.artifacts.behaviors || []).map((item) => [item.id, resourceFingerprint(item as unknown as JsonObject)])]), status: 'managed', createdAt: now, updatedAt: now }];
  next.config.updatedAt = now; next.release ||= {}; next.release.defaultFormId ||= plan.artifacts.forms[0]?.id;
  const validation = validateProjectModel(next);
  const blocking = [...validation.structural.errors, ...validation.references.errors];
  if (blocking.length) throw toolError('GENERATED_PROJECT_INVALID', blocking[0].message, blocking[0].path, validation);
  return next;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as JsonObject).sort(([left], [right]) => left.localeCompare(right)).filter(([, item]) => item !== undefined).map(([key, item]) => [key, stable(item)]));
}

export function resourceFingerprint(resource: JsonObject) { return createHash('sha256').update(JSON.stringify(stable(resource))).digest('hex'); }

export function inspectTemplateInstanceDrift(project: JsonObject, instanceId: string) {
  const instance = (project.templateInstances || []).find((item: JsonObject) => item.id === instanceId);
  if (!instance) throw toolError('TEMPLATE_INSTANCE_NOT_FOUND', `模板实例 ${instanceId} 不存在`, 'id');
  const ids = [...(instance.resources?.formIds || []), ...(instance.resources?.ruleIds || []), ...(instance.resources?.behaviorIds || []), ...(instance.resources?.workflowIds || []), ...(instance.resources?.outputIds || []), ...(instance.resources?.testIds || [])];
  const resources = [...(project.forms || []), ...(project.workflows || []), ...(project.outputs || []), ...(project.testing?.suites || [])];
  const currentBehaviorArtifacts = (() => {
    const templateBehaviorCount = Number(instance.resources?.behaviorIds?.length || 0) + Number(instance.resources?.ruleIds?.length || 0);
    const templateStub = { generation: { behaviors: templateBehaviorCount } } as Pick<OperationTemplateDefinition, 'generation'>;
    const extracted = extractBehaviorArtifacts(templateStub, project.forms || []);
    return new Map<string, JsonObject>([...extracted.rules, ...extracted.behaviors].map((artifact) => [artifact.id, artifact as unknown as JsonObject]));
  })();
  const checks = ids.map((id) => {
    const resource = resources.find((item: JsonObject) => item.id === id) || currentBehaviorArtifacts.get(id);
    if (!resource) return { id, status: 'missing', message: '生成资源已被删除' };
    const expected = instance.fingerprints?.[id]; const actual = resourceFingerprint(resource);
    if (!expected) return { id, status: 'unknown', message: '旧实例没有生成时指纹' };
    return expected === actual ? { id, status: 'unchanged', message: '仍与模板生成版本一致' } : { id, status: 'modified', message: '资源已被手工修改' };
  });
  return { instanceId, drifted: checks.some((item) => item.status === 'missing' || item.status === 'modified'), checks };
}

export function deleteTemplateInstanceResources(project: JsonObject, instanceId: string) {
  const instance = (project.templateInstances || []).find((item: JsonObject) => item.id === instanceId);
  if (!instance) throw toolError('TEMPLATE_INSTANCE_NOT_FOUND', `模板实例 ${instanceId} 不存在`, 'id');
  const next = structuredClone(project); const belongs = (item: JsonObject) => item.generatedBy?.instanceId === instanceId || item.design?.generatedBy?.instanceId === instanceId;
  const formIds = new Set(instance.resources?.formIds || []); const workflowIds = new Set(instance.resources?.workflowIds || []); const outputIds = new Set(instance.resources?.outputIds || []); const testIds = new Set(instance.resources?.testIds || []);
  next.forms = (next.forms || []).filter((item: JsonObject) => !formIds.has(item.id) || !belongs(item));
  next.workflows = (next.workflows || []).filter((item: JsonObject) => !workflowIds.has(item.id) || !belongs(item));
  next.outputs = (next.outputs || []).filter((item: JsonObject) => !outputIds.has(item.id) || !belongs(item));
  next.testing ||= { profiles: [], suites: [], fixtures: [], runs: [] }; next.testing.suites = (next.testing.suites || []).filter((item: JsonObject) => !testIds.has(item.id) || item.generatedBy?.instanceId !== instanceId);
  next.templateInstances = (next.templateInstances || []).filter((item: JsonObject) => item.id !== instanceId);
  if (next.release?.defaultFormId && formIds.has(next.release.defaultFormId)) next.release.defaultFormId = next.forms[0]?.id;
  next.config.updatedAt = new Date().toISOString(); return next;
}

function replaceGeneratedInstanceId(resource: JsonObject, instanceId: string) {
  if (resource.generatedBy) resource.generatedBy.instanceId = instanceId;
  if (resource.design?.generatedBy) resource.design.generatedBy.instanceId = instanceId;
}

/** Rebuilds only resources still owned by a managed instance; manual drift is blocked unless explicitly overridden. */
export function regenerateTemplateInstance(project: JsonObject, instanceId: string, overwriteModified = false) {
  const instance = (project.templateInstances || []).find((item: JsonObject) => item.id === instanceId);
  if (!instance) throw toolError('TEMPLATE_INSTANCE_NOT_FOUND', `模板实例 ${instanceId} 不存在`, 'id');
  if (instance.status !== 'managed') throw toolError('TEMPLATE_INSTANCE_DETACHED', '已脱离管理的实例不能重新生成', 'id');
  const drift = inspectTemplateInstanceDrift(project, instanceId); const modified = drift.checks.filter((item) => item.status === 'modified');
  if (modified.length && !overwriteModified) throw toolError('TEMPLATE_INSTANCE_DRIFTED', '生成资源已被手工修改；请先查看差异，再决定保留修改或明确覆盖。', 'id', { checks: modified });
  const stripped = deleteTemplateInstanceResources(project, instanceId);
  const plan = planOperationTemplate(stripped, instance.templateId, instance.selection || {}, instance.parameters || {}); plan.instanceId = instanceId;
  for (const resource of [...plan.artifacts.forms, ...plan.artifacts.workflows, ...plan.artifacts.outputs, ...plan.artifacts.tests]) replaceGeneratedInstanceId(resource, instanceId);
  const regenerated = applyOperationPlan(stripped, plan); const next = regenerated.templateInstances.find((item: JsonObject) => item.id === instanceId);
  if (next) { next.createdAt = instance.createdAt; next.updatedAt = new Date().toISOString(); next.regeneratedAt = next.updatedAt; }
  return { project: regenerated, plan, drift, overwritten: modified.map((item) => item.id) };
}

export interface DataTransactionOperation {
  id: string;
  tableId: string;
  sheetName: string;
  baseVersion?: string;
  adds?: JsonObject[];
  updates?: Array<{ rowKey: string; changes: JsonObject }>;
  deletes?: string[];
}

export interface DataTransactionResult {
  project: JsonObject;
  applied: Array<{ id: string; tableId: string; sheetName: string; adds: number; updates: number; deletes: number; dataVersion: string; generatedKeys: JsonObject[] }>;
  totalChanges: number;
}

function referenceValue(value: unknown, generated: Map<string, JsonObject[]>): unknown {
  if (Array.isArray(value)) return value.map((item) => referenceValue(item, generated));
  if (!value || typeof value !== 'object') return value;
  const object = value as JsonObject;
  if (typeof object.$ref === 'string') {
    const match = object.$ref.match(/^([A-Za-z0-9_-]+)\.(\d+)\.([A-Za-z0-9_\u4e00-\u9fff-]+)$/);
    if (!match) throw toolError('INVALID_TRANSACTION_REFERENCE', `无效事务引用 ${object.$ref}`, '$ref');
    const row = generated.get(match[1])?.[Number(match[2])];
    if (!row || row[match[3]] === undefined) throw toolError('UNRESOLVED_TRANSACTION_REFERENCE', `无法解析事务引用 ${object.$ref}`, '$ref');
    return row[match[3]];
  }
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, referenceValue(item, generated)]));
}

function addGeneratedKeys(project: JsonObject, operation: DataTransactionOperation, rows: JsonObject[]): { rows: JsonObject[]; keys: JsonObject[] } {
  const table = (project.srcTable || []).find((item: JsonObject) => item.id === operation.tableId);
  const sheet = table?.sheets?.find((item: JsonObject) => item.name === operation.sheetName);
  if (!table || !sheet) throw toolError('SHEET_NOT_FOUND', `${operation.tableId}/${operation.sheetName} 不存在`);
  const keyFields: string[] = sheet.config?.keyFields || [];
  const current = fullSourceRows(project, table, sheet);
  const maxima = new Map<string, number>();
  for (const key of keyFields) {
    const column = sheet.columns?.find((item: JsonObject) => item.name === key);
    if (column?.dataType === 'number') maxima.set(key, Math.max(0, ...current.map((item) => Number(item[key])).filter(Number.isFinite)));
  }
  const normalized = rows.map((row) => {
    const next = { ...row };
    for (const key of keyFields) if ((next[key] === undefined || next[key] === null || next[key] === '') && maxima.has(key)) {
      const value = (maxima.get(key) || 0) + 1; maxima.set(key, value); next[key] = value;
    }
    return next;
  });
  return { rows: normalized, keys: normalized.map((row) => Object.fromEntries(keyFields.map((key) => [key, row[key]]))) };
}

/** Apply all table mutations to an isolated project clone; callers persist it once after this succeeds. */
export function applyDataRowsTransaction(project: JsonObject, operations: DataTransactionOperation[]): DataTransactionResult {
  if (!operations.length) throw toolError('EMPTY_TRANSACTION', '事务至少需要一项操作', 'operations');
  const totalChanges = operations.reduce((total, item) => total + (item.adds?.length || 0) + (item.updates?.length || 0) + (item.deletes?.length || 0), 0);
  if (totalChanges > 1000) throw toolError('BATCH_LIMIT_EXCEEDED', '跨表事务单次最多 1000 个变更', 'operations');
  const identities = operations.map((item) => `${item.tableId}/${item.sheetName}`);
  if (new Set(operations.map((item) => item.id)).size !== operations.length) throw toolError('DUPLICATE_OPERATION_ID', '事务操作 ID 必须唯一', 'operations');
  if (new Set(identities).size !== identities.length) throw toolError('DUPLICATE_TRANSACTION_TARGET', '同一事务中每个 Sheet 只能出现一次', 'operations');
  const next = structuredClone(project); const generated = new Map<string, JsonObject[]>(); const applied: DataTransactionResult['applied'] = [];
  for (const operation of operations) {
    const resolvedAdds = (referenceValue(operation.adds || [], generated) as JsonObject[]);
    const resolvedUpdates = (referenceValue(operation.updates || [], generated) as Array<{ rowKey: string; changes: JsonObject }>);
    const withKeys = addGeneratedKeys(next, operation, resolvedAdds); generated.set(operation.id, withKeys.rows);
    const result = batchProjectRows(next, { ...operation, adds: withKeys.rows, updates: resolvedUpdates });
    applied.push({ id: operation.id, tableId: operation.tableId, sheetName: operation.sheetName, ...result.applied, dataVersion: result.dataVersion, generatedKeys: withKeys.keys });
  }
  return { project: next, applied, totalChanges };
}

export interface JoinQueryOptions {
  relationId: string;
  joinType?: 'inner' | 'left';
  page?: number;
  pageSize?: number;
  search?: string;
  sortModel?: SortRule[];
  filterModel?: Record<string, FilterRule>;
  exportAll?: boolean;
}

function relationKey(row: JsonObject, fields: string[]) { return JSON.stringify(fields.map((field) => row[field])); }

export function queryRelationRows(project: JsonObject, options: JoinQueryOptions) {
  const relation = (project.relations || []).find((item: DataRelation) => item.id === options.relationId) as DataRelation | undefined;
  if (!relation) throw toolError('RELATION_NOT_FOUND', `关系 ${options.relationId} 不存在`, 'relationId');
  const validation = validateRelation(project, relation); if (!validation.valid) throw toolError('RELATION_INVALID', '关系定义无效', 'relationId', validation);
  const locate = (side: DataRelation['left']) => {
    const table = (project.srcTable || []).find((item: JsonObject) => item.id === side.tableId);
    const sheet = table?.sheets?.find((item: JsonObject) => item.name === side.sheetName);
    return { table, sheet, rows: table && sheet ? fullSourceRows(project, table, sheet) : [] };
  };
  const left = locate(relation.left); const right = locate(relation.right); const rightIndex = new Map<string, JsonObject[]>();
  for (const row of right.rows) { const key = relationKey(row, relation.right.fields); rightIndex.set(key, [...(rightIndex.get(key) || []), row]); }
  const leftKeys = left.sheet.config?.keyFields || []; const rightKeys = right.sheet.config?.keyFields || [];
  let rows = left.rows.flatMap((leftRow: JsonObject) => {
    const matches = rightIndex.get(relationKey(leftRow, relation.left.fields)) || [];
    if (!matches.length && (options.joinType || relation.defaultJoinType) === 'inner') return [];
    return (matches.length ? matches : [null]).map((rightRow) => ({
      ...Object.fromEntries(Object.entries(leftRow).map(([key, value]) => [`${relation.left.tableId}.${key}`, value])),
      ...(rightRow ? Object.fromEntries(Object.entries(rightRow).map(([key, value]) => [`${relation.right.tableId}.${key}`, value])) : {}),
      __sources: {
        [relation.left.tableId]: Object.fromEntries(leftKeys.map((key: string) => [key, leftRow[key]])),
        [relation.right.tableId]: rightRow ? Object.fromEntries(rightKeys.map((key: string) => [key, rightRow[key]])) : null,
      },
    }));
  });
  const headers = Object.keys(rows[0] || {}).filter((key) => key !== '__sources');
  const queried = queryRows({ rows, headers, page: options.exportAll ? 1 : options.page, pageSize: options.exportAll ? Math.min(rows.length || 1, 10_000) : options.pageSize, search: options.search, sortModel: options.sortModel, filterModel: options.filterModel, maxPageSize: options.exportAll ? 10_000 : 500 });
  return { relationId: relation.id, headers, exportAll: !!options.exportAll, ...queried, sourceKeys: { [relation.left.tableId]: leftKeys, [relation.right.tableId]: rightKeys } };
}
