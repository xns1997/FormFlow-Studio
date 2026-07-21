import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAgentProgressCards, { type ProjectAgentSessionV2 } from './ProjectAgentProgressCards';

function task(id: string, role: 'project' | 'form', status: string, dependsOn: string[] = []) {
  return { id, role, title: role === 'project' ? '初始化项目' : '创建窗体', instruction: role === 'project' ? '初始化项目' : '创建录入与查询窗体', access: 'write' as const, dependsOn, acceptance: ['结构正确'], status, attempt: 1, maxAttempts: 3, startRevision: 'revision-start', endRevision: status === 'passed' ? 'revision-project' : undefined, evidenceArtifactIds: status === 'passed' ? ['evidence-1'] : [] };
}

function baseSession(overrides: Partial<ProjectAgentSessionV2> = {}): ProjectAgentSessionV2 {
  return { schemaVersion: 2, id: 'session-v2', projectId: 'employee-center', phase: 'executing', checkpointRevision: 'revision-project-abcdef', activePlanId: 'plan-1', plans: [{ id: 'plan-1', revision: 1, goal: '创建员工中心', successCriteria: ['项目通过校验'], summary: '创建员工信息管理项目', assumptions: ['部门字典由项目维护'], risks: ['删除需要确认'], status: 'confirmed', tasks: [task('task-project', 'project', 'passed'), task('task-form', 'form', 'running', ['task-project'])] }], questions: [], artifacts: [{ id: 'evidence-1', taskId: 'task-project', title: '验收', data: { valid: true } }], events: [{ seq: 1, type: 'tool_started', data: { taskId: 'task-project', toolName: 'project.initialize' }, createdAt: new Date().toISOString() }, { seq: 2, type: 'verification_completed', data: { taskId: 'task-project' }, createdAt: new Date().toISOString() }], ...overrides };
}

const handlers = { busy: false, onConfirmPlan() {}, onConfirmOperation() {}, onControl() {}, onRetryPlanning() {}, onClear() {} };

test('compact task workbench renders evidence and destructive confirmation', () => {
  const session = baseSession({ phase: 'awaiting_operation_approval', pendingApproval: { id: 'approval-1', toolName: 'form.delete', taskId: 'task-form', confirmation: { summary: '确认替换旧窗体', impact: { formId: 'old-form' } } } });
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers }));
  for (const expected of ['初始化项目', '创建窗体', '确认替换旧窗体', '查看影响范围', '确认执行', '1 个依赖：初始化项目']) assert.match(html, new RegExp(expected));
  const evidenceHtml = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers, selectedTaskId: 'task-project' }));
  for (const expected of ['project.initialize', '验收通过', '验收产物', 'valid']) assert.match(evidenceHtml, new RegExp(expected));
  assert.doesNotMatch(html, /当前关注|执行记录/);
});

test('project agent V2 hides manual operation approval when local mode auto-approves', () => {
  const session = baseSession({ phase: 'awaiting_operation_approval', pendingApproval: { id: 'approval-1', toolName: 'form.delete', taskId: 'task-form', confirmation: { summary: '删除表单需要确认', impact: { formId: 'old-form' } } } });
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers, manualOperationApproval: false }));
  assert.doesNotMatch(html, /删除表单需要确认|确认执行|拒绝/);
});

test('compact task workbench renders an empty grounding snapshot', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session: baseSession({ projectId: undefined, phase: 'grounding', activePlanId: undefined, plans: [], artifacts: [], events: [] }), ...handlers }));
  assert.match(html, /完成项目检查和计划确认后/); assert.match(html, /暂无任务/);
});

test('compact task workbench exposes task retry budget without duplicating current focus', () => {
  const running = baseSession(); const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session: running, ...handlers, busy: true }));
  assert.match(html, /尝试 1\/3/); assert.doesNotMatch(html, /当前关注/);
  assert.equal((html.match(/data-task-lineage="task-form"/g) || []).length, 1);
  const failedSession = baseSession({ phase: 'failed' }); failedSession.plans[0].tasks[1].status = 'failed';
  const failedHtml = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session: failedSession, ...handlers })); assert.match(failedHtml, /重试此任务/);
});

