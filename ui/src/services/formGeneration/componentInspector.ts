/**
 * Component inspector service — extracts component state for debugging.
 * Shows binding, validation, linkage, and runtime state of a selected component.
 */

import type { DesignComponent, SrcTableEntry, WorkflowFile } from '../../project/types';
import { getField } from './inspectorHelpers';

export interface ComponentState {
  id: string;
  type: string;
  label: string;
  field: string;
  bindings: BindingInfo[];
  validations: ValidationInfo[];
  linkages: LinkageInfo[];
  flowTriggers: FlowTriggerInfo[];
  runtimeValue?: unknown;
  runtimeError?: string;
  sourceTable?: string;
  sourceSheet?: string;
  sourceColumn?: string;
}

export interface BindingInfo {
  field: string;
  direction: string;
  source: string;
  status: 'active' | 'broken' | 'missing';
  detail: string;
}

export interface ValidationInfo {
  type: string;
  label: string;
  value: string;
  status: 'pass' | 'fail' | 'unknown';
  message: string;
}

export interface LinkageInfo {
  event: string;
  targetField: string;
  action: string;
  condition?: string;
}

export interface FlowTriggerInfo {
  event: string;
  workflowId: string;
  workflowName: string;
  enabled: boolean;
  status: 'valid' | 'missing-flow' | 'disabled';
}

export interface DataFlowNode {
  id: string;
  type: 'data-source' | 'component' | 'workflow' | 'expression';
  label: string;
  field?: string;
  connections: DataFlowConnection[];
}

export interface DataFlowConnection {
  from: string;
  to: string;
  field: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  status: 'active' | 'broken';
}

/** 检查组件（绑定/校验/UX 问题）。 */
export function inspectComponent(
  component: DesignComponent,
  allComponents: DesignComponent[],
  tables: SrcTableEntry[],
  workflows: WorkflowFile[],
): ComponentState {
  const field = getField(component);
  const label = String(component.props?.label || component.props?.title || field || component.id);

  // Bindings
  const bindings: BindingInfo[] = [];
  const dataBinding = component.props?.dataBinding as Record<string, unknown> | undefined;
  if (dataBinding) {
    const source = dataBinding.source as Record<string, unknown> | undefined;
    bindings.push({
      field,
      direction: String(dataBinding.direction || 'twoWay'),
      source: source ? `${source.kind}:${source.path}` : 'unknown',
      status: 'active',
      detail: `绑定到 ${source?.path || field}`,
    });
  } else if (field) {
    bindings.push({
      field,
      direction: 'none',
      source: 'form-field',
      status: 'missing',
      detail: '未显式绑定数据源，数据仅在表单内可用',
    });
  }

  // Validations
  const validations: ValidationInfo[] = [];
  if (component.props?.required) {
    validations.push({
      type: 'required',
      label: '必填',
      value: '是',
      status: 'unknown',
      message: '提交时检查是否为空',
    });
  }
  if (component.props?.min != null) {
    validations.push({
      type: 'min',
      label: '最小值',
      value: String(component.props.min),
      status: 'unknown',
      message: `值不能小于 ${component.props.min}`,
    });
  }
  if (component.props?.max != null) {
    validations.push({
      type: 'max',
      label: '最大值',
      value: String(component.props.max),
      status: 'unknown',
      message: `值不能大于 ${component.props.max}`,
    });
  }
  if (component.props?.pattern) {
    validations.push({
      type: 'pattern',
      label: '格式校验',
      value: String(component.props.pattern),
      status: 'unknown',
      message: '值必须匹配正则表达式',
    });
  }
  if (component.props?.maxLength != null) {
    validations.push({
      type: 'maxLength',
      label: '最大长度',
      value: String(component.props.maxLength),
      status: 'unknown',
      message: `长度不能超过 ${component.props.maxLength}`,
    });
  }

  // Linkages
  const linkages: LinkageInfo[] = [];
  const linkageRules = (component.props?.linkageRules || {}) as Record<string, Array<{ condition?: string; actions?: Array<{ type?: string; targetField?: string; value?: unknown; expression?: string }> }>>;
  for (const [event, rules] of Object.entries(linkageRules)) {
    for (const rule of rules || []) {
      for (const action of rule.actions || []) {
        linkages.push({
          event,
          targetField: String(action.targetField || ''),
          action: action.type || 'setValue',
          condition: rule.condition,
        });
      }
    }
  }

  // Flow triggers
  const flowTriggers: FlowTriggerInfo[] = [];
  const triggers = (component.props?.flowTriggers || {}) as Record<string, { enabled?: boolean; workflowId?: string }>;
  for (const [event, trigger] of Object.entries(triggers)) {
    const workflow = workflows.find((w) => w.id === trigger.workflowId);
    flowTriggers.push({
      event,
      workflowId: trigger.workflowId || '',
      workflowName: workflow?.name || '(未知流程)',
      enabled: !!trigger.enabled,
      status: !trigger.workflowId ? 'missing-flow' : !trigger.enabled ? 'disabled' : 'valid',
    });
  }

  // Source table info
  let sourceTable: string | undefined;
  let sourceSheet: string | undefined;
  let sourceColumn: string | undefined;
  for (const table of tables) {
    for (const sheet of table.sheets) {
      if (sheet.columns.some((c) => c.name === field)) {
        sourceTable = table.fileName;
        sourceSheet = sheet.name;
        sourceColumn = field;
        break;
      }
    }
    if (sourceTable) break;
  }

  return {
    id: component.id,
    type: component.type,
    label,
    field,
    bindings,
    validations,
    linkages,
    flowTriggers,
    sourceTable,
    sourceSheet,
    sourceColumn,
  };
}

