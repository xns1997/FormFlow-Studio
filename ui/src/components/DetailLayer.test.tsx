import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DetailLayer from './DetailLayer';
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
    status: 'executing',
    messages: [],
    summary: '',
    events: [{ id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: now }],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
    plan: {
      id: 'plan_1',
      revision: 1,
      request: 'r',
      goal: '员工管理系统',
      successCriteria: ['数据表存在', '表单存在'],
      summary: '两步完成',
      assumptions: ['部门固定'],
      risks: [],
      status: 'confirmed',
      createdAt: now,
      tasks: [
        { id: 't1', title: '建数据表', instruction: '先建表', scope: 'data', access: 'write', acceptance: ['表存在'], status: 'failed', attempt: 1, maxAttempts: 3, toolSteps: 1, evidence: [], error: '主键缺失', createdAt: now, updatedAt: now },
      ],
    },
  };
}

test('detail layer shows plan overview by default', () => {
  const html = renderToStaticMarkup(createElement(DetailLayer, { thread: thread(), active: null, onClose: () => undefined, onOpenTask: () => undefined, onRetryTask: () => undefined }));
  assert.match(html, /员工管理系统/);
  assert.match(html, /如何判断完成/);
  assert.match(html, /数据表存在/);
  assert.match(html, /建数据表/);
  assert.match(html, /事件流水/);
});

test('detail layer shows a task sheet with acceptance, evidence and error', () => {
  const html = renderToStaticMarkup(createElement(DetailLayer, {
    thread: thread(),
    active: { key: 'task:t1', kind: 'task', state: 'failed', title: '建数据表', meta: '', ref: { taskId: 't1' } },
    onClose: () => undefined,
    onOpenTask: () => undefined,
    onRetryTask: () => undefined,
  }));
  assert.match(html, /任务详情/);
  assert.match(html, /先建表/);
  assert.match(html, /主键缺失/);
  assert.match(html, /重试任务/);
});
