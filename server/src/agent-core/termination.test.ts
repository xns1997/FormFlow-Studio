import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLOCKED_THRESHOLD, NO_PROGRESS_THRESHOLD, blocked, blockingFingerprint,
  budgetExhausted, progressFingerprint, recordBlockedCondition, recordProgress, stalled,
} from './termination';
import type { AgentThread } from './types';

function thread(): AgentThread {
  return {
    schemaVersion: 2,
    id: 'pat_t',
    tenantId: 'local',
    userId: 'local',
    projectIds: [],
    projectRevisions: {},
    title: 't',
    profileId: 'p',
    capabilityBundleVersionId: 'b',
    status: 'executing',
    turns: [],
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

test('dynamic plan update changes the fingerprint and resets no-progress', () => {
  const value = thread();
  const first = progressFingerprint(value);
  value.dynamicPlan = { goal: 'g2', successCriteria: [], summary: '', steps: [], assumptions: [], risks: [], updatedAt: new Date().toISOString(), updatedBy: 'model' };
  const second = progressFingerprint(value);
  assert.notEqual(first, second);
  recordProgress(value, first);
  assert.equal(value.consecutiveNoProgress, 0);
});

test('reads count as progress before the first write and within a post-write allowance', () => {
  const value = thread();
  const before = progressFingerprint(value);
  value.events = [
    { id: 'e1', seq: 1, type: 'tool_observation', data: { toolName: 'project.get', status: 'succeeded', summary: '读取完成' }, createdAt: new Date().toISOString() },
    { id: 'e2', seq: 2, type: 'tool_observation', data: { toolName: 'project.validate', status: 'succeeded', summary: '校验通过' }, createdAt: new Date().toISOString() },
  ];
  assert.notEqual(progressFingerprint(value), before, '首个写之前：成功只读算进展');
  recordProgress(value, before);
  assert.equal(value.consecutiveNoProgress, 0);
  value.events.push({ id: 'e3', seq: 3, type: 'tool_observation', data: { toolName: 'data_source.create', status: 'succeeded', summary: '建表', changes: ['创建数据表'] }, createdAt: new Date().toISOString() });
  const afterWrite = progressFingerprint(value);
  for (let i = 0; i < 5; i += 1) {
    value.events.push({ id: `e${4 + i}`, seq: 4 + i, type: 'tool_observation', data: { toolName: 'project.get', status: 'succeeded', summary: '额度内读取' }, createdAt: new Date().toISOString() });
  }
  assert.notEqual(progressFingerprint(value), afterWrite, '写后读额度内：只读仍算进展');
  for (let i = 0; i < 10; i += 1) {
    value.events.push({ id: `e${9 + i}`, seq: 9 + i, type: 'tool_observation', data: { toolName: 'project.get', status: 'succeeded', summary: '超额读取' }, createdAt: new Date().toISOString() });
  }
  const overQuota = progressFingerprint(value);
  value.events.push({ id: 'e_last', seq: 999, type: 'tool_observation', data: { toolName: 'project.get', status: 'succeeded', summary: '再读一次' }, createdAt: new Date().toISOString() });
  assert.equal(progressFingerprint(value), overQuota, '写后读额度用尽：纯只读不再算进展');
  recordProgress(value, overQuota);
  assert.ok(value.consecutiveNoProgress >= 1, '读额度用尽后只读应累计无进展');
});

test('same blocking condition repeated to the threshold marks the thread blocked', () => {
  const value = thread();
  const fingerprint = blockingFingerprint('validation', '项目结构校验未通过');
  recordBlockedCondition(value, fingerprint);
  recordBlockedCondition(value, fingerprint);
  assert.equal(blocked(value), false);
  recordBlockedCondition(value, fingerprint);
  assert.equal(blocked(value), false);
  recordBlockedCondition(value, fingerprint);
  recordBlockedCondition(value, fingerprint);
  assert.equal(value.blockedCount, 5);
  assert.equal(blocked(value), true);
  assert.equal(BLOCKED_THRESHOLD, 5);
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
