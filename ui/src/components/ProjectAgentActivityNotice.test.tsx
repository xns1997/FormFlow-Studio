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
  for (const text of ['我在核对完成标准和风险边界', '正在处理', '已经处理了 30秒', '你可以先浏览前面的内容', '正在请求模型完善目标契约']) assert.match(html, new RegExp(text));
  assert.doesNotMatch(html, /看看最新进展|服务端|最近事件/);
});

test('activity notice offers refresh when progress has been quiet for a minute', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentActivityNotice, { session, connection: 'reconnecting', now: new Date('2026-07-20T10:02:00.000Z').getTime(), onRefresh() {} }));
  assert.match(html, /看看最新进展/); assert.match(html, /还在处理/); assert.match(html, /连接恢复后会自动补上进展/); assert.match(html, /stale/);
});
