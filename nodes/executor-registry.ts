import type { SrcTableEntry } from '../src/project/types';
import type { FlowSideEffect } from '../src/services/flowSideEffects';
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

export function registerExecutor(nodeId: string, fn: NodeExecutorFn) {
  executors.set(nodeId, fn);
}

export function getExecutor(nodeId: string): NodeExecutorFn | undefined {
  return executors.get(nodeId);
}

export function hasExecutor(nodeId: string): boolean {
  return executors.has(nodeId);
}

export { checkPortType, assertPortType, checkPortValues };
