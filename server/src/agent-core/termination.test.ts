import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCKED_THRESHOLD, NO_PROGRESS_THRESHOLD, blocked, blockingFingerprint,
  budgetExhausted, progressFingerprint, recordBlockedCondition, recordProgress, stalled,
} from './termination';
import type { AgentThread } from './types';

function thread(): AgentThread {
  return {
    schemaVersion: 1,
    id: 'pat_t',
    tenantId: 'local',
    userId: 'local',
    projectIds: [],
    projectRevisions: {},
    title: 't',
    profileId: 'p',
    capabilityBundleVersionId: 'b',
    mode: 'plan',
    status: 'executing',
    messages: [],
    summary: '',
    events: [],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    recoveryCycles: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test('no-progress detection requires two consecutive identical fingerprints', () => {
  const value = thread();
  const before = progressFingerprint(value);
  value.decisionSteps = 1;
  const same = progressFingerprint(value);
  assert.equal(before, same);
  recordProgress(value, before);
  assert.equal(value.consecutiveNoProgress, 1);
  assert.equal(stalled(value), false);
  recordProgress(value, same);
  assert.equal(value.consecutiveNoProgress, 2);
  assert.equal(stalled(value), true);
  assert.equal(NO_PROGRESS_THRESHOLD, 2);
});

test('task completion changes the fingerprint and resets no-progress', () => {
  const value = thread();
  const first = progressFingerprint(value);
  value.plan = {
    id: 'plan_1',
    revision: 1,
    request: 'r',
    goal: 'g',
    successCriteria: [],
    summary: '',
    assumptions: [],
    risks: [],
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    tasks: [{ id: 't1', title: 't1', instruction: 'i', scope: 'project', access: 'write', acceptance: [], status: 'passed', attempt: 0, maxAttempts: 3, toolSteps: 1, evidence: [], createdAt: '', updatedAt: '' }],
  };
  const second = progressFingerprint(value);
  assert.notEqual(first, second);
  recordProgress(value, first);
  assert.equal(value.consecutiveNoProgress, 0);
});

test('successful tool observations count as progress (read steps do not stall)', () => {
  const value = thread();
  const before = progressFingerprint(value);
  value.events = [
    { id: 'e1', seq: 1, type: 'tool_observation', data: { toolName: 'project.get', status: 'succeeded', summary: '读取完成' }, createdAt: new Date().toISOString() },
    { id: 'e2', seq: 2, type: 'tool_observation', data: { toolName: 'project.validate', status: 'succeeded', summary: '校验通过' }, createdAt: new Date().toISOString() },
  ];
  const after = progressFingerprint(value);
  assert.notEqual(before, after);
  recordProgress(value, before);
  assert.equal(value.consecutiveNoProgress, 0);
});

test('same blocking condition three times marks the thread blocked', () => {
  const value = thread();
  const fingerprint = blockingFingerprint('validation', '项目结构校验未通过');
  recordBlockedCondition(value, fingerprint);
  recordBlockedCondition(value, fingerprint);
  assert.equal(blocked(value), false);
  recordBlockedCondition(value, fingerprint);
  assert.equal(value.blockedCount, 3);
  assert.equal(blocked(value), true);
  assert.equal(BLOCKED_THRESHOLD, 3);
  const other = blockingFingerprint('permission', '无权访问');
  recordBlockedCondition(value, other);
  assert.equal(value.blockedCount, 1);
});

test('budget exhaustion pauses at the configured decision-step cap', () => {
  const value = thread();
  value.decisionSteps = 39;
  assert.equal(budgetExhausted(value, 40), false);
  value.decisionSteps = 40;
  assert.equal(budgetExhausted(value, 40), true);
});
