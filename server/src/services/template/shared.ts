import { createHash, randomUUID } from 'node:crypto';
import {
  fullSourceRows,
  toolError,
  type JsonObject,
} from '../project-authoring';
import { queryRows, type FilterRule, type SortRule } from '../data-preview';

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


export interface ResolvedFieldReference {
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


export const parameters = (properties: JsonObject = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

export function resolveTables(project: JsonObject, selection: TemplateSelection) {
  const ids = [...new Set([...(selection.tableIds || []), ...(selection.tableId ? [selection.tableId] : [])])];
  return ids.map((id) => (project.srcTable || []).find((item: JsonObject) => item.id === id)).filter(Boolean);
}


export function selectedSheet(table: JsonObject | undefined, selection: TemplateSelection) {
  return table?.sheets?.find((item: JsonObject) => item.name === selection.sheetName) || table?.sheets?.[0];
}


export const EMAIL_FIELD_PATTERN = /(email|e-mail|邮箱)/i;

export const PHONE_FIELD_PATTERN = /(phone|mobile|tel|电话|手机)/i;

export const URL_FIELD_PATTERN = /(url|link|website|web|网址|链接)/i;

export const FILE_FIELD_PATTERN = /(file|attachment|附件|图片|照片|文档)/i;

export const CURRENCY_FIELD_PATTERN = /(amount|price|cost|fee|salary|工资|金额|价格|费用|收入|预算)/i;

export const PERCENTAGE_FIELD_PATTERN = /(rate|ratio|pct|percent|百分比|占比|比例|率)/i;

export const INTEGER_FIELD_PATTERN = /(count|qty|quantity|num|数量|人数|次数|期数)/i;

export const TIME_FIELD_PATTERN = /(time|时刻|时段)/i;

export const DATETIME_FIELD_PATTERN = /(datetime|timestamp|created.?at|updated.?at|时间戳|创建时间|更新时间)/i;

export const LONG_TEXT_FIELD_PATTERN = /(说明|描述|备注|意见|内容|详情|地址|原因|总结|日志|comment|description|remark|content|address)/i;

export const RELATION_KEY_FIELD_PATTERN = /(id|编号|编码|标识)$/i;


export function normalizedFieldId(tableId: string, sheetName: string, field: string) {
  return `${tableId}.${sheetName}.${field}`;
}


export function distinctNonEmptyStrings(values: unknown[] = []) {
  return [...new Set(values.filter((value) => value !== '' && value !== null && value !== undefined).map(String))];
}


export function looksLikeAllIntegers(values: unknown[] = []) {
  const numeric = values.filter((value) => value !== '' && value !== null && value !== undefined);
  return numeric.length > 0 && numeric.every((value) => Number.isInteger(Number(value)));
}


export function inferNormalizedFieldType(column: JsonObject, field: string, samples: unknown[], format?: string): Pick<NormalizedField, 'type' | 'typeConfidence' | 'pattern' | 'minLength' | 'maxLength' | 'reasons'> {
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


export function normalizeSheetFields(table: JsonObject | undefined, sheet: JsonObject | undefined): NormalizedField[] {
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


export function inferRecommendationParameters(
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


export function extractBehaviorArtifacts(
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


export function finiteFieldValues(rows: JsonObject[], field: string) {
  return rows
    .map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter(Number.isFinite);
}


export function parseTimeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}


export function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}


export function uniqueStrings(values: string[]) {
  return [...new Set(values.map(String).filter(Boolean))];
}


export function sameFieldSequence(left: string[], right: string[]) {
  return left.length === right.length && left.every((field, index) => field === right[index]);
}


export function resolveSelectedFieldSet(
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


export function relationScopedTables(project: JsonObject, selection: TemplateSelection, relation: DataRelation | undefined) {
  if (!relation) return resolveTables(project, selection);
  return [relation.left.tableId, relation.right.tableId]
    .map((id) => (project.srcTable || []).find((item: JsonObject) => item.id === id))
    .filter(Boolean) as JsonObject[];
}


export function crossTableFieldCatalog(project: JsonObject, selection: TemplateSelection, relation: DataRelation | undefined) {
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


export function resolveCrossTableFieldReference(
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


export function resolveCrossTableFieldReferences(
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


export function relationKey(row: JsonObject, fields: string[]) { return JSON.stringify(fields.map((field) => row[field])); }


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
