import { createHash } from 'node:crypto';
import {
  batchProjectRows, fullSourceRows, generatedForm, normalizeFormDesign, toolError, validateProjectModel, type JsonObject,
} from '../project-authoring';
import { DataRelation, FeasibilityReport, FeasibilityStatus, OperationTemplateDefinition, TemplateRecommendation, TemplateSelection, inferRecommendationParameters } from './shared';
import { OPERATION_TEMPLATES } from './definitions';
import { analyzeOperationTemplate } from './feasibility';

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

