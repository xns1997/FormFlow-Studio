/**
 * Form flow trigger — orchestrates form event to workflow execution.
 *
 * This module is a thin orchestrator that imports resolution logic from
 * formFlowBindings and coordinates workflow execution.
 */
import type { SrcTableEntry, WorkflowFile } from '../../project/types';
import { loadNodeRegistry } from '../../flowRegistry';
import { executeFlow, type FlowExecutionResult } from './flowEngine';
import {
  ensureWorkflowIo,
  getWorkflowExportFields,
  getWorkflowExportNode,
  getWorkflowImportFields,
  getWorkflowImportNode,
} from './workflowIo';
import {
  resolveV2FlowInputs,
  resolveFormFlowValue,
  type FlowBindingsV2,
  type FormControlEventContext,
} from './formFlowBindings';

// Re-export types for backward compatibility
export type {
  FlowBindingsV2,
  FlowInputBinding,
  FlowOutputBinding,
  FlowOutputPresetStep,
  FlowValueSource,
  FormControlEventName,
  FormControlEventContext,
} from './formFlowBindings';
export { resolveFormFlowValue } from './formFlowBindings';

export interface FormFlowTriggerConfig {
  enabled: boolean;
  workflowId: string;
  bindings?: FlowBindingsV2;
  /** 旧版输入映射；读取兼容，V2 配置应用后不再写入。 */
  parameterMap?: Record<string, unknown>;
  /** 旧版目标节点；读取兼容。 */
  targetNodeId?: string;
}

export function resolveFormFlowParameters(config: FormFlowTriggerConfig, context: FormControlEventContext): Record<string, unknown> {
  if (config.bindings?.version === 2) return {};
  const defaults: Record<string, unknown> = {
    value: context.value,
    field: context.field,
    event: context.eventName,
    values: context.values,
    formData: context.values,
    componentId: context.component.id,
    component: context.component,
    previousValue: context.previousValue,
    timestamp: context.timestamp,
    dirty: context.dirty,
    changedFields: context.changedFields || [],
    detail: context.detail,
    context,
  };
  for (const [name, expression] of Object.entries(config.parameterMap || {})) {
    defaults[name] = resolveFormFlowValue(expression, context);
  }
  return defaults;
}

export function splitFlowParameterTargets(workflow: WorkflowFile, parameters: Record<string, unknown>) {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const variables: Record<string, unknown> = {};
  const nodeInputs: Record<string, Record<string, unknown>> = {};
  for (const [name, value] of Object.entries(parameters)) {
    const dot = name.lastIndexOf('.');
    const nodeId = dot > 0 ? name.slice(0, dot) : '';
    const portName = dot > 0 ? name.slice(dot + 1) : '';
    if (nodeId && portName && nodeIds.has(nodeId)) {
      nodeInputs[nodeId] = { ...(nodeInputs[nodeId] || {}), [portName]: value };
    } else variables[name] = value;
  }
  return { variables, nodeInputs };
}

const SYSTEM_PARAMETER_EXPRESSIONS: Record<string, string> = {
  value: '$value',
  field: '$field',
  event: '$event',
  formData: '$values',
  originalValues: '$originalValues',
  previousValue: '$previousValue',
  timestamp: '$timestamp',
  dirty: '$dirty',
  changedFields: '$changedFields',
  detail: '$detail',
  component: '$component',
  componentId: '$componentId',
};

function buildImportNodeInputs(fieldNames: string[], values: Record<string, unknown>) {
  return Object.fromEntries(fieldNames.map((name) => [name, values[name]]));
}

