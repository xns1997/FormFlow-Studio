import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEventLog, buildSurfaceItems, messageById, planProgress, taskById, threadGroups,
  type ProjectAgentThread,
} from './projectAgentUiModel';

function thread(): ProjectAgentThread {
  const now = '2026-08-03T00:00:00.000Z';
  return {
    schemaVersion: 1,
    id: 'pat_1',
    tenantId: 'local',
    userId: 'local',
    projectIds: ['p1'],
    currentProjectId: 'p1',
    projectRevisions: {},
    title: '员工管理',
    profileId: 'default-cloud',
    capabilityBundleVersionId: 'cap_default_v1',
    mode: 'plan',
    status: 'executing',
    messages: [
      { id: 'm1', role: 'user', kind: 'prompt', content: '创建一个员工管理系统\n包含部门字典', createdAt: now },
      { id: 'm2', role: 'assistant', kind: 'commentary', content: '目标契约已生成', createdAt: now },
    ],
    summary: '',
    events: [
      { id: 'e1', seq: 1, type: 'turn_started', data: {}, createdAt: now },
      { id: 'e2', seq: 2, type: 'tool_observation', data: { toolName: 'project.validate', summary: '校验通过' }, createdAt: now },
    ],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 2,
    archived: false,
    createdAt: now,
    updatedAt: now,
    plan: {
      id: 'plan_1',
      revision: 1,
      request: 'r',
      goal: '员工管理系统',
      successCriteria: ['数据表存在'],
      summary: '',
      assumptions: [],
      risks: [],
      status: 'confirmed',
      createdAt: now,
      tasks: [
        { id: 't1', title: '创建部门字典', instruction: '建表', scope: 'data', access: 'write', acceptance: ['表存在'], status: 'passed', attempt: 0, maxAttempts: 3, toolSteps: 2, evidence: [{ id: 'ev1', kind: 'structural_validation', summary: '校验通过', createdAt: now }], createdAt: now, updatedAt: now },
        { id: 't2', title: '创建员工表单', instruction: '建表单', scope: 'form', access: 'write', acceptance: ['表单存在'], status: 'running', attempt: 1, maxAttempts: 3, toolSteps: 1, evidence: [], createdAt: now, updatedAt: now },
      ],
    },
  };
}

test('surface items are concise one-liners covering messages, plan and tasks', () => {
  const items = buildSurfaceItems(thread());
  const kinds = items.map((item) => item.kind);
  assert.ok(kinds.includes('message'));
  assert.ok(kinds.includes('plan'));
  assert.equal(kinds.filter((kind) => kind === 'task').length, 2);
  for (const item of items) {
    assert.ok(item.title.length > 0);
    if (item.kind !== 'message') assert.ok(item.meta.length > 0);
  }
  const task = items.find((item) => item.ref.taskId === 't2')!;
  assert.equal(task.state, 'running');
  assert.match(task.meta, /×1/);
});

test('plan progress counts passed tasks', () => {
  assert.deepEqual(planProgress(thread()), { total: 2, passed: 1, percent: 50 });
  assert.deepEqual(planProgress({ ...thread(), plan: undefined } as unknown as ProjectAgentThread), { total: 0, passed: 0, percent: 0 });
});

test('detail lookups resolve messages and tasks', () => {
  const value = thread();
  assert.equal(messageById(value, 'm1')?.content, '创建一个员工管理系统\n包含部门字典');
  assert.equal(taskById(value, 't2')?.title, '创建员工表单');
  assert.equal(taskById(value, 'missing'), undefined);
});

test('event log keeps recent events with tool names', () => {
  const events = buildEventLog(thread(), 10);
  assert.equal(events.length, 2);
  assert.equal(events[0].seq, 1);
  assert.equal(events[1].toolName, 'project.validate');
});

test('thread groups split current project, unbound and others', () => {
  const value = thread();
  const groups = threadGroups([value, { ...value, id: 'pat_2', projectIds: [], currentProjectId: undefined }, { ...value, id: 'pat_3', projectIds: ['p9'], currentProjectId: 'p9' }], 'p1');
  assert.deepEqual(groups.current.map((item) => item.id), ['pat_1']);
  assert.deepEqual(groups.unbound.map((item) => item.id), ['pat_2']);
  assert.deepEqual(groups.other.map((item) => item.id), ['pat_3']);
});
