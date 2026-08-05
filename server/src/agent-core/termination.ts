/**
 * Codex-style termination semantics: 2 consecutive no-progress steps pause
 * and ask the user; the same blocking condition 3 times marks the thread
 * blocked; decision-step budgets pause execution.
 */
import type { AgentThread } from './types';

export const NO_PROGRESS_THRESHOLD = 2;
export const BLOCKED_THRESHOLD = 3;

/** 当前进度的稳定指纹（用于检测连续无进展）。 */
export function progressFingerprint(thread: AgentThread) {
  const tasks = (thread.plan?.tasks || []).map((task) => `${task.id}:${task.status}:${task.attempt}:${task.evidence.length}`);
  let lastSuccessfulObservation = 0;
  for (const event of thread.events) {
    if (event.type === 'tool_observation' && event.data?.status === 'succeeded') {
      lastSuccessfulObservation = Math.max(lastSuccessfulObservation, event.seq);
    }
  }
  return JSON.stringify({
    tasks,
    revisions: thread.projectRevisions,
    summaryLength: thread.summary.length,
    evidenceCount: (thread.plan?.tasks || []).reduce((total, task) => total + task.evidence.length, 0),
    lastSuccessfulObservation,
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
