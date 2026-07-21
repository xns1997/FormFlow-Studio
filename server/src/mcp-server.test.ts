import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import express from 'express';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
const testRoot = mkdtempSync(join(tmpdir(), 'formflow-mcp-http-'));
process.env.PROJECT_AGENT_STORE_PATH = join(testRoot, 'project-agent-sessions.json');
process.env.PROJECT_AGENT_V2_STORE_PATH = join(testRoot, 'project-agent-v2.json');
process.env.PROJECT_AGENT_BUNDLE_STORE_PATH = join(testRoot, 'project-agent-bundles.json');

const { mcpRouter } = await import('./mcp-server');
const { aiRouter, listProjectAgentTools, projectAgentToolArguments } = await import('./routes/ai');
const projectAgentV2Store = await import('./services/project-agent-v2-store');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test('MCP transport removes the aggregate endpoint and validates specialist roles', async () => {
  assert.equal(listProjectAgentTools('delivery').some((tool) => tool.name === 'release.apply'), false);
  assert.ok(listProjectAgentTools('delivery').some((tool) => tool.name === 'release.preview'));
  assert.equal(projectAgentToolArguments('form.create', { baseRevision: 'stale' }, 'current').baseRevision, 'stale');
  assert.equal(projectAgentToolArguments('form.create', {}, 'current').baseRevision, 'current');
  assert.equal(projectAgentToolArguments('project.get', { projectId: 'demo' }, 'current').baseRevision, undefined);
  const app = express(); app.use(express.json()); app.use('/mcp', mcpRouter); app.use('/api/ai', aiRouter);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const root = `http://127.0.0.1:${address.port}`;
  try {
    const aggregate = await fetch(`${root}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(aggregate.status, 410); assert.match(JSON.stringify(await aggregate.json()), /\/mcp\/:role/);
    const invalid = await fetch(`${root}/mcp/unknown`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1 }) });
    assert.equal(invalid.status, 404); assert.match(JSON.stringify(await invalid.json()), /未知 MCP 角色/);
    for (const role of ['project', 'data', 'form', 'workflow', 'behavior', 'quality', 'delivery']) {
      const initialized = await fetch(`${root}/mcp/${role}`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } } }),
      });
      assert.equal(initialized.status, 200, role); const body = await initialized.text(); assert.match(body, new RegExp(`formflow-${role}`));
    }
    const oldTools = await fetch(`${root}/api/ai/tools`); assert.equal(oldTools.status, 410);
    const oldInvoke = await fetch(`${root}/api/ai/tools/form.create/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(oldInvoke.status, 410);
    const roles = await fetch(`${root}/api/ai/mcp-roles`); assert.equal(roles.status, 200); assert.equal((await roles.json() as any).roles.length, 7);
    const formTools = await fetch(`${root}/api/ai/mcp-roles/form/tools`); const formCatalog = await formTools.json() as any;
    assert.equal(formTools.status, 200); assert.ok(formCatalog.tools.some((tool: any) => tool.name === 'form.create')); assert.equal(formCatalog.tools.some((tool: any) => tool.name === 'data_source.import'), false);
    const denied = await fetch(`${root}/api/ai/mcp-roles/data/tools/form.create/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 422); assert.equal((await denied.json() as any).error.code, 'TOOL_NOT_AVAILABLE_IN_ROLE');

    const legacy = await fetch(`${root}/api/ai/project-agent/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(legacy.status, 410);
    const created = await fetch(`${root}/api/ai/project-agent/v2/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const v2 = await created.json() as any;
    assert.equal(created.status, 201); assert.equal(v2.schemaVersion, 2); assert.equal(v2.phase, 'grounding');
    const snapshot = await fetch(`${root}/api/ai/project-agent/v2/sessions/${v2.id}`); assert.equal(snapshot.status, 200); assert.equal((await snapshot.json() as any).id, v2.id);
    const stored = projectAgentV2Store.getAgentSessionV2(v2.id)!; projectAgentV2Store.appendAgentEvent(stored, 'task_started', { taskId: 'read-1' }); projectAgentV2Store.appendAgentEvent(stored, 'task_completed', { taskId: 'read-1' });
    const replay = await fetch(`${root}/api/ai/project-agent/v2/sessions/${v2.id}/events?afterSeq=1`); const replayBody = await replay.json() as any; assert.deepEqual(replayBody.events.map((event: any) => event.seq), [2]);
    const retryWithoutFailure = await fetch(`${root}/api/ai/project-agent/v2/sessions/${v2.id}/turns/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(retryWithoutFailure.status, 422); assert.match(JSON.stringify(await retryWithoutFailure.json()), /规划失败记录不存在/);
    const bundles = await fetch(`${root}/api/ai/project-agent/v2/capability-bundles`); assert.equal(bundles.status, 200); assert.ok((await bundles.json() as any[]).some((item) => item.status === 'published'));
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
