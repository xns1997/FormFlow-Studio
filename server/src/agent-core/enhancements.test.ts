import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';
const testRoot = mkdtempSync(join(tmpdir(), 'agent-core-enhancements-'));
process.env.AGENT_THREAD_STORE_PATH = join(testRoot, 'threads.json');
process.env.AGENT_BUNDLE_STORE_PATH = join(testRoot, 'bundles.json');
process.env.FORMFLOW_PROJECTS_DIR = join(testRoot, 'projects');
process.env.FORMFLOW_DATA_DIR = join(testRoot, 'data');
process.env.AGENT_ARTIFACT_STORE_PATH = join(testRoot, 'artifacts');
process.env.AGENT_CHECKPOINT_STORE_PATH = join(testRoot, 'checkpoints');

const { executeLlmTool } = await import('../services/llm-tools');
const { projectPackagePath } = await import('../services/project-package-store');
const {
  createAgentThread, getAgentThread, initializeAgentStore, runTurn, saveAgentThread,
  storeAgentArtifact, readAgentArtifact,
} = await import('./index');
const { maybeCompactContext, maxPromptChars } = await import('./context');
const { runFinalGates } = await import('./gates');
const { defaultCapabilityBundle } = await import('./store');

test.after(() => rmSync(testRoot, { recursive: true, force: true }));

const run = { tenantId: 'local', userId: 'local', requestId: 'req_enhance' };

function threadWithPlan(projectIds: string[] = [], currentProjectId?: string) {
  const thread = createAgentThread({ tenantId: run.tenantId, userId: run.userId, projectIds, currentProjectId, profileId: 'default-cloud' });
  const now = new Date().toISOString();
  thread.dynamicPlan = {
    goal: '完成增强能力验证',
    successCriteria: ['可验证'],
    summary: '',
    steps: ['创建表单 f1'],
    assumptions: [],
    risks: [],
    updatedAt: now,
    updatedBy: 'system',
  };
  thread.status = 'idle';
  thread.turns = [];
  thread.turnId = undefined;
  saveAgentThread(thread);
  return thread;
}

test('batch reads run up to three read tools in one step', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'batch_ok', name: '批量只读', idempotencyKey: 'batch-k1' }, { tenantId: run.tenantId, projectId: 'batch_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const thread = threadWithPlan(['batch_ok'], 'batch_ok');

  let index = 0;
  await runTurn(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return {
          action: 'act', summary: '批量读取',
          batchReads: [
            { toolName: 'project.get', arguments: { projectId: 'batch_ok' } },
            { toolName: 'project.validate', arguments: { projectId: 'batch_ok' } },
          ],
        };
      }
      return { action: 'complete', summary: '完成', finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'batch_reads_completed' && event.data?.ok === 2));
  const observed = final.events.filter((event) => event.type === 'tool_observation').map((event) => event.data?.toolName);
  assert.ok(observed.includes('project.get'));
  assert.ok(observed.includes('project.validate'));
});

