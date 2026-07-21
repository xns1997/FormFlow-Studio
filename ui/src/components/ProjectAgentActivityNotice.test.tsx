import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAgentActivityNotice from './ProjectAgentActivityNotice';
import type { ProjectAgentSessionV2 } from './projectAgentUiModel';

const session: ProjectAgentSessionV2 = { schemaVersion: 2, id: 'activity-session', phase: 'planning', plans: [], questions: [], artifacts: [], events: [
  { seq: 1, type: 'phase_changed', data: { phase: 'planning' }, createdAt: '2026-07-20T10:00:00.000Z' },
  { seq: 2, type: 'planning_attempt_started', data: {}, createdAt: '2026-07-20T10:00:05.000Z' },
] };

test('activity notice visibly confirms execution and reports elapsed progress', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentActivityNotice, { session, connection: 'connected', now: new Date('2026-07-20T10:00:30.000Z').getTime(), onRefresh() {} }));
  for (const text of ['正在生成可确认的任务图', '服务端执行中', '已运行 30秒', '最近事件 25秒前', '正在请求模型生成计划']) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /刷新状态/);
});

test('activity notice offers refresh when progress has been quiet for a minute', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentActivityNotice, { session, connection: 'reconnecting', now: new Date('2026-07-20T10:02:00.000Z').getTime(), onRefresh() {} }));
  assert.match(html, /刷新状态/); assert.match(html, /等待新进度/); assert.match(html, /实时连接恢复后会补播进度/); assert.match(html, /stale/);
});
