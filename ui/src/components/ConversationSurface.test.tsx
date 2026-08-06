import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConversationSurface from './ConversationSurface';
import type { ProjectAgentThread } from './projectAgentUiModel';

function thread(): ProjectAgentThread {
  const now = '2026-08-03T00:00:00.000Z';
  return {
    schemaVersion: 2,
    id: 'pat_1',
    tenantId: 'local',
    userId: 'local',
    projectIds: ['p1'],
    currentProjectId: 'p1',
    projectRevisions: {},
    title: 't',
    profileId: 'p',
    capabilityBundleVersionId: 'b',
    status: 'awaiting_operation_approval',
    turns: [{ id: 'turn_1', userInput: '创建一个员工管理系统', status: 'waiting_approval', startedAt: now }],
    messages: [{ id: 'm1', role: 'user', kind: 'prompt', content: '创建一个员工管理系统', createdAt: now }],
    summary: '',
    events: [{ id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: now }],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
    pendingApproval: {
      id: 'pao_1',
      toolName: 'project.delete',
      turnId: 'turn_1',
      scope: 'project',
      arguments: { projectId: 'p1' },
      confirmation: { token: 'x', expiresAt: now, summary: '删除项目需要确认', impact: { projects: ['p1'] } },
      createdAt: now,
    },
    dynamicPlan: {
      goal: '员工管理系统',
      successCriteria: ['数据表存在', '表单存在'],
      summary: '从数据到表单',
      steps: ['建数据表', '建表单'],
      assumptions: [],
      risks: [],
      updatedAt: now,
      updatedBy: 'system',
    },
  };
}

function render(value: ProjectAgentThread, props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(ConversationSurface, {
    thread: value,
    onOpenDetail: () => undefined,
    onApprove: () => undefined,
    onRetryPlanning: () => undefined,
    onUseExample: () => undefined,
    ...props,
  }));
}

test('surface renders unified cards covering plan, message, event and approval', () => {
  const html = render(thread());
  assert.match(html, /创建一个员工管理系统/);
  assert.match(html, /agent-card-feed/);
  assert.match(html, /agent-card-plan/);
  assert.match(html, /员工管理系统/);
  assert.match(html, /agent-card-event/);
  assert.match(html, /正在调用工具/);
  assert.match(html, /agent-card-approval/);
  assert.match(html, /删除项目需要确认/);
  assert.match(html, /✓ 确认/);
  assert.match(html, /取消/);
  assert.match(html, /agent-surface-header/);
});

test('question renders as a unified card with options', () => {
  const value = thread();
  value.status = 'paused';
  value.pendingApproval = undefined;
  value.messages.push({
    id: 'm2', role: 'assistant', kind: 'question', createdAt: '2026-08-03T00:00:01.000Z',
    content: '缺少信息：请确认范围',
    questions: [{ header: '缺少信息', question: '请确认范围', kind: 'choice', context: '当前目标：员工管理系统', options: [{ label: '继续，使用合理默认值' }] }],
  });
  const html = render(value, { onSendQuick: () => undefined });
  assert.match(html, /agent-card-question/);
  assert.match(html, /继续，使用合理默认值/);
  assert.match(html, /可直接回复选项/);
});

test('messages render as unified cards with sender symbols instead of verbose labels', () => {
  const value = thread();
  value.status = 'paused';
  value.pendingApproval = undefined;
  value.messages.push({ id: 'm2', role: 'assistant', kind: 'commentary', content: '已生成动态计划', createdAt: '2026-08-03T00:00:01.000Z' });
  const html = render(value);
  assert.match(html, /agent-card-message/);
  assert.doesNotMatch(html, />你的需求</);
  assert.doesNotMatch(html, />智能体</);
  assert.match(html, />你</);
  assert.match(html, />✦</);
  assert.match(html, /data-sender="user"/);
  assert.match(html, /data-sender="agent"/);
  assert.match(html, /agent-card-message/);
});

test('executing thread shows a running indicator with activity label and elapsed time', () => {
  const value = thread();
  value.status = 'executing';
  value.pendingApproval = undefined;
  value.events.push({ id: 'e2', seq: 2, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: '2026-08-03T00:00:02.000Z' });
  const html = render(value);
  assert.match(html, /agent-spinner/);
  assert.match(html, /正在调用 form\.create/);
  assert.match(html, /已运行/);
  assert.match(html, /本步/);
});
