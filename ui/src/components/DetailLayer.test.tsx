import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DetailLayer from './DetailLayer';
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
    status: 'executing',
    turns: [{ id: 'turn_1', userInput: '建员工系统', status: 'running_model', startedAt: now }],
    messages: [],
    summary: '',
    events: [{ id: 'e1', seq: 1, type: 'tool_call', data: { toolName: 'form.create' }, createdAt: now }],
    consecutiveNoProgress: 0,
    blockedCount: 0,
    decisionSteps: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
    dynamicPlan: {
      goal: '员工管理系统',
      successCriteria: ['数据表存在', '表单存在'],
      summary: '两步完成',
      steps: ['建数据表', '建表单'],
      assumptions: ['部门固定'],
      risks: [],
      updatedAt: now,
      updatedBy: 'system',
    },
  };
}

test('detail layer shows dynamic plan overview by default', () => {
  const html = renderToStaticMarkup(createElement(DetailLayer, { thread: thread(), active: null, onClose: () => undefined }));
  assert.match(html, /员工管理系统/);
  assert.match(html, /✓ 完成标准/);
  assert.match(html, /数据表存在/);
  assert.match(html, /建数据表/);
  assert.match(html, /≡ 事件/);
});

test('detail layer shows an event sheet with payload', () => {
  const html = renderToStaticMarkup(createElement(DetailLayer, {
    thread: thread(),
    active: { key: 'event:1', kind: 'event', state: 'running', title: '调用工具', meta: '', ref: { eventSeq: 1 } },
    onClose: () => undefined,
  }));
  assert.match(html, /▸ 事件/);
  assert.match(html, /tool_call/);
  assert.match(html, /form\.create/);
});

test('detail event log shows recent count vs total and reveals older events', () => {
  const value = thread();
  value.events = Array.from({ length: 15 }, (_, index) => ({
    id: `e${index + 1}`,
    seq: index + 1,
    type: index === 0 ? 'model.started' : 'tool_call',
    data: { toolName: 'form.create' },
    createdAt: '2026-08-03T00:00:00.000Z',
  }));
  const html = renderToStaticMarkup(createElement(DetailLayer, { thread: value, active: null, onClose: () => undefined }));
  assert.match(html, /最近 12 \/ 共 15/);
  assert.match(html, /查看更早的 3 条/);
  assert.match(html, /#15/);
});

test('detail event log omits older toggle when within cap', () => {
  const html = renderToStaticMarkup(createElement(DetailLayer, { thread: thread(), active: null, onClose: () => undefined }));
  assert.match(html, /最近 1 \/ 共 1/);
  assert.doesNotMatch(html, /查看更早/);
});
