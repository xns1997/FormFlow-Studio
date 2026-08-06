/**
 * Codex-style termination semantics: 2 consecutive no-progress steps pause
 * and ask the user; the same blocking condition 3 times marks the thread
 * blocked; decision-step budgets pause execution.
 */
import type { AgentThread } from './types';

/** 连续无进展阈值（达到则暂停提问）。 */
export const NO_PROGRESS_THRESHOLD = 2;
/** 同一阻塞条件连续阈值（达到则标记 blocked；配合无进展纠正给模型更多修正机会）。 */
export const BLOCKED_THRESHOLD = 5;

/** 当前进度的稳定指纹（用于检测连续无进展）。 */
export function progressFingerprint(thread: AgentThread) {
  let lastProgress = 0;
  let hasWrittenOrVerified = false;
  let postWriteReadsCounted = 0;
  /** 距上次写/验证之间允许的「读额度」：读够真实 id/列名后应继续写；每次写/验证会重置额度。 */
  const POST_WRITE_READ_ALLOWANCE = 12;
  for (const event of thread.events) {
    const isWrite = event.type === 'tool_observation' && event.data?.status === 'succeeded' && (event.data?.changes || []).length > 0;
    const isVerify = event.type === 'verification.completed' || (event.type === 'tool_observation' && event.data?.toolName === 'verify.write' && event.data?.status === 'succeeded');
    if (isWrite || isVerify) {
      hasWrittenOrVerified = true;
      postWriteReadsCounted = 0;
      lastProgress = Math.max(lastProgress, event.seq);
    } else if (!hasWrittenOrVerified && event.type === 'tool_observation' && event.data?.status === 'succeeded') {
      // 首个写/验证之前：成功只读也算进展（探索期），避免开局即被误判无进展。
      lastProgress = Math.max(lastProgress, event.seq);
    } else if (hasWrittenOrVerified && event.type === 'tool_observation' && event.data?.status === 'succeeded' && postWriteReadsCounted < POST_WRITE_READ_ALLOWANCE) {
      // 写后有有限读额度：读取真实 id/列名/现状用，超出后只读不再算进展（防读空转）。
      postWriteReadsCounted += 1;
      lastProgress = Math.max(lastProgress, event.seq);
    }
  }
  return JSON.stringify({
    revisions: thread.projectRevisions,
    summaryLength: thread.summary.length,
    messageCount: thread.messages.length,
    planUpdatedAt: thread.dynamicPlan?.updatedAt,
    lastSuccessfulObservation: lastProgress,
  });
}

/** 记录本轮进度指纹，返回是否发生变化。 */
export function recordProgress(thread: AgentThread, previous: string) {
  const current = progressFingerprint(thread);
  if (current === previous) {
    thread.consecutiveNoProgress += 1;
  } else {
    thread.consecutiveNoProgress = 0;
  }
  return current;
}

/** 阻塞条件的稳定指纹（用于计数同一阻塞）。 */
export function blockingFingerprint(failureClass: string | undefined, message: string | undefined) {
  const normalized = (message || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${failureClass || 'unknown'}:${normalized}`;
}

/** 记录一次阻塞条件。 */
export function recordBlockedCondition(thread: AgentThread, fingerprint: string) {
  if (thread.blockedConditionFingerprint === fingerprint) {
    thread.blockedCount += 1;
  } else {
    thread.blockedConditionFingerprint = fingerprint;
    thread.blockedCount = 1;
  }
  return thread.blockedCount;
}

/** 连续无进展次数达到阈值则暂停提问。 */
export function stalled(thread: AgentThread) {
  return thread.consecutiveNoProgress >= NO_PROGRESS_THRESHOLD;
}

/** 同一阻塞条件连续三次未解决则标记 blocked 并提问。 */
export function blocked(thread: AgentThread) {
  return thread.blockedCount >= BLOCKED_THRESHOLD;
}

/** 决策步数预算耗尽。 */
export function budgetExhausted(thread: AgentThread, maxDecisionSteps: number) {
  return thread.decisionSteps >= maxDecisionSteps;
}
