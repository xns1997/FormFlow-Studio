import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAgentConversation from './ProjectAgentConversation';

test('clarification decisions render as selected cards with unified submission', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentConversation, { messages: [], questions: [{ id: 'q1', header: '交付范围', question: '是否需要交付预检？', kind: 'choice', options: [{ label: '需要', description: '运行 release.preview' }, { label: '不需要' }] }], answers: { q1: '需要' }, busy: false, onAnswer() {}, onSubmitAnswers() {}, onUseExample() {} }));
  assert.match(html, /需要你的决策/); assert.match(html, /aria-pressed="true"/); assert.match(html, /提交全部答案/); assert.doesNotMatch(html, /project-agent-message-card user/);
});
