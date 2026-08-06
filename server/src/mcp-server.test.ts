import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import express from 'express';
import JSZip from 'jszip';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
const testRoot = mkdtempSync(join(tmpdir(), 'formflow-mcp-http-'));
process.env.AGENT_THREAD_STORE_PATH = join(testRoot, 'agent-threads.json');
process.env.AGENT_BUNDLE_STORE_PATH = join(testRoot, 'agent-bundles.json');
process.env.FORMFLOW_PROJECTS_DIR = join(testRoot, 'projects');
process.env.FORMFLOW_DATA_DIR = join(testRoot, 'server-data');

const { mcpRouter } = await import('./mcp-server');
const { aiRouter } = await import('./routes/ai');
const { listFormFlowTools } = await import('./services/formflow-tool-registry');
const { stageUpload } = await import('./services/upload-staging');
const agentCore = await import('./agent-core');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

test('MCP transport removes the aggregate endpoint and validates specialist roles', async () => {
  assert.equal(listFormFlowTools('delivery').some((tool) => tool.name === 'release.apply'), true);
  assert.equal(listFormFlowTools('delivery').filter((tool) => tool.name !== 'release.apply').some((tool) => tool.name === 'release.preview'), true);
  assert.ok(listFormFlowTools('delivery').some((tool) => tool.name === 'release.preview'));
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
    const projectId = `http_idempotency_${Date.now()}`;
    const idempotencyKey = `http-create-${projectId}`;
    const firstCreate = await fetch(`${root}/api/ai/mcp-roles/project/tools/project.create/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ arguments: { id: projectId, name: 'HTTP 首次创建', idempotencyKey } }) });
    const replayCreate = await fetch(`${root}/api/ai/mcp-roles/project/tools/project.create/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ arguments: { id: projectId, name: 'HTTP 不应覆盖', idempotencyKey } }) });
    const idempotencyReplayBody = await replayCreate.json() as any;
    assert.equal(firstCreate.status, 200); assert.equal(replayCreate.status, 422);
    assert.equal(idempotencyReplayBody.error.code, 'IDEMPOTENCY_KEY_REUSED');
    const loadedProject = await fetch(`${root}/api/ai/mcp-roles/project/tools/project.get/invoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ arguments: { projectId } }) });
    assert.match(JSON.stringify(await loadedProject.json()), /HTTP 首次创建/);

    const created = await fetch(`${root}/api/ai/project-agent/v5/threads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const thread = await created.json() as any;
    assert.equal(created.status, 201); assert.equal(thread.schemaVersion, 2); assert.equal(thread.status, 'idle');
    const snapshot = await fetch(`${root}/api/ai/project-agent/v5/threads/${thread.id}`); assert.equal(snapshot.status, 200); assert.equal((await snapshot.json() as any).id, thread.id);
    const stored = agentCore.getAgentThread(thread.id)!; agentCore.appendAgentThreadEvent(stored, 'tool_call', { toolName: 'project.get' });
    const replay = await fetch(`${root}/api/ai/project-agent/v5/threads/${thread.id}/events?afterSeq=0`); const replayBody = await replay.json() as any; assert.deepEqual(replayBody.events.map((event: any) => event.seq), [1]); assert.equal(replayBody.total, 1, '事件响应应携带线程事件总数');
    const retryWithoutFailure = await fetch(`${root}/api/ai/project-agent/v5/threads/${thread.id}/turns/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(retryWithoutFailure.status, 422); assert.match(JSON.stringify(await retryWithoutFailure.json()), /只有失败状态可以重试/);
    const bundles = await fetch(`${root}/api/ai/project-agent/v5/capability-bundles`); assert.equal(bundles.status, 200); assert.ok((await bundles.json() as any[]).some((item) => item.status === 'published'));
    // ?scope= 必须被尊重：此前 /threads 忽略 scope，all 会退化按 unbound 过滤。
    const scopeAll = await fetch(`${root}/api/ai/project-agent/v5/threads?scope=all`); assert.equal(scopeAll.status, 200); const scopeAllBody = await scopeAll.json() as any; const allThreads = scopeAllBody.items as any[];
    assert.equal(typeof scopeAllBody.total, 'number', '线程列表应携带总数');
    assert.ok(allThreads.some((item: any) => item.id === thread.id), 'scope=all 应包含新建的未绑定线程');
    const scopeProject = await fetch(`${root}/api/ai/project-agent/v5/threads?scope=project&projectId=${projectId}`); assert.equal(scopeProject.status, 200); const projectThreads = (await scopeProject.json() as any).items as any[];
    assert.equal(projectThreads.some((item: any) => item.id === thread.id), false, 'project 作用域不应包含未绑定线程');
    const scopeUnbound = await fetch(`${root}/api/ai/project-agent/v5/threads?scope=unbound`); assert.equal(scopeUnbound.status, 200); const unboundThreads = (await scopeUnbound.json() as any).items as any[];
    assert.ok(unboundThreads.some((item: any) => item.id === thread.id), 'unbound 作用域应包含未绑定线程');
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('project.import rejects malformed JSON inside a package with a friendly tool error', async () => {
  const app = express(); app.use(express.json()); app.use('/mcp', mcpRouter); app.use('/api/ai', aiRouter);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const root = `http://127.0.0.1:${address.port}`;
  try {
    const zip = new JSZip();
    zip.file('project.json', '{broken json');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const staged = stageUpload({ buffer, originalName: 'malformed.formflow' });
    const res = await fetch(`${root}/api/ai/mcp-roles/project/tools/project.import/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arguments: { fileId: staged.id, idempotencyKey: `import-malformed-${staged.id}` } }),
    });
    assert.equal(res.status, 422);
    const body = await res.json() as any;
    assert.equal(body.error.code, 'INVALID_PROJECT_PACKAGE');
    assert.match(String(body.error.message || ''), /不是合法 JSON/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
