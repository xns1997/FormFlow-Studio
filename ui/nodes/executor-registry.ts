import type { SrcTableEntry } from '../src/project/types';
import type { FlowSideEffect } from '../src/services/engine/flowSideEffects';
import { checkPortType, assertPortType, checkPortValues, type TypeCheckResult } from './port-types';

export interface NodeExecContext {
  inputs: Record<string, unknown>;
  properties: Record<string, unknown>;
  tables: SrcTableEntry[];
  getNodeOutput: (nodeId: string) => Record<string, unknown>;
  checkType: (type: string, value: unknown) => TypeCheckResult;
  assertType: (type: string, value: unknown, portName?: string) => unknown;
}

export interface NodeExecResult {
  [portName: string]: unknown;
  sideEffects?: FlowSideEffect[];
}

export type NodeExecutorFn = (ctx: NodeExecContext) => Promise<NodeExecResult> | NodeExecResult;

const executors = new Map<string, NodeExecutorFn>();

/** 注册节点执行器。 */
export function registerExecutor(nodeId: string, fn: NodeExecutorFn) {
  executors.set(nodeId, fn);
}

/** 获取节点执行器。 */
export function getExecutor(nodeId: string): NodeExecutorFn | undefined {
  return executors.get(nodeId);
}

/** 节点是否有已注册执行器。 */
export function hasExecutor(nodeId: string): boolean {
  return executors.has(nodeId);
}

export { checkPortType, assertPortType, checkPortValues };
