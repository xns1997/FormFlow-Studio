import { requestResult } from '../io/api';

export type TemplateCategory = 'entry' | 'maintenance' | 'cross-table' | 'analysis' | 'prediction' | 'fragment' | 'workflow';

export interface OperationTemplateCatalogItem {
  id: string;
  version: string;
  kind: 'project' | 'operation' | 'fragment' | 'recipe';
  category: TemplateCategory;
  name: string;
  description: string;
  selectionContract: Record<string, unknown>;
  parameterSchema: { type: 'object'; properties?: Record<string, Record<string, unknown>>; required?: string[] };
  generation: { forms: number; workflows: number; behaviors: number; outputs: number; tests: number; modifiesData: boolean; destructive: boolean };
}

export interface TemplateSelection {
  tableId?: string;
  sheetName?: string;
  tableIds?: string[];
  fields?: string[];
  relationIds?: string[];
}

export interface FeasibilityReport {
  status: 'ready' | 'needs-configuration' | 'warning' | 'blocked' | 'not-applicable';
  score: number;
  summary: string;
  checks: Array<{ code: string; status: 'passed' | 'warning' | 'failed'; message: string; path?: string; fix?: { label: string } }>;
  inferredRoles: Array<{ field: string; role: string; confidence: number }>;
  requiredQuestions: Array<{ id: string; label: string; type: string; required: boolean }>;
  generationPreview?: OperationTemplateCatalogItem['generation'];
}

export interface TemplateRecommendation {
  template: OperationTemplateCatalogItem;
  report: FeasibilityReport;
  matchScore: number;
  roleCoverage: number;
  reasons: string[];
  suggestedParameters: Record<string, unknown>;
  unresolvedParameters: string[];
}

type ToolEnvelope<T> = { ok: true; data: T } | { ok: false; error?: { message?: string }; confirmation?: { token: string; summary: string } };

/** 操作模板工具错误（含错误码）。 */
export class TemplateToolError extends Error {
  constructor(
    message: string,
    readonly code = 'TOOL_EXECUTION_FAILED',
    readonly path?: string,
    readonly details?: unknown,
    readonly retryable = false,
  ) { super(message); this.name = 'TemplateToolError'; }
}

/** 操作模板需要确认的错误。 */
export class TemplateConfirmationRequired extends Error {
  constructor(readonly token: string, readonly summary: string, readonly impact: unknown) {
    super(summary); this.name = 'TemplateConfirmationRequired';
  }
}

async function invoke<T>(role: 'project' | 'data' | 'quality', toolName: string, argumentsValue: Record<string, unknown>): Promise<T> {
  const response = await requestResult(`/ai/mcp-roles/${role}/tools/${encodeURIComponent(toolName)}/invoke`, { method: 'POST', body: JSON.stringify({ arguments: argumentsValue }) });
  const result = response.body as ToolEnvelope<T> & { error?: { code?: string; message?: string; path?: string; details?: unknown; retryable?: boolean }; confirmation?: { token: string; summary: string; impact: unknown } };
  if (!result.ok && result.confirmation) throw new TemplateConfirmationRequired(result.confirmation.token, result.confirmation.summary, result.confirmation.impact);
  if (!result.ok) throw new TemplateToolError(result.error?.message || `模板操作失败（HTTP ${response.status}）`, result.error?.code, result.error?.path, result.error?.details, result.error?.retryable);
  return result.data;
}

export interface RelationDraft {
  id: string; name: string;
  left: { tableId: string; sheetName: string; fields: string[] };
  right: { tableId: string; sheetName: string; fields: string[] };
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  defaultJoinType: 'inner' | 'left';
  integrity: 'enforced' | 'checked' | 'informational';
  onDelete: 'restrict' | 'set-null' | 'cascade';
}

export interface RelationSuggestion {
  id: string;
  left: RelationDraft['left'];
  right: RelationDraft['right'];
  cardinality: RelationDraft['cardinality'];
  confidence: number;
  reasons: string[];
}

export interface TemplateInstanceDrift {
  instanceId: string; drifted: boolean;
  checks: Array<{ id: string; status: 'missing' | 'unknown' | 'unchanged' | 'modified'; message: string }>;
}

export interface AnalysisResultRecord {
  id: string; templateId: string; templateName?: string; status: 'succeeded' | 'failed'; usable: boolean; stale: boolean;
  staleReason?: string; error?: string; modelVersion: string; dataVersion: string; currentDataVersion?: string;
  metrics?: Record<string, unknown>; baseline?: Record<string, unknown>; result?: Record<string, unknown>;
  createdAt: string; completedAt: string;
  input?: { tableId: string; sheetName: string; fields?: string[]; parameters?: Record<string, unknown> };
}

export interface TemplateStatistics {
  installed: number; managed: number; presets: number; analysisRuns: number; successfulRuns: number; failedRuns: number; toolCalls: number;
  byTemplate: Array<{ templateId: string; count: number }>;
  failureReasons: Array<{ code: string; message: string; count: number }>;
}

