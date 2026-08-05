import { createHash } from 'node:crypto';
import {
  batchProjectRows,
  fullSourceRows,
  normalizeFormDesign,
  toolError,
  validateProjectModel,
  type JsonObject,
} from '../project-authoring';
import { OperationTemplateDefinition, extractBehaviorArtifacts } from './shared';
import { GenerationPlan, planOperationTemplate } from './generation';

/** 将操作模板生成计划应用到项目模型（幂等，含 revision 递增）。 */
export function applyOperationPlan(project: JsonObject, plan: GenerationPlan): JsonObject {
  if (plan.conflicts.length) throw toolError('GENERATION_CONFLICT', plan.conflicts[0].message, 'plan.conflicts', plan.conflicts);
  const next = structuredClone(project); const now = new Date().toISOString();
  const normalizedForms: JsonObject[] = plan.artifacts.forms.map((form) => ({ ...form, behaviors: [], ruleCode: '', design: normalizeFormDesign(form.design || {}) }));
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


/** 资源稳定指纹（漂移检测用）。 */
export function resourceFingerprint(resource: JsonObject) { return createHash('sha256').update(JSON.stringify(stable(resource))).digest('hex'); }


/** 检查模板实例与模板定义之间的漂移（字段/结构差异）。 */
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


/** 删除模板实例产生的资源（表单/行为/工作流/数据）。 */
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

/** 重新生成模板实例（默认不覆盖用户修改，返回冲突列表）。 */
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

/** 以事务方式应用数据行变更（校验主键与类型后写入）。 */
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
