import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectAgentActivity, buildProjectAgentTaskLineages, buildProjectAgentTimeline, buildQualityRepairChain, chooseCurrentTaskId, chooseInitialProjectAgentSession, clampProjectAgentWidth, dependencySummary, groupProjectAgentHistoryByTime, groupProjectAgentSessions, groupProjectAgentTaskLineages, groupProjectAgentTasks, isAffirmativePlanConfirmation, lineageForTask, projectAgentActivityState, projectAgentSessionStorageKey, projectAgentWorkNarrative, requiresPauseBeforeSessionSwitch, shouldProjectAgentTimelineFollow, summarizeProjectAgentEvent, type ProjectAgentSessionV2, type ProjectAgentTask } from './projectAgentUiModel';

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
  assert.deepEqual(activity.map((item) => item.title), ['已读取项目完整配置', '验收通过']);
  assert.deepEqual(activity[0].eventSeqs, [3, 4]);
  assert.deepEqual(activity[0].technicalEvents.map((event) => event.type), ['node_started', 'tool_call', 'message_delta']);
  assert.equal(activity[1].detail, undefined);
});

test('tool activity explains the business action and useful result instead of a generic success', () => {
  const activity = buildProjectAgentActivity([{ seq: 1, type: 'tool_completed', data: { taskId: 'create-project', toolName: 'project.initialize', result: { ok: true, data: { project: { config: { name: '灵活就业分析' } }, validation: { valid: true, counts: { dataSources: 4, forms: 2, workflows: 2, outputs: 1 } } } } }, createdAt: '2026-07-22T02:55:41Z' }], ['create-project']);
  assert.equal(activity[0].title, '已创建并初始化项目');
  assert.equal(activity[0].detail, '“灵活就业分析” · 4 张数据表、2 个表单、2 条流程、1 个输出 · 结构校验通过');
  assert.doesNotMatch(`${activity[0].title}\n${activity[0].detail}`, /taskId|revision|requestId|已获得执行结果/);
});

test('revision recovery is readable and hides technical conflict details', () => {
  const activity = buildProjectAgentActivity([
    { seq: 1, type: 'tool_started', data: { taskId: 'edit-form', toolName: 'form.update' }, createdAt: '2026-07-22T03:00:00Z' },
    { seq: 2, type: 'tool_completed', data: { taskId: 'edit-form', toolName: 'form.update', recoveringRevision: true, result: { ok: false, error: { code: 'PROJECT_REVISION_CONFLICT', message: '原始冲突详情' } } }, createdAt: '2026-07-22T03:00:01Z' },
    { seq: 3, type: 'revision_recompute_started', data: { taskId: 'edit-form' }, createdAt: '2026-07-22T03:00:02Z' },
    { seq: 4, type: 'revision_recompute_completed', data: { taskId: 'edit-form' }, createdAt: '2026-07-22T03:00:03Z' },
  ], ['edit-form']);
  const copy = activity.map((item) => `${item.title}\n${item.detail || ''}`).join('\n');
  assert.match(copy, /正在重新核对/);
  assert.match(copy, /已读取最新状态/);
  assert.doesNotMatch(copy, /PROJECT_REVISION_CONFLICT|原始冲突详情|revision/);
  assert.equal(activity.some((item) => item.status === 'failed'), false);
});

