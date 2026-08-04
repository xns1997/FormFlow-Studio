/**
 * Codex-style termination semantics: 2 consecutive no-progress steps pause
 * and ask the user; the same blocking condition 3 times marks the thread
 * blocked; decision-step budgets pause execution.
 */
import type { AgentThread } from './types';

export const NO_PROGRESS_THRESHOLD = 2;
export const BLOCKED_THRESHOLD = 3;

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

export function recordProgress(thread: AgentThread, previous: string) {
  const current = progressFingerprint(thread);
  if (current === previous) {
    thread.consecutiveNoProgress += 1;
  } else {
    thread.consecutiveNoProgress = 0;
  }
  return current;
}

export function blockingFingerprint(failureClass: string | undefined, message: string | undefined) {
  const normalized = (message || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return `${failureClass || 'unknown'}:${normalized}`;
}

export function recordBlockedCondition(thread: AgentThread, fingerprint: string) {
  if (thread.blockedConditionFingerprint === fingerprint) {
    thread.blockedCount += 1;
  } else {
    thread.blockedConditionFingerprint = fingerprint;
    thread.blockedCount = 1;
  }
  return thread.blockedCount;
}

export function stalled(thread: AgentThread) {
  return thread.consecutiveNoProgress >= NO_PROGRESS_THRESHOLD;
}

export function blocked(thread: AgentThread) {
  return thread.blockedCount >= BLOCKED_THRESHOLD;
}

export function budgetExhausted(thread: AgentThread, maxDecisionSteps: number) {
  return thread.decisionSteps >= maxDecisionSteps;
}
