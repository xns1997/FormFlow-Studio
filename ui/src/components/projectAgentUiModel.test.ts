import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildActivityState, buildProjectAgentActivity, buildUnifiedCards, evidenceKindLabel, formatDuration, formatSummaryText, groupProjectAgentHistoryByTime, humanEventSummary, projectAgentActivityState,
  sessionProjectScope, statusLabels, threadProjectScope,
  type ProjectAgentThread,
} from './projectAgentUiModel';

function thread(overrides: Partial<ProjectAgentThread> = {}): ProjectAgentThread {
  return {
    schemaVersion: 2,
    id: 'pat_test',
    tenantId: 'local',
    userId: 'local',
    projectIds: [],
    projectRevisions: {},
    title: '测试线程',
    profileId: 'default-cloud',
    capabilityBundleVersionId: 'cap_default_v1',
    status: 'idle',
    turns: [],
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
  for (const status of ['idle', 'executing', 'awaiting_operation_approval', 'paused', 'completed', 'blocked', 'stopped', 'failed'] as const) {
    assert.ok(statusLabels[status], `缺少 ${status} 的标签`);
  }
});

test('activity state is active only while planning/executing', () => {
  const idle = projectAgentActivityState(thread(), 0);
  assert.equal(idle.active, false);
  const running = projectAgentActivityState(thread({ status: 'executing', events: [{ id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: '2026-08-03T00:00:01.000Z' }] }), Date.parse('2026-08-03T00:02:01.000Z'));
  assert.equal(running.active, true);
  assert.equal(running.stale, true);
  assert.match(running.label, /正在判断下一步/);
});

test('thread project scope de-duplicates ids', () => {
  assert.deepEqual(threadProjectScope(thread({ projectIds: ['p1', 'p2'], currentProjectId: 'p1' })), ['p1', 'p2']);
  assert.deepEqual(sessionProjectScope({ projectIds: ['p1'], currentProjectId: 'p1' }), ['p1']);
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
    { id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: '2026-08-03T00:00:01.000Z' },
    { id: 'e2', seq: 2, type: 'verification.failed', data: { summary: '结构校验未通过' }, createdAt: '2026-08-03T00:00:02.000Z' },
    { id: 'e3', seq: 3, type: 'thread_completed', data: {}, createdAt: '2026-08-03T00:00:03.000Z' },
  ];
  const activities = buildProjectAgentActivity(events);
  assert.equal(activities.length, 3);
  assert.equal(activities[0].kind, 'tool');
  assert.equal(activities[1].kind, 'verification');
  assert.equal(activities[2].status, 'passed');
});

test('activity state reflects the latest executing event with a spinner', () => {
  const now = Date.parse('2026-08-03T00:00:03.000Z');
  const value = thread({
    status: 'executing',
    events: [{ id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: new Date(now).toISOString() }],
  });
  const activity = buildActivityState(value, now);
  assert.equal(activity.active, true);
  assert.equal(activity.spinner, true);
  assert.ok(activity.label.includes('form.create'));
  const idle = buildActivityState(thread({ status: 'paused' }), now);
  assert.equal(idle.active, false);
});

test('formatDuration renders seconds and minutes', () => {
  assert.equal(formatDuration(3500), '4s');
  assert.equal(formatDuration(125000), '2m 5s');
  assert.equal(formatDuration(120000), '2m');
  assert.equal(formatDuration(-1), '');
});

test('buildUnifiedCards merges plan, messages and events into a chronological card list', () => {
  const value = thread({
    status: 'executing',
    dynamicPlan: {
      goal: '员工系统', successCriteria: ['表存在'], summary: '', steps: ['建表'], assumptions: [], risks: [],
      updatedAt: '2026-08-03T00:00:00.000Z', updatedBy: 'system',
    },
    messages: [{ id: 'm1', role: 'user', kind: 'prompt', content: '创建员工系统', createdAt: '2026-08-03T00:00:01.000Z' }],
    events: [{ id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'project.create' }, createdAt: '2026-08-03T00:00:02.000Z' }],
    turns: [],
  });
  const cards = buildUnifiedCards(value);
  assert.equal(cards[0].kind, 'plan');
  assert.equal(cards[0].state, 'running', '执行中的计划卡应显示运行态');
  const messageIndex = cards.findIndex((card) => card.kind === 'message');
  const eventIndex = cards.findIndex((card) => card.kind === 'event');
  assert.ok(messageIndex >= 0, '应包含消息卡片');
  assert.ok(eventIndex >= 0, '应包含事件卡片');
  assert.ok(messageIndex < eventIndex, '消息应按时间排在事件之前');

  const done = buildUnifiedCards(thread({ status: 'completed', dynamicPlan: value.dynamicPlan }));
  assert.equal(done[0].state, 'passed', '完成的线程其计划卡应为完成态');
  assert.equal(done[0].kind, 'plan');
});

test('buildUnifiedCards merges verification started and result into one card', () => {
  const value = thread({
    status: 'completed',
    events: [
      { id: 'e1', seq: 1, type: 'verification.started', data: { projectId: 'p1', kind: 'write' }, createdAt: '2026-08-03T00:00:01.000Z' },
      { id: 'e2', seq: 2, type: 'verification.completed', data: { projectId: 'p1', kind: 'write', summary: '结构校验通过' }, createdAt: '2026-08-03T00:00:02.000Z' },
      { id: 'e3', seq: 3, type: 'verification.started', data: { kind: 'write' }, createdAt: '2026-08-03T00:00:03.000Z' },
    ],
  });
  const cards = buildUnifiedCards(value);
  const verifyCards = cards.filter((card) => card.kind === 'event' && (card.title.includes('验证') || card.title.includes('开始验证')));
  assert.equal(verifyCards.length, 2, '开始与结果应合并为一张卡，进行中的验证另算一张');
  const merged = cards.find((card) => card.key === 'card:verify:1');
  assert.ok(merged, '合并卡应使用开始事件作为稳定 key');
  assert.equal(merged?.state, 'passed');
  assert.equal(merged?.title, '验证通过。');
  assert.match(merged?.meta ?? '', /→/);
  assert.match(merged?.body ?? '', /结构校验通过/);
  const running = cards.find((card) => card.key === 'card:verify:3');
  assert.ok(running, '未结束的验证应保留运行态卡片');
  assert.equal(running?.state, 'running');
  assert.equal(running?.title, '正在验证…');
  assert.ok(!cards.some((card) => card.title === '开始验证。'), '不应再出现独立的开始验证卡片');
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