/** 操作模板客户端（应用/校验/导入导出）。 */
export const operationTemplateClient = {
  list: (projectId?: string) => invoke<OperationTemplateCatalogItem[]>('project', 'catalog.operation_templates.list', projectId ? { projectId } : {}),
  recommend: (projectId: string, selection: TemplateSelection) => invoke<TemplateRecommendation[]>('project', 'template.recommend', { projectId, selection }),
  analyze: (projectId: string, templateId: string, selection: TemplateSelection, parameters: Record<string, unknown>) => invoke<FeasibilityReport>('project', 'template.analyze', { projectId, templateId, selection, parameters }),
  plan: (projectId: string, templateId: string, selection: TemplateSelection, parameters: Record<string, unknown>) => invoke<{ plan: Record<string, any>; revision: string }>('project', 'template.plan', { projectId, templateId, selection, parameters }),
  apply: (projectId: string, baseRevision: string, plan: Record<string, unknown>) => invoke<{ instanceId: string; resources: Record<string, unknown>; revision: string }>('project', 'template.apply', { projectId, baseRevision, plan, idempotencyKey: `template-ui-${crypto.randomUUID()}` }),
  getRevision: async (projectId: string) => (await invoke<{ revision: string }>('project', 'project.get', { projectId })).revision,
  validateRelation: (projectId: string, relation: RelationDraft) => invoke<{ valid: boolean; checks: FeasibilityReport['checks'] }>('data', 'data_relation.validate', { projectId, relation }),
  suggestRelations: (projectId: string) => invoke<RelationSuggestion[]>('data', 'data_relation.suggest', { projectId }),
  saveRelation: (projectId: string, relation: RelationDraft, baseRevision: string, idempotencyKey: string) => invoke<{ relation: RelationDraft; revision: string }>('data', 'data_relation.upsert', { projectId, relation, baseRevision, idempotencyKey }),
  deleteRelation: (projectId: string, id: string, baseRevision: string, idempotencyKey: string, cascade: boolean, confirmationToken?: string) => invoke<{ deleted: true; revision: string }>('data', 'data_relation.delete', { projectId, id, baseRevision, idempotencyKey, cascade, confirmationToken }),
  inspectDrift: (projectId: string, id: string) => invoke<TemplateInstanceDrift>('project', 'template.instance.drift', { projectId, id }),
  detachInstance: (projectId: string, id: string, baseRevision: string, idempotencyKey: string) => invoke<{ revision: string }>('project', 'template.instance.detach', { projectId, id, baseRevision, idempotencyKey }),
  deleteInstance: (projectId: string, id: string, baseRevision: string, idempotencyKey: string, confirmationToken?: string) => invoke<{ deleted: true; revision: string }>('project', 'template.instance.delete', { projectId, id, baseRevision, idempotencyKey, confirmationToken }),
  regenerateInstance: (projectId: string, id: string, baseRevision: string, idempotencyKey: string, overwriteModified = false, confirmationToken?: string) => invoke<{ instanceId: string; overwritten: string[]; revision: string }>('project', 'template.instance.regenerate', { projectId, id, baseRevision, idempotencyKey, overwriteModified, confirmationToken }),
  upgradeInstance: (projectId: string, id: string, baseRevision: string, idempotencyKey: string, overwriteModified = false, confirmationToken?: string) => invoke<{ upgraded: boolean; fromVersion: string; toVersion: string; revision: string }>('project', 'template.instance.upgrade', { projectId, id, baseRevision, idempotencyKey, overwriteModified, confirmationToken }),
  listAnalysisResults: (projectId: string) => invoke<AnalysisResultRecord[]>('quality', 'project_analysis.list', { projectId }),
  runAnalysis: (projectId: string, baseRevision: string, templateId: string, selection: TemplateSelection, parameters: Record<string, unknown>) => invoke<{ record: AnalysisResultRecord; result: Record<string, unknown>; revision: string }>('quality', 'project_analysis.run', { projectId, baseRevision, idempotencyKey: `analysis-ui-${crypto.randomUUID()}`, templateId, tableId: selection.tableId || selection.tableIds?.[0], tableIds: selection.tableIds, relationIds: selection.relationIds, sheetName: selection.sheetName, fields: selection.fields, parameters }),
  savePreset: (projectId: string, baseRevision: string, preset: { id: string; name: string; templateId: string; parameters: Record<string, unknown> }) => invoke<{ revision: string }>('project', 'template.preset.upsert', { projectId, baseRevision, idempotencyKey: `template-preset-${crypto.randomUUID()}`, preset }),
  statistics: (projectId: string) => invoke<TemplateStatistics>('project', 'template.statistics', { projectId }),
  exportPackage: (projectId: string, templateIds: string[]) => invoke<Record<string, unknown>>('project', 'template.package.export', { projectId, templateIds }),
  importPackage: (projectId: string, baseRevision: string, packageValue: Record<string, unknown>) => invoke<{ imported: Array<{ id: string; version: string }>; revision: string }>('project', 'template.package.import', { projectId, baseRevision, idempotencyKey: `template-import-${crypto.randomUUID()}`, package: packageValue }),
  writebackPrediction: (projectId: string, id: string, fieldName: string, baseRevision: string, idempotencyKey: string, overwrite = false, confirmationToken?: string) => invoke<{ applied: number; fieldName: string; revision: string }>('quality', 'project_analysis.writeback', { projectId, id, fieldName, baseRevision, idempotencyKey, overwrite, confirmationToken }),
};
