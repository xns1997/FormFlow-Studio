import type { DesignComponent, SrcTableEntry, WorkflowFile, TableConfig } from '../../project/types';
import { getFormWindowLayout, type FormWindowLike } from '../../../../shared/form-window-layout';
import { normalizeDataBinding } from '../data/dataBinding';
import { controlOptionsFromSamples, type DataFieldDragItem } from './fieldControlRecommendation';

export type FormDiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Machine-applicable quick fix. Every diagnostic produced by `diagnoseForm`
 * carries one, so users always have a one-click "attempt fix" path.
 */
export type QuickFixKind =
  | 'component-props' // merge props into a component (default)
  | 'component-field' // rename a component's field (fieldBinding + props.name)
  | 'component-geometry' // move/resize a component
  | 'add-component' // add a default control to the form
  | 'workflow-patch' // patch a workflow file
  | 'table-config' // patch a sheet table config (may revalidate keys first)
  | 'navigate'; // jump to another workspace to finish the fix manually

export interface QuickFix {
  label: string;
  description?: string;
  kind?: QuickFixKind;
  componentId?: string;
  props?: Record<string, unknown>;
  field?: string;
  geometry?: { x?: number; y?: number; width?: number; height?: number };
  componentType?: string;
  workflowId?: string;
  workflowPatch?: Partial<WorkflowFile>;
  tableId?: string;
  sheetName?: string;
  tablePatch?: Partial<TableConfig>;
  navigateTo?: 'data' | 'flow';
  /** false = safe to attempt one-by-one but excluded from the "fix all" runner. */
  auto?: boolean;
}

export interface FormDiagnostic {
  id: string;
  severity: FormDiagnosticSeverity;
  title: string;
  detail: string;
  componentId?: string;
  field?: string;
  quickFix?: QuickFix;
}

const FIELD_CONTROL_TYPES = new Set(['input', 'textarea', 'number', 'datePicker', 'dateRange', 'timePicker', 'switch', 'select', 'checkbox', 'radio', 'rating', 'slider', 'tagInput', 'upload', 'imageUpload']);
const OPTION_CONTROL_TYPES = new Set(['select', 'radio', 'checkbox']);

function configured(value: unknown) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

function uniqueFieldName(base: string, taken: Set<string>): string {
  const seed = String(base || '字段').trim().replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '') || '字段';
  let name = seed;
  let suffix = 2;
  while (taken.has(name)) name = `${seed}_${suffix++}`;
  return name;
}

function findFieldItem(field: string, tables: SrcTableEntry[]): DataFieldDragItem | undefined {
  for (const table of tables) {
    for (const sheet of table.sheets) {
      const column = sheet.columns.find((item) => item.name === field);
      if (column) {
        return {
          tableId: table.id,
          tableName: table.fileName,
          sheetName: sheet.name,
          column: {
            name: column.name,
            dataType: column.dataType,
            nullable: column.nullable,
            sampleValues: column.sampleValues,
            uniqueCount: column.uniqueCount,
          },
        };
      }
    }
  }
  return undefined;
}

interface LinkageEdgeRef {
  componentId: string;
  eventName: string;
  ruleIndex: number;
  actionIndex: number;
}

interface LinkageGraphEdge {
  targetField: string;
  ref: LinkageEdgeRef;
}

interface LinkageWriteRecord extends LinkageEdgeRef {
  signature: string;
}

function buildLinkageRulesWithoutRefs(component: DesignComponent, refs: LinkageEdgeRef[]): Record<string, unknown> {
  const refSet = new Set(refs.map((ref) => `${ref.eventName}\u0000${ref.ruleIndex}\u0000${ref.actionIndex}`));
  const current = (component.props?.linkageRules || {}) as Record<string, Array<{ actions?: Array<Record<string, unknown>> }>>;
  const next: Record<string, Array<{ actions: Array<Record<string, unknown>> }>> = {};
  for (const [eventName, rules] of Object.entries(current)) {
    const keptRules = (rules || []).flatMap((rule, ruleIndex) => {
      const keptActions = (rule.actions || []).filter((_, actionIndex) => !refSet.has(`${eventName}\u0000${ruleIndex}\u0000${actionIndex}`));
      return keptActions.length ? [{ ...rule, actions: keptActions }] : [];
    });
    if (keptRules.length) next[eventName] = keptRules;
  }
  return next;
}

