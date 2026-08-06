/**
 * Agent Loop facade（v2 harness）。
 *
 * 组装 FormFlow 的 HarnessComponents 注入通用 AgentLoop；对外保留
 * runTurn / executeAction / recordToolResult / classifyFailure /
 * appendToolObservation 等既有导出，路由与测试无需感知 harness 结构。
 */
import { formFlowHarness, recordToolResult as formFlowRecordToolResult } from './formflow-harness';
import { classifyFailureMessage, runTurn as harnessRunTurn } from './harness/agent-loop';
import { storeEventEmitter } from './harness/events';
import { shouldAutoApproveOperation } from './policy';
import type { AgentThread, CapabilityBundleVersion, FailureClass, LoopDecision, LoopObservation, LoopQuestion, RunContext } from './types';
import type { McpRole } from '../services/tool-shared';
import type { HarnessToolResult } from './harness/types';

export type ActionOutcome = 'succeeded' | 'failed' | 'waiting' | 'refreshed';

export { shouldAutoApproveOperation };
export type { LoopDecision, LoopQuestion };

/** 主循环：组装 FormFlow harness 后执行一个 Turn。 */
export async function runTurn(
  thread: AgentThread,
  run: RunContext,
  hooks: Parameters<typeof harnessRunTurn>[3] = {},
) {
  return harnessRunTurn(thread, run, formFlowHarness(), hooks);
}

/** 执行单个决策动作（工具调用或 plan.update）。 */
export async function executeAction(
  thread: AgentThread,
  run: RunContext,
  decision: LoopDecision,
  bundle: CapabilityBundleVersion,
): Promise<ActionOutcome> {
  return formFlowHarness().tools.execute(thread, run, decision, bundle);
}

function toHarnessResult(result: any): HarnessToolResult {
  return {
    ok: result?.ok === true,
    data: result?.data,
    meta: result?.meta,
    error: 'error' in result ? result.error : undefined,
    status: 'status' in result ? result.status : undefined,
    confirmation: 'confirmation' in result ? result.confirmation : undefined,
  };
}

/** 记录工具结果（审批决策路径使用）。 */
export async function recordToolResult(
  thread: AgentThread,
  run: RunContext,
  decision: Pick<LoopDecision, 'toolName' | 'scope' | 'arguments'>,
  scope: McpRole,
  result: any,
  effectiveArguments?: Record<string, any>,
): Promise<ActionOutcome> {
  return formFlowRecordToolResult(thread, run, decision, scope, toHarnessResult(result), effectiveArguments, storeEventEmitter());
}

/** 追加工具观察事件。 */
export function appendToolObservation(thread: AgentThread, observation: LoopObservation) {
  storeEventEmitter().observe(thread, observation);
}

/** 失败分类（harness 通用规则）。 */
export function classifyFailure(message: string, code?: string): FailureClass {
  return classifyFailureMessage(message, code) as FailureClass;
}
