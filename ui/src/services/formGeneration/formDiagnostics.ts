import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../../project/types';
import { normalizeDataBinding } from '../data/dataBinding';

export type FormDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface FormDiagnostic {
  id: string;
  severity: FormDiagnosticSeverity;
  title: string;
  detail: string;
  componentId?: string;
  field?: string;
  quickFix?: { label: string; props: Record<string, unknown> };
}

const FIELD_CONTROL_TYPES = new Set(['input', 'textarea', 'number', 'datePicker', 'dateRange', 'timePicker', 'switch', 'select', 'checkbox', 'radio', 'rating', 'slider', 'tagInput', 'upload', 'imageUpload']);

function configured(value: unknown) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

export function diagnoseForm(
  components: DesignComponent[],
  tables: SrcTableEntry[] = [],
  workflows: WorkflowFile[] = [],
): FormDiagnostic[] {
  const diagnostics: FormDiagnostic[] = [];
  const workflowIds = new Set(workflows.map((workflow) => workflow.id));
  const seenFields = new Map<string, string>();
  const linkageGraph = new Map<string, Set<string>>();
  const linkageWrites = new Map<string, Set<string>>();

  for (const component of components) {
    const field = String(component.fieldBinding || component.props?.name || '').trim();
    if (FIELD_CONTROL_TYPES.has(component.type)) {
      if (!field) {
        diagnostics.push({ id: `missing-name:${component.id}`, severity: 'error', title: '字段缺少稳定名称', detail: '运行时无法保存或引用这个控件。', componentId: component.id });
      } else {
        const previous = seenFields.get(field);
        if (previous) diagnostics.push({ id: `duplicate:${component.id}`, severity: 'error', title: `字段名称重复：${field}`, detail: `与控件 ${previous} 使用了相同字段名。`, componentId: component.id, field });
        else seenFields.set(field, component.id);
        if (!normalizeDataBinding(component)) diagnostics.push({
          id: `unbound:${component.id}`, severity: 'warning', title: `字段未绑定：${field}`, detail: '可在表单内填写，但没有显式的统一 dataBinding。', componentId: component.id, field,
          quickFix: { label: '绑定到同名表单字段', props: { dataBinding: { version: 1, source: { kind: 'formField', path: field }, direction: 'twoWay', valueMode: 'firstCell' } } },
        });
        if (component.props?.required && !configured(component.props?.placeholder) && !configured(component.props?.defaultValue)) diagnostics.push({
          id: `required-hint:${component.id}`, severity: 'info', title: `必填字段缺少输入提示：${field}`, detail: '建议提供占位提示或默认值。', componentId: component.id, field,
          quickFix: { label: '添加输入提示', props: { placeholder: component.type === 'select' || component.type === 'datePicker' ? `请选择${field}` : `请输入${field}` } },
        });
      }
    }

    if (component.type === 'button') {
      const events = component.props?.events as Record<string, unknown> | undefined;
      const flowTriggers = component.props?.flowTriggers as Record<string, { enabled?: boolean; workflowId?: string }> | undefined;
      const hasExecutableEvent = Object.values(events || {}).some((handler) => typeof handler === 'string' && handler.trim().length > 0);
      const hasValidFlowTrigger = Object.values(flowTriggers || {}).some((trigger) => trigger?.enabled === true && !!trigger.workflowId && workflowIds.has(trigger.workflowId));
      if (!hasExecutableEvent && !hasValidFlowTrigger) diagnostics.push({ id: `button-action:${component.id}`, severity: 'error', title: `按钮没有动作：${component.props?.label || field || component.id}`, detail: '请配置非空事件脚本，或指向现有流程的启用触发器。', componentId: component.id });
      for (const [eventName, trigger] of Object.entries(flowTriggers || {})) {
        if (trigger?.enabled && !trigger.workflowId) diagnostics.push({ id: `invalid-flow:${component.id}:${eventName}`, severity: 'error', title: '启用的流程触发器缺少流程', detail: `${eventName} 触发器需要选择流程。`, componentId: component.id });
        if (trigger?.enabled && trigger.workflowId && !workflowIds.has(trigger.workflowId)) diagnostics.push({ id: `missing-flow:${component.id}:${eventName}`, severity: 'error', title: `引用的流程不存在：${trigger.workflowId}`, detail: `${eventName} 触发器需要重新选择流程。`, componentId: component.id });
      }
    }

    const sourceField = String(component.fieldBinding || component.props?.name || '').trim();
    const linkageRules = (component.props?.linkageRules || {}) as Record<string, Array<{ actions?: Array<{ type?: string; targetField?: string; value?: unknown; expression?: string }> }>>;
    for (const [eventName, rules] of Object.entries(linkageRules)) for (const rule of rules || []) for (const action of rule.actions || []) {
      const targetField = String(action.targetField || '').trim();
      if (!sourceField || !targetField) continue;
      if (!linkageGraph.has(sourceField)) linkageGraph.set(sourceField, new Set());
      linkageGraph.get(sourceField)!.add(targetField);
      const writeKey = `${sourceField}:${eventName}:${targetField}`;
      const signature = JSON.stringify({ type: action.type, value: action.value, expression: action.expression });
      if (!linkageWrites.has(writeKey)) linkageWrites.set(writeKey, new Set());
      linkageWrites.get(writeKey)!.add(signature);
    }
  }

  for (const [key, signatures] of linkageWrites) if (signatures.size > 1) diagnostics.push({ id: `write-conflict:${key}`, severity: 'error', title: `联动写入冲突：${key.split(':').slice(-1)[0]}`, detail: '同一触发事件会用不同规则写入同一目标字段，请合并或调整条件。' });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (field: string, path: string[]): string[] | null => {
    if (visiting.has(field)) return [...path.slice(path.indexOf(field)), field];
    if (visited.has(field)) return null;
    visiting.add(field);
    for (const target of linkageGraph.get(field) || []) { const cycle = walk(target, [...path, field]); if (cycle) return cycle; }
    visiting.delete(field); visited.add(field); return null;
  };
  for (const field of linkageGraph.keys()) {
    const cycle = walk(field, []);
    if (cycle) { diagnostics.push({ id: `linkage-cycle:${cycle.join(':')}`, severity: 'error', title: '联动规则存在循环写入', detail: `${cycle.join(' → ')}，运行时可能反复触发。` }); break; }
  }

  for (const workflow of workflows) {
    const nodeIds = new Set((workflow.nodes || []).map((node) => node.id));
    for (const edge of workflow.edges || []) if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) diagnostics.push({ id: `broken-edge:${workflow.id}:${edge.id}`, severity: 'error', title: `流程连线引用不存在的节点：${workflow.name}`, detail: `${edge.source} → ${edge.target}` });
  }

  for (const table of tables) for (const sheet of table.sheets || []) {
    if (sheet.config?.keyFields?.length && sheet.config.keyValidation && !sheet.config.keyValidation.valid) diagnostics.push({
      id: `invalid-key:${table.id}:${sheet.name}`, severity: 'error', title: `主键不可用于写回：${sheet.name}`, detail: `主键包含${sheet.config.keyValidation.hasNulls ? '空值' : ''}${sheet.config.keyValidation.hasNulls && sheet.config.keyValidation.duplicateCount ? '和' : ''}${sheet.config.keyValidation.duplicateCount ? `${sheet.config.keyValidation.duplicateCount} 个重复值` : ''}。`,
    });
  }
  return diagnostics;
}

export function summarizeFormDiagnostics(diagnostics: FormDiagnostic[]) {
  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  const info = diagnostics.filter((item) => item.severity === 'info').length;
  const score = Math.max(0, Math.round(100 - errors * 20 - warnings * 8 - info * 2));
  return { errors, warnings, info, score, ready: errors === 0 };
}

export function findUnrepresentedColumns(components: DesignComponent[], tables: SrcTableEntry[]) {
  const represented = new Set(components.map((component) => String(component.fieldBinding || component.props?.name || '').trim()).filter(Boolean));
  return tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns
    .filter((column) => !column.hidden && column.visible !== false && !represented.has(column.name))
    .map((column) => ({ tableId: table.id, tableName: table.fileName, sheetName: sheet.name, column }))));
}
