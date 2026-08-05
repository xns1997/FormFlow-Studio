import { createHash } from 'node:crypto';
import {
  batchProjectRows, fullSourceRows, generatedForm, normalizeFormDesign, toolError, validateProjectModel, type JsonObject,
} from '../project-authoring';
import { OperationTemplateDefinition, parameters } from './shared';

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

