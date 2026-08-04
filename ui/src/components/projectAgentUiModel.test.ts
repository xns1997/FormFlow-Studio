import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectAgentActivity, evidenceKindLabel, formatSummaryText, groupProjectAgentHistoryByTime, humanEventSummary, projectAgentActivityState,
  sessionProjectScope, statusLabels, taskStatus, threadProjectScope,
  type ProjectAgentThread,
} from './projectAgentUiModel';

function thread(overrides: Partial<ProjectAgentThread> = {}): ProjectAgentThread {
  return {
    schemaVersion: 1,
    id: 'pat_test',
    tenantId: 'local',
    userId: 'local',
    projectIds: [],
    projectRevisions: {},
    title: '测试线程',
    profileId: 'default-cloud',
    capabilityBundleVersionId: 'cap_default_v1',
    mode: 'plan',
    status: 'idle',
    messages: [],
    summary: '',
    events: [],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

test('status labels cover every thread status', () => {
  for (const status of ['idle', 'planning', 'awaiting_plan_approval', 'executing', 'awaiting_operation_approval', 'paused', 'completed', 'blocked', 'stopped', 'failed'] as const) {
    assert.ok(statusLabels[status], `缺少 ${status} 的标签`);
  }
});

test('activity state is active only while planning/executing', () => {
  const idle = projectAgentActivityState(thread(), 0);
  assert.equal(idle.active, false);
  const running = projectAgentActivityState(thread({ status: 'executing', events: [{ id: 'e1', seq: 1, type: 'task_started', data: { taskId: 't1' }, createdAt: '2026-08-03T00:00:01.000Z' }] }), Date.parse('2026-08-03T00:02:01.000Z'));
  assert.equal(running.active, true);
  assert.equal(running.stale, true);
  assert.match(running.label, /正在判断下一步/);
});

test('thread project scope de-duplicates ids', () => {
  assert.deepEqual(threadProjectScope(thread({ projectIds: ['p1', 'p2'], currentProjectId: 'p1' })), ['p1', 'p2']);
  assert.deepEqual(sessionProjectScope({ projectIds: ['p1'], currentProjectId: 'p1' }), ['p1']);
});

test('task status normalizes unknown values to pending', () => {
  assert.equal(taskStatus('passed'), 'passed');
  assert.equal(taskStatus('cancelled'), 'cancelled');
  assert.equal(taskStatus('whatever'), 'pending');
});

test('history grouping separates pinned/today/recent/earlier', () => {
  const now = new Date('2026-08-03T12:00:00Z').getTime();
  const items = [
    { id: 'a', pinnedAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-03T00:00:00Z' },
    { id: 'b', updatedAt: '2026-08-03T10:00:00Z' },
    { id: 'c', updatedAt: '2026-08-01T10:00:00Z' },
    { id: 'd', updatedAt: '2026-07-01T10:00:00Z' },
  ];
  const groups = groupProjectAgentHistoryByTime(items, now);
  assert.deepEqual(groups.pinned.map((item) => item.id), ['a']);
  assert.deepEqual(groups.today.map((item) => item.id), ['b']);
  assert.deepEqual(groups.recent.map((item) => item.id), ['c']);
  assert.deepEqual(groups.earlier.map((item) => item.id), ['d']);
});

test('activity feed maps known event types', () => {
  const events = [
    { id: 'e1', seq: 1, type: 'task_started', data: {}, createdAt: '2026-08-03T00:00:01.000Z' },
    { id: 'e2', seq: 2, type: 'approval_required', data: { toolName: 'project.delete' }, createdAt: '2026-08-03T00:00:02.000Z' },
    { id: 'e3', seq: 3, type: 'thread_completed', data: {}, createdAt: '2026-08-03T00:00:03.000Z' },
  ];
  const activities = buildProjectAgentActivity(events);
  assert.equal(activities.length, 3);
  assert.equal(activities[1].kind, 'approval');
  assert.equal(activities[2].status, 'passed');
});

test('formatSummaryText never leaks object placeholders and truncates long text', () => {
  const plain = formatSummaryText('工具 data_source.list 执行成功');
  assert.equal(plain.short, '工具 data_source.list 执行成功');
  assert.equal(plain.full, '工具 data_source.list 执行成功');

  const object = formatSummaryText({ project: { id: 'p1' }, release: { mode: 'design' } }, 30);
  assert.doesNotMatch(object.short, /\[object Object\]/);
  assert.match(object.short, /p1/);
  assert.match(object.full, /"project"/);
  assert.ok(object.short.endsWith('…'));

  const jsonString = formatSummaryText('{"a":{"b":1}}');
  assert.equal(jsonString.full, '{\n  "a": {\n    "b": 1\n  }\n}');
  assert.equal(jsonString.short, '{ "a": { "b": 1 } }');

  const empty = formatSummaryText(null);
  assert.equal(empty.short, '');
  assert.equal(empty.full, '');
});

test('humanEventSummary renders object summaries without object placeholders', () => {
  const event = { id: 'e1', seq: 1, type: 'thread_project_bound', data: { summary: { project: { id: 'p1' } } }, createdAt: '2026-08-03T00:00:00.000Z' };
  const summary = humanEventSummary(event as any);
  assert.doesNotMatch(summary, /\[object Object\]/);
  assert.match(summary, /p1/);
  const exact = humanEventSummary({ id: 'e2', seq: 2, type: 'tool_observation', data: { summary: { project: { id: 'p1' } } }, createdAt: '2026-08-03T00:00:00.000Z' } as any);
  assert.doesNotMatch(exact, /\[object Object\]/);
});

test('evidence kind labels cover known verification kinds', () => {
  assert.equal(evidenceKindLabel('formal_verification'), '形式化验证');
  assert.equal(evidenceKindLabel('structural_validation'), '结构校验');
  assert.equal(evidenceKindLabel('tool_result'), '工具结果');
  assert.equal(evidenceKindLabel('unknown-kind'), '证据');
});
