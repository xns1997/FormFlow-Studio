import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'formflow-project-agent-v2-'));
process.env.PROJECT_AGENT_V2_STORE_PATH = join(root, 'sessions-v2.json');
process.env.PROJECT_AGENT_BUNDLE_STORE_PATH = join(root, 'bundles.json');
process.env.PROJECT_AGENT_STORE_PATH = join(root, 'legacy.json');
writeFileSync(process.env.PROJECT_AGENT_STORE_PATH, '[{"id":"legacy"}]');
const store = await import('./project-agent-v2-store');

test.after(() => rmSync(root, { recursive: true, force: true }));

test('V2 store clears only legacy sessions and persists ordered events', () => {
  assert.deepEqual(JSON.parse(readFileSync(process.env.PROJECT_AGENT_STORE_PATH!, 'utf8')), []);
  const session = store.createAgentSessionV2({ tenantId: 't', userId: 'u', profileId: 'p' });
  assert.equal(session.phase, 'idle');
  store.appendAgentEvent(session, 'phase_changed', { phase: 'planning' }); store.appendAgentEvent(session, 'plan_proposed', { id: 'p1' });
  assert.deepEqual(store.eventsAfter(session, 1).map((event) => event.seq), [2]);
  assert.equal(store.getAgentSessionV2(session.id)?.schemaVersion, 2); assert.ok(existsSync(process.env.PROJECT_AGENT_V2_STORE_PATH!));
});

test('session listing isolates project and unbound scopes and sorts by latest update', () => {
  const older = store.createAgentSessionV2({ tenantId: 'scope-t', userId: 'scope-u', projectId: 'project-a', profileId: 'p', title: 'older' });
  const newer = store.createAgentSessionV2({ tenantId: 'scope-t', userId: 'scope-u', projectId: 'project-a', profileId: 'p', title: 'newer' });
  const other = store.createAgentSessionV2({ tenantId: 'scope-t', userId: 'scope-u', projectId: 'project-b', profileId: 'p', title: 'other' });
  const unbound = store.createAgentSessionV2({ tenantId: 'scope-t', userId: 'scope-u', profileId: 'p', title: 'unbound' });
  older.updatedAt = '2026-01-01T00:00:00.000Z';
  newer.updatedAt = '2026-01-02T00:00:00.000Z';
  assert.deepEqual(store.listAgentSessionsV2({ tenantId: 'scope-t', userId: 'scope-u', projectId: 'project-a', sessionScope: 'project' }).map((item) => item.id), [newer.id, older.id]);
  assert.deepEqual(store.listAgentSessionsV2({ tenantId: 'scope-t', userId: 'scope-u', sessionScope: 'unbound' }).map((item) => item.id), [unbound.id]);
  assert.deepEqual(store.listAgentSessionsV2({ tenantId: 'scope-t', userId: 'scope-u' }).map((item) => item.id), [unbound.id]);
  assert.deepEqual(new Set(store.listAgentSessionsV2({ tenantId: 'scope-t', userId: 'scope-u', sessionScope: 'all' }).map((item) => item.id)), new Set([older.id, newer.id, other.id, unbound.id]));
  newer.phase = 'executing';
  assert.equal(store.findActiveProjectAgentSession({ tenantId: 'scope-t', userId: 'scope-u', projectId: 'project-a' }, older.id)?.id, newer.id);
  newer.phase = 'paused';
  assert.equal(store.findActiveProjectAgentSession({ tenantId: 'scope-t', userId: 'scope-u', projectId: 'project-a' }, older.id), undefined);
  store.archiveAgentSessionV2(other);
  assert.equal(store.listAgentSessionsV2({ tenantId: 'scope-t', userId: 'scope-u', sessionScope: 'all' }).some((item) => item.id === other.id), false);
});