/** 构建组件数据流图。 */
export function buildDataFlowGraph(
  components: DesignComponent[],
  tables: SrcTableEntry[],
  workflows: WorkflowFile[],
): DataFlowNode[] {
  const nodes: DataFlowNode[] = [];

  // Data source nodes
  for (const table of tables) {
    for (const sheet of table.sheets) {
      nodes.push({
        id: `table:${table.id}:${sheet.name}`,
        type: 'data-source',
        label: `${table.fileName} / ${sheet.name}`,
        connections: [],
      });
    }
  }

  // Component nodes
  for (const comp of components) {
    const field = getField(comp);
    if (!field) continue;

    const connections: DataFlowConnection[] = [];

    // Check data binding
    const dataBinding = comp.props?.dataBinding as Record<string, unknown> | undefined;
    if (dataBinding) {
      const source = dataBinding.source as Record<string, unknown> | undefined;
      if (source?.kind === 'tableField') {
        const path = String(source.path || '');
        const [tableId, sheetField] = path.split('/');
        const [sheetName] = sheetField?.split('.') || [];
        connections.push({
          from: `table:${tableId}:${sheetName}`,
          to: comp.id,
          field,
          direction: 'bidirectional',
          status: 'active',
        });
      }
    }

    // Check linkage targets
    const linkageRules = (comp.props?.linkageRules || {}) as Record<string, Array<{ actions?: Array<{ targetField?: string }> }>>;
    for (const rules of Object.values(linkageRules)) {
      for (const rule of rules || []) {
        for (const action of rule.actions || []) {
          const targetField = String(action.targetField || '');
          if (targetField) {
            const targetComp = components.find((c) => String(c.fieldBinding || c.props?.name || '') === targetField);
            if (targetComp) {
              connections.push({
                from: comp.id,
                to: targetComp.id,
                field: targetField,
                direction: 'outbound',
                status: 'active',
              });
            }
          }
        }
      }
    }

    nodes.push({
      id: comp.id,
      type: 'component',
      label: String(comp.props?.label || field),
      field,
      connections,
    });
  }

  // Workflow nodes
  for (const workflow of workflows) {
    nodes.push({
      id: `workflow:${workflow.id}`,
      type: 'workflow',
      label: workflow.name,
      connections: workflow.edges.map((edge) => ({
        from: edge.source,
        to: edge.target,
        field: '',
        direction: 'outbound' as const,
        status: 'active' as const,
      })),
    });
  }

  return nodes;
}
