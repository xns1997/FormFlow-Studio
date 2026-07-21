import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'formflow-project-agent-'));
process.env.PROJECT_AGENT_STORE_PATH = join(root, 'sessions.json');
const store = await import('./project-agent-store');

test.after(() => rmSync(root, { recursive: true, force: true }));

test('project agent sessions persist scope, stages, messages and bounded audit', () => {
  const session = store.createProjectAgentSession({ tenantId: 'tenant-a', userId: 'user-a', title: '员工管理' });
  assert.equal(session.currentStage, 'blueprint'); assert.equal(session.blueprintConfirmed, false);
  assert.equal(session.agentMode, 'plan'); assert.equal(session.executionState, 'idle');
  assert.deepEqual(session.delegationQueue, []); assert.deepEqual(session.specialistRuns, []);
  store.addProjectAgentMessage(session, 'user', '创建员工管理项目');
  store.addProjectAgentMessage(session, 'assistant', '蓝图');
  store.recordProjectAgentEvents(session, Array.from({ length: 520 }, (_, index) => ({ type: 'event', data: { index } })));
  session.blueprint = '蓝图'; session.blueprintConfirmed = true; session.projectId = 'employees'; session.currentStage = 'project_data';
  session.proposedPlan = { id: 'plan-1', request: '创建员工管理项目', summary: '创建方案', assumptions: [], risks: [], tasks: [], status: 'pending', createdAt: new Date().toISOString() };
  store.saveProjectAgentSession(session);
  const loaded = store.getProjectAgentSession(session.id)!;
  assert.equal(loaded.projectId, 'employees'); assert.equal(loaded.messages.length, 2); assert.equal(loaded.audit.length, 500);
  assert.equal(loaded.agentMode, 'plan'); assert.equal(loaded.proposedPlan?.status, 'pending');
  assert.deepEqual(loaded.delegationQueue, []); assert.deepEqual(loaded.specialistRuns, []);
  assert.equal(store.listProjectAgentSessions({ tenantId: 'tenant-a', userId: 'user-a' }).length, 1);
  assert.equal(store.listProjectAgentSessions({ tenantId: 'tenant-a', userId: 'other' }).length, 0);
  assert.doesNotThrow(() => JSON.parse(readFileSync(process.env.PROJECT_AGENT_STORE_PATH!, 'utf8')));
});