test('history summaries filter, pin, paginate, archive, restore and permanently delete without exposing full payloads', async () => {
  const first = store.createAgentSessionV2({ tenantId: 'history-t', userId: 'history-u', projectId: 'project-a', profileId: 'p', title: '员工录入任务' });
  const second = store.createAgentSessionV2({ tenantId: 'history-t', userId: 'history-u', projectId: 'project-b', profileId: 'p', title: '设备巡检任务' });
  const third = store.createAgentSessionV2({ tenantId: 'history-t', userId: 'history-u', profileId: 'p', title: '新项目任务' });
  first.phase = 'completed'; first.requirementCoverage = { total: 2, planned: 2, supported: 2, verified: 2, failed: 0, capabilityGaps: 0, needsUserInput: 0, planComplete: true, complete: true };
  second.phase = 'failed'; second.plans.push({ id: 'plan', revision: 1, request: '', goal: '修复巡检流程', successCriteria: [], summary: '', assumptions: [], risks: [], tasks: [], status: 'confirmed', createdAt: '' }); second.activePlanId = 'plan';
  store.updateAgentSessionMetadata(first, { pinned: true }); store.saveAgentSessionV2(second); store.saveAgentSessionV2(third);
  const firstPage = store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', limit: 2 });
  assert.equal(firstPage.items[0].id, first.id); assert.equal(firstPage.items.length, 2); assert.ok(firstPage.nextCursor);
  assert.equal('messages' in firstPage.items[0], false); assert.equal('events' in firstPage.items[0], false); assert.equal('artifacts' in firstPage.items[0], false); assert.equal('projectRevisions' in firstPage.items[0], false);
  const secondPage = store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', cursor: firstPage.nextCursor });
  assert.equal(secondPage.items.length, 1); assert.deepEqual(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)), new Set([first.id, second.id, third.id]));
  assert.deepEqual(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', status: 'attention' }).items.map((item) => item.id), [second.id]);
  assert.deepEqual(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', q: '巡检流程' }).items.map((item) => item.id), [second.id]);
  assert.deepEqual(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', projectId: 'project-a' }).items.map((item) => item.id), [first.id]);
  assert.deepEqual(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', projectId: '__unbound__' }).items.map((item) => item.id), [third.id]);
  store.archiveAgentSessionV2(second); assert.deepEqual(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u', archived: true }).items.map((item) => item.id), [second.id]);
  store.restoreAgentSessionV2(second); assert.equal(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u' }).items.some((item) => item.id === second.id), true);
  assert.deepEqual(await store.deleteAgentSessionV2(second), { deleted: true, id: second.id }); assert.equal(store.getAgentSessionV2(second.id), undefined); assert.equal(store.listAgentSessionHistory({ tenantId: 'history-t', userId: 'history-u' }).items.some((item) => item.id === second.id), false);
  assert.throws(() => store.updateAgentSessionMetadata(first, { title: '' }), /1–80/);
});

test('sessions support multiple limited projects with one current project', () => {
  const session = store.createAgentSessionV2({ tenantId: 'multi-t', userId: 'multi-u', projectId: 'project-a', projectIds: ['project-a', 'project-b'], profileId: 'p' });
  assert.deepEqual(store.sessionProjectIds(session), ['project-a', 'project-b']);
  assert.equal(store.listAgentSessionsV2({ tenantId: 'multi-t', userId: 'multi-u', projectId: 'project-b', sessionScope: 'project' })[0]?.id, session.id);
  session.projectRevisions = { 'project-a': 'rev-a', 'project-b': 'rev-b' };
  store.setSessionProjectScope(session, ['project-b', 'project-c'], 'project-c');
  assert.equal(session.projectId, 'project-c'); assert.deepEqual(session.projectIds, ['project-b', 'project-c']); assert.deepEqual(session.projectRevisions, { 'project-b': 'rev-b' });
  assert.throws(() => store.setSessionProjectScope(session, ['project-b'], 'project-c'), /当前项目/);
});

test('task graph rejects missing and cyclic dependencies', () => {
  const task = (id: string, dependsOn: string[] = []): any => ({ id, role: 'quality', title: id, instruction: id, access: 'read', dependsOn, acceptance: [], status: 'pending', attempt: 0, maxAttempts: 3, evidenceArtifactIds: [] });
  assert.throws(() => store.validateTaskGraph([task('a', ['missing'])]), /不存在/);
  assert.throws(() => store.validateTaskGraph([task('a', ['b']), task('b', ['a'])]), /循环/);
  assert.deepEqual(store.validateTaskGraph([task('a'), task('b', ['a'])]), { valid: true });
});

test('scheduler parallelizes ready reads and serializes writes', () => {
  const node = (id: string, access: 'read' | 'write', status: any = 'pending', dependsOn: string[] = []): any => ({ id, role: 'quality', title: id, instruction: id, access, dependsOn, acceptance: [], status, attempt: 0, maxAttempts: 3, evidenceArtifactIds: [] });
  const reads = [node('r1', 'read'), node('r2', 'read'), node('r3', 'read')]; assert.deepEqual(store.selectRunnableTaskBatch(reads, 2).map((item) => item.id), ['r1', 'r2']);
  const writes = [node('w1', 'write'), node('w2', 'write', 'pending', ['w1'])]; assert.deepEqual(store.selectRunnableTaskBatch(writes, 4).map((item) => item.id), ['w1']); writes[0].status = 'passed'; assert.deepEqual(store.selectRunnableTaskBatch(writes, 4).map((item) => item.id), ['w2']);
  assert.throws(() => store.validateTaskGraph([node('a', 'write'), node('b', 'write')]), /必须依赖/);
});

test('capability bundles can only shrink tool permissions and never enable release.apply', () => {
  const draft = store.saveCapabilityBundleDraft({ name: 'unsafe', agents: [{ role: 'delivery', name: 'delivery', description: '', instructions: '', tools: ['release.apply'] }], context: { recentMessages: 8, maxSummaryChars: 1000 }, budget: { maxParallelReads: 4, maxAttempts: 3, maxToolSteps: 32 } }, 'u');
  assert.throws(() => store.publishCapabilityBundle(draft.id, 'u'), /release\.apply/);
});

test('conversation compaction keeps recent turns and emits evidence', () => {
  const session = store.createAgentSessionV2({ tenantId: 't', userId: 'u', profileId: 'p' });
  session.messages = Array.from({ length: 6 }, (_, index) => ({ id: String(index), role: index % 2 ? 'assistant' as const : 'user' as const, content: `message-${index}`, createdAt: new Date().toISOString() }));
  store.compactConversation(session, 1000, 2); assert.equal(session.messages.length, 2); assert.match(session.conversationSummary, /message-0/); assert.equal(session.events.at(-1)?.type, 'context_compacted');
});