test('data preflight events expose bounded arguments and actionable suggestions', () => {
  const session = baseSession({ events: [{
    seq: 9, type: 'tool_preflight_failed', createdAt: new Date().toISOString(), data: {
      taskId: 'task-form', toolName: 'data_source.create',
      error: { code: 'DATA_ROWS_LOOK_LIKE_SCHEMA', message: 'rows 看起来是字段定义', path: 'rows' },
      originalArguments: { rows: [{ fieldId: 'device_id', title: '设备编号' }] },
      normalizedArguments: { rows: [{ fieldId: 'device_id', title: '设备编号' }], config: {} },
      normalizations: [{ path: 'config.primaryKey', from: 'primaryKey', to: 'config.keyFields' }],
      suggestedArguments: { rows: [], config: { columns: [{ name: 'device_id', type: 'string' }], keyFields: ['device_id'] } },
    },
  }] });
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers, selectedTaskId: 'task-form' }));
  for (const expected of ['工具参数预检未通过', 'DATA_ROWS_LOOK_LIKE_SCHEMA', '技术详情', 'originalArguments', 'normalizedArguments', 'normalizations', 'suggestedArguments', 'device_id']) assert.match(html, new RegExp(expected));
});

test('quality gate failure offers a new remediation cycle with concrete diagnostics', () => {
  const session = baseSession({ phase: 'failed' }); session.plans[0].tasks[1].status = 'failed'; session.events = [
    { seq: 8, type: 'quality_gate_failed', data: { taskId: 'task-form', diagnostics: [{ severity: 'error', code: 'BUTTON_WITHOUT_ACTION', path: 'forms.leave.submit', message: '按钮没有事件或流程绑定' }] }, createdAt: new Date().toISOString() },
  ];
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers }));
  for (const expected of ['质量门禁未通过', '后续交付已暂停', 'BUTTON_WITHOUT_ACTION', 'forms.leave.submit', '开始新一轮修复', '任务与修复历史']) assert.match(html, new RegExp(expected));
  assert.doesNotMatch(html, />重试此任务</);
});

test('project agent V2 cards offer a persistent planning retry after structured output failure', () => {
  const session = baseSession({ phase: 'failed', projectId: undefined, activePlanId: undefined, plans: [], events: [
    { seq: 1, type: 'turn_started', data: { turnId: 'turn-1' }, createdAt: new Date().toISOString() },
    { seq: 2, type: 'planning_attempt_failed', data: { attempt: 1, error: '模型未返回合法的结构化 JSON' }, createdAt: new Date().toISOString() },
    { seq: 3, type: 'planning_attempt_failed', data: { attempt: 2, error: '模型未返回合法的结构化 JSON' }, createdAt: new Date().toISOString() },
    { seq: 4, type: 'turn_failed', data: { turnId: 'turn-1', stage: 'planning', error: '模型未返回合法的结构化 JSON', retryable: true }, createdAt: new Date().toISOString() },
    { seq: 5, type: 'phase_changed', data: { phase: 'failed', stage: 'planning' }, createdAt: new Date().toISOString() },
  ] });
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers }));
  for (const expected of ['任务计划生成失败', '已自动尝试 2 次', '项目没有被修改', '再次尝试']) assert.match(html, new RegExp(expected));
  assert.doesNotMatch(html, /重试此任务/);
});

test('automatic recovery renders a collapsed dynamic task lineage', () => {
  const session = baseSession({ phase: 'recovering', recovery: { cycles: 2, maxCycles: 6, dynamicTasks: 3, maxDynamicTasks: 24, strategies: {}, lastFailureTaskId: 'task-form', lastFailureClass: 'tool_scope' } });
  const previous = { ...session.plans[0].tasks[1], id: 'old-task', status: 'superseded', attempt: 3, error: '旧策略失败' };
  Object.assign(session.plans[0].tasks[1], { origin: 'recovery', generation: 2, supersedesTaskId: 'old-task', failureClass: 'tool_scope' }); session.plans[0].tasks.splice(1, 0, previous);
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers }));
  for (const expected of ['正在调整执行策略', '2/6', '修复任务', '2 代任务', '累计 4 次尝试', 'recovery 第 2 代', 'tool_scope']) assert.match(html, new RegExp(expected));
  assert.equal((html.match(/data-task-lineage="old-task"/g) || []).length, 1);
});

test('semantic activity hides provider noise from the default timeline and keeps it in technical details', () => {
  const session = baseSession({ events: [
    { seq: 1, type: 'node_started', data: { taskId: 'task-form' }, createdAt: new Date().toISOString() },
    { seq: 2, type: 'message_delta', data: { taskId: 'task-form', content: '内部消息' }, createdAt: new Date().toISOString() },
    { seq: 3, type: 'tool_started', data: { taskId: 'task-form', toolName: 'form.create' }, createdAt: new Date().toISOString() },
    { seq: 4, type: 'tool_completed', data: { taskId: 'task-form', toolName: 'form.create', result: { ok: true } }, createdAt: new Date().toISOString() },
  ] });
  const html = renderToStaticMarkup(createElement(ProjectAgentProgressCards, { session, ...handlers }));
  assert.match(html, /工具执行完成 · form.create/); assert.match(html, /技术详情/);
  assert.doesNotMatch(html, />node_started<|>message_delta</);
});