export async function executeFormFlowTrigger(
  workflow: WorkflowFile,
  config: FormFlowTriggerConfig,
  context: FormControlEventContext,
  tables: SrcTableEntry[] = [],
): Promise<FlowExecutionResult> {
  await loadNodeRegistry();
  const parameters = resolveFormFlowParameters(config, context);
  const migrated = ensureWorkflowIo(workflow, { legacyTargetNodeId: config.targetNodeId });
  const isLegacyWithoutExport = !getWorkflowExportNode(workflow);
  const hasOnlyMissingExportError = migrated.errors.length > 0
    && migrated.errors.every((error) => error === '流程导出节点还没有定义字段');
  if (isLegacyWithoutExport && hasOnlyMissingExportError) {
    const { variables, nodeInputs } = splitFlowParameterTargets(workflow, parameters);
    const result = await executeFlow(
      workflow.nodes.map((node) => ({ id: node.id, specId: node.specId, position: node.position, data: node.data })),
      workflow.edges.map((edge) => ({ ...edge })),
      tables,
      { targetNodeId: config.targetNodeId, variables, nodeInputs, idempotencyKey: context.idempotencyKey },
    );
    for (const effect of result.sideEffects) {
      if (effect.kind === 'set-form-value') result.finalOutputs[effect.field] = effect.value;
    }
    if (result.debug) result.debug.exportKeys = Object.keys(result.finalOutputs);
    return result;
  }
  if (migrated.errors.length > 0) {
    throw new Error(migrated.errors.join('；'));
  }
  const activeWorkflow = migrated.workflow;
  const importNode = getWorkflowImportNode(activeWorkflow);
  if (!importNode) throw new Error('流程缺少唯一导入节点');
  const importFields = getWorkflowImportFields(importNode);
  if (importFields.length === 0) throw new Error('流程导入节点还没有定义字段');
  const exportFields = getWorkflowExportFields(activeWorkflow);
  if (exportFields.length === 0) throw new Error('流程导出节点还没有定义字段');
  const activeParameters = config.bindings?.version === 2
    ? { ...resolveV2FlowInputs(config.bindings, activeWorkflow, context), ...(config.parameterMap || {}) }
    : parameters;
  const { variables, nodeInputs } = splitFlowParameterTargets(activeWorkflow, activeParameters);
  const importNodeInputs = {
    ...variables,
    ...(nodeInputs[importNode.id] || {}),
  };
  return executeFlow(
    activeWorkflow.nodes.map((node) => ({ id: node.id, specId: node.specId, position: node.position, data: node.data })),
    activeWorkflow.edges.map((edge) => ({ ...edge })),
    tables,
    {
      targetNodeId: migrated.exportNodeId,
      variables,
      idempotencyKey: context.idempotencyKey,
      nodeInputs: {
        ...nodeInputs,
        [importNode.id]: buildImportNodeInputs(importFields.map((field) => field.name), importNodeInputs),
      },
    },
  );
}

export function getWorkflowVariableNames(workflow: WorkflowFile | undefined): string[] {
  if (!workflow) return [];
  const names: string[] = [];
  for (const node of workflow.nodes) {
    if (node.specId !== 'generic:value-input') continue;
    try {
      const raw = node.data?.propertiesJson;
      const properties = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      const name = String((properties as any).name || '').trim();
      if (name && !names.includes(name)) names.push(name);
    } catch {}
  }
  return names;
}

export function createDefaultParameterMap(workflow: WorkflowFile | undefined, componentName: string): Record<string, unknown> {
  const importNode = workflow ? getWorkflowImportNode(ensureWorkflowIo(workflow).workflow) : null;
  if (importNode) {
    return Object.fromEntries(getWorkflowImportFields(importNode).map((field) => {
      const defaultExpression = SYSTEM_PARAMETER_EXPRESSIONS[field.name] || `$form.${field.name}`;
      return [`${importNode.id}.${field.name}`, defaultExpression];
    }));
  }
  return Object.fromEntries(getWorkflowVariableNames(workflow).map((name) => {
    if (name === 'value' || name === componentName) return [name, '$value'];
    if (name === 'values' || name === 'formData') return [name, '$values'];
    if (name === 'field') return [name, '$field'];
    if (name === 'event') return [name, '$event'];
    if (name === 'previousValue') return [name, '$previousValue'];
    if (name === 'timestamp') return [name, '$timestamp'];
    if (name === 'dirty') return [name, '$dirty'];
    if (name === 'changedFields') return [name, '$changedFields'];
    if (name === 'detail') return [name, '$detail'];
    if (name === 'context') return [name, '$context'];
    return [name, `$form.${name}`];
  }));
}
