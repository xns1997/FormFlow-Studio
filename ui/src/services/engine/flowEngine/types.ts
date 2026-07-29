/**
 * Types for the flow engine.
 */
import type { FlowSideEffect } from '../flowSideEffects';
import type { DebugEntry } from '../../../project/types';

export interface FlowNodeDef {
  id: string;
  specId: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
}

export interface FlowEdgeDef {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  specId: string;
  label: string;
  success: boolean;
  outputs: Record<string, unknown>;
  sideEffects: FlowSideEffect[];
  error?: string;
  duration: number;
  inputKeys?: string[];
  outputKeys?: string[];
}

export interface FlowExecutionResult {
  success: boolean;
  nodeResults: Map<string, NodeExecutionResult>;
  finalOutputs: Record<string, unknown>;
  sideEffects: FlowSideEffect[];
  errors: string[];
  totalDuration: number;
  debug?: {
    requestId?: string;
    workflowId?: string;
    executedNodeCount: number;
    exportKeys: string[];
    duration: number;
    errors: string[];
    events: DebugEntry[];
  };
}

export interface ExecuteFlowOptions {
  idempotencyKey?: string;
  targetNodeId?: string;
  variables?: Record<string, unknown>;
  nodeInputs?: Record<string, Record<string, unknown>>;
  workflowId?: string;
  checkpointId?: string;
  resumeFromCheckpoint?: boolean;
  keepCheckpointOnSuccess?: boolean;
  onNodeFailure?: 'abort' | 'skip' | 'continue';
  timeoutMs?: number;
  nodeTimeoutMs?: number;
  parallel?: boolean;
  isolatedScopes?: boolean;
  debug?: boolean;
  transactionalSideEffects?: boolean;
}