export function diagnoseForm(
  components: DesignComponent[],
  tables: SrcTableEntry[] = [],
  workflows: WorkflowFile[] = [],
  formWindow?: FormWindowLike,
): FormDiagnostic[] {
  const diagnostics: FormDiagnostic[] = [];
  const workflowIds = new Set(workflows.map((workflow) => workflow.id));
  const seenFields = new Map<string, string>();
  const takenFields = new Set<string>();
  const linkageGraph = new Map<string, LinkageGraphEdge[]>();
  const linkageWrites = new Map<string, LinkageWriteRecord[]>();

  if (components.length === 0) {
    diagnostics.push({
      id: 'empty-form',
      severity: 'info',
      title: '表单还没有控件',
      detail: '添加一个输入控件后即可开始录入数据。',
      quickFix: {
        label: '添加默认输入框',
        description: '在表单顶部添加一个文本输入控件，可稍后改名或调整。',
        kind: 'add-component',
        componentType: 'input',
        geometry: { x: 16, y: 16 },
      },
    });
  }

  for (const component of components) {
    const field = String(component.fieldBinding || component.props?.name || '').trim();
    if (FIELD_CONTROL_TYPES.has(component.type)) {
      if (!field) {
        const labelSeed = String(component.props?.label || '').trim() || component.type;
        const generated = uniqueFieldName(labelSeed, takenFields);
        takenFields.add(generated);
        diagnostics.push({
          id: `missing-name:${component.id}`,
          severity: 'error',
          title: '字段缺少稳定名称',
          detail: '运行时无法保存或引用这个控件。',
          componentId: component.id,
          quickFix: {
            label: '自动生成字段名',
            description: `从标签“${labelSeed}”生成稳定字段标识：${generated}`,
            kind: 'component-field',
            componentId: component.id,
            field: generated,
            props: { name: generated },
          },
        });
      } else {
        takenFields.add(field);
        const previous = seenFields.get(field);
        if (previous) {
          const renamed = uniqueFieldName(field, takenFields);
          takenFields.add(renamed);
          diagnostics.push({
            id: `duplicate:${component.id}`,
            severity: 'error',
            title: `字段名称重复：${field}`,
            detail: `与控件 ${previous} 使用了相同字段名。`,
            componentId: component.id,
            field,
            quickFix: {
              label: `重命名为 ${renamed}`,
              description: '将当前控件的字段名改为唯一值，避免数据互相覆盖。',
              kind: 'component-field',
              componentId: component.id,
              field: renamed,
              props: { name: renamed },
            },
          });
        } else {
          seenFields.set(field, component.id);
        }
        if (!normalizeDataBinding(component)) diagnostics.push({
          id: `unbound:${component.id}`, severity: 'warning', title: `字段未绑定：${field}`, detail: '可在表单内填写，但没有显式的统一 dataBinding。', componentId: component.id, field,
          quickFix: { label: '绑定到同名表单字段', description: '创建双向数据绑定，使该字段随表单值同步。', props: { dataBinding: { version: 1, source: { kind: 'formField', path: field }, direction: 'twoWay', valueMode: 'firstCell' } } },
        });
        if (component.props?.required && !configured(component.props?.placeholder) && !configured(component.props?.defaultValue)) diagnostics.push({
          id: `required-hint:${component.id}`, severity: 'info', title: `必填字段缺少输入提示：${field}`, detail: '建议提供占位提示或默认值。', componentId: component.id, field,
          quickFix: { label: '添加输入提示', description: '为控件添加占位提示文本。', props: { placeholder: component.type === 'select' || component.type === 'datePicker' ? `请选择${field}` : `请输入${field}` } },
        });

        if (OPTION_CONTROL_TYPES.has(component.type)) {
          const options = component.props?.options;
          const optionSource = component.props?.optionSource as { mode?: string } | undefined;
          const isEmptyOptions = !Array.isArray(options) || options.length === 0;
          if (isEmptyOptions && (!optionSource || optionSource.mode !== 'dynamic')) {
            const item = findFieldItem(field, tables);
            const sampleOptions = item ? controlOptionsFromSamples(item, component.type) : undefined;
            const defaultOptions = sampleOptions && sampleOptions.length ? sampleOptions : [
              { label: '选项1', value: '1' },
              { label: '选项2', value: '2' },
            ];
            diagnostics.push({
              id: `select-no-options:${component.id}`,
              severity: 'warning',
              title: `选项为空：${component.props?.label || field}`,
              detail: '选择控件没有任何可选选项，用户无法填写。',
              componentId: component.id,
              field,
              quickFix: {
                label: '添加默认选项',
                description: sampleOptions && sampleOptions.length ? '从数据列样本生成选项。' : '添加两个占位选项，可稍后修改。',
                props: { options: defaultOptions },
              },
            });
          }
        }
      }
    }

    if (component.type === 'button') {
      const events = component.props?.events as Record<string, unknown> | undefined;
      const flowTriggers = component.props?.flowTriggers as Record<string, { enabled?: boolean; workflowId?: string }> | undefined;
      const hasExecutableEvent = Object.values(events || {}).some((handler) => typeof handler === 'string' && handler.trim().length > 0);
      const hasValidFlowTrigger = Object.values(flowTriggers || {}).some((trigger) => trigger?.enabled === true && !!trigger.workflowId && workflowIds.has(trigger.workflowId));
      if (!hasExecutableEvent && !hasValidFlowTrigger) {
        const action = String(component.props?.action || 'submit');
        const script = action === 'reset' ? 'await ctx.resetForm();' : 'await ctx.submit();';
        diagnostics.push({
          id: `button-action:${component.id}`,
          severity: 'error',
          title: `按钮没有动作：${component.props?.label || field || component.id}`,
          detail: '请配置非空事件脚本，或指向现有流程的启用触发器。',
          componentId: component.id,
          quickFix: {
            label: '添加默认动作脚本',
            description: script.startsWith('await ctx.resetForm') ? '添加“重置表单”脚本，点击按钮将重置表单。' : '添加“提交表单”脚本（await ctx.submit()）。',
            props: { events: { ...(events || {}), onClick: script } },
          },
        });
      }
      const firstWorkflowId = workflowIds.size ? [...workflowIds][0] : undefined;
      const firstWorkflowName = firstWorkflowId ? workflows.find((workflow) => workflow.id === firstWorkflowId)?.name || firstWorkflowId : undefined;
      for (const [eventName, trigger] of Object.entries(flowTriggers || {})) {
        if (trigger?.enabled && !trigger.workflowId) {
          const nextTrigger = firstWorkflowId ? { ...trigger, workflowId: firstWorkflowId } : { ...trigger, enabled: false };
          diagnostics.push({
            id: `invalid-flow:${component.id}:${eventName}`,
            severity: 'error',
            title: '启用的流程触发器缺少流程',
            detail: `${eventName} 触发器需要选择流程。`,
            componentId: component.id,
            quickFix: {
              label: firstWorkflowId ? '自动选择流程' : '停用该触发器',
              description: firstWorkflowId
                ? `将 ${eventName} 触发器指向现有流程“${firstWorkflowName}”。`
                : '当前项目没有可用流程，先停用触发器避免运行时错误。',
              props: { flowTriggers: { ...flowTriggers, [eventName]: nextTrigger } },
            },
          });
        }
        if (trigger?.enabled && trigger.workflowId && !workflowIds.has(trigger.workflowId)) {
          const nextTrigger = firstWorkflowId ? { ...trigger, workflowId: firstWorkflowId } : { ...trigger, enabled: false };
          diagnostics.push({
            id: `missing-flow:${component.id}:${eventName}`,
            severity: 'error',
            title: `引用的流程不存在：${trigger.workflowId}`,
            detail: `${eventName} 触发器需要重新选择流程。`,
            componentId: component.id,
            quickFix: {
              label: firstWorkflowId ? '重新选择流程' : '停用该触发器',
              description: firstWorkflowId
                ? `将 ${eventName} 触发器重新指向现有流程“${firstWorkflowName}”。`
                : '当前项目没有可用流程，先停用触发器避免运行时错误。',
              props: { flowTriggers: { ...flowTriggers, [eventName]: nextTrigger } },
            },
          });
        }
      }
    }

    const sourceField = String(component.fieldBinding || component.props?.name || '').trim();
    const linkageRules = (component.props?.linkageRules || {}) as Record<string, Array<{ actions?: Array<{ type?: string; targetField?: string; value?: unknown; expression?: string }> }>>;
    for (const [eventName, rules] of Object.entries(linkageRules)) {
      for (const [ruleIndex, rule] of (rules || []).entries()) {
        for (const [actionIndex, action] of (rule.actions || []).entries()) {
          const targetField = String(action.targetField || '').trim();
          if (!sourceField || !targetField) continue;
          const ref: LinkageEdgeRef = { componentId: component.id, eventName, ruleIndex, actionIndex };
          if (!linkageGraph.has(sourceField)) linkageGraph.set(sourceField, []);
          linkageGraph.get(sourceField)!.push({ targetField, ref });
          const writeKey = `${sourceField}:${eventName}:${targetField}`;
          const signature = JSON.stringify({ type: action.type, value: action.value, expression: action.expression });
          if (!linkageWrites.has(writeKey)) linkageWrites.set(writeKey, []);
          linkageWrites.get(writeKey)!.push({ ...ref, signature });
        }
      }
    }
  }

  for (const [key, writes] of linkageWrites) {
    const uniqueSignatures = new Set(writes.map((write) => write.signature));
    if (uniqueSignatures.size <= 1) continue;
    const targetField = key.split(':').slice(-1)[0];
    const firstComponentId = writes[0].componentId;
    const removalsForFirst: LinkageEdgeRef[] = [];
    const seen = new Set<string>();
    for (const write of writes) {
      if (!seen.has(write.signature)) {
        seen.add(write.signature);
        continue;
      }
      if (write.componentId === firstComponentId) removalsForFirst.push(write);
    }
    const component = components.find((item) => item.id === firstComponentId);
    diagnostics.push({
      id: `write-conflict:${key}`,
      severity: 'error',
      title: `联动写入冲突：${targetField}`,
      detail: '同一触发事件会用不同规则写入同一目标字段，请合并或调整条件。',
      componentId: firstComponentId,
      quickFix: component && removalsForFirst.length ? {
        label: '保留第一条写入规则',
        description: '保留最先写入的规则，移除该控件中重复写入同一字段的后续规则。',
        kind: 'component-props',
        componentId: firstComponentId,
        props: { linkageRules: buildLinkageRulesWithoutRefs(component, removalsForFirst) },
      } : {
        label: '检查联动规则',
        description: '需要手动调整不同控件的写入条件，避免同时命中同一字段。',
        auto: false,
      },
    });
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (field: string, path: string[], edges: LinkageEdgeRef[]): boolean => {
    if (visiting.has(field)) {
      const start = path.indexOf(field);
      const cycle = [...path.slice(start), field];
      diagnostics.push({
        id: `linkage-cycle:${cycle.join(':')}`,
        severity: 'error',
        title: '联动规则存在循环写入',
        detail: `${cycle.join(' → ')}，运行时可能反复触发。`,
        componentId: edges[edges.length - 1]?.componentId,
        quickFix: (() => {
          const closingRef = edges[edges.length - 1];
          const component = closingRef ? components.find((item) => item.id === closingRef.componentId) : undefined;
          return component ? {
            label: '断开循环',
            description: '移除形成循环的最后一条写入规则，其余联动保持不变。',
            kind: 'component-props',
            componentId: closingRef.componentId,
            props: { linkageRules: buildLinkageRulesWithoutRefs(component, [closingRef]) },
          } : {
            label: '检查联动规则',
            description: '需要手动调整联动规则，断开循环引用。',
            auto: false,
          };
        })(),
      });
      return true;
    }
    if (visited.has(field)) return false;
    visiting.add(field);
    for (const edge of linkageGraph.get(field) || []) {
      if (walk(edge.targetField, [...path, field], [...edges, edge.ref])) return true;
    }
    visiting.delete(field);
    visited.add(field);
    return false;
  };
  for (const field of linkageGraph.keys()) {
    if (walk(field, [], [])) break;
  }

  for (const workflow of workflows) {
    const nodeIds = new Set((workflow.nodes || []).map((node) => node.id));
    for (const edge of workflow.edges || []) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        const remaining = (workflow.edges || []).filter((item) => item.id !== edge.id);
        diagnostics.push({
          id: `broken-edge:${workflow.id}:${edge.id}`,
          severity: 'error',
          title: `流程连线引用不存在的节点：${workflow.name}`,
          detail: `${edge.source} → ${edge.target}`,
          quickFix: {
            label: '删除无效连线',
            description: '移除引用不存在节点的连线，流程其余部分保持不变。',
            kind: 'workflow-patch',
            workflowId: workflow.id,
            workflowPatch: { edges: remaining },
          },
        });
      }
    }
  }

  const usedColumnNames = new Set(components.map((component) => String(component.fieldBinding || component.props?.name || '').trim()).filter(Boolean));
  for (const table of tables) {
    for (const sheet of table.sheets || []) {
      if (sheet.config?.keyFields?.length && sheet.config.keyValidation && !sheet.config.keyValidation.valid) {
        diagnostics.push({
          id: `invalid-key:${table.id}:${sheet.name}`,
          severity: 'error',
          title: `主键不可用于写回：${sheet.name}`,
          detail: `主键包含${sheet.config.keyValidation.hasNulls ? '空值' : ''}${sheet.config.keyValidation.hasNulls && sheet.config.keyValidation.duplicateCount ? '和' : ''}${sheet.config.keyValidation.duplicateCount ? `${sheet.config.keyValidation.duplicateCount} 个重复值` : ''}。`,
          quickFix: {
            label: '尝试重新校验主键',
            description: '基于当前数据重新校验主键；仍无效时跳转到数据工作区处理。',
            kind: 'table-config',
            tableId: table.id,
            sheetName: sheet.name,
          },
        });
      } else if (
        !sheet.config?.keyFields?.length
        && sheet.rowCount > 0
        && sheet.columns.some((column) => !column.hidden && column.visible !== false)
        && sheet.columns.some((column) => usedColumnNames.has(column.name))
      ) {
        diagnostics.push({
          id: `missing-key:${table.id}:${sheet.name}`,
          severity: 'warning',
          title: `可写数据表未配置主键：${sheet.name}`,
          detail: '表单用到了该数据表但未配置主键，无法可靠写回数据。',
          quickFix: {
            label: '自动选择主键',
            description: '尝试从数据中挑选唯一且非空的列作为主键；找不到时跳转到数据工作区。',
            kind: 'table-config',
            tableId: table.id,
            sheetName: sheet.name,
          },
        });
      }
    }
  }

  if (formWindow) {
    const content = getFormWindowLayout(formWindow).content;
    for (const component of components) {
      if (component.parentId) continue;
      const right = component.x + component.width;
      const bottom = component.y + component.height;
      const fullyOutside = right <= 0 || bottom <= 0 || component.x >= content.width || component.y >= content.height;
      if (component.x < 0 || component.y < 0 || fullyOutside) {
        const nextX = Math.max(0, Math.min(component.x, Math.max(0, content.width - component.width)));
        const nextY = Math.max(0, Math.min(component.y, Math.max(0, content.height - component.height)));
        diagnostics.push({
          id: `off-canvas:${component.id}`,
          severity: 'warning',
          title: `控件超出表单范围：${component.props?.label || component.props?.name || component.id}`,
          detail: '控件位于表单可视区域之外，预览时可能无法看到或操作。',
          componentId: component.id,
          quickFix: {
            label: '移回表单内',
            description: '将控件移入表单可视区域，尺寸保持不变。',
            kind: 'component-geometry',
            componentId: component.id,
            geometry: { x: nextX, y: nextY },
          },
        });
      }
    }
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
