import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectAgentActivity, buildProjectAgentTaskLineages, buildQualityRepairChain, chooseCurrentTaskId, chooseInitialProjectAgentSession, clampProjectAgentWidth, dependencySummary, groupProjectAgentSessions, groupProjectAgentTaskLineages, groupProjectAgentTasks, isAffirmativePlanConfirmation, lineageForTask, projectAgentActivityState, projectAgentSessionStorageKey, requiresPauseBeforeSessionSwitch, summarizeProjectAgentEvent, type ProjectAgentSessionV2, type ProjectAgentTask } from './projectAgentUiModel';

const task = (id: string, status: string, dependsOn: string[] = []): ProjectAgentTask => ({ id, role: 'project', title: `任务 ${id}`, instruction: id, access: 'read', dependsOn, acceptance: [], status, attempt: 1, maxAttempts: 3, evidenceArtifactIds: [] });
const session = (tasks: ProjectAgentTask[], overrides: Partial<ProjectAgentSessionV2> = {}): ProjectAgentSessionV2 => ({ schemaVersion: 2, id: 's1', phase: 'executing', activePlanId: 'p1', plans: [{ id: 'p1', revision: 1, goal: '测试', summary: '', successCriteria: [], assumptions: [], risks: [], tasks, status: 'confirmed' }], questions: [], artifacts: [], events: [], ...overrides });

test('task grouping removes the pinned task and preserves status groups', () => {
  const tasks = [task('running', 'running'), task('pending', 'pending'), task('done', 'passed'), task('failed', 'failed')];
  assert.equal(chooseCurrentTaskId(session(tasks)), 'running');
  assert.deepEqual(Object.fromEntries(Object.entries(groupProjectAgentTasks(tasks, 'running')).map(([key, items]) => [key, items.map((item) => item.id)])), { pending: ['pending'], completed: ['done'], failed: ['failed'] });
});

test('task lineages collapse superseded recovery generations into one logical task', () => {
  const original = { ...task('original', 'superseded'), attempt: 3 };
  const repair = { ...task('repair', 'superseded'), attempt: 1, supersedesTaskId: 'original', origin: 'recovery' as const, generation: 2 };
  const final = { ...task('final', 'passed'), attempt: 2, supersedesTaskId: 'repair', origin: 'recovery' as const, generation: 3 };
  const pending = task('pending', 'pending');
  const lineages = buildProjectAgentTaskLineages([original, pending, repair, final]);
  assert.equal(lineages.length, 2);
  assert.deepEqual(lineages[0].taskIds, ['original', 'repair', 'final']);
  assert.equal(lineages[0].representative.id, 'final');
  assert.equal(lineages[0].totalAttempts, 6);
  assert.equal(lineageForTask(lineages, 'repair')?.id, 'original');
  assert.deepEqual(groupProjectAgentTaskLineages(lineages).completed.map((item) => item.id), ['original']);
});

test('semantic activity coalesces tool events and preserves hidden provider details', () => {
  const events = [
    { seq: 1, type: 'node_started', data: { taskId: 'one' }, createdAt: '2026-07-21T01:00:00Z' },
    { seq: 2, type: 'tool_call', data: { taskId: 'one', name: 'project.get' }, createdAt: '2026-07-21T01:00:01Z' },
    { seq: 3, type: 'tool_started', data: { taskId: 'one', toolName: 'project.get' }, createdAt: '2026-07-21T01:00:02Z' },
    { seq: 4, type: 'tool_completed', data: { taskId: 'one', toolName: 'project.get', result: { ok: true } }, createdAt: '2026-07-21T01:00:03Z' },
    { seq: 5, type: 'message_delta', data: { taskId: 'one', content: 'internal' }, createdAt: '2026-07-21T01:00:04Z' },
    { seq: 6, type: 'verification_completed', data: { taskId: 'one', revision: 'abcdef1234567890' }, createdAt: '2026-07-21T01:00:05Z' },
    { seq: 7, type: 'tool_started', data: { taskId: 'other', toolName: 'form.get' }, createdAt: '2026-07-21T01:00:06Z' },
  ];
  const activity = buildProjectAgentActivity(events, ['one']);
  assert.deepEqual(activity.map((item) => item.title), ['工具执行完成 · project.get', '验收通过']);
  assert.deepEqual(activity[0].eventSeqs, [3, 4]);
  assert.deepEqual(activity[0].technicalEvents.map((event) => event.type), ['node_started', 'tool_call', 'message_delta']);
  assert.equal(activity[1].detail, 'revision abcdef123456');
});