test('revision conflict auto-refreshes and retries instead of failing', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'conflict_ok', name: '冲突前', idempotencyKey: 'conf-k1' }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const first = await executeLlmTool('project.get', { projectId: 'conflict_ok' }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  const staleRevision = (first as any).data.revision;
  const bumped = await executeLlmTool('project.update', {
    projectId: 'conflict_ok', baseRevision: staleRevision, idempotencyKey: 'conf-bump', config: { description: '外部修改' },
  }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(bumped.ok, true, JSON.stringify(bumped));

  const thread = threadWithPlan(['conflict_ok'], 'conflict_ok');
  thread.projectRevisions.conflict_ok = staleRevision;
  saveAgentThread(thread);

  let index = 0;
  await runTurn(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return { action: 'act', summary: '更新名称', toolName: 'project.update', scope: 'project', arguments: { projectId: 'conflict_ok', config: { name: '冲突后' } } };
      }
      return { action: 'complete', summary: '完成', finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  assert.ok(final.events.some((event) => event.type === 'recovery_retry' && event.data?.failureClass === 'revision_conflict'));
  const project = await executeLlmTool('project.get', { projectId: 'conflict_ok' }, { tenantId: run.tenantId, projectId: 'conflict_ok', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal((project as any).data.project.config.name, '冲突后');
});

test('context.read_artifact returns a bounded window of a stored result', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan();
  const bigPayload = { rows: Array.from({ length: 400 }, (_, i) => ({ id: i, value: `row-${i}-${'x'.repeat(20)}` })) };
  const meta = await storeAgentArtifact(thread.id, 'tool_result', bigPayload, '大结果');

  let index = 0;
  await runTurn(thread, run, {
    decide: async () => {
      if (index === 0) {
        index += 1;
        return { action: 'act', summary: '回读', toolName: 'context.read_artifact', scope: 'project', arguments: { artifactId: meta.id, offset: 0, limit: 200 } };
      }
      return { action: 'complete', summary: '完成', finalAnswer: '完成' };
    },
    selfReview: async () => ({ issues: [] }),
  });

  const final = getAgentThread(thread.id)!;
  assert.equal(final.status, 'completed');
  const observation = final.events.filter((event) => event.type === 'tool_observation').find((event) => event.data?.toolName === 'context.read_artifact');
  assert.ok(observation);
  assert.ok(String(observation!.data.evidence?.[0] || '').length <= 200);
  const reread = await readAgentArtifact(thread.id, meta.id);
  assert.ok(reread);
  assert.equal((reread!.payload as any).rows.length, 400);
});

test('context compaction keeps a structured contract and trims old messages', async () => {
  await initializeAgentStore();
  const thread = threadWithPlan();
  thread.summary = '';
  for (let i = 0; i < 30; i += 1) {
    thread.messages.push({ id: `m${i}`, role: 'user', kind: 'prompt', content: `第 ${i} 条很长的历史消息：${'长'.repeat(120)}`, createdAt: new Date().toISOString() });
  }
  saveAgentThread(thread);
  const bundle = defaultCapabilityBundle();
  bundle.context.maxPromptChars = 1;
  assert.equal(maxPromptChars(bundle), 1);

  await maybeCompactContext(thread, bundle, run);

  assert.ok(thread.context, '压缩后必须生成结构化契约');
  assert.equal(thread.context!.goal, '完成增强能力验证');
  assert.ok(thread.context!.remainingWork.some((item) => item.includes('创建表单 f1')));
  assert.ok(thread.messages.length < 30);
  assert.ok(thread.events.some((event) => event.type === 'context_compacted'));
  assert.equal(thread.turnMetrics?.compactions, 1);
});

test('pre-existing test failures do not block completion but introduced ones do', async () => {
  await initializeAgentStore();
  const created = await executeLlmTool('project.create', { id: 'test_gate', name: '测试门禁', idempotencyKey: 'gate-k1' }, { tenantId: run.tenantId, projectId: 'test_gate', userId: run.userId, requestId: run.requestId, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const testingPath = join(projectPackagePath('test_gate'), 'testing', 'testing.json');
  writeFileSync(testingPath, JSON.stringify({
    profiles: [],
    fixtures: [],
    runs: [],
    suites: [{ id: 'suite_fail', title: '失败套件', cases: [{ id: 'c1', category: 'business', formId: 'no_such_form', values: {}, expectValid: true }] }],
  }, null, 2));

  const thread = threadWithPlan(['test_gate'], 'test_gate');
  thread.testBaseline = { capturedAt: new Date().toISOString(), passed: false, failures: ['用例「c1」：表单不存在'] };
  const preexisting = await runFinalGates(thread, run);
  assert.equal(preexisting.passed, true, `预存失败不应阻塞：${preexisting.failures.join('；')}`);

  thread.testBaseline = { capturedAt: new Date().toISOString(), passed: true, failures: [] };
  const introduced = await runFinalGates(thread, run);
  assert.equal(introduced.passed, false, '引入失败必须阻塞');
  assert.ok(introduced.failures.some((item) => item.includes('新增失败')));
});
