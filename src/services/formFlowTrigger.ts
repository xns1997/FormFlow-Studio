import type { ComponentNode } from '../models';
import type { SrcTableEntry, WorkflowFile } from '../project/types';
import { loadNodeRegistry } from '../flowRegistry';
import { executeFlow, type FlowExecutionResult } from './flowEngine';

export type FormControlEventName = 'onChange' | 'onBlur' | 'onFocus' | 'onClick' | string;

export interface FormFlowTriggerConfig {
  enabled: boolean;
  workflowId: string;
  parameterMap?: Record<string, unknown>;
  targetNodeId?: string;
}

export interface FormControlEventContext {
  eventName: FormControlEventName;
  field: string;
  value: unknown;
  values: Record<string, unknown>;
  originalValues?: Record<string, unknown>;
  detail?: unknown;
  component: ComponentNode;
}

function resolvePath(source: unknown, path: string[]): unknown {
  return path.reduce((value: any, key) => value == null ? undefined : value[key], source as any);
}

export function resolveFormFlowValue(expression: unknown, context: FormControlEventContext): unknown {
  if (Array.isArray(expression)) return expression.map((item) => resolveFormFlowValue(item, context));
  if (expression && typeof expression === 'object') {
    return Object.fromEntries(Object.entries(expression).map(([key, value]) => [key, resolveFormFlowValue(value, context)]));
  }
  if (typeof expression !== 'string') return expression;
  const exact: Record<string, unknown> = {
    '$value': context.value,
    '$field': context.field,
    '$event': context.eventName,
    '$values': context.values,
    '$formData': context.values,
    '$originalValues': context.originalValues || {},
    '$component': context.component,
    '$componentId': context.component.id,
    '$detail': context.detail,
  };
  if (Object.prototype.hasOwnProperty.call(exact, expression)) return exact[expression];
  if (expression.startsWith('$form.')) return resolvePath(context.values, expression.slice(6).split('.'));
  if (expression.startsWith('$original.')) return resolvePath(context.originalValues || {}, expression.slice(10).split('.'));
  if (expression.startsWith('$component.')) return resolvePath(context.component, expression.slice(11).split('.'));
  if (expression.startsWith('$detail.')) return resolvePath(context.detail, expression.slice(8).split('.'));
  return expression;
}

export function resolveFormFlowParameters(config: FormFlowTriggerConfig, context: FormControlEventContext): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    value: context.value,
    field: context.field,
    event: context.eventName,
    values: context.values,
    formData: context.values,
    componentId: context.component.id,
    component: context.component,
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

export async function executeFormFlowTrigger(
  workflow: WorkflowFile,
  config: FormFlowTriggerConfig,
  context: FormControlEventContext,
  tables: SrcTableEntry[] = [],
): Promise<FlowExecutionResult> {
  await loadNodeRegistry();
  const parameters = resolveFormFlowParameters(config, context);
  const { variables, nodeInputs } = splitFlowParameterTargets(workflow, parameters);
  return executeFlow(
    workflow.nodes.map((node) => ({ id: node.id, specId: node.specId, position: node.position, data: node.data })),
    workflow.edges.map((edge) => ({ ...edge })),
    tables,
    { targetNodeId: config.targetNodeId, variables, nodeInputs },
  );
}

export function getWorkflowVariableNames(workflow: WorkflowFile | undefined): string[] {
  if (!workflow) return [];
  const names: string[] = [];
  for (const node of workflow.nodes) {
    if (node.specId !== 'generic:variable-input') continue;
    try {
      const raw = node.data?.propertiesJson;
      const properties = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
      const name = String((properties as any).varName || '').trim();
      if (name && !names.includes(name)) names.push(name);
    } catch {}
  }
  return names;
}

export function createDefaultParameterMap(workflow: WorkflowFile | undefined, componentName: string): Record<string, unknown> {
  return Object.fromEntries(getWorkflowVariableNames(workflow).map((name) => {
    if (name === 'value' || name === componentName) return [name, '$value'];
    if (name === 'values' || name === 'formData') return [name, '$values'];
    if (name === 'field') return [name, '$field'];
    if (name === 'event') return [name, '$event'];
    return [name, `$form.${name}`];
  }));
}