test('pending approval wins automatic task selection and dependencies use titles', () => {
  const tasks = [task('one', 'running'), task('two', 'pending', ['one'])];
  assert.equal(chooseCurrentTaskId(session(tasks, { pendingApproval: { id: 'a1', taskId: 'two', toolName: 'project.delete', confirmation: {} } })), 'two');
  assert.equal(dependencySummary(tasks[1], tasks), '1 个依赖：任务 one');
});

test('quality remediation chain exposes diagnosis, repair, verification and rerun', () => {
  const events = [
    { seq: 1, type: 'quality_gate_failed', data: { taskId: 'quality' }, createdAt: '' },
    { seq: 2, type: 'quality_remediation_scheduled', data: {}, createdAt: '' },
    { seq: 3, type: 'remediation_verification_completed', data: {}, createdAt: '' },
    { seq: 4, type: 'quality_gate_passed', data: {}, createdAt: '' },
  ];
  assert.deepEqual(buildQualityRepairChain(session([task('quality', 'passed')], { events }), task('quality', 'passed')).map((step) => step.state), ['passed', 'passed', 'passed', 'passed']);
});

test('workbench width is bounded by desktop and viewport limits', () => {
  assert.equal(clampProjectAgentWidth(400, 1400), 520);
  assert.equal(clampProjectAgentWidth(1200, 1400), 920);
  assert.equal(clampProjectAgentWidth(780, 700), 676);
});

test('rejected cross-role tools are explained in the task event timeline', () => {
  assert.equal(summarizeProjectAgentEvent({ seq: 9, type: 'tool_rejected', data: { tool_name: 'project.quality.inspect' }, createdAt: '' }), '不安全或越界工具调用已拒绝，正在纠正 · project.quality.inspect');
  assert.equal(summarizeProjectAgentEvent({ seq: 10, type: 'tool_preflight_failed', data: { toolName: 'data_source.create' }, createdAt: '' }), '工具参数预检未通过 · data_source.create');
});

test('session helpers preserve scope, remembered selection and safe switching', () => {
  const sessions = [{ id: 'project-a', projectId: 'a', projectIds: ['a', 'b'] }, { id: 'unbound' }, { id: 'project-b', projectId: 'b', projectIds: ['b'] }];
  assert.equal(chooseInitialProjectAgentSession(sessions, 'unbound')?.id, 'unbound');
  assert.equal(chooseInitialProjectAgentSession(sessions, 'missing')?.id, 'project-a');
  assert.deepEqual(Object.fromEntries(Object.entries(groupProjectAgentSessions(sessions, 'a')).map(([key, items]) => [key, items.map((item) => item.id)])), { currentProject: ['project-a'], unbound: ['unbound'], otherProjects: ['project-b'] });
  assert.equal(projectAgentSessionStorageKey('a'), 'formflow.projectAgent.activeSession.a');
  assert.equal(projectAgentSessionStorageKey(), 'formflow.projectAgent.activeSession.global');
  assert.equal(requiresPauseBeforeSessionSwitch('recovering'), true);
  assert.equal(requiresPauseBeforeSessionSwitch('paused'), false);
});

test('affirmative plan confirmation only accepts exact confirmation commands', () => {
  for (const value of ['确认', '确认执行', '执行。', '继续！']) assert.equal(isAffirmativePlanConfirmation(value), true);
  for (const value of ['确认，但先修改表单', '继续完善计划', '开始新任务']) assert.equal(isAffirmativePlanConfirmation(value), false);
});

test('activity state distinguishes real execution from an SSE connection', () => {
  const now = new Date('2026-07-20T10:00:30.000Z').getTime();
  const planning = session([], { phase: 'planning', events: [
    { seq: 1, type: 'phase_changed', data: { phase: 'planning' }, createdAt: '2026-07-20T10:00:00.000Z' },
    { seq: 2, type: 'planning_attempt_started', data: {}, createdAt: '2026-07-20T10:00:10.000Z' },
  ] });
  assert.deepEqual(projectAgentActivityState(planning, now), { active: true, label: '正在生成可确认的任务图', detail: '最近进度：正在请求模型生成计划', startedAt: new Date('2026-07-20T10:00:00.000Z').getTime(), lastEventAt: new Date('2026-07-20T10:00:10.000Z').getTime(), stale: false });
  assert.equal(projectAgentActivityState({ ...planning, phase: 'awaiting_plan_approval' }, now).active, false);
  assert.equal(projectAgentActivityState(planning, now + 60_000).stale, true);
});
