import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConversationSurface from './ConversationSurface';
import type { ProjectAgentThread } from './projectAgentUiModel';

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
    title: 't',
    profileId: 'p',
    capabilityBundleVersionId: 'b',
    mode: 'plan',
    status: 'awaiting_operation_approval',
    messages: [{ id: 'm1', role: 'user', kind: 'prompt', content: '创建一个员工管理系统', createdAt: now }],
    summary: '',
    events: [],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
    pendingApproval: {
      id: 'pao_1',
      toolName: 'project.delete',
      taskId: 't1',
      scope: 'project',
      arguments: { projectId: 'p1' },
      confirmation: { token: 'x', expiresAt: now, summary: '删除项目需要确认', impact: { projects: ['p1'] } },
      createdAt: now,
    },
    plan: {
      id: 'plan_1',
      revision: 1,
      request: 'r',
      goal: '员工管理系统',
      successCriteria: [],
      summary: '',
      assumptions: [],
      risks: [],
      status: 'confirmed',
      createdAt: now,
      tasks: [{ id: 't1', title: '删除旧项目', instruction: '删除', scope: 'project', access: 'write', acceptance: [], status: 'running', attempt: 0, maxAttempts: 3, toolSteps: 0, evidence: [], createdAt: now, updatedAt: now }],
    },
  };
}

test('surface renders concise user, plan and task cards with approval actions', () => {
  const html = renderToStaticMarkup(createElement(ConversationSurface, {
    thread: thread(),
    onOpenDetail: () => undefined,
    onConfirmPlan: () => undefined,
    onRejectPlan: () => undefined,
    onApprove: () => undefined,
    onRetryPlanning: () => undefined,
    onUseExample: () => undefined,
    onSwitchMode: () => undefined,
  }));
  assert.match(html, /创建一个员工管理系统/);
  assert.match(html, /删除旧项目/);
  assert.match(html, /0\/1 项任务完成/);
  assert.match(html, /删除项目需要确认/);
  assert.match(html, /确认执行/);
  assert.match(html, /取消/);
});

test('surface shows the pending plan confirmation card', () => {
  const value = thread();
  value.plan!.status = 'pending';
  value.status = 'awaiting_plan_approval';
  value.pendingApproval = undefined;
  const html = renderToStaticMarkup(createElement(ConversationSurface, {
    thread: value,
    onOpenDetail: () => undefined,
    onConfirmPlan: () => undefined,
    onRejectPlan: () => undefined,
    onApprove: () => undefined,
    onRetryPlanning: () => undefined,
    onUseExample: () => undefined,
    onSwitchMode: () => undefined,
  }));
  assert.match(html, /确认目标并开始/);
  assert.match(html, /重新规划/);
});

test('goal mode plan card is autonomous without confirm buttons', () => {
  const value = thread();
  value.plan!.status = 'pending';
  value.status = 'awaiting_plan_approval';
  value.mode = 'goal';
  value.pendingApproval = undefined;
  const html = renderToStaticMarkup(createElement(ConversationSurface, {
    thread: value,
    onOpenDetail: () => undefined,
    onConfirmPlan: () => undefined,
    onRejectPlan: () => undefined,
    onApprove: () => undefined,
    onRetryPlanning: () => undefined,
    onUseExample: () => undefined,
    onSwitchMode: () => undefined,
  }));
  assert.match(html, /目标模式 · 确认后自动执行/);
  assert.match(html, /自主执行/);
  assert.doesNotMatch(html, /确认目标并开始/);
});