test('recoverable tool errors stay with the current expert instead of appearing as task failure', () => {
  const activity = buildProjectAgentActivity([
    { seq: 1, type: 'tool_started', data: { taskId: 'form-task', toolName: 'form.create' }, createdAt: '2026-07-22T03:00:00Z' },
    { seq: 2, type: 'tool_completed', data: { taskId: 'form-task', toolName: 'form.create', expertInvestigating: true, result: { ok: false, error: { code: 'INVALID_ARGUMENT', message: '控件类型无效' } } }, createdAt: '2026-07-22T03:00:01Z' },
    { seq: 3, type: 'expert_diagnosis_started', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:02Z' },
    { seq: 4, type: 'expert_repair_completed', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:03Z' },
  ], ['form-task']);
  assert.equal(activity.some((item) => item.status === 'failed'), false);
  assert.match(activity.map((item) => item.title).join('\n'), /专家正在查找原因/);
  assert.match(activity.map((item) => item.title).join('\n'), /专家已修正问题/);
  assert.doesNotMatch(activity.map((item) => `${item.title}${item.detail || ''}`).join('\n'), /INVALID_ARGUMENT/);
});

test('expert assistance reads as a handoff and return to the original expert', () => {
  const activity = buildProjectAgentActivity([
    { seq: 1, type: 'expert_assistance_requested', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:00Z' },
    { seq: 2, type: 'expert_assistance_assigned', data: { taskId: 'form-task', helperRole: 'data' }, createdAt: '2026-07-22T03:00:01Z' },
    { seq: 3, type: 'expert_assistance_started', data: { taskId: 'form-task', helperRole: 'data' }, createdAt: '2026-07-22T03:00:02Z' },
    { seq: 4, type: 'expert_assistance_completed', data: { taskId: 'form-task', helperRole: 'data' }, createdAt: '2026-07-22T03:00:03Z' },
    { seq: 5, type: 'task_resumed', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:04Z' },
    { seq: 6, type: 'expert_resumed_after_assistance', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:05Z' },
    { seq: 7, type: 'expert_resumed_completed', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:06Z' },
  ], ['form-task']);
  const titles = activity.map((item) => item.title).join('\n');
  assert.match(titles, /需要其他专家协助/); assert.match(titles, /协助专家正在解决阻断/); assert.match(titles, /协助专家已解决阻断/); assert.match(titles, /原专家从卡住的位置继续/); assert.match(titles, /原专家已完成后续工作/);
  assert.equal(activity.some((item) => item.status === 'failed'), false);
});

test('policy correction is shown as an in-place adjustment rather than a failed task', () => {
  const activity = buildProjectAgentActivity([
    { seq: 1, type: 'task_investigating', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:00Z' },
    { seq: 2, type: 'task_correction_requested', data: { taskId: 'form-task', summary: '删除需要审批' }, createdAt: '2026-07-22T03:00:01Z' },
  ], ['form-task']);
  assert.match(activity.map((item) => item.title).join('\n'), /正在核对当前操作|已调整处理方式/);
  assert.equal(activity.some((item) => item.status === 'failed'), false);
});

test('a deletion waiting for approval is not rendered as a failed tool call', () => {
  const activity = buildProjectAgentActivity([
    { seq: 1, type: 'tool_started', data: { taskId: 'form-task', toolName: 'form_component.delete' }, createdAt: '2026-07-22T03:00:00Z' },
    { seq: 2, type: 'tool_completed', data: { taskId: 'form-task', toolName: 'form_component.delete', result: { ok: false, status: 'confirmation_required' } }, createdAt: '2026-07-22T03:00:01Z' },
    { seq: 3, type: 'approval_required', data: { taskId: 'form-task' }, createdAt: '2026-07-22T03:00:02Z' },
  ], ['form-task']);
  assert.equal(activity.some((item) => item.status === 'failed'), false);
  assert.match(activity.map((item) => item.title).join('\n'), /等待操作确认/);
});

test('parameter correction is shown as in-place repair instead of task restart', () => {
  const activities = buildProjectAgentActivity([
    { seq: 1, type: 'tool_parameter_correction_requested', data: { taskId: 't1', repeated: false }, createdAt: '2026-07-22T01:00:00Z' },
    { seq: 2, type: 'tool_parameter_correction_completed', data: { taskId: 't1' }, createdAt: '2026-07-22T01:00:01Z' },
  ], ['t1']);
  assert.equal(activities.some((item) => item.title.includes('参数需要调整') && item.status === 'running'), true);
  assert.equal(activities.some((item) => item.title.includes('参数已纠正') && item.status === 'passed'), true);
  assert.equal(activities.some((item) => item.title.includes('任务失败')), false);
});

test('question preflight explains project checking and reconsideration', () => {
  const value = session([], { events: [
    { seq: 1, type: 'project_state_check_started', data: { reason: 'before_question' }, createdAt: '2026-07-22T01:00:00Z' },
    { seq: 2, type: 'project_state_check_completed', data: { summary: '已检查项目' }, createdAt: '2026-07-22T01:00:01Z' },
    { seq: 3, type: 'question_reconsideration_completed', data: { avoidedQuestion: true }, createdAt: '2026-07-22T01:00:02Z' },
  ] });
  const copy = value.events.map(summarizeProjectAgentEvent).join('；');
  assert.match(copy, /提问前核对项目现状/); assert.match(copy, /提问必要性复核完成/);
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

test('history summaries keep pinned items separate and group the rest by readable time ranges', () => {
  const now = new Date('2026-07-22T12:00:00+08:00').getTime(); const items = [
    { id: 'pinned', pinnedAt: '2026-07-22T01:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'today', updatedAt: '2026-07-22T02:00:00Z' },
    { id: 'recent', updatedAt: '2026-07-19T02:00:00Z' },
    { id: 'earlier', updatedAt: '2026-06-01T02:00:00Z' },
  ];
  assert.deepEqual(Object.fromEntries(Object.entries(groupProjectAgentHistoryByTime(items, now)).map(([key, values]) => [key, values.map((item) => item.id)])), { pinned: ['pinned'], today: ['today'], recent: ['recent'], earlier: ['earlier'] });
});

test('affirmative plan confirmation only accepts exact confirmation commands', () => {
  for (const value of ['确认', '确认执行', '执行。', '继续！']) assert.equal(isAffirmativePlanConfirmation(value), true);
  for (const value of ['确认，但先修改表单', '继续完善计划', '开始新任务']) assert.equal(isAffirmativePlanConfirmation(value), false);
});

test('activity state distinguishes real execution from an SSE connection', () => {
  const now = new Date('2026-07-20T10:00:30.000Z').getTime();
  assert.equal(projectAgentActivityState(session([], { phase: 'idle', events: [] }), now).active, false);
  const analyzing = session([], { phase: 'analyzing_requirements', events: [{ seq: 1, type: 'requirements_analysis_started', data: {}, createdAt: '2026-07-20T10:00:00.000Z' }] });
  assert.equal(projectAgentActivityState(analyzing, now).label, '我在把你的想法整理成清晰目标');
  const planning = session([], { phase: 'planning', events: [
    { seq: 1, type: 'phase_changed', data: { phase: 'planning' }, createdAt: '2026-07-20T10:00:00.000Z' },
    { seq: 2, type: 'planning_attempt_started', data: {}, createdAt: '2026-07-20T10:00:10.000Z' },
  ] });
  assert.deepEqual(projectAgentActivityState(planning, now), { active: true, label: '我在核对完成标准和风险边界', detail: '正在请求模型完善目标契约。', startedAt: new Date('2026-07-20T10:00:00.000Z').getTime(), lastEventAt: new Date('2026-07-20T10:00:10.000Z').getTime(), stale: false });
  assert.equal(projectAgentActivityState({ ...planning, phase: 'awaiting_plan_approval' }, now).active, false);
  assert.equal(projectAgentActivityState(planning, now + 60_000).stale, true);
});

test('work narrative explains intent result and next step in human language', () => {
  const current = { ...task('write', 'running'), title: '创建员工录入表单', access: 'write' as const, decisionReason: '数据结构已经准备好', acceptance: ['表单可录入', '字段绑定正确'], evidenceArtifactIds: ['one'] };
  const running = projectAgentWorkNarrative({ id: 'step', index: 1, status: 'running', inputFingerprint: '', taskIds: ['write'], observationIds: [], startedAt: '' }, [current]);
  assert.equal(running.headline, '我正在处理：创建员工录入表单'); assert.match(running.detail, /因为数据结构已经准备好/); assert.deepEqual([running.completedChecks, running.totalChecks], [1, 2]);
  const failed = projectAgentWorkNarrative({ id: 'step', index: 1, status: 'failed', inputFingerprint: '', taskIds: ['write'], observationIds: [], startedAt: '' }, [{ ...current, status: 'blocked', error: '字段来源不明确' }]);
  assert.equal(failed.headline, '这一步遇到了问题'); assert.match(failed.next, /另一位专家协助/);
});

test('orchestration timeline groups linked records by turn and keeps execution order stable', () => {
  const linkedTask = { ...task('form-task', 'passed'), roundId: 'round-1' };
  const value = session([linkedTask], {
    phase: 'completed',
    messages: [
      { id: 'm-user', role: 'user', content: '创建员工表单', turnId: 'turn-1', kind: 'user', createdAt: '2026-07-21T01:00:00Z' },
      { id: 'm-plan', role: 'assistant', content: '计划摘要', turnId: 'turn-1', kind: 'plan_summary', createdAt: '2026-07-21T01:00:01Z' },
      { id: 'm-done', role: 'assistant', content: '已完成', turnId: 'turn-1', kind: 'completion', createdAt: '2026-07-21T01:00:04Z' },
    ],
    plans: [{ ...session([]).plans[0], turnId: 'turn-1', createdAt: '2026-07-21T01:00:01Z', tasks: [linkedTask] }],
    rounds: [{ id: 'round-1', turnId: 'turn-1', index: 1, status: 'completed', decisions: [], taskIds: ['form-task'], startedAt: '2026-07-21T01:00:02Z', completedAt: '2026-07-21T01:00:03Z' }],
  });
  const turns = buildProjectAgentTimeline(value);
  assert.equal(turns.length, 1);
  assert.deepEqual(turns[0].entries.map((entry) => entry.type), ['message', 'planning', 'round', 'task', 'message']);
  assert.equal(turns[0].entries.filter((entry) => entry.type === 'message').length, 2, 'plan summary message is represented by the plan card once');
});

test('legacy timeline records fall back to the nearest preceding user turn', () => {
  const value = session([], {
    messages: [
      { id: 'old-turn', role: 'user', content: '第一项', createdAt: '2026-07-21T01:00:00Z' },
      { id: 'new-turn', role: 'user', content: '第二项', createdAt: '2026-07-21T01:10:00Z' },
    ],
    plans: [{ ...session([]).plans[0], id: 'old-plan', createdAt: '2026-07-21T01:02:00Z' }],
    rounds: [{ id: 'new-round', index: 1, status: 'completed', decisions: [], taskIds: [], startedAt: '2026-07-21T01:12:00Z' }],
  });
  const turns = buildProjectAgentTimeline(value);
  assert.deepEqual(turns.map((turn) => turn.id), ['old-turn', 'new-turn']);
  assert.ok(turns[0].entries.some((entry) => entry.type === 'planning'));
  assert.ok(turns[1].entries.some((entry) => entry.type === 'round'));
});

test('active questions are rendered once and timeline follow respects historical browsing', () => {
  const value = session([], {
    phase: 'clarifying',
    messages: [
      { id: 'user', role: 'user', content: '继续', turnId: 'turn-q', kind: 'user', createdAt: '2026-07-21T01:00:00Z' },
      { id: 'question-copy', role: 'assistant', content: '请选择', turnId: 'turn-q', kind: 'question', createdAt: '2026-07-21T01:00:01Z' },
    ],
    questions: [{ id: 'q1', turnId: 'turn-q', createdAt: '2026-07-21T01:00:01Z', header: '范围', question: '修改哪个项目？', kind: 'text' }],
  });
  const entries = buildProjectAgentTimeline(value)[0].entries;
  assert.equal(entries.filter((entry) => entry.type === 'question').length, 1);
  assert.equal(entries.filter((entry) => entry.type === 'message' && entry.message.kind === 'question').length, 0);
  assert.equal(shouldProjectAgentTimelineFollow(1000, 790, 100), true);
  assert.equal(shouldProjectAgentTimelineFollow(1000, 500, 100), false);
});
