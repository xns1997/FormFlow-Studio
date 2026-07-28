import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAgentTimeline from './ProjectAgentTimeline';
import type { ProjectAgentSessionV2 } from './projectAgentUiModel';

function timelineSession(overrides: Partial<ProjectAgentSessionV2> = {}): ProjectAgentSessionV2 {
  const task = { id: 'form-task', role: 'form' as const, title: '创建员工表单', instruction: '创建录入和查询表单', access: 'write' as const, dependsOn: [], acceptance: ['表单可录入'], status: 'running', attempt: 1, maxAttempts: 3, evidenceArtifactIds: [], stepId: 'step-1', decisionReason: '需求需要表单界面' };
  return {
    schemaVersion: 2, id: 'timeline-session', phase: 'executing', activePlanId: 'plan-1',
    messages: [{ id: 'user-1', role: 'user', content: '创建员工信息管理项目', turnId: 'turn-1', kind: 'user', createdAt: '2026-07-21T01:00:00Z' }],
    plans: [{ id: 'plan-1', turnId: 'turn-1', revision: 1, goal: '员工管理', successCriteria: ['可录入员工'], summary: '建立员工表单', assumptions: [], risks: [], tasks: [task], status: 'confirmed', createdAt: '2026-07-21T01:00:01Z' }],
    steps: [{ id: 'step-1', turnId: 'turn-1', index: 1, status: 'running', action: 'assign', summary: '正在建立员工表单', taskIds: ['form-task'], observationIds: [], startedAt: '2026-07-21T01:00:02Z' }], observations: [],
    questions: [], artifacts: [], events: [{ seq: 1, type: 'tool_started', data: { taskId: 'form-task', toolName: 'form.create' }, createdAt: '2026-07-21T01:00:03Z' }],
    ...overrides,
  };
}

const handlers = { busy: false, answers: {}, onAnswer() {}, onSubmitAnswers() {}, onUseExample() {}, onConfirmPlan() {}, onConfirmOperation() {}, onControl() {}, onRetryPlanning() {} };

test('timeline presents business actions without loop, skip or internal ids', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentTimeline, { session: timelineSession(), ...handlers }));
  for (const expected of ['你的需求', '正在建立员工表单', '表单专家', '创建员工表单', '正在做什么', '执行反馈']) assert.match(html, new RegExp(expected));
  assert.doesNotMatch(html, /Loop|本轮|跳过|step-1|form-task|artifactId|toolCallId|技术事件/);
  assert.equal((html.match(/创建员工表单/g) || []).length, 1, 'task is not repeated in a separate list');
  assert.doesNotMatch(html, /project-agent-task-layout|project-agent-task-list/);
});

test('timeline shows what each completed tool actually changed or verified', () => {
  const session = timelineSession({ events: [
    { seq: 1, type: 'tool_started', data: { taskId: 'form-task', toolName: 'project.initialize' }, createdAt: '2026-07-21T01:00:03Z' },
    { seq: 2, type: 'tool_completed', data: { taskId: 'form-task', toolName: 'project.initialize', result: { ok: true, data: { project: { config: { name: '灵活就业分析' } }, validation: { valid: true, counts: { dataSources: 4, forms: 2, workflows: 2, outputs: 1 } } } } }, createdAt: '2026-07-21T01:00:04Z' },
    { seq: 3, type: 'tool_started', data: { taskId: 'form-task', toolName: 'project.validate' }, createdAt: '2026-07-21T01:00:05Z' },
    { seq: 4, type: 'tool_completed', data: { taskId: 'form-task', toolName: 'project.validate', result: { ok: true, data: { valid: true, errors: [], counts: { dataSources: 4, forms: 2, workflows: 2, outputs: 1 } } } }, createdAt: '2026-07-21T01:00:06Z' },
  ] });
  const html = renderToStaticMarkup(createElement(ProjectAgentTimeline, { session, ...handlers }));
  for (const expected of ['已创建并初始化项目', '灵活就业分析', '4 张数据表、2 个表单、2 条流程、1 个输出', '项目校验通过', '结构、引用和业务语义均有效']) assert.match(html, new RegExp(expected));
  assert.doesNotMatch(html, /已获得执行结果|project\.initialize|project\.validate/);
});

test('timeline places question and destructive approval at their execution position once', () => {
  const session = timelineSession({
    phase: 'awaiting_operation_approval',
    messages: [
      { id: 'user-1', role: 'user', content: '替换旧表单', turnId: 'turn-1', kind: 'user', createdAt: '2026-07-21T01:00:00Z' },
      { id: 'question-copy', role: 'assistant', content: '请确认范围', turnId: 'turn-1', kind: 'question', createdAt: '2026-07-21T01:00:01Z' },
    ],
    questions: [{ id: 'scope', turnId: 'turn-1', createdAt: '2026-07-21T01:00:01Z', header: '范围', question: '是否替换旧表单？', kind: 'choice', options: [{ label: '替换' }, { label: '保留' }] }],
    pendingApproval: { id: 'approval-1', taskId: 'form-task', toolName: 'form.delete', confirmation: { summary: '删除旧表单', impact: { formId: 'old-form' } } },
  });
  const html = renderToStaticMarkup(createElement(ProjectAgentTimeline, { session, ...handlers }));
  assert.equal((html.match(/需要你的决策/g) || []).length, 1);
  assert.equal((html.match(/删除旧表单/g) || []).length, 1);
  for (const expected of ['是否替换旧表单', '目标确认不替代', '确认执行']) assert.match(html, new RegExp(expected));
});

test('timeline keeps planning failures actionable at the originating turn', () => {
  const session = timelineSession({ phase: 'failed', plans: [], activePlanId: undefined, rounds: [], events: [{ seq: 1, type: 'turn_failed', data: { turnId: 'turn-1', stage: 'planning', error: '结构化结果无效' }, createdAt: '2026-07-21T01:00:02Z' }] });
  const html = renderToStaticMarkup(createElement(ProjectAgentTimeline, { session, ...handlers }));
  for (const expected of ['目标契约生成失败', '结构化结果无效', '再次尝试']) assert.match(html, new RegExp(expected));
});

test('history timeline is read only and hides every mutation control', () => {
  const session = timelineSession({ phase: 'failed', questions: [{ id: 'q', header: '范围', question: '请选择范围', kind: 'text' }], events: [{ seq: 1, type: 'turn_failed', data: { turnId: 'turn-1', stage: 'planning', error: '结构化结果无效' }, createdAt: '2026-07-21T01:00:02Z' }] });
  const html = renderToStaticMarkup(createElement(ProjectAgentTimeline, { session, ...handlers, readOnly: true }));
  for (const expected of ['等待用户补充', '历史只读记录', '请选择范围']) assert.match(html, new RegExp(expected));
  for (const hidden of ['提交全部答案', '再次尝试', '调整行动并重试', '确认目标并开始']) assert.doesNotMatch(html, new RegExp(hidden));
  assert.doesNotMatch(html, /textarea|type="checkbox"/);
});
