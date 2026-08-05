import type { DesignComponent, FormLinkageOptionsConfig, SrcTableEntry, WorkflowFile } from '../../project/types';
import type { FormEventExecutionTrace } from '../../project/types';
import type { ComponentNode } from '../../models';
import { exportToComponentNodes } from '../../designer/export';
import type { FormFlowTriggerConfig } from './formFlowTrigger';
import type { FlowExecutionResult } from './flowEngine';
import { executeFormControlEvent, type FormEventCallback } from './formEventExecutor';
import type { FormEventEffect } from './formEventTransaction';

export interface DesignPreviewEventContext {
  eventName: string;
  field: string;
  value: unknown;
  detail?: unknown;
  values: Record<string, unknown>;
  originalValues?: Record<string, unknown>;
  component: DesignComponent;
  previousValue?: unknown;
  timestamp?: number;
  idempotencyKey?: string;
}

export interface DesignPreviewEventResult {
  codeExecuted: boolean;
  flowExecuted: boolean;
  flowResult?: FlowExecutionResult;
  flowResults?: FlowExecutionResult[];
  callbackResult?: unknown;
  trace: FormEventExecutionTrace;
  error?: Error;
}

/** 设计组件绑定字段名。 */
export function getDesignComponentField(component: DesignComponent): string {
  return String(component.fieldBinding || component.props.name || component.id);
}

function asComponentNode(component: DesignComponent): ComponentNode {
  return exportToComponentNodes([component])[0];
}

/** 在设计预览运行时执行事件（模拟表单运行）。 */
export async function executeDesignPreviewEvent(
  context: DesignPreviewEventContext,
  options: {
    workflows: WorkflowFile[];
    tables?: SrcTableEntry[];
    components?: DesignComponent[];
    setValue: (field: string, value: unknown) => void;
    setVisible?: (componentId: string, visible: boolean) => void;
    setDisabled?: (componentId: string, disabled: boolean) => void;
    setRequired?: (field: string, required: boolean) => void;
    applyEffects?: (effects: FormEventEffect[]) => void | Promise<void>;
    setOptions?: (field: string, config: FormLinkageOptionsConfig) => void;
    showMessage?: (message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;
    callbacks?: Record<string, FormEventCallback>;
  },
): Promise<DesignPreviewEventResult> {
  const code = String((context.component.props.events as Record<string, unknown> | undefined)?.[context.eventName] || '').trim();
  const trigger = (context.component.props.flowTriggers as Record<string, FormFlowTriggerConfig> | undefined)?.[context.eventName];
  const result = await executeFormControlEvent({
    eventName: context.eventName,
    field: context.field,
    value: context.value,
    detail: context.detail,
    values: context.values,
    originalValues: context.originalValues || {},
    component: asComponentNode(context.component),
    previousValue: context.previousValue,
    timestamp: context.timestamp,
    idempotencyKey: context.idempotencyKey,
  }, {
    workflows: options.workflows,
    tables: options.tables,
    setValue: options.setValue,
    setVisible: options.setVisible,
    setDisabled: options.setDisabled,
    setRequired: options.setRequired,
    applyEffects: options.applyEffects,
    setOptions: options.setOptions,
    showMessage: options.showMessage,
    callbacks: options.callbacks,
    components: (options.components || [context.component]).map(asComponentNode),
    code,
    trigger,
  });
  return {
    codeExecuted: result.callbackExecuted,
    callbackResult: result.callbackResult,
    flowExecuted: result.flowExecuted,
    flowResult: result.flowResult,
    flowResults: result.flowResults,
    trace: result.trace,
    error: result.error,
  };
}
