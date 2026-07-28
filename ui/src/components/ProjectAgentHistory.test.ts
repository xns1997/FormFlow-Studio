import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectAgentHistory from './ProjectAgentHistory';
import type { ProjectAgentSessionV2 } from './projectAgentUiModel';

const activeSession: ProjectAgentSessionV2 & { title: string } = {
  schemaVersion: 2, id: 'active-session', title: '创建员工管理项目', projectId: 'project-a', projectIds: ['project-a'], phase: 'executing', plans: [], questions: [], artifacts: [], events: [], messages: [],
};

test('history mode is a full read-only browser and keeps the active task visible', () => {
  const html = renderToStaticMarkup(createElement(ProjectAgentHistory, {
    activeSession, currentProjectId: 'project-a', projects: [{ id: 'project-a', name: '员工管理' }], busy: false,
    onClose() {}, async onActivate() {}, onNavigate() {}, async onRename() {}, async onTogglePin() {}, async onArchive() {}, async onRestore() {}, async onDelete() { return true; },
  }));
  for (const expected of ['历史任务', '浏览不会切换或暂停当前任务', '当前任务仍在后台运行', '搜索标题、目标或项目', '全部', '进行中', '需处理', '已完成', '查看归档']) assert.match(html, new RegExp(expected));
  assert.doesNotMatch(html, /暂停并继续|暂停任务？/);
});
