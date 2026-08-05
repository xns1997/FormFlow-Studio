import { PROJECT_TEMPLATES } from '../../../../shared/project-templates';
import { DESIGN_TEMPLATES } from '../../designer/designTemplates';
import type { OperationTemplateCatalogItem } from './operationTemplateClient';

export type TemplateAuditKind = 'designer' | 'operation' | 'project';
export type TemplateDestination = 'designer' | 'data' | 'results' | 'usage';

export interface TemplateAuditEntry {
  id: string;
  name: string;
  kind: TemplateAuditKind;
  category: string;
  requiredInput: string;
  primaryAction: string;
  successDestination: TemplateDestination;
  recoveryAction: string;
}

function operationDestination(template: OperationTemplateCatalogItem): TemplateDestination {
  if (template.id === 'single-table-batch-update') return 'data';
  if (template.category === 'analysis' || template.category === 'prediction') return 'results';
  return 'designer';
}

function operationAction(template: OperationTemplateCatalogItem) {
  if (template.category === 'analysis' || template.category === 'prediction') return '配置并运行分析';
  if (template.category === 'maintenance') return '查询并保存修改';
  if (template.category === 'cross-table') return '检查并提交跨表变更';
  return '填写并保存记录';
}

function operationInput(template: OperationTemplateCatalogItem) {
  const contract = template.selectionContract || {};
  const tables = Number(contract.minTables || 1);
  const fields = Number(contract.minFields || 1);
  const relation = contract.requiresRelation ? '，数据关系' : '';
  const key = contract.requiresKey ? '，稳定主键' : '';
  return `${tables} 张数据表、至少 ${fields} 个字段${key}${relation}`;
}

/**
 * Builds the UX audit contract from the three production registries. The matrix
 * intentionally contains behavior-level expectations only; template schemas
 * remain the single source of truth for IDs, labels, and selection rules.
 */
/** 构建模板审计矩阵（覆盖/一致性检查）。 */
export function buildTemplateAuditMatrix(operationTemplates: OperationTemplateCatalogItem[]): TemplateAuditEntry[] {
  const designerEntries = DESIGN_TEMPLATES.map((template) => ({
    id: template.key,
    name: template.label,
    kind: 'designer' as const,
    category: template.formMode,
    requiredInput: template.key === 'master-detail' ? '已声明的一对一或一对多关系' : '可选字段投影',
    primaryAction: template.key === 'lookup-edit' ? '查询并保存修改' : template.key === 'blank' ? '开始设计表单' : '填写并保存表单',
    successDestination: 'designer' as const,
    recoveryAction: '返回字段选择或继续设计',
  }));
  const operationEntries = operationTemplates.map((template) => ({
    id: template.id,
    name: template.name,
    kind: 'operation' as const,
    category: template.category,
    requiredInput: operationInput(template),
    primaryAction: operationAction(template),
    successDestination: operationDestination(template),
    recoveryAction: template.category === 'analysis' || template.category === 'prediction' ? '保留已安装实例并重试运行' : '定位字段问题后返回配置',
  }));
  const projectEntries = PROJECT_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    kind: 'project' as const,
    category: template.kind,
    requiredInput: '模板自带数据表和示例字段',
    primaryAction: '完成首次录入并运行模板分析',
    successDestination: 'usage' as const,
    recoveryAction: '返回数据预览或测试运行',
  }));
  return [...designerEntries, ...operationEntries, ...projectEntries];
}

/** 断言审计矩阵通过（门禁用）。 */
export function assertTemplateAuditMatrix(matrix: TemplateAuditEntry[]) {
  const ids = new Set<string>();
  for (const entry of matrix) {
    if (!entry.id || ids.has(entry.id)) throw new Error(`模板审计矩阵存在重复或空 ID：${entry.id}`);
    if (!entry.name || !entry.requiredInput || !entry.primaryAction || !entry.recoveryAction) {
      throw new Error(`模板 ${entry.id} 缺少交互合同字段`);
    }
    ids.add(entry.id);
  }
  return matrix;
}
